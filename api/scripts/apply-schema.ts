// Applies schema.sql to the branch in DATABASE_URL_UNPOOLED (idempotent).
import { readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_UNPOOLED is not set");
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  const { rows } = await client.query("select table_name from information_schema.tables where table_schema = 'public' order by 1");
  console.log("Schema applied:", rows.map(row => row.table_name).join(", "));
} finally {
  await client.end();
}
