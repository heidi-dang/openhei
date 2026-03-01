// This bridge intentionally keeps runtime-side resolution minimal to avoid
// importing Node built-ins at build time in the repo tooling. It returns a
// small wrapper that dynamically imports the external plugin at runtime.

const candidate =
  (typeof process !== "undefined" ? process.env.HOME || "" : "") + "/.config/openhei/plugins/opencode-morph-fast-apply"

export default async function (input: any) {
  try {
    const mod = await import(/* @vite-ignore */ candidate + "/index.ts")
    const pluginFactory = mod?.default ?? mod
    if (typeof pluginFactory === "function") return await pluginFactory(input)
    return pluginFactory
  } catch (err) {
    try {
      const mod = await import(/* @vite-ignore */ candidate + "/index.js")
      const pluginFactory = mod?.default ?? mod
      if (typeof pluginFactory === "function") return await pluginFactory(input)
      return pluginFactory
    } catch (e) {
      return {}
    }
  }
}
