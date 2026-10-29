import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { RowDataPacket } from "mysql2";
import { getPool, verifyDatabaseConnection } from "./pool.js";

const schemaPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../schema.sql");
const schema = await readFile(schemaPath, "utf8");
await verifyDatabaseConnection();
const statements = schema.split(/;\s*(?:\r?\n|$)/).map((statement) => statement.trim()).filter(Boolean);
for (const statement of statements) await getPool().query(statement);

// CREATE TABLE IF NOT EXISTS does not change an already-existing table. Keep
// upgrades safe for databases created by earlier versions of the workbench.
const requiredDocumentColumns: Record<string, string> = {
  session_id: "CHAR(36) NULL",
  mime_type: "VARCHAR(100) NULL",
  size_bytes: "BIGINT UNSIGNED NULL",
  status: "VARCHAR(30) NULL",
  character_count: "INT UNSIGNED NOT NULL DEFAULT 0",
  extracted_text: "LONGTEXT NULL",
  error_message: "TEXT NULL",
  created_at: "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP",
  updated_at: "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
};

interface ColumnCountRow extends RowDataPacket {
  count: number;
}

for (const [columnName, definition] of Object.entries(requiredDocumentColumns)) {
  const [rows] = await getPool().execute<ColumnCountRow[]>(
    `SELECT COUNT(*) AS count
       FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'documents' AND column_name = ?`,
    [columnName],
  );
  if (Number(rows[0]?.count ?? 0) === 0) {
    await getPool().query(`ALTER TABLE documents ADD COLUMN ${columnName} ${definition}`);
    console.log(`Added missing documents.${columnName} column.`);
  }
}

await getPool().end();
console.log(`Initialized ${statements.length} idempotent MySQL statements in ${process.env.MYSQL_DATABASE}.`);
