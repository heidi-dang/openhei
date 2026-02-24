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

const ALTERNATIVE_ENDPOINTS: Record<string, string> = {
  [PROVIDERS.DUCKDUCKGO]: "https://duckduckgo.com/duckchat/v1/chat",
  [PROVIDERS.PERPLEXITY]: "https://www.perplexity.ai/api/v1/chat/completions",
  [PROVIDERS.MISTRAL]: "https://chat.mistral.ai/api/chat/completions",
  [PROVIDERS.CLAUDE]: "https://claude.ai/api",
  [PROVIDERS.VENICE]: "https://api.venice.ai/api/v1/chat/completions",
  [PROVIDERS.M_COPILOT]: "https://copilot.microsoft.com/api/chat",
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

function toDDGModel(openheiModelId: string): string {
  return openheiModelId.replace(/^duckduckgo\//, "");
}

function normalizeDDGMessages(messages: any[]): Array<{ role: string; content: string }> {
  const out: Array<{ role: string; content: string }> = [];

  for (const m of messages ?? []) {
    if (!m) continue;

    let role = m.role ?? "user";
    let content = "";

    if (typeof m.content === "string") {
      content = m.content;
    } else if (Array.isArray(m.content)) {
      // OpenAI content parts -> plain text
      content = m.content
        .map((p: any) => (p?.type === "text" ? (p.text ?? "") : ""))
        .join("")
        .trim();
    } else if (m.content != null) {
      content = String(m.content);
    }

    if (!content) continue;

    // DDG can be picky; if system causes 400, map it to user prefix
    if (role === "system") {
      role = "user";
      content = `[System]\n${content}`;
    }

    if (role !== "user" && role !== "assistant") role = "user";
    out.push({ role, content });
  }

  return out;
}

export const AlternativeAuthPlugin: Plugin = async ({ client }: PluginInput) => {
  // Proactive State for DuckDuckGo
  let ddgVqd: string | null = null;
  let ddgVqdHash: string | null = null;
  let ddgCounter = 0;

  const refreshDDGVqd = async () => {
    try {
      const res = await fetch("https://duckduckgo.com/duckchat/v1/status", {
        headers: { "x-vqd-accept": "1" },
      });
      ddgVqd = res.headers.get("x-vqd-4");
      ddgVqdHash = res.headers.get("x-vqd-hash-1");
      ddgCounter = 0;
      logDebug(`[AlternativeAuth] DuckDuckGo VQD Refreshed: ${ddgVqd?.substring(0, 8)}...`);
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
          baseURL: ALTERNATIVE_ENDPOINTS[providerID] || "http://localhost",
          async fetch(input: Request | string | URL, init?: RequestInit): Promise<Response> {
            // --- Proactive Rate Limit Management ---

            // DuckDuckGo: Reset session every 10 messages to avoid hard rate limit
            if (providerID === PROVIDERS.DUCKDUCKGO) {
              if (!ddgVqd || ddgCounter >= 10) {
                await refreshDDGVqd();
              }
              ddgCounter++;
            }

            const executeRequest = async (retryOnBadToken = true): Promise<Response> => {
              const currentAuth = await getAuth();
              let url = ALTERNATIVE_ENDPOINTS[providerID] || (typeof input === "string" || input instanceof URL ? input.toString() : input.url);

              // Special handling for Claude to avoid invalid endpoint joins
              if (providerID === PROVIDERS.CLAUDE) {
                if (url.endsWith("/complete") || url.endsWith("/messages")) {
                  // Default organization for now, can be extracted from cookies in future
                  url = "https://claude.ai/api/organizations/default/chat_sequences";
                }
              }

              // Initialize options from init or input
              let options: RequestInit = { ...init };
              if (input instanceof Request) {
                options.method = options.method || input.method;
                options.body = options.body || input.body;
                // Merge headers
                const mergedHeaders = new Headers(input.headers);
                if (init?.headers) {
                  new Headers(init.headers).forEach((v, k) => mergedHeaders.set(k, v));
                }
                options.headers = mergedHeaders;
              }

              const headers = new Headers(options.headers);

              // Handle DuckDuckGo transformation
              if (providerID === PROVIDERS.DUCKDUCKGO) {
                if (!ddgVqd) await refreshDDGVqd();

                headers.set("x-vqd-4", ddgVqd || "");
                if (ddgVqdHash) headers.set("x-vqd-hash-1", ddgVqdHash);
                headers.set("accept", "text/event-stream");
                headers.set("content-type", "application/json");
                headers.set("origin", "https://duckduckgo.com");
                headers.set("referer", "https://duckduckgo.com/");

                // Remove OpenAI/Anthropic headers that might cause 400s
                headers.delete("authorization");
                headers.delete("x-api-key");
                headers.delete("api-key");
                headers.delete("openai-organization");
                headers.delete("openai-project");

                // Transform body to DDG schema
                if (options.body && typeof options.body === "string") {
                  try {
                    const oai = JSON.parse(options.body);
                    const ddgBody = {
                      model: toDDGModel(oai.model || ""),
                      messages: normalizeDDGMessages(oai.messages || []),
                    };
                    options.body = JSON.stringify(ddgBody);
                  } catch (e) {
                    logDebug("[AlternativeAuth] DDG Body Parse Error", e);
                  }
                }
              } else if (currentAuth) {
                // Clear placeholder keys that might have been injected by the core
                headers.delete("x-api-key");
                headers.delete("api-key");
                headers.delete("anthropic-api-key");
                headers.delete("authorization");

                if (providerID === PROVIDERS.PERPLEXITY && currentAuth.type === "api") {
                  headers.set("Authorization", `Bearer ${currentAuth.key}`);
                } else if (providerID === PROVIDERS.MISTRAL && currentAuth.type === "api") {
                  headers.set("Cookie", `mistral.auth_token=${currentAuth.key}`);
                } else if (currentAuth.type === "oauth") {
                  headers.set("Authorization", `Bearer ${currentAuth.access}`);
                }
              }

              options.headers = headers;
              const response = await fetch(url, options);

              // --- Reactive Rate Limit / Token Management ---
              if (response.status === 429 || response.status === 400 || response.status === 403) {
                if (providerID === PROVIDERS.DUCKDUCKGO && retryOnBadToken) {
                  logDebug(`[AlternativeAuth] DDG Error ${response.status}. Refreshing VQD...`);
                  await refreshDDGVqd();
                  return executeRequest(false);
                }
              }

              // Capture next sequence tokens (for DDG)
              if (providerID === PROVIDERS.DUCKDUCKGO) {
                const nextVqd = response.headers.get("x-vqd-4");
                const nextVqdHash = response.headers.get("x-vqd-hash-1");
                if (nextVqd) ddgVqd = nextVqd;
                if (nextVqdHash) ddgVqdHash = nextVqdHash;
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
              url: "https://venice.ai/sign-in",
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
