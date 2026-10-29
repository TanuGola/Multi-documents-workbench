import { Router } from "express";
import { getSessionDocuments } from "./documents.js";
import { runAnalysis } from "../services/analysisProvider.js";
import { AnalysisProviderError } from "../services/geminiProvider.js";
import { randomUUID } from "node:crypto";
import { getAnalysis, saveAnalysis } from "../db/persistence.js";

const router = Router();
const maxInstructionLength = 2000;

router.get("/:analysisId", async (request, response) => {
  try {
    const result = await getAnalysis(request.params.analysisId);
    if (!result) {
      response.status(404).json({ error: "The saved analysis was not found." });
      return;
    }
    response.json(result);
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "The saved analysis could not be retrieved." });
  }
});

router.post("/", async (request, response) => {
  const { sessionId, instruction } = request.body as { sessionId?: unknown; instruction?: unknown };
  if (typeof sessionId !== "string" || !sessionId.trim()) {
    response.status(400).json({ error: "sessionId is required." });
    return;
  }
  if (typeof instruction !== "string" || !instruction.trim()) {
    response.status(400).json({ error: "instruction is required." });
    return;
  }
  if (instruction.length > maxInstructionLength) {
    response.status(400).json({ error: `instruction must be ${maxInstructionLength} characters or fewer.` });
    return;
  }

  try {
    const documents = await getSessionDocuments(sessionId);
    if (!documents) {
      response.status(404).json({ error: "The upload session was not found." });
      return;
    }
    const readableDocuments = documents.filter((document) => document.status === "processed");
    if (readableDocuments.length === 0) {
      response.status(422).json({ error: "The session has no readable documents to analyze." });
      return;
    }

    const result = await runAnalysis(sessionId, instruction.trim(), readableDocuments);
    const mode = (process.env.AI_MODE ?? "mock").trim().toLowerCase() === "gemini" ? "gemini" as const : "mock" as const;
    const analysisId = randomUUID();
    const persistedResult = {
      ...result,
      analysisId,
      mode,
      createdAt: new Date().toISOString(),
      documents: documents.map(({ extractedText: _extractedText, ...document }) => document),
    };
    await saveAnalysis(analysisId, sessionId, instruction.trim(), mode, persistedResult, documents);
    response.json(persistedResult);
  } catch (error: unknown) {
    if (error instanceof AnalysisProviderError) {
      response.status(error.httpStatus).json({ error: error.message, code: error.code });
      return;
    }
    response.status(500).json({ error: error instanceof Error ? error.message : "Analysis failed." });
  }
});

export default router;
