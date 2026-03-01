import { exec } from "child_process"
import { platform } from "os"

export async function openBrowserUrl(url: string): Promise<void> {
  const command =
    platform() === "win32" ? `start "" "${url}"` : platform() === "darwin" ? `open "${url}"` : `xdg-open "${url}"`

  return new Promise((resolve) => {
    exec(command, (error) => {
      if (error) {
        console.log(`Please open this URL in your browser: ${url}`)
      }
      resolve()
    })
  })
}
