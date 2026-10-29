import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import documentsRouter from "./routes/documents.js";
import analysisRouter from "./routes/analysis.js";
import { verifyDatabaseConnection } from "./db/pool.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  }),
);
app.use(express.json());
app.use("/api/documents", documentsRouter);
app.use("/api/analysis", analysisRouter);

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    aiMode: process.env.AI_MODE ?? "mock",
  });
});

async function startServer() {
  try {
    await verifyDatabaseConnection();
    app.listen(port, () => console.log(`Backend listening on http://localhost:${port}`));
  } catch (error) {
    console.error("MySQL connection failed. Check MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE, and run npm run db:init.");
    console.error(error instanceof Error ? error.message : "Unknown database error");
    process.exitCode = 1;
  }
}

void startServer();
