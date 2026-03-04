import z from "zod"
import { Tool } from "./tool"

const parameters = z.object({
  tool: z.string(),
  error: z.string(),
})

type InvalidMetadata = Record<string, unknown>

export const InvalidTool = Tool.define<typeof parameters, InvalidMetadata>("invalid", {
  description: "Do not use",
  parameters,
  async execute(params) {
    return {
      title: "Invalid Tool",
      output: `The arguments provided to the tool are invalid: ${params.error}`,
      metadata: {},
    }
  },
})
