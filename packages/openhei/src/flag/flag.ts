function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

export namespace Flag {
  export const OPENHEI_AUTO_SHARE = truthy("OPENHEI_AUTO_SHARE")
  export const OPENHEI_GIT_BASH_PATH = process.env["OPENHEI_GIT_BASH_PATH"]
  export const OPENHEI_CONFIG = process.env["OPENHEI_CONFIG"]
  export declare const OPENHEI_CONFIG_DIR: string | undefined
  export const OPENHEI_CONFIG_CONTENT = process.env["OPENHEI_CONFIG_CONTENT"]
  export const OPENHEI_DISABLE_AUTOUPDATE = truthy("OPENHEI_DISABLE_AUTOUPDATE")
  export const OPENHEI_DISABLE_PRUNE = truthy("OPENHEI_DISABLE_PRUNE")
  export const OPENHEI_DISABLE_TERMINAL_TITLE = truthy("OPENHEI_DISABLE_TERMINAL_TITLE")
  export const OPENHEI_PERMISSION = process.env["OPENHEI_PERMISSION"]
  export const OPENHEI_DISABLE_DEFAULT_PLUGINS = truthy("OPENHEI_DISABLE_DEFAULT_PLUGINS")
  export const OPENHEI_DISABLE_LSP_DOWNLOAD = truthy("OPENHEI_DISABLE_LSP_DOWNLOAD")
  export const OPENHEI_ENABLE_EXPERIMENTAL_MODELS = truthy("OPENHEI_ENABLE_EXPERIMENTAL_MODELS")
  export const OPENHEI_DISABLE_AUTOCOMPACT = truthy("OPENHEI_DISABLE_AUTOCOMPACT")
  export const OPENHEI_DISABLE_MODELS_FETCH = truthy("OPENHEI_DISABLE_MODELS_FETCH")
  export const OPENHEI_DISABLE_CLAUDE_CODE = truthy("OPENHEI_DISABLE_CLAUDE_CODE")
  export const OPENHEI_DISABLE_CLAUDE_CODE_PROMPT =
    OPENHEI_DISABLE_CLAUDE_CODE || truthy("OPENHEI_DISABLE_CLAUDE_CODE_PROMPT")
  export const OPENHEI_DISABLE_CLAUDE_CODE_SKILLS =
    OPENHEI_DISABLE_CLAUDE_CODE || truthy("OPENHEI_DISABLE_CLAUDE_CODE_SKILLS")
  export const OPENHEI_DISABLE_EXTERNAL_SKILLS =
    OPENHEI_DISABLE_CLAUDE_CODE_SKILLS || truthy("OPENHEI_DISABLE_EXTERNAL_SKILLS")
  export declare const OPENHEI_DISABLE_PROJECT_CONFIG: boolean
  export const OPENHEI_FAKE_VCS = process.env["OPENHEI_FAKE_VCS"]
  export declare const OPENHEI_CLIENT: string
  export const OPENHEI_SERVER_PASSWORD = process.env["OPENHEI_SERVER_PASSWORD"]
  export const OPENHEI_SERVER_USERNAME = process.env["OPENHEI_SERVER_USERNAME"]
  export const OPENHEI_ENABLE_QUESTION_TOOL = truthy("OPENHEI_ENABLE_QUESTION_TOOL")

  // Experimental
  export const OPENHEI_EXPERIMENTAL = truthy("OPENHEI_EXPERIMENTAL")
  export const OPENHEI_EXPERIMENTAL_FILEWATCHER = truthy("OPENHEI_EXPERIMENTAL_FILEWATCHER")
  export const OPENHEI_EXPERIMENTAL_DISABLE_FILEWATCHER = truthy("OPENHEI_EXPERIMENTAL_DISABLE_FILEWATCHER")
  export const OPENHEI_EXPERIMENTAL_ICON_DISCOVERY =
    OPENHEI_EXPERIMENTAL || truthy("OPENHEI_EXPERIMENTAL_ICON_DISCOVERY")

  const copy = process.env["OPENHEI_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
  export const OPENHEI_EXPERIMENTAL_DISABLE_COPY_ON_SELECT =
    copy === undefined ? process.platform === "win32" : truthy("OPENHEI_EXPERIMENTAL_DISABLE_COPY_ON_SELECT")
  export const OPENHEI_ENABLE_EXA =
    truthy("OPENHEI_ENABLE_EXA") || OPENHEI_EXPERIMENTAL || truthy("OPENHEI_EXPERIMENTAL_EXA")
  export const OPENHEI_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS = number("OPENHEI_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS")
  export const OPENHEI_EXPERIMENTAL_OUTPUT_TOKEN_MAX = number("OPENHEI_EXPERIMENTAL_OUTPUT_TOKEN_MAX")
  export const OPENHEI_EXPERIMENTAL_OXFMT = OPENHEI_EXPERIMENTAL || truthy("OPENHEI_EXPERIMENTAL_OXFMT")
  export const OPENHEI_EXPERIMENTAL_LSP_TY = truthy("OPENHEI_EXPERIMENTAL_LSP_TY")
  export const OPENHEI_EXPERIMENTAL_LSP_TOOL = OPENHEI_EXPERIMENTAL || truthy("OPENHEI_EXPERIMENTAL_LSP_TOOL")
  export const OPENHEI_DISABLE_FILETIME_CHECK = truthy("OPENHEI_DISABLE_FILETIME_CHECK")
  export const OPENHEI_EXPERIMENTAL_PLAN_MODE = OPENHEI_EXPERIMENTAL || truthy("OPENHEI_EXPERIMENTAL_PLAN_MODE")
  export const OPENHEI_EXPERIMENTAL_MARKDOWN = truthy("OPENHEI_EXPERIMENTAL_MARKDOWN")
  export const OPENHEI_MODELS_URL = process.env["OPENHEI_MODELS_URL"]
  export const OPENHEI_MODELS_PATH = process.env["OPENHEI_MODELS_PATH"]

  function number(key: string) {
    const value = process.env[key]
    if (!value) return undefined
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
  }
}

// Dynamic getter for OPENHEI_DISABLE_PROJECT_CONFIG
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "OPENHEI_DISABLE_PROJECT_CONFIG", {
  get() {
    return truthy("OPENHEI_DISABLE_PROJECT_CONFIG")
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for OPENHEI_CONFIG_DIR
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "OPENHEI_CONFIG_DIR", {
  get() {
    return process.env["OPENHEI_CONFIG_DIR"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for OPENHEI_CLIENT
// This must be evaluated at access time, not module load time,
// because some commands override the client at runtime
Object.defineProperty(Flag, "OPENHEI_CLIENT", {
  get() {
    return process.env["OPENHEI_CLIENT"] ?? "cli"
  },
  enumerable: true,
  configurable: false,
})
