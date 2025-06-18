import { Annotation, StateGraph } from "@langchain/langgraph";
import { getTopAdsByReach, getCompanyName } from './helpers';
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { adStructureSchema, layerSchema } from "./structures"
import { ChatOpenAI } from "@langchain/openai";
import { generateImage, uploadAdToAPI, sendImageToSlack, sanitizeJsonContent } from "./helpers"
import dotenv from 'dotenv';
import * as prompts from "./prompts"

dotenv.config();

const stateSchema = Annotation.Root({
    companyId: Annotation<number>,
    companyName: Annotation<string>,
    exampleAds: Annotation<string[]>,
    fullAdDescription: Annotation<string>,
    layers: Annotation<object[]>,
    backgroundDescription: Annotation<string>,
    imageString: Annotation<string>,
});

async function setupNode(state: typeof stateSchema.State) {
    const exampleAds = await getTopAdsByReach(state.companyId);
    const companyName = await getCompanyName(state.companyId);
    return {companyName: companyName, exampleAds: exampleAds};
}

async function generateFullAdDescriptionNode(state: typeof stateSchema.State) {
    const fullAdDescriptionAgent = createReactAgent({
        llm: new ChatOpenAI({ model: "gpt-4.1"}),
        tools: [],
        prompt: prompts.fullAdDescriptionAgentSP,
      });
      
      const message = new HumanMessage({
        content: [
          {
            type: "text",
            text: "Please return the image description of the new ad. Attached you find a list of image descriptions of the best ads of the company.",
          },
          {
            type:"text",
            text: state.exampleAds.join("\n\n"),
          }
        ],
      });
      
      // Now it's time to use!
      const endState = await fullAdDescriptionAgent.invoke(
        { messages: [message] },
      );
      
      const imageDescription = endState.messages[endState.messages.length - 1].content;
      return {fullAdDescription : imageDescription}
}

async function extractAdLayerNode(state: typeof stateSchema.State) {
  const extractAdLayerAgent = createReactAgent({
      llm: new ChatOpenAI({ model: "gpt-4.1"}),
      tools: [],
      responseFormat: layerSchema,
      prompt: prompts.extractAdLayerAgentSP,
    });
    
    const message = new HumanMessage({
      content: [
        {
          type: "text",
          text: "Please return the layers of the new ad. Attached you find a description of the new ad.",
        },
        {
          type:"text",
          text: state.fullAdDescription,
        }
      ],
    });
    
    const endState = await extractAdLayerAgent.invoke(
      { messages: [message] },
    );
    
    let content = endState.messages[endState.messages.length - 1].content as string;
    
    // Use the sanitization function from helpers
    content = sanitizeJsonContent(content);
    
    try {
        const parsedContent = JSON.parse(content);
        //console.log('Successfully parsed layers:', parsedContent.layers);
        return { layers: parsedContent.layers };
    } catch (parseError) {
        console.error('JSON parsing failed even after sanitization:', parseError);
        console.error('Content that failed to parse:', content);
        
        // Fallback: return empty layers array
        return { layers: [] };
    }
}

async function extractBackgroundDescriptionNode(state: typeof stateSchema.State) {
  const extractBackgroundAgent = createReactAgent({
      llm: new ChatOpenAI({ model: "gpt-4.1"}),
      tools: [],
      prompt: prompts.extractBackgroundAgentSP,
    });
    
    const message = new HumanMessage({
      content: [
        {
          type: "text",
          text: "Please analyze the full ad description and extracted layers, then return a clean background description that excludes all elements already represented in the layers.",
        },
        {
          type: "text",
          text: `Full Ad Description:\n${state.fullAdDescription}`,
        },
        {
          type: "text",
          text: `Extracted Layers:\n${JSON.stringify(state.layers, null, 2)}`,
        }
      ],
    });
    
    const endState = await extractBackgroundAgent.invoke(
      { messages: [message] },
    );
    
    const backgroundDescription = endState.messages[endState.messages.length - 1].content as string;
    return { backgroundDescription: backgroundDescription };
}

async function uploadAdNode(state: typeof stateSchema.State) {
    // Create background image prompt using the separated background description
    const backgroundImagePrompt = `Generate an image based on the following image description: ${state.backgroundDescription}.`;
    
    const image_base64 = await generateImage(backgroundImagePrompt);
    const image_base64_FullAd = await generateImage(state.fullAdDescription);
    
    const mergedAdData = {
        width: 1024,
        height: 1024,
        layers: state.layers
    };
    
    await uploadAdToAPI(mergedAdData, image_base64 as string);
    return {imageString: image_base64};
}

export const graph = new StateGraph({
    stateSchema: stateSchema
})
    .addNode("setupNode", setupNode)
    .addNode("generateFullAdDescriptionNode", generateFullAdDescriptionNode)
    .addNode("extractAdLayerNode", extractAdLayerNode)
    .addNode("extractBackgroundDescriptionNode", extractBackgroundDescriptionNode)
    .addNode("uploadAdNode", uploadAdNode)
    .addEdge("__start__", "setupNode")
    .addEdge("setupNode", "generateFullAdDescriptionNode")
    .addEdge("generateFullAdDescriptionNode", "extractAdLayerNode")
    .addEdge("extractAdLayerNode", "extractBackgroundDescriptionNode")
    .addEdge("extractBackgroundDescriptionNode", "uploadAdNode")
    .addEdge("uploadAdNode", "__end__")
    .compile();

    