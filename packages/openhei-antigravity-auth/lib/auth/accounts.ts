import fs from "fs"
import path from "path"

export type GoogleAccount = {
  email: string
  refreshToken: string
  accessToken?: string
  expiresAt?: number
  projectId?: string
}

const ACCOUNTS_PATH = path.join(process.env.HOME || ".", ".config", "openhei", "antigravity-accounts.json")

export async function loadAccounts(): Promise<GoogleAccount[]> {
  try {
    const raw = await fs.promises.readFile(ACCOUNTS_PATH, "utf-8")
    return JSON.parse(raw).accounts || []
  } catch {
    return []
  }
}

export async function saveAccounts(accounts: GoogleAccount[]) {
  const dir = path.dirname(ACCOUNTS_PATH)
  await fs.promises.mkdir(dir, { recursive: true })
  await fs.promises.writeFile(ACCOUNTS_PATH, JSON.stringify({ accounts }, null, 2), "utf-8")
}

export function createAccountManager() {
  return {
    getCurrentAccount(auth: any, accounts: GoogleAccount[]) {
      // If auth contains accountId, prefer that
      if (auth && (auth as any).accountId) {
        return accounts.find((a) => a.email === (auth as any).accountId) || accounts[0]
      }
      return accounts[0]
    },
    shouldRefreshToken(account: GoogleAccount) {
      if (!account.expiresAt) return false
      return Date.now() > account.expiresAt - 60 * 1000
    },
    async refreshToken(account: GoogleAccount) {
      try {
        const params = new URLSearchParams({
          client_id: process.env.OPENHEI_GOOGLE_CLIENT_ID || "",
          grant_type: "refresh_token",
          refresh_token: account.refreshToken,
        })
        const resp = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        })
        if (!resp.ok) return false
        const data = (await resp.json()) as Record<string, any>
        account.accessToken = data.access_token
        account.expiresAt = Date.now() + (data.expires_in || 0) * 1000
        // persist updated account
        const all = await loadAccounts()
        const idx = all.findIndex((a) => a.email === account.email)
        if (idx >= 0) all[idx] = account
        else all.push(account)
        await saveAccounts(all)
        return true
      } catch {
        return false
      }
    },
  }
}
