import { Annotation, messagesStateReducer, StateGraph } from "@langchain/langgraph";
import { getTopAdsByReach, getCompanyName } from './helpers';
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, BaseMessage } from "@langchain/core/messages";
import { adStructureSchema, layerSchema } from "./structures"
import { ChatOpenAI } from "@langchain/openai";
import { generateImage, uploadAdToAPI, sendImageToSlack, sanitizeJsonContent,returnEditorAd } from "./helpers"
import dotenv from 'dotenv';
import * as prompts from "./prompts"
import { reflectionGraph } from "./reflection.ts"

dotenv.config();

const stateSchema = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer, // Built-in reducer that handles message deduplication
    default: () => [],
  }),
  companyId: Annotation<number>,
  companyName: Annotation<string>,
  backgroundImageBase64: Annotation<string>,
  layers: Annotation<object[]>,
});

async function setupNode(state: typeof stateSchema.State) {
  const exampleAds = await getTopAdsByReach(state.companyId);
  const companyName = await getCompanyName(state.companyId);
  const message = new HumanMessage({
    content: [
      {
        type: "text",
        text: "Please return the image description of the new ad. Attached you find a list of image descriptions of the best ads of the company.",
      },
      {
        type:"text",
        text: exampleAds.join("\n\n"),
      }
    ],
  });
  return {companyName: companyName, messages: message};
}

function returnLastMessage(state: { messages: BaseMessage[] }) {
  const lastMessage = state.messages.slice(-1);
  return { llmInputMessages: lastMessage };
}

const fullAdDescriptionAgent = createReactAgent({
  llm: new ChatOpenAI({ model: "gpt-4.1"}),
  tools: [],
  prompt: prompts.fullAdDescriptionAgentSP,
  //preModelHook: returnLastMessage,
});

const extractAdLayerAgent = createReactAgent({
  llm: new ChatOpenAI({ model: "gpt-4.1"}),
  tools: [],
  responseFormat: layerSchema,
  prompt: prompts.extractAdLayerAgentSP,
  //preModelHook: returnLastMessage,
});

async function inputForExtractBackgroundAgent(state: typeof stateSchema.State) {
  
  const message = new HumanMessage({
    content: [
      {
        type: "text",
        text: "Please analyze the full ad description and extracted layers, then return a clean background description that excludes all elements already represented in the layers.",
      },
      {
        type: "text",
        text: `Full Ad Description:\n${state.messages.slice(-2, -1).map(msg => msg.content).join('\n')}`,
      },
      {
        type: "text",
        text: `Extracted Layers:\n${state.messages.slice(-1).map(msg => msg.content).join('\n')}`,
      }
    ],
  });
  
  return { messages: message };
}

const extractBackgroundAgent = createReactAgent({
  llm: new ChatOpenAI({ model: "gpt-4.1"}),
  tools: [],
  prompt: prompts.extractBackgroundAgentSP,
  //preModelHook: inputForExtractBackgroundAgent,
});

async function uploadAdNode(state: typeof stateSchema.State) {
    // Create background image prompt using the separated background description
    const backgroundImagePrompt = `Generate an image based on the following image description: ${state.messages.slice(-1).map(msg => msg.content).join('')}.`;
    const fullAdImagePrompt = `Generate an image based on the following image description: ${state.messages[1].content}.`;
    const image_base64 = await generateImage(backgroundImagePrompt);
    const image_base64_FullAd = await generateImage(fullAdImagePrompt);
    
    // Extract the actual layer data from the extractAdLayerAgent's output
    // Find the message that contains the layer data (should be from extractAdLayerAgent)
    const layerMessage = state.messages.find(msg => 
        typeof msg.content === 'string' && msg.content.includes('layers')
    );
    
    let layersData = [];
    if (layerMessage && typeof layerMessage.content === 'string') {
        try {
            const parsedContent = JSON.parse(layerMessage.content);
            layersData = parsedContent.layers || [];
        } catch (error) {
            console.error('Error parsing layer data:', error);
            layersData = [];
        }
    }
    
    const mergedAdData = {
        width: 1024,
        height: 1024,
        layers: layersData
    };
    
    await uploadAdToAPI(mergedAdData, image_base64 as string);
    //const editorImage = await returnEditorAd(mergedAdData, image_base64 as string);
    //console.log(editorImage.slice(0, 50))
    return { backgroundImageBase64: image_base64, layers: layersData }
}

export const graph = new StateGraph({
    stateSchema: stateSchema
})
    .addNode("setupNode", setupNode)
    .addNode("fullAdDescriptionAgent", fullAdDescriptionAgent)
    .addNode("extractAdLayerAgent", extractAdLayerAgent)
    .addNode("inputForExtractBackgroundAgent", inputForExtractBackgroundAgent)
    .addNode("extractBackgroundAgent", extractBackgroundAgent)
    .addNode("uploadAdNode", uploadAdNode)
    .addNode("reflectionGraph", reflectionGraph)

graph
    .addEdge("__start__", "setupNode")
    .addEdge("setupNode", "fullAdDescriptionAgent")
    .addEdge("fullAdDescriptionAgent", "extractAdLayerAgent")
    .addEdge("extractAdLayerAgent", "inputForExtractBackgroundAgent")
    .addEdge("inputForExtractBackgroundAgent", "extractBackgroundAgent")
    .addEdge("extractBackgroundAgent", "uploadAdNode")
    .addEdge("uploadAdNode", "reflectionGraph")
    .addEdge("reflectionGraph", "__end__")
    .compile();