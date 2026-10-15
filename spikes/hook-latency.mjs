import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
const dir = `${process.env.HOME}/.agentic-leash`;
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(`${dir}/spike.db`);
db.exec("CREATE TABLE IF NOT EXISTS grants (path TEXT, expires_at INTEGER)");
const row = db.prepare("SELECT count(*) AS n FROM grants WHERE expires_at > ?").get(Date.now());
process.stdout.write(JSON.stringify(row));
