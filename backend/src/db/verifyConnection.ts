import "dotenv/config";
import type { RowDataPacket } from "mysql2";
import { getPool, verifyDatabaseConnection } from "./pool.js";

await verifyDatabaseConnection();
const [rows] = await getPool().query<RowDataPacket[]>("SELECT 1 AS connection_ok");
await getPool().end();
console.log(`MySQL connection verified for ${process.env.MYSQL_DATABASE}: ${Number(rows[0]?.connection_ok) === 1 ? "ok" : "unexpected response"}.`);
