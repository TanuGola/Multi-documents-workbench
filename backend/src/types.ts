export type DocumentStatus =
  | "processed"
  | "empty"
  | "corrupt"
  | "unsupported"
  | "oversized"
  | "scanned_pdf"
  | "unreadable";

export interface ProcessedDocument {
  id: string;
  filename: string;
  status: DocumentStatus;
  mimeType: string;
  sizeBytes: number;
  characterCount: number;
  error?: string;
}

export interface StoredDocument extends ProcessedDocument {
  extractedText: string;
}

export type VerificationStatus = "discrepancy" | "consistent" | "not_found" | "review";
export type FindingSeverity = "low" | "medium" | "high";

export interface ExtractedFact {
  field: string;
  value: string;
  sourceDocumentId: string;
  sourceFilename: string;
  evidenceExcerpt: string;
}

export interface AnalysisFinding {
  findingId: string;
  title: string;
  category: "match" | "discrepancy" | "missing_information" | "review";
  severity: FindingSeverity;
  verificationStatus: VerificationStatus;
  extractedFacts: ExtractedFact[];
  interpretation: string;
  sourceDocumentIds: string[];
  sourceFilenames: string[];
  supportingEvidence: string[];
  missingInformation: string[];
}

export interface AnalysisResult {
  sessionId: string;
  instruction: string;
  findings: AnalysisFinding[];
  summary: string;
  analysisId?: string;
  mode?: "mock" | "gemini";
  createdAt?: string;
  documents?: Array<{
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    status: DocumentStatus;
    characterCount: number;
    error?: string;
  }>;
}
