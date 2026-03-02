import type { LanguageModelV2 } from "@ai-sdk/provider"
import { withoutTrailingSlash } from "@ai-sdk/provider-utils"
import { OpenAICompatibleChatLanguageModel } from "../copilot/chat/openai-compatible-chat-language-model"
import { Auth } from "../../../auth"
import { Log } from "../../../util/log"

const log = Log.create({ service: "chatbox-provider" })

export interface ChatboxProviderSettings {
  refreshCookie?: string
  accessToken?: string
  baseURL?: string
}

export interface ChatboxProvider {
  (modelId: string): LanguageModelV2
  languageModel(modelId: string): LanguageModelV2
}

export function createChatbox(options: ChatboxProviderSettings = {}): ChatboxProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? "https://api.florate.io/v2")

  let currentAccessToken = options.accessToken
  const refreshCookie = options.refreshCookie

  const getHeaders = () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Origin": "https://app.chatboxapp.ai",
      "Referer": "https://app.chatboxapp.ai/",
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
      "x-date": new Date().toUTCString(),
      "accept": "text/event-stream",
    }
    if (currentAccessToken) {
      headers["Authorization"] = `Bearer ${currentAccessToken}`
    }
    return headers
  }

  const refreshToken = async () => {
    if (!refreshCookie) {
      throw new Error("No ChatBox_refresh cookie available for token refresh")
    }

    log.info("Refreshing Chatbox access token...")
    try {
      const response = await fetch("https://api.chatboxapp.ai/auth/v1/logins/access/refresh", {
        method: "POST",
        headers: {
          "Cookie": `ChatBox_refresh=${refreshCookie}`,
          "Content-Type": "application/json",
          "Origin": "https://app.chatboxapp.ai",
          "Referer": "https://app.chatboxapp.ai/",
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to refresh token: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as { accessToken: string }
      currentAccessToken = data.accessToken

      // Update auth.json
      const auth = await Auth.get("chatbox")
      if (auth?.type === "oauth") {
        await Auth.set("chatbox", {
          ...auth,
          access: currentAccessToken,
        })
      }

      log.info("Successfully refreshed Chatbox access token")
      return currentAccessToken
    } catch (error) {
      log.error("Error refreshing Chatbox token", { error })
      throw error
    }
  }

  const customFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Inject current headers
    const headers = { ...getHeaders(), ...(init?.headers as Record<string, string>) }

    let response = await fetch(input, { ...init, headers })

    // If 401 or 412, try refresh once
    if ((response.status === 401 || response.status === 412) && refreshCookie) {
      await refreshToken()
      const newHeaders = { ...getHeaders(), ...(init?.headers as Record<string, string>) }
      response = await fetch(input, { ...init, headers: newHeaders })
    }

    return response
  }

  const createChatModel = (modelId: string) => {
    return new OpenAICompatibleChatLanguageModel(modelId, {
      provider: "chatbox",
      headers: getHeaders,
      url: ({ path }) => `${baseURL}${path}`,
      fetch: customFetch as typeof fetch,
    })
  }

  const provider = function (modelId: string) {
    return createChatModel(modelId)
  }

  provider.languageModel = createChatModel

  return provider as ChatboxProvider
}
