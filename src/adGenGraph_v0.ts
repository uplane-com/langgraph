import { Annotation, StateGraph, messagesStateReducer } from "@langchain/langgraph";
import { getTopAdsByReach, getCompanyName } from './helpers';
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, SystemMessage, BaseMessage, AIMessage } from "@langchain/core/messages";
import * as schemas from "./structures"
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { generateImage, returnEditorAd, uploadAdToAPI } from "./helpers"
import dotenv from 'dotenv';
import * as prompts from "./prompts"

//input
const loops = 5

dotenv.config();

const stateSchema = Annotation.Root({
  companyId: Annotation<number>,
  companyName: Annotation<string>,
  exampleAds: Annotation<string[]>,
  backgroundImageBase64: Annotation<string>,
  backgroundDescription: Annotation<string>,
  layers: Annotation<object[]>,
  adImageBase64: Annotation<string>,
  iterations: Annotation<number>,
  messages: Annotation<BaseMessage[]>,
  fixes: Annotation<string>
});

async function downloadAdExamples(state: typeof stateSchema.State) {
  const exampleAds = await getTopAdsByReach(state.companyId);
  const companyName = await getCompanyName(state.companyId);
  return {companyName: companyName, exampleAds: exampleAds};
}

async function generateInitialAdStructure(state: typeof stateSchema.State) {
  //const llm = new ChatOpenAI({ model: "gpt-4.1" }).withStructuredOutput(schemas.adSchema);
  const llm = new ChatGoogleGenerativeAI({ model: "gemini-2.5-pro-preview-06-05", temperature: 0.9 }).withStructuredOutput(schemas.adSchemaGoogle);

  const messages: BaseMessage[] = [
    new SystemMessage(prompts.generateInitialAdStructureSP),
    new HumanMessage({
        content: [
          {
            type: "text",
            text: "Please return the new ad in the specified format. Attached you find a list of image descriptions of the best ads of the company.",
          },
          {
            type:"text",
            text: state.exampleAds.join("\n\n"),
          }
        ],
    }),
  ];

  const initialAdStructure = await llm.invoke(messages);
  const backgroundDescription = initialAdStructure.backgroundDescription + " No text should be shown anywhere in the image. Text is forbidden in this image. Return the image in the dimensions 1024 x 1024.";
  const layers = initialAdStructure.layers;
  const backgroundImageBase64 = await generateImage(backgroundDescription, backgroundDescription);

  return {layers: layers, backgroundDescription: backgroundDescription, backgroundImageBase64: backgroundImageBase64, fixes: "This is the initial ad:"}
}

async function generateAd(state: typeof stateSchema.State) {
  const mergedAdData = {width: 1024, height: 1024, layers: state.layers};
  const adImageBase64 = await returnEditorAd(mergedAdData, state.backgroundImageBase64, `____________________ITERATION #${state.iterations}____________________\n` + state.fixes);
  if (state.iterations === undefined || state.iterations === null) {
      return {adImageBase64: adImageBase64, iterations: 0}
  }
  if (state.iterations >= loops) {
      await uploadAdToAPI(mergedAdData, state.backgroundImageBase64);
      return { adImageBase64: adImageBase64 }
  }
}

async function checkAndImproveLayers(state: typeof stateSchema.State) {
  //const llm = new ChatOpenAI({ model: "gpt-4.1" }).withStructuredOutput(schemas.reflectionSchema);
  const llm = new ChatGoogleGenerativeAI({ model: "gemini-2.5-pro-preview-06-05" }).withStructuredOutput(schemas.reflectionSchemaGoogle);

  if (state.iterations === 0 ) {
    let messages: BaseMessage[] = [

      new SystemMessage(prompts.checkAndImproveLayersSP),
      new HumanMessage({
          content: [
              {
                  type: "text",
                  text: `Here are the current layers:\n\n${JSON.stringify(state.layers)}`,
              },
              {
                type: "text",
                text: "This is the image of the current version of the ad which has to be improved by modifying the layers:",
              },
              {
                  type: "image_url",
                  image_url: {
                      url: `data:image/png;base64,${state.adImageBase64}`,
                  },
              },
              {
                  type: "text",
                  text: "This is the background image (which is fixed and cannot be changed):",
              },
              {
                  type: "image_url",
                  image_url: {
                      url: `data:image/png;base64,${state.backgroundImageBase64}`,
                  },
              },
          ],
      }),
    ];

    const result = await llm.invoke(messages);
    messages.push(new AIMessage(JSON.stringify(result)));
    console.log(result.fixes)
    return { layers: result.layers, iterations: (state.iterations + 1), messages: messages, fixes: result.fixes }
  } else {
    const newHumanMessage =
      new HumanMessage({
          content: [
              {
                type: "text",
                text: "Attached you find the image of the new version of the ad with the updated layers. Please continue the job of analyzing the ad to find flaws, and improving the layers. Learn from your past edits to further improve the ad in the next iteration. The fixed background images stays the same. Only return the improved layers together with the new fixes.",
              },
              {
                  type: "image_url",
                  image_url: {
                      url: `data:image/png;base64,${state.adImageBase64}`,
                  },
              },
          ],
      })
    let newMessages = state.messages;
    newMessages.push(newHumanMessage)
    const result = await llm.invoke(newMessages);
    newMessages.push(new AIMessage(JSON.stringify(result)));
    console.log(result.fixes)
    return { layers: result.layers, iterations: (state.iterations + 1), messages: newMessages, fixes: result.fixes }
  }
}

function endLoopByCondition(state: typeof stateSchema.State) {
  if (state.iterations >= loops) {
      return "__end__"
  } else {
      return "checkAndImproveLayers"
  }
}

export const adGenGraph = new StateGraph({
  stateSchema: stateSchema
})
  .addNode("downloadAdExamples", downloadAdExamples)
  .addNode("generateInitialAdStructure", generateInitialAdStructure)
  .addNode("generateAd", generateAd)
  .addNode("checkAndImproveLayers", checkAndImproveLayers)
  .addEdge("__start__", "downloadAdExamples")
  .addEdge("downloadAdExamples", "generateInitialAdStructure")
  .addEdge("generateInitialAdStructure", "generateAd")
  .addConditionalEdges("generateAd", endLoopByCondition, {
      "checkAndImproveLayers": "checkAndImproveLayers",
      "__end__": "__end__"
  })
  .addEdge("checkAndImproveLayers", "generateAd")
  .compile();