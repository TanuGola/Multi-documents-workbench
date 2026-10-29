import assert from "node:assert/strict";
import test from "node:test";
import { generateGeminiAnalysis, AnalysisProviderError, validateGeminiOutput } from "./geminiProvider.js";
import type { StoredDocument } from "../types.js";

const sourceDocument: StoredDocument = {
  id: "doc-1",
  filename: "source.txt",
  status: "processed",
  mimeType: "text/plain",
  sizeBytes: 23,
  characterCount: 23,
  extractedText: "Revenue: 100\nCompany: Northwind",
};

function validModelOutput() {
  return {
    summary: "One finding.",
    findings: [{
      title: "Revenue matches",
      category: "match",
      severity: "low",
      verificationStatus: "consistent",
      extractedFacts: [{
        field: "Revenue",
        value: "100",
        sourceDocumentId: "doc-1",
        sourceFilename: "source.txt",
        evidenceExcerpt: "Revenue: 100",
      }],
      interpretation: "The extracted value is present in the source.",
      sourceDocumentIds: ["doc-1"],
      sourceFilenames: ["source.txt"],
      supportingEvidence: ["Revenue: 100"],
      missingInformation: [],
    }],
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }), { status: 200 });
}

test("validates Gemini evidence against the original source text", () => {
  const result = validateGeminiOutput(validModelOutput(), "session-1", "Compare revenue", [sourceDocument]);
  assert.equal(result.findings[0].supportingEvidence[0], "Revenue: 100");
});

test("rejects invented or mismatched evidence", () => {
  const output = validModelOutput();
  output.findings[0].extractedFacts[0].evidenceExcerpt = "Revenue: 999";
  assert.throws(
    () => validateGeminiOutput(output, "session-1", "Compare revenue", [sourceDocument]),
    (error: unknown) => error instanceof AnalysisProviderError && error.code === "invalid_provider_output",
  );
});

test("returns a clear API failure without falling back to mock mode", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_MODEL = "test-model";
  const fakeFetch = async () => new Response(JSON.stringify({ error: "provider unavailable" }), { status: 503 });
  await assert.rejects(
    () => generateGeminiAnalysis("session-1", "Compare revenue", [sourceDocument], fakeFetch),
    (error: unknown) => error instanceof AnalysisProviderError && error.code === "provider_api_failure" && error.httpStatus === 502,
  );
});

test("returns a clear timeout error", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_MODEL = "test-model";
  process.env.ANALYSIS_TIMEOUT_MS = "5";
  const fakeFetch = async (_input: string | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });
  await assert.rejects(
    () => generateGeminiAnalysis("session-1", "Compare revenue", [sourceDocument], fakeFetch),
    (error: unknown) => error instanceof AnalysisProviderError && error.code === "provider_timeout" && error.httpStatus === 504,
  );
  delete process.env.ANALYSIS_TIMEOUT_MS;
});

test("accepts a valid structured provider response", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_MODEL = "test-model";
  const result = await generateGeminiAnalysis("session-1", "Compare revenue", [sourceDocument], async () => jsonResponse(validModelOutput()));
  assert.equal(result.findings.length, 1);
  assert.ok(result.findings[0].findingId);
});

test("filters unrelated provider findings and downgrades one-source consistency claims", () => {
  const raw = validModelOutput();
  raw.findings[0].title = "Document reference matches across documents";
  raw.findings[0].extractedFacts[0].field = "Document reference";
  raw.findings[0].extractedFacts[0].value = "100";
  const result = validateGeminiOutput(raw, "session-1", "Compare Address across these documents", [sourceDocument]);
  assert.deepEqual(result.findings, []);

  raw.findings[0].title = "Revenue matches across documents";
  raw.findings[0].extractedFacts[0].field = "Revenue";
  const reviewResult = validateGeminiOutput(raw, "session-1", "Compare revenue", [sourceDocument]);
  assert.equal(reviewResult.findings[0].verificationStatus, "review");
  assert.equal(reviewResult.findings[0].severity, "medium");
});
