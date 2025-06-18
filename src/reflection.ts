import { Annotation, messagesStateReducer, StateGraph } from "@langchain/langgraph";
import { getTopAdsByReach, getCompanyName } from './helpers.ts';
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, BaseMessage, SystemMessage } from "@langchain/core/messages"; // Added SystemMessage
import { adStructureSchema, layerSchema, adFeedbackSchema } from "./structures.ts"
import { ChatOpenAI } from "@langchain/openai";
import { generateImage, uploadAdToAPI, sendImageToSlack, sanitizeJsonContent,returnEditorAd } from "./helpers.ts"
import dotenv from 'dotenv';
import * as prompts from "./prompts"

dotenv.config();

const stateSchema = Annotation.Root({
    backgroundImageBase64: Annotation<string>,
    layers: Annotation<object[]>,
    adImageBase64: Annotation<string>,
    feedbackIsPositive: Annotation<boolean>, // Corrected to lowercase 'boolean'
    adFeedback: Annotation<string>,
    iterations: Annotation<number>, // Initialize iterations with 0
  });

// use backgroundImageBase64 and layers to create the adImageBase64
async function generateAd(state: typeof stateSchema.State) {
    const mergedAdData = {
        width: 1024,
        height: 1024,
        layers: state.layers
    };
    const adImageBase64 = await returnEditorAd(mergedAdData, state.backgroundImageBase64);
    if (state.iterations === undefined || state.iterations === null) {
        return {adImageBase64: adImageBase64, iterations: 0}
    } else {
        return {adImageBase64: adImageBase64}
    }
}

// use adImageBase64 to create adFeedback
async function reviewAd(state: typeof stateSchema.State) {
    const llm = new ChatOpenAI({ model: "gpt-4.1" }).withStructuredOutput(adFeedbackSchema);

    // Construct the messages for the direct LLM call
    const messages: BaseMessage[] = [
        new SystemMessage(prompts.adReviewAgentSP), // Use the existing prompt as a system message
        new HumanMessage({
            content: [
                {
                    type: "text",
                    text: "Please review the following ad image and provide feedback based on the instructions in the system prompt.",
                },
                {
                    type: "image_url",
                    image_url: {
                        url: `data:image/png;base64,${state.adImageBase64}`,
                    },
                },
            ],
        }),
    ];

    try {
        const response = await llm.invoke(messages);
        
        // With structured output, response is already parsed and validated
        console.log("FEEDBACK:")
        console.log(response.adFeedback)
        return {
            feedbackIsPositive: response.feedbackIsPositive,
            adFeedback: response.adFeedback,
            iterations: (state.iterations + 1)
        };
    } catch (error) {
        console.error('Error during LLM call:', error);
        return {
            feedbackIsPositive: false,
            adFeedback: "Error: Failed to get feedback from LLM.",
            iterations: (state.iterations + 1)
        };
    }
}

// use adFeedback to create new layers
async function improveLayers(state: typeof stateSchema.State) {
    const llm = new ChatOpenAI({ model: "gpt-4.1" }).withStructuredOutput(layerSchema);

    const messages: BaseMessage[] = [
        new SystemMessage(prompts.improveAdLayersAgentSP),
        new HumanMessage({
            content: [
                {
                    type: "text",
                    text: `Here are the current layers:\n\n${JSON.stringify(state.layers)}\n\nHere is the feedback received:\n\n${state.adFeedback}\n\nPlease analyze the feedback, the current ad image, and the background image to provide an improved set of layers. The background image shows what is fixed. The ad image shows the current ad. Improve the layers to create a better ad based on the feedback.\n\nThis is the current ad image:`,
                },
                {
                    type: "image_url",
                    image_url: {
                        url: `data:image/png;base64,${state.adImageBase64}`,
                    },
                },
                {
                    type: "text",
                    text: "This is the background image (which is fixed):",
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

    try {
        const response = await llm.invoke(messages);
        const parsedResult = response; // Assuming 'response' is the direct parsed output
        if (parsedResult && Array.isArray(parsedResult.layers)) {
            return { layers: parsedResult.layers };
        } else {
            // This else block might be redundant if withStructuredOutput throws on failure.
            console.error('Parsed layers from LLM are not in the expected format or type:', parsedResult);
            return { layers: state.layers }; // Fallback to original layers
        }
    } catch (error) {
        console.error('Error during LLM call or parsing improved layers JSON:', error);
        // Fallback to original layers or throw error
        return { layers: state.layers }; 
    }
}

function endLoopByCondition(state: typeof stateSchema.State) {
    if (state.iterations >=10) {
        return "__end__"
    } else {
        return "improveLayers"
    }
}


export const reflectionGraph = new StateGraph({
    stateSchema: stateSchema
})
    .addNode("generateAd", generateAd)
    .addNode("reviewAd", reviewAd)
    .addNode("improveLayers", improveLayers)
    .addEdge("__start__", "generateAd")
    .addEdge("generateAd", "reviewAd")
    .addConditionalEdges("reviewAd", endLoopByCondition, {
        "improveLayers": "improveLayers",
        "__end__": "__end__"
    })
    .addEdge("improveLayers", "generateAd")
    .compile(); // Now the compiled graph is assigned to reflectionGraph
