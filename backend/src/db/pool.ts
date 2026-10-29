import mysql, { type Pool, type PoolConnection } from "mysql2/promise";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const database = process.env.MYSQL_DATABASE?.trim();
    const user = process.env.MYSQL_USER?.trim();
    if (!database || !user) throw new Error("MYSQL_DATABASE and MYSQL_USER must be configured for MySQL persistence.");
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST?.trim() || "127.0.0.1",
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user,
      password: process.env.MYSQL_PASSWORD ?? "",
      database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: "utf8mb4",
    });
  }
  return pool;
}

export async function verifyDatabaseConnection(): Promise<void> {
  const connection = await getPool().getConnection();
  try {
    await connection.query("SELECT 1 AS connection_ok");
  } finally {
    connection.release();
  }
}

export async function withTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
