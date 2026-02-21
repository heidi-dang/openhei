const stage = process.env.SST_STAGE || "dev"

export default {
  url: stage === "production" ? "https://openhei.ai" : `https://${stage}.openhei.ai`,
  console: stage === "production" ? "https://openhei.ai/auth" : `https://${stage}.openhei.ai/auth`,
  email: "contact@anoma.ly",
  socialCard: "https://social-cards.sst.dev",
  github: "https://github.com/heidi-dang/openhei",
  discord: "https://openhei.ai/discord",
  headerLinks: [
    { name: "app.header.home", url: "/" },
    { name: "app.header.docs", url: "/docs/" },
  ],
}
