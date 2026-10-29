import type { RowDataPacket } from "mysql2";
import { getPool, withTransaction } from "./pool.js";
import type { AnalysisResult, StoredDocument } from "../types.js";

export async function saveDocuments(sessionId: string, documents: StoredDocument[]): Promise<void> {
  await withTransaction(async (connection) => {
    for (const document of documents) {
      await connection.execute(
        `INSERT INTO documents
          (id, session_id, filename, mime_type, size_bytes, status, character_count, extracted_text, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           session_id = VALUES(session_id),
           filename = VALUES(filename), mime_type = VALUES(mime_type), size_bytes = VALUES(size_bytes),
           status = VALUES(status), character_count = VALUES(character_count),
           extracted_text = VALUES(extracted_text), error_message = VALUES(error_message), updated_at = CURRENT_TIMESTAMP`,
        [document.id, sessionId, document.filename, document.mimeType, document.sizeBytes, document.status,
          document.characterCount, document.extractedText || null, document.error ?? null],
      );
    }
  });
}

interface SessionDocumentRow extends RowDataPacket {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: StoredDocument["status"];
  characterCount: number;
  extractedText: string | null;
  errorMessage: string | null;
}

export async function getDocumentsBySessionId(sessionId: string): Promise<StoredDocument[] | undefined> {
  const [rows] = await getPool().execute<SessionDocumentRow[]>(
    `SELECT id, filename, mime_type AS mimeType, size_bytes AS sizeBytes,
            status, character_count AS characterCount, extracted_text AS extractedText,
            error_message AS errorMessage
       FROM documents
      WHERE session_id = ?
      ORDER BY created_at, id`,
    [sessionId],
  );
  if (rows.length === 0) return undefined;
  return rows.map(({ errorMessage, ...document }) => ({
    ...document,
    extractedText: document.extractedText ?? "",
    ...(errorMessage ? { error: errorMessage } : {}),
  }));
}

export async function saveAnalysis(
  analysisId: string,
  sessionId: string,
  instruction: string,
  mode: "mock" | "gemini",
  result: AnalysisResult,
  documents: StoredDocument[],
): Promise<void> {
  await withTransaction(async (connection) => {
    await connection.execute(
      "INSERT INTO analyses (id, session_id, instruction, ai_mode, summary) VALUES (?, ?, ?, ?, ?)",
      [analysisId, sessionId, instruction, mode, result.summary],
    );

    for (const [uploadOrder, document] of documents.entries()) {
      await connection.execute(
        "INSERT INTO analysis_documents (analysis_id, document_id, upload_order) VALUES (?, ?, ?)",
        [analysisId, document.id, uploadOrder],
      );
    }

    for (const finding of result.findings) {
      await connection.execute(
        `INSERT INTO findings
          (id, analysis_id, title, category, severity, verification_status, interpretation,
           extracted_facts, source_document_ids, source_filenames, supporting_evidence,
           missing_information, finding_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [finding.findingId, analysisId, finding.title, finding.category, finding.severity,
          finding.verificationStatus, finding.interpretation, JSON.stringify(finding.extractedFacts),
          JSON.stringify(finding.sourceDocumentIds), JSON.stringify(finding.sourceFilenames),
          JSON.stringify(finding.supportingEvidence), JSON.stringify(finding.missingInformation),
          JSON.stringify(finding)],
      );
    }
  });
}

interface AnalysisRow extends RowDataPacket {
  id: string;
  session_id: string;
  instruction: string;
  ai_mode: "mock" | "gemini";
  summary: string;
  created_at: Date;
}

interface FindingRow extends RowDataPacket {
  finding_json: string | object;
}

export async function getAnalysis(analysisId: string): Promise<AnalysisResult | undefined> {
  const pool = getPool();
  const [analysisRows] = await pool.execute<AnalysisRow[]>(
    "SELECT id, session_id, instruction, ai_mode, summary, created_at FROM analyses WHERE id = ?",
    [analysisId],
  );
  const analysis = analysisRows[0];
  if (!analysis) return undefined;

  const [findingRows] = await pool.execute<FindingRow[]>(
    "SELECT finding_json FROM findings WHERE analysis_id = ? ORDER BY created_at, id",
    [analysisId],
  );
  const findings = findingRows.map((row) => typeof row.finding_json === "string" ? JSON.parse(row.finding_json) : row.finding_json);
  const [documentRows] = await pool.execute<RowDataPacket[]>(
    `SELECT d.id, d.filename, d.mime_type AS mimeType, d.size_bytes AS sizeBytes,
            d.status, d.character_count AS characterCount, d.error_message AS errorMessage,
            ad.upload_order AS uploadOrder
       FROM analysis_documents ad
       JOIN documents d ON d.id = ad.document_id
      WHERE ad.analysis_id = ?
      ORDER BY ad.upload_order`,
    [analysisId],
  );

  return {
    analysisId: analysis.id,
    sessionId: analysis.session_id,
    instruction: analysis.instruction,
    mode: analysis.ai_mode,
    createdAt: new Date(analysis.created_at).toISOString(),
    summary: analysis.summary,
    findings,
    documents: documentRows.map(({ uploadOrder: _uploadOrder, errorMessage, ...document }) => ({
      ...document,
      ...(errorMessage ? { error: errorMessage } : {}),
    })),
  } as AnalysisResult;
}
