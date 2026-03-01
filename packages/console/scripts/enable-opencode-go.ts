import mysql from "mysql2/promise"

// Small helper script to enable opencode-go models for a workspace using DB
// Usage: node enable-opencode-go.js <workspace_id>

async function main() {
  const workspace = process.argv[2]
  if (!workspace) {
    console.error("Usage: node enable-opencode-go.js <workspace_id>")
    process.exit(1)
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "",
    database: process.env.DB_NAME || "openhei",
  })

  const models = [
    'minimax-m2.5',
    'minimax-m2.5-free',
    'minimax-m2.1',
    'glm-5',
    'glm-5-free',
    'glm-4.7',
    'glm-4.6',
    'kimi-k2.5',
    'kimi-k2.5-free',
    'kimi-k2-thinking',
    'kimi-k2',
  ]

  const placeholders = models.map(() => "?").join(",")
  const sql = `DELETE FROM model WHERE workspace_id = ? AND model IN (${placeholders})`

  const params = [workspace, ...models]

  try {
    const [result] = await connection.execute(sql, params)
    console.log("Deleted rows:", (result as any).affectedRows)
  } catch (e) {
    console.error("Error:", e)
    process.exit(1)
  } finally {
    await connection.end()
  }
}

main()
