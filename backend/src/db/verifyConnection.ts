import "dotenv/config";
import type { RowDataPacket } from "mysql2";
import { getPool, verifyDatabaseConnection } from "./pool.js";

const requiredTables = ["documents", "analyses", "analysis_documents", "findings"];

await verifyDatabaseConnection();
const [rows] = await getPool().query<RowDataPacket[]>("SELECT 1 AS connection_ok");
const [tableRows] = await getPool().query<RowDataPacket[]>(
  `SELECT table_name AS table_name
     FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name IN (?)`,
  [requiredTables],
);
const foundTables = new Set(tableRows.map((row) => String(row.table_name)));
const missingTables = requiredTables.filter((tableName) => !foundTables.has(tableName));
await getPool().end();

if (missingTables.length > 0) {
  throw new Error(`MySQL connection is reachable, but required tables are missing: ${missingTables.join(", ")}. Run npm run db:init.`);
}

console.log(
  `MySQL connection and schema verified for ${process.env.MYSQL_DATABASE}: ${Number(rows[0]?.connection_ok) === 1 ? "ok" : "unexpected response"}. Tables: ${requiredTables.join(", ")}.`,
);
