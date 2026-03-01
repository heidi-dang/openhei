// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BunServer = any

interface OAuthServerInfo {
  server: BunServer
  port: number
  ready: boolean
  close: () => void
}

const OAUTH_PORT = 51121

export function startLocalOAuthServer(options: { state: string }): Promise<OAuthServerInfo> {
  return new Promise((resolve) => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url)

        if (url.pathname === "/auth/callback") {
          const code = url.searchParams.get("code")
          const state = url.searchParams.get("state")

          if (state !== options.state) {
            return new Response("Invalid state", { status: 400 })
          }

          if (code) {
            return new Response(
              `<html><body><h1>Authentication Successful!</h1><p>You can close this window and return to opencode.</p><script>window.close()</script></body></html>`,
              { headers: { "Content-Type": "text/html" } },
            )
          }
        }

        return new Response("Not Found", { status: 404 })
      },
    })

    const port = server.port ?? 0
    const ready = port === OAUTH_PORT || port > 0

    resolve({
      server,
      port,
      ready,
      close: () => server.stop(),
    })
  })
}

interface OAuthCallbackResult {
  code: string
  state: string
}

export function waitForOAuthCallback(serverInfo: OAuthServerInfo): Promise<OAuthCallbackResult | null> {
  return new Promise((resolve) => {
    const checkCallback = async () => {
      try {
        const response = await fetch(`http://localhost:${serverInfo.port}/auth/callback`)
        if (response.status === 200) {
          const url = new URL(response.url)
          const code = url.searchParams.get("code")
          const state = url.searchParams.get("state")

          if (code && state) {
            resolve({ code, state })
            return
          }
        }
      } catch {
        // Server might not be ready yet
      }

      setTimeout(checkCallback, 1000)
    }

    checkCallback()

    setTimeout(() => resolve(null), 300000)
  })
}
