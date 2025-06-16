import { z } from "zod";

export const adStructureSchema = z.object({
    width: z.number().int().describe("The pixel width of the entire ad (should be 1024)"),
    height: z.number().int().describe("The pixel height of the entire ad (should be 1024)"),
    sourceImage: z.string().describe("Detailed background image description following the specified format"),
    layers: z.array(
      z.union([
        // Text layer schema
        z.object({
          type: z.literal("text"),
          text: z.string().describe("Text content within the mask"),
          x: z.number().int().describe("X coordinate of the box"),
          y: z.number().int().describe("Y coordinate of the box"),
          width: z.number().int().describe("Width of the box"),
          height: z.number().int().describe("Height of the box"),
          fontSize: z.number().int().describe("Size of the font"),
          color: z.string().describe("Color of the text as a hex code"),
          align: z.string().describe("Alignment of the text (e.g. 'center', 'left', 'right')")
        }),
        // Rect layer schema
        z.object({
          type: z.literal("rect"),
          x: z.number().int().describe("X coordinate of the box"),
          y: z.number().int().describe("Y coordinate of the box"),
          width: z.number().int().describe("Width of the box"),
          height: z.number().int().describe("Height of the box"),
          fill: z.string().describe("Fill color of the box as a hex code"),
          stroke: z.string().describe("Stroke color of the box as a hex code"),
          strokeWidth: z.number().describe("Stroke width of the box"),
          rotation: z.number().describe("Rotation of the box"),
          borderRadius: z.number().describe("Border radius of the box")
        })
      ])
    ).describe("List of text and rect layers to be placed on top of the background")
  });

  export const layerSchema = z.object({
    layers: z.array(
      z.union([
        // Text layer schema
        z.object({
          type: z.literal("text"),
          text: z.string().describe("Text content within the mask"),
          x: z.number().int().describe("X coordinate of the box"),
          y: z.number().int().describe("Y coordinate of the box"),
          width: z.number().int().describe("Width of the box"),
          height: z.number().int().describe("Height of the box"),
          fontSize: z.number().int().describe("Size of the font"),
          color: z.string().describe("Color of the text as a hex code"),
          align: z.string().describe("Alignment of the text (e.g. 'center', 'left', 'right')")
        }),
        // Rect layer schema
        z.object({
          type: z.literal("rect"),
          x: z.number().int().describe("X coordinate of the box"),
          y: z.number().int().describe("Y coordinate of the box"),
          width: z.number().int().describe("Width of the box"),
          height: z.number().int().describe("Height of the box"),
          fill: z.string().describe("Fill color of the box as a hex code"),
          stroke: z.string().describe("Stroke color of the box as a hex code"),
          strokeWidth: z.number().describe("Stroke width of the box"),
          rotation: z.number().describe("Rotation of the box"),
          borderRadius: z.number().describe("Border radius of the box")
        })
      ])
    ).describe("List of text and rect layers to be placed on top of the background")
  });