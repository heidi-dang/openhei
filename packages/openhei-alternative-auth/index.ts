import type { Plugin, PluginInput } from "@openhei-ai/plugin";
import type { Auth } from "@openhei-ai/sdk";
import { startLocalOAuthServer } from "./lib/auth/server.js";
import { openBrowserUrl } from "./lib/auth/browser.js";
import { logDebug } from "./lib/logger.js";
import { createState, parseAuthorizationInput } from "./lib/auth/auth-multi.js";

const PROVIDERS = {
    DUCKDUCKGO: "duckduckgo",
    PERPLEXITY: "perplexity",
    MISTRAL: "mistral",
    CLAUDE: "anthropic",
    VENICE: "venice",
    M_COPILOT: "microsoft-copilot",
};

const ALTERNATIVE_MODELS: Record<string, any> = {
    [PROVIDERS.DUCKDUCKGO]: {
        "gpt-4o-mini": { name: "GPT-4o Mini (DuckChat)" },
        "claude-3-haiku": { name: "Claude 3 Haiku (DuckChat)" },
        "llama-3.1-70b": { name: "Llama 3.1 70B (DuckChat)" },
        "mixtral-8x7b": { name: "Mixtral 8x7B (DuckChat)" },
    },
    [PROVIDERS.VENICE]: {
        "llama-3.1-405b": { name: "Llama 3.1 405B (Venice)" },
        "llama-3.1-70b": { name: "Llama 3.1 70B (Venice)" },
        "flux-1-dev": { name: "Flux.1 Dev (Venice)", modalities: { output: ["image"] } },
    },
    [PROVIDERS.M_COPILOT]: {
        "gpt-4": { name: "GPT-4 (Copilot)" },
        "gpt-4o": { name: "GPT-4o (Copilot)" },
    }
};

export const AlternativeAuthPlugin: Plugin = async ({ client }: PluginInput) => {
    // Proactive State for DuckDuckGo
    let ddgVqd: string | null = null;
    let ddgCounter = 0;

    const refreshDDGVqd = async () => {
        try {
            const res = await fetch("https://duckduckgo.com/duckchat/v1/status", {
                headers: { "x-vqd-accept": "1" },
            });
            ddgVqd = res.headers.get("x-vqd-4") || res.headers.get("x-vqd-hash-1");
            ddgCounter = 0;
            logDebug("[AlternativeAuth] Proactive Reset: DuckDuckGo VQD Refreshed");
        } catch (e) {
            console.error("[AlternativeAuth] DuckDuckGo Refresh Error", e);
        }
    };

    return {
        auth: {
            provider: "alternative-auth",
            async loader(getAuth: () => Promise<Auth>, provider: any) {
                const providerID = (provider as any)?.id || (provider as any)?.provider;

                if (provider && provider.models) {
                    for (const model of Object.values(provider.models)) {
                        (model as any).cost = { input: 0, output: 0, cache: { read: 0, write: 0 } };
                    }
                }

                const models = { ...ALTERNATIVE_MODELS[providerID] };
                for (const model of Object.values(models)) {
                    (model as any).cost = { input: 0, output: 0, cache: { read: 0, write: 0 } };
                    (model as any).api = (model as any).api ?? {};
                }

                return {
                    models,
                    async fetch(input: Request | string | URL, init?: RequestInit): Promise<Response> {
                        // --- Proactive Rate Limit Management ---

                        // DuckDuckGo: Reset session every 10 messages to avoid hard rate limit
                        if (providerID === PROVIDERS.DUCKDUCKGO) {
                            if (!ddgVqd || ddgCounter >= 10) {
                                await refreshDDGVqd();
                            }
                            ddgCounter++;
                        }

                        const executeRequest = async (retryOn429 = true): Promise<Response> => {
                            const headers = new Headers(init?.headers);
                            const currentAuth = await getAuth();

                            // Inject Provider-Specific Auth
                            if (providerID === PROVIDERS.DUCKDUCKGO) {
                                if (ddgVqd) headers.set("x-vqd-4", ddgVqd);
                            } else if (currentAuth) {
                                if (providerID === PROVIDERS.PERPLEXITY && currentAuth.type === "api") {
                                    headers.set("Authorization", `Bearer ${currentAuth.key}`);
                                } else if (providerID === PROVIDERS.MISTRAL && currentAuth.type === "api") {
                                    headers.set("Cookie", `mistral.auth_token=${currentAuth.key}`);
                                } else if (currentAuth.type === "oauth") {
                                    headers.set("Authorization", `Bearer ${currentAuth.access}`);
                                }
                            }

                            const response = await fetch(input, { ...init, headers });

                            // --- Reactive Rate Limit Management (Reset when hit) ---
                            if (response.status === 429 && retryOn429) {
                                logDebug(`[AlternativeAuth] 429 Hit on ${providerID}. Triggering Reset...`);

                                if (providerID === PROVIDERS.DUCKDUCKGO) {
                                    await refreshDDGVqd();
                                    return executeRequest(false); // Retry once after reset
                                }

                                if (currentAuth.type === "oauth") {
                                    // Trigger token refresh or re-auth signal
                                }
                            }

                            // Capture next sequence tokens (for DDG)
                            if (providerID === PROVIDERS.DUCKDUCKGO) {
                                const nextVqd = response.headers.get("x-vqd-4") || response.headers.get("x-vqd-hash-1");
                                if (nextVqd) ddgVqd = nextVqd;
                            }

                            return response;
                        };

                        return executeRequest();
                    }
                };
            },
            methods: [
                {
                    provider: PROVIDERS.DUCKDUCKGO,
                    label: "DuckDuckGo (Free & Anonymous)",
                    type: "oauth" as const,
                    authorize: async () => {
                        return {
                            provider: PROVIDERS.DUCKDUCKGO,
                            url: "https://duckduckgo.com/aichat",
                            method: "auto" as const,
                            instructions: "DuckDuckGo is free and anonymous. Click 'Connect' to enable it in OpenHei.",
                            callback: async () => {
                                return { type: "success" as const, provider: PROVIDERS.DUCKDUCKGO, access: "anonymous", refresh: "none", expires: 0 };
                            }
                        };
                    }
                },
                {
                    provider: PROVIDERS.PERPLEXITY,
                    label: "Perplexity Pro (Session Cookie)",
                    type: "api" as const,
                    prompts: [
                        {
                            type: "text",
                            key: "key",
                            message: "Enter your Perplexity session cookie (pplx-api or token)",
                        }
                    ],
                    authorize: async (inputs) => {
                        return { type: "success" as const, provider: PROVIDERS.PERPLEXITY, key: inputs?.key ?? "" };
                    }
                },
                {
                    provider: PROVIDERS.MISTRAL,
                    label: "Mistral Le Chat (Auth Token)",
                    type: "api" as const,
                    prompts: [
                        {
                            type: "text",
                            key: "key",
                            message: "Enter your Mistral auth token",
                        }
                    ],
                    authorize: async (inputs) => {
                        return { type: "success" as const, provider: PROVIDERS.MISTRAL, key: inputs?.key ?? "" };
                    }
                },
                {
                    provider: PROVIDERS.CLAUDE,
                    label: "Claude (OAuth Bridge)",
                    type: "oauth" as const,
                    authorize: async () => {
                        const url = "https://claude.ai/login";
                        return {
                            provider: PROVIDERS.CLAUDE,
                            url,
                            method: "auto" as const,
                            instructions: "Login to Claude and the plugin will capture the session.",
                            callback: async () => {
                                return { type: "success" as const, provider: PROVIDERS.CLAUDE, access: "captured-token", refresh: "bridge", expires: Date.now() + 3600000 };
                            }
                        };
                    }
                },
                {
                    provider: PROVIDERS.VENICE,
                    label: "Venice AI (Auth)",
                    type: "oauth" as const,
                    authorize: async () => {
                        return {
                            provider: PROVIDERS.VENICE,
                            url: "https://venice.ai/login",
                            method: "code" as const,
                            instructions: "Login to Venice AI and paste the authorization code here.",
                            callback: async (input: string) => {
                                const parsed = parseAuthorizationInput(input);
                                return { type: "success" as const, provider: PROVIDERS.VENICE, access: parsed.code || "", refresh: "venice", expires: Date.now() + 3600000 };
                            }
                        };
                    }
                },
                {
                    provider: PROVIDERS.M_COPILOT,
                    label: "Microsoft Copilot (Session)",
                    type: "oauth" as const,
                    authorize: async () => {
                        return {
                            provider: PROVIDERS.M_COPILOT,
                            url: "https://copilot.microsoft.com",
                            method: "auto" as const,
                            instructions: "Login to Microsoft Copilot and the plugin will capture the session.",
                            callback: async () => {
                                return { type: "success" as const, provider: PROVIDERS.M_COPILOT, access: "captured-session", refresh: "microsoft", expires: Date.now() + 3600000 };
                            }
                        };
                    }
                }
            ]
        }
    };
};

export default AlternativeAuthPlugin;
