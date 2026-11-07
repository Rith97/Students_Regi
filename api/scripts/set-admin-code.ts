// Sets the admin code (portal "__admin__" login and admin-app access key) on
// the branch in DATABASE_URL_UNPOOLED. Usage: ADMIN_CODE=... node scripts/set-admin-code.ts
import { randomUUID } from "node:crypto";
import pg from "pg";
import { hashPin } from "../src/portal.ts";

const code = String(process.env.ADMIN_CODE || "").trim();
if (code.length < 6) throw new Error("ADMIN_CODE must be at least 6 characters");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
await client.connect();
try {
  const salt = randomUUID();
  await client.query(`insert into portal_access (scope, class_name, salt, pin_hash, teacher_name, enabled, updated_at)
    values ('admin', '', $1, $2, 'រដ្ឋបាល', true, $3)
    on conflict (scope, class_name) do update set salt = excluded.salt, pin_hash = excluded.pin_hash, enabled = true, updated_at = excluded.updated_at`,
    [salt, hashPin(salt, code), new Date().toISOString()]);
  console.log("Admin code set.");
} finally {
  await client.end();
}
