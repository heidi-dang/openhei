import { copyFileSync, existsSync } from "fs"

if (!existsSync("./dist")) {
  console.log("No dist folder, skipping schema copy")
  process.exit(0)
}

if (existsSync("./dist/docs/config.json")) {
  copyFileSync("./dist/docs/config.json", "./dist/config.json")
  console.log("copied config.json to root")
}

if (existsSync("./public/theme.json")) {
  copyFileSync("./public/theme.json", "./dist/theme.json")
  console.log("copied theme.json to root")
}

if (existsSync("./dist/docs/theme.json")) {
  copyFileSync("./dist/docs/theme.json", "./dist/theme.json")
  console.log("copied theme.json to root (from docs)")
}
