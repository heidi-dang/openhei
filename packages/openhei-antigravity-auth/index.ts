import type { Plugin, PluginInput } from "@openhei-ai/plugin"
import type { Auth } from "@openhei-ai/sdk"
import { openBrowserUrl } from "./lib/auth/browser"
import { startLocalOAuthServer, waitForOAuthCallback } from "./lib/auth/server"
import { createGoogleOAuthUrl, exchangeGoogleCode, createPKCE } from "./lib/auth/oauth"
import { loadAccounts, saveAccounts, type GoogleAccount, createAccountManager } from "./lib/auth/accounts"
import { getConfig, saveConfig } from "./lib/config"

const PROVIDER_ID = "google"

export const AntigravityAuthPlugin: Plugin = async (input: PluginInput) => {
  const manager = createAccountManager()

  return {
    auth: {
      provider: PROVIDER_ID,
      async loader(getAuth: () => Promise<Auth>, provider: unknown) {
        const auth = await getAuth()

        if (auth.type !== "oauth") {
          return {}
        }

        const accounts = await loadAccounts()
        const currentAccount = manager.getCurrentAccount(auth, accounts)

        if (!currentAccount) {
          return {}
        }

        return {
          apiKey: "",
          async fetch(request: Request | string | URL, init?: RequestInit) {
            let currentAuth = await getAuth()

            const accounts = await loadAccounts()
            const account = manager.getCurrentAccount(currentAuth, accounts)

            if (!account) {
              return fetch(request, init)
            }

            if (manager.shouldRefreshToken(account)) {
              const refreshed = await manager.refreshToken(account)
              if (refreshed) {
                currentAuth = await getAuth()
              }
            }

            const url = request instanceof URL ? request.href : request.toString()
            const headers: Record<string, string> = {
              ...(init?.headers as Record<string, string>),
              Authorization: `Bearer ${"access_token" in currentAuth ? (currentAuth as any).access : ""}`,
              "Content-Type": "application/json",
            }

            return fetch(url, {
              ...init,
              headers,
            })
          },
        }
      },
      methods: [
        {
          type: "oauth",
          label: "Login with Google (Antigravity)",
          authorize: async () => {
            try {
              const { verifier, challenge } = await createPKCE()
              const { url, state } = await createGoogleOAuthUrl(challenge)

              const serverInfo = await startLocalOAuthServer({ state })

              openBrowserUrl(url)

              if (!serverInfo.ready) {
                serverInfo.close()
                return {
                  url,
                  method: "code" as const,
                  instructions: "Paste the authorization code from the browser:",
                  callback: async (code: string) => {
                    const tokens = await exchangeGoogleCode(code, verifier)
                    if (tokens) {
                      const accounts = await loadAccounts()
                      const email = tokens.email || "Unknown"

                      const newAccount: GoogleAccount = {
                        email,
                        refreshToken: tokens.refresh_token,
                        accessToken: tokens.access_token,
                        expiresAt: Date.now() + tokens.expires_in * 1000,
                        projectId: tokens.project_id,
                      }

                      accounts.push(newAccount)
                      await saveAccounts(accounts)

                      return {
                        type: "success" as const,
                        refresh: tokens.refresh_token,
                        access: tokens.access_token,
                        expires: tokens.expires_in,
                        accountId: email,
                      }
                    }
                    return { type: "failed" as const }
                  },
                }
              }

              return {
                url,
                method: "auto" as const,
                instructions: "Authorize in your browser, then come back here",
                callback: async () => {
                  const result = await waitForOAuthCallback(serverInfo)
                  serverInfo.close()

                  if (!result) {
                    return { type: "failed" as const }
                  }

                  const tokens = await exchangeGoogleCode(result.code, verifier)
                  if (tokens) {
                    const accounts = await loadAccounts()
                    const email = tokens.email || "Unknown"

                    const newAccount: GoogleAccount = {
                      email,
                      refreshToken: tokens.refresh_token,
                      accessToken: tokens.access_token,
                      expiresAt: Date.now() + tokens.expires_in * 1000,
                      projectId: tokens.project_id,
                    }

                    accounts.push(newAccount)
                    await saveAccounts(accounts)

                    return {
                      type: "success" as const,
                      refresh: tokens.refresh_token,
                      access: tokens.access_token,
                      expires: tokens.expires_in,
                      accountId: email,
                    }
                  }
                  return { type: "failed" as const }
                },
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              return {
                url: "",
                method: "code" as const,
                instructions: `Google OAuth is not configured: ${message}. Set OPENHEI_GOOGLE_CLIENT_ID and try again.`,
                callback: async () => ({ type: "failed" as const }),
              }
            }
          },
        },
        {
          type: "oauth",
          label: "Add another Google account",
          authorize: async () => {
            try {
              const { verifier, challenge } = await createPKCE()
              const { url, state } = await createGoogleOAuthUrl(challenge)

              const serverInfo = await startLocalOAuthServer({ state })

              openBrowserUrl(url)

              return {
                url,
                method: "auto" as const,
                instructions: "Authorize with another Google account",
                callback: async () => {
                  const result = await waitForOAuthCallback(serverInfo)
                  serverInfo.close()

                  if (!result) {
                    return { type: "failed" as const }
                  }

                  const tokens = await exchangeGoogleCode(result.code, verifier)
                  if (tokens) {
                    const accounts = await loadAccounts()
                    const email = tokens.email || "Unknown"

                    const newAccount: GoogleAccount = {
                      email,
                      refreshToken: tokens.refresh_token,
                      accessToken: tokens.access_token,
                      expiresAt: Date.now() + tokens.expires_in * 1000,
                      projectId: tokens.project_id,
                    }

                    accounts.push(newAccount)
                    await saveAccounts(accounts)

                    return {
                      type: "success" as const,
                      refresh: tokens.refresh_token,
                      access: tokens.access_token,
                      expires: tokens.expires_in,
                      accountId: email,
                    }
                  }
                  return { type: "failed" as const }
                },
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              return {
                url: "",
                method: "code" as const,
                instructions: `Google OAuth is not configured: ${message}. Set OPENHEI_GOOGLE_CLIENT_ID and try again.`,
                callback: async () => ({ type: "failed" as const }),
              }
            }
          },
        },
      ],
    },
    metadata: {
      name: "Google Antigravity",
      icon: "google",
      description: "Use Google's Antigravity IDE for AI coding assistance with Gemini models",
      usage:
        "Run `openhei auth login` and select Google Antigravity OAuth. Supports multiple Google accounts for quota rotation. Use Gemini models through Google's infrastructure.",
    },
    healthCheck: async () => {
      const accounts = await loadAccounts()
      if (accounts.length === 0) {
        return { healthy: false, message: "No accounts configured. Run `openhei auth login` to add an account." }
      }
      const hasValidAccount = accounts.some((acc) => !manager.shouldRefreshToken(acc))
      if (!hasValidAccount) {
        return { healthy: false, message: "All accounts need re-authentication" }
      }
      return { healthy: true, message: `${accounts.length} account(s) configured` }
    },
  }
}

export default AntigravityAuthPlugin
