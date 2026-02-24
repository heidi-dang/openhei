import { randomBytes } from "node:crypto";
import type { ParsedAuthInput } from "../types.js";

export function createState(): string {
    return randomBytes(16).toString("hex");
}

export function parseAuthorizationInput(input: string): ParsedAuthInput {
    const value = (input || "").trim();
    if (!value) return {};

    try {
        const url = new URL(value);
        return {
            code: url.searchParams.get("code") ?? undefined,
            state: url.searchParams.get("state") ?? undefined,
        };
    } catch { }

    if (value.includes("#")) {
        const [code, state] = value.split("#", 2);
        return { code, state };
    }
    return { code: value };
}
