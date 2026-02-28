import crypto from "crypto"

export const GOOGLE_CLIENT_ID = process.env.OPENHEI_GOOGLE_CLIENT_ID || ""
export const GOOGLE_REDIRECT_URI = process.env.OPENHEI_GOOGLE_REDIRECT_URI || "http://localhost:51121/auth/callback"
export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/cloud-platform", "openid", "email", "profile"]

export async function createPKCE() {
  const verifier = crypto.randomBytes(64).toString("base64url")
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url")
  return { verifier, challenge }
}

export async function createGoogleOAuthUrl(challenge: string) {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error(
      "Google OAuth client_id is not configured. Set OPENHEI_GOOGLE_CLIENT_ID in your environment to a valid OAuth Client ID.",
    )
  }

  const state = crypto.randomBytes(16).toString("hex")
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  })
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, state }
}

export async function exchangeGoogleCode(code: string, verifier: string) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: GOOGLE_REDIRECT_URI,
    code_verifier: verifier,
  })

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  })

  if (!resp.ok) return null
  const data = (await resp.json()) as Record<string, any>

  // Try to fetch basic user info
  let email: string | undefined = undefined
  try {
    const idResp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${data.access_token}` },
    })
    if (idResp.ok) {
      const id = (await idResp.json()) as Record<string, any>
      email = id.email
    }
  } catch {}

  return Object.assign({}, data, { email })
}
