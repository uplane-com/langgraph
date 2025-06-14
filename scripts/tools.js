import dotenv from 'dotenv';
import { getTopAdsByReach } from './helpers';
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { HumanMessage } from "@langchain/core/messages";

dotenv.config();

export const getTopAdsByReachTool = tool(
    async (input) => {
      return getTopAdsByReach(input.companyId);
    },
    {
      name: "getTopAdsByReach",
      description: "Returns ad description examples of the company's best ads.",
      schema: z.object({
        companyId: z.number().describe("The id of the company."),
      }),
    }
  );