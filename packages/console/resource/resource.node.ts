import type { KVNamespaceListOptions, KVNamespaceListResult, KVNamespacePutOptions } from "@cloudflare/workers-types"
import { Resource as ResourceBase } from "sst"
import Cloudflare from "cloudflare"

const env = process.env

const devResources: Record<string, any> = {
  App: {
    stage: "development",
  },
  Database: {
    host: env.PLANETSCALE_DB_HOST ?? "localhost",
    username: env.PLANETSCALE_DB_USERNAME ?? "root",
    password: env.PLANETSCALE_DB_PASSWORD ?? "",
    database: env.PLANETSCALE_DB_DATABASE ?? "console",
    port: env.PLANETSCALE_DB_PORT ? parseInt(env.PLANETSCALE_DB_PORT) : 3306,
  },
  ZEN_SESSION_SECRET: { value: env.ZEN_SESSION_SECRET ?? "dev-secret-change-in-production" },
  STRIPE_SECRET_KEY: { value: env.STRIPE_SECRET_KEY ?? "" },
  STRIPE_WEBHOOK_SECRET: { value: env.STRIPE_WEBHOOK_SECRET ?? "" },
  GITHUB_CLIENT_ID_CONSOLE: { value: env.GITHUB_CLIENT_ID_CONSOLE ?? "" },
  GITHUB_CLIENT_SECRET_CONSOLE: { value: env.GITHUB_CLIENT_SECRET_CONSOLE ?? "" },
  GOOGLE_CLIENT_ID: { value: env.GOOGLE_CLIENT_ID ?? "" },
  GOOGLE_CLIENT_SECRET: { value: env.GOOGLE_CLIENT_SECRET ?? "" },
  AWS_SES_ACCESS_KEY_ID: { value: env.AWS_SES_ACCESS_KEY_ID ?? "" },
  AWS_SES_SECRET_ACCESS_KEY: { value: env.AWS_SES_SECRET_ACCESS_KEY ?? "" },
  Email: { sender: env.EMAIL_SENDER ?? "noreply@anoma.ly" },
  HONEYCOMB_API_KEY: { value: env.HONEYCOMB_API_KEY ?? "" },
  CLOUDFLARE_API_TOKEN: { value: env.CLOUDFLARE_API_TOKEN ?? "" },
  CLOUDFLARE_DEFAULT_ACCOUNT_ID: { value: env.CLOUDFLARE_DEFAULT_ACCOUNT_ID ?? "" },
}

const modelEnvs = [
  "ZEN_MODELS1",
  "ZEN_MODELS2",
  "ZEN_MODELS3",
  "ZEN_MODELS4",
  "ZEN_MODELS5",
  "ZEN_MODELS6",
  "ZEN_MODELS7",
  "ZEN_MODELS8",
  "ZEN_MODELS9",
  "ZEN_MODELS10",
  "ZEN_MODELS11",
  "ZEN_MODELS12",
  "ZEN_MODELS13",
  "ZEN_MODELS14",
  "ZEN_MODELS15",
  "ZEN_MODELS16",
  "ZEN_MODELS17",
  "ZEN_MODELS18",
  "ZEN_MODELS19",
  "ZEN_MODELS20",
  "ZEN_MODELS21",
  "ZEN_MODELS22",
  "ZEN_MODELS23",
  "ZEN_MODELS24",
  "ZEN_MODELS25",
  "ZEN_MODELS26",
  "ZEN_MODELS27",
  "ZEN_MODELS28",
  "ZEN_MODELS29",
  "ZEN_MODELS30",
]

for (const key of modelEnvs) {
  devResources[key] = { value: env[key] ?? "{}" }
}

const blackEnvs = ["ZEN_BLACK_LIMITS", "ZEN_BLACK_PRICE"]
for (const key of blackEnvs) {
  devResources[key] = { value: env[key] ?? "{}" }
}

const kvStore: Record<string, Map<string, string>> = {}

export const waitUntil = async (promise: Promise<any>) => {
  await promise
}

export const Resource = new Proxy(
  {},
  {
    get(_target, prop: keyof typeof ResourceBase) {
      if (prop in devResources) {
        return devResources[prop]
      }

      const value = ResourceBase?.[prop as keyof typeof ResourceBase]
      if (value && typeof value === "object" && "type" in value) {
        // @ts-ignore
        if (value.type === "sst.cloudflare.Bucket") {
          return {
            put: async () => {},
          }
        }
        // @ts-ignore
        if (value.type === "sst.cloudflare.Kv") {
          // @ts-ignore
          const namespaceId = value.namespaceId
          return {
            get: (k: string | string[]) => {
              const ns = kvStore[namespaceId] ?? new Map()
              if (Array.isArray(k)) {
                return Promise.resolve(new Map(k.map((key) => [key, ns.get(key) ?? ""])))
              }
              return Promise.resolve(ns.get(k as string) ?? "")
            },
            put: (k: string, v: string, _opts?: KVNamespacePutOptions) => {
              let ns = kvStore[namespaceId]
              if (!ns) {
                ns = new Map()
                kvStore[namespaceId] = ns
              }
              ns.set(k, v)
              return Promise.resolve()
            },
            delete: (k: string) => {
              const ns = kvStore[namespaceId]
              if (ns) ns.delete(k)
              return Promise.resolve()
            },
            list: (_opts?: KVNamespaceListOptions): Promise<KVNamespaceListResult<unknown, string>> => {
              const ns = kvStore[namespaceId]
              return Promise.resolve({
                keys: Array.from(ns?.keys() ?? []).map((name) => ({ name })),
                list_complete: true,
                cacheStatus: null,
              })
            },
          }
        }
      }
      if (value && typeof value === "object" && "value" in value) {
        return value
      }
      return devResources[prop] ?? { value: "" }
    },
  },
) as Record<string, any>
