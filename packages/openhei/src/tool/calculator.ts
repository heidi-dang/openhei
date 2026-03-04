import { Tool } from "./tool"
import z from "zod"
import { math } from "@openhei-ai/util/math"

export const CalculatorTool: Tool.Info = {
    id: "calculator",
    init: async () => ({
        description: "Perform basic arithmetic operations (add, subtract, multiply, divide).",
        parameters: z.object({
            operation: z.enum(["add", "subtract", "multiply", "divide"]).describe("The operation to perform."),
            a: z.number().describe("The first operand."),
            b: z.number().describe("The second operand."),
        }),
        execute: async ({ operation, a, b }) => {
            let result: number
            switch (operation) {
                case "add":
                    result = a + b
                    break
                case "subtract":
                    result = a - b
                    break
                case "multiply":
                    result = a * b
                    break
                case "divide":
                    if (b === 0) throw new Error("Division by zero")
                    result = a / b
                    break
                default:
                    throw new Error(`Invalid operation: ${operation}`)
            }
            return {
                title: `Calculator: ${a} ${operation} ${b}`,
                output: `Result: ${result}`,
                metadata: { operation, a, b, result },
            }
        },
    }),
}
