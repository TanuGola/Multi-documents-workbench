import { randomUUID } from "node:crypto";
import type { AnalysisFinding, AnalysisResult, ExtractedFact, StoredDocument } from "../types.js";

interface DocumentFactSet {
  document: StoredDocument;
  facts: ExtractedFact[];
}

function normalizeField(field: string): string {
  return field.trim().replace(/\s+/g, " ").toLowerCase();
}

const inlineFieldLabels = [
  "application date",
  "submission date",
  "document reference",
  "annual revenue",
  "applicant name",
  "prepared date",
  "company",
  "address",
  "revenue",
  "income",
  "name",
  "date",
].sort((left, right) => right.length - left.length);
const inlineFieldPattern = new RegExp(
  `\\b(${inlineFieldLabels.map((label) => label.replace(/ /g, "\\s+")).join("|")})\\s*:`,
  "gi",
);

const recognizedInstructionTerms = /\b(?:applicant|application|identity|name|names|address|revenue|income|financial|earnings|turnover|date|dates|submitted|prepared)\b/i;
const instructionStopWords = new Set(["the", "and", "across", "these", "those", "document", "documents", "compare", "comparison", "check", "fields", "field", "information"]);

function isFieldRequested(field: string, instruction: string): boolean {
  if (!recognizedInstructionTerms.test(instruction)) return true;
  const fieldWords = normalizeField(field).split(" ").filter((word) => word.length > 2 && !instructionStopWords.has(word));
  const instructionWords = new Set(normalizeField(instruction).match(/[a-z0-9]+/g) ?? []);
  if (fieldWords.some((word) => instructionWords.has(word))) return true;
  if (/\b(?:applicant|identity|name|names)\b/i.test(instruction) && /(?:name|applicant|identity)/i.test(field)) return true;
  if (/\b(?:revenue|income|financial|earnings|turnover)\b/i.test(instruction) && /(?:revenue|income|financial|earnings|turnover)/i.test(field)) return true;
  if (/\baddress(?:es)?\b/i.test(instruction) && /address/i.test(field)) return true;
  if (/\bdates?\b|\bsubmitted\b|\bprepared\b/i.test(instruction) && /date|submitted|prepared/i.test(field)) return true;
  return false;
}

function relevantDocumentsForField(field: string, documents: DocumentFactSet[], instruction: string): DocumentFactSet[] {
  const label = normalizeField(field);
  return documents.filter(({ document, facts }) => {
    if (facts.some((fact) => normalizeField(fact.field) === label)) return true;
    const filenameAndText = `${document.filename} ${document.extractedText}`.toLowerCase();
    if (/(revenue|income|financial|earnings|turnover)/i.test(label)) {
      return /financial|statement|revenue|income|company|application|verification|loan/i.test(filenameAndText);
    }
    if (/(name|identity|address)/i.test(label)) {
      return /identity|address|application|verification|loan|applicant|company/i.test(filenameAndText);
    }
    if (/(date|submitted|prepared)/i.test(label)) {
      return /application|verification|loan|submission|prepared|report/i.test(filenameAndText)
        && /\bdates?\b|\bsubmitted\b|\bprepared\b/i.test(instruction);
    }
    return false;
  });
}

function extractFacts(document: StoredDocument): ExtractedFact[] {
  return document.extractedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const inlineMatches = [...line.matchAll(inlineFieldPattern)];
      if (inlineMatches.length > 0) {
        return inlineMatches.flatMap((match, index) => {
          const field = match[1].trim();
          const valueStart = (match.index ?? 0) + match[0].length;
          const valueEnd = inlineMatches[index + 1]?.index ?? line.length;
          const value = line.slice(valueStart, valueEnd).trim();
          if (!field || !value) return [];
          return [{
            field,
            value,
            sourceDocumentId: document.id,
            sourceFilename: document.filename,
            evidenceExcerpt: `${field}: ${value}`,
          }];
        });
      }

      const match = line.match(/^([^:=\-]{1,100})\s*(?::|=|-)\s*(\S.*)$/);
      if (!match) return [];
      const field = match[1].trim();
      const value = match[2].trim();
      if (!field || !value) return [];
      return [{
        field,
        value,
        sourceDocumentId: document.id,
        sourceFilename: document.filename,
        evidenceExcerpt: line,
      }];
    });
}

function addFinding(
  findings: AnalysisFinding[],
  partial: Omit<AnalysisFinding, "findingId">,
): void {
  findings.push({ findingId: randomUUID(), ...partial });
}

export function analyzeDocuments(
  sessionId: string,
  instruction: string,
  documents: StoredDocument[],
): AnalysisResult {
  const documentFacts: DocumentFactSet[] = documents
    .filter((document) => document.status === "processed" && document.extractedText.trim())
    .map((document) => ({ document, facts: extractFacts(document) }));
  const fieldGroups = new Map<string, ExtractedFact[]>();

  for (const { facts } of documentFacts) {
    for (const fact of facts) {
      const key = normalizeField(fact.field);
      const group = fieldGroups.get(key) ?? [];
      group.push(fact);
      fieldGroups.set(key, group);
    }
  }

  const findings: AnalysisFinding[] = [];
  for (const facts of fieldGroups.values()) {
    const field = facts[0].field;
    if (!isFieldRequested(field, instruction)) continue;
    const values = new Set(facts.map((fact) => fact.value.trim().toLowerCase()));
    const documentIdsWithField = new Set(facts.map((fact) => fact.sourceDocumentId));
    const sourceDocumentIds = facts.map((fact) => fact.sourceDocumentId);
    const sourceFilenames = [...new Set(facts.map((fact) => fact.sourceFilename))];
    const supportingEvidence = facts.map((fact) => fact.evidenceExcerpt);
    const relevantDocuments = relevantDocumentsForField(field, documentFacts, instruction);
    const missingInformation = relevantDocuments
      .filter(({ document }) => !documentIdsWithField.has(document.id))
      .map(({ document }) => `${field} is not present in ${document.filename}.`);

    if (values.size > 1) {
      addFinding(findings, {
        title: `${field} differs across documents`,
        category: "discrepancy",
        severity: "high",
        verificationStatus: "discrepancy",
        extractedFacts: facts,
        interpretation: `The extracted ${field} values do not match across the relevant processed documents.${missingInformation.length ? " The field is also missing from one or more relevant documents." : ""}`,
        sourceDocumentIds,
        sourceFilenames,
        supportingEvidence,
        missingInformation,
      });
    } else if (missingInformation.length > 0) {
      addFinding(findings, {
        title: `${field} is missing from one or more documents`,
        category: "missing_information",
        severity: "medium",
        verificationStatus: "not_found",
        extractedFacts: facts,
        interpretation: `The extracted field appears in ${sourceFilenames.join(", ")} but is not present in every processed document.`,
        sourceDocumentIds,
        sourceFilenames,
        supportingEvidence,
        missingInformation,
      });
      continue;
    } else if (documentIdsWithField.size < 2) {
      addFinding(findings, {
        title: `${field} found in one document`,
        category: "review",
        severity: "medium",
        verificationStatus: "review",
        extractedFacts: facts,
        interpretation: `The extracted ${field} value appears in only one relevant document, so consistency cannot be confirmed.`,
        sourceDocumentIds,
        sourceFilenames,
        supportingEvidence,
        missingInformation: [],
      });
    } else {
      addFinding(findings, {
        title: `${field} matches across documents`,
        category: "match",
        severity: "low",
        verificationStatus: "consistent",
        extractedFacts: facts,
        interpretation: `The extracted ${field} value matches across all processed documents containing this field.`,
        sourceDocumentIds,
        sourceFilenames,
        supportingEvidence,
        missingInformation: [],
      });
    }
  }

  if (findings.length === 0) {
    addFinding(findings, {
      title: "No comparable labeled facts were extracted",
      category: "review",
      severity: "low",
      verificationStatus: "review",
      extractedFacts: [],
      interpretation: "The processed documents did not contain comparable facts in a supported field-value format.",
      sourceDocumentIds: documentFacts.map(({ document }) => document.id),
      sourceFilenames: documentFacts.map(({ document }) => document.filename),
      supportingEvidence: [],
      missingInformation: [],
    });
  }

  const discrepancyCount = findings.filter((finding) => finding.verificationStatus === "discrepancy").length;
  const missingCount = findings.filter((finding) => finding.verificationStatus === "not_found").length;
  return {
    sessionId,
    instruction,
    findings,
    summary: `${findings.length} finding(s): ${discrepancyCount} discrepancy(ies), ${missingCount} missing-information finding(s).`,
  };
}
