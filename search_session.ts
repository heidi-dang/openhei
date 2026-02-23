import { Database } from "bun:sqlite";

const id = "ses_37fba4d84ffeLcRNwbZnFsNrJX";
const paths = [
    "/home/heidi/.local/share/openhei/openhei.db",
    "/home/heidi/snap/bun-js/87/.local/share/openhei/openhei.db"
];

for (const p of paths) {
    console.log(`Checking ${p}...`);
    try {
        const db = new Database(p);
        const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all();
        if (tables.length === 0) {
            console.log(`  DB is empty (no tables)`);
        } else {
            const row = db.query("SELECT id, title FROM session WHERE id = ?").get(id);
            if (row) {
                console.log(`  FOUND:`, row);
            } else {
                console.log(`  Not found in this DB`);
            }
        }
        db.close();
    } catch (e) {
        console.error(`  Error: ${e}`);
    }
}
