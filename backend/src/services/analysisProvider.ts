import { analyzeDocuments } from "./analyzer.js";
import { generateGeminiAnalysis } from "./geminiProvider.js";
import { AnalysisProviderError } from "./geminiProvider.js";
import type { AnalysisResult, StoredDocument } from "../types.js";

export async function runAnalysis(
  sessionId: string,
  instruction: string,
  documents: StoredDocument[],
): Promise<AnalysisResult> {
  const mode = (process.env.AI_MODE ?? "mock").trim().toLowerCase();
  if (mode === "mock") return analyzeDocuments(sessionId, instruction, documents);
  if (mode === "gemini") return generateGeminiAnalysis(sessionId, instruction, documents);
  throw new AnalysisProviderError("provider_configuration", `Unsupported AI_MODE: ${mode}. Use mock or gemini.`, 503);
}
