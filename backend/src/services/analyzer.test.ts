import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDocuments } from "./analyzer.js";
import type { StoredDocument } from "../types.js";

function document(id: string, filename: string, extractedText: string): StoredDocument {
  return {
    id,
    filename,
    status: "processed",
    mimeType: "text/plain",
    sizeBytes: extractedText.length,
    characterCount: extractedText.length,
    extractedText,
  };
}

test("reports conflicting values with separate facts and source evidence", () => {
  const result = analyzeDocuments("session-1", "Compare revenue", [
    document("doc-a", "company-a.txt", "Company: Northwind\nRevenue: 1000000"),
    document("doc-b", "company-b.txt", "Company: Northwind\nRevenue: 1200000"),
  ]);

  const finding = result.findings.find((item) => item.title === "Revenue differs across documents");
  assert.ok(finding);
  assert.equal(finding.verificationStatus, "discrepancy");
  assert.equal(finding.severity, "high");
  assert.deepEqual(finding.extractedFacts.map((fact) => fact.value), ["1000000", "1200000"]);
  assert.deepEqual(finding.supportingEvidence, ["Revenue: 1000000", "Revenue: 1200000"]);
  for (const evidence of finding.supportingEvidence) {
    assert.ok(finding.extractedFacts.some((fact) => fact.evidenceExcerpt === evidence));
  }
});

test("reports a field missing from one document without inventing a value", () => {
  const result = analyzeDocuments("session-2", "Compare company details", [
    document("doc-a", "company-a.txt", "Company: Northwind\nRevenue: 1000000"),
    document("doc-b", "company-b.txt", "Company: Northwind\nSubmission date: 2026-10-03"),
  ]);

  const finding = result.findings.find((item) => item.title === "Revenue is missing from one or more documents");
  assert.ok(finding);
  assert.equal(finding.verificationStatus, "not_found");
  assert.deepEqual(finding.missingInformation, ["Revenue is not present in company-b.txt."]);
  assert.equal(finding.extractedFacts.length, 1);
  assert.equal(finding.extractedFacts[0].value, "1000000");
  assert.equal(finding.extractedFacts[0].sourceFilename, "company-a.txt");
});

test("does not claim consistency when a relevant document is missing the field", () => {
  const result = analyzeDocuments("session-3", "Compare values", [
    document("doc-a", "a.txt", "Revenue: 100"),
    document("doc-b", "b.txt", "Company: Northwind"),
  ]);
  assert.equal(result.findings.some((item) => item.title === "Revenue matches across documents"), false);
});

test("uses the instruction to omit unrelated labeled facts", () => {
  const result = analyzeDocuments("session-4", "Compare revenue only", [
    document("doc-a", "company-a.txt", "Company: Northwind\nRevenue: 100"),
    document("doc-b", "company-b.txt", "Company: Northwind\nRevenue: 120"),
  ]);
  assert.equal(result.findings.some((item) => item.title.startsWith("Company")), false);
  assert.equal(result.findings.some((item) => item.title === "Revenue differs across documents"), true);
});

test("reports a discrepancy and missing information together", () => {
  const result = analyzeDocuments("session-5", "Compare revenue", [
    document("doc-a", "financial-a.txt", "Revenue: 100"),
    document("doc-b", "financial-b.txt", "Revenue: 120"),
    document("doc-c", "financial-c.txt", "Company: Northwind"),
  ]);
  const finding = result.findings.find((item) => item.title === "Revenue differs across documents");
  assert.ok(finding);
  assert.equal(finding.verificationStatus, "discrepancy");
  assert.deepEqual(finding.missingInformation, ["Revenue is not present in financial-c.txt."]);
});

test("keeps differently labelled dates as separate fields", () => {
  const result = analyzeDocuments("session-6", "Compare application date and submission date", [
    document("doc-a", "application.txt", "Application date: 2026-10-01"),
    document("doc-b", "submission.txt", "Submission date: 2026-10-03"),
  ]);
  assert.equal(result.findings.some((item) => item.title.startsWith("Application date")), true);
  assert.equal(result.findings.some((item) => item.title.startsWith("Submission date")), true);
  assert.equal(result.findings.some((item) => item.title.includes("matches")), false);
});

test("does not include unrelated single-document reference fields in an address comparison", () => {
  const result = analyzeDocuments("session-7", "Compare Address across these three documents, excluding TEST.txt and TEST Copy.txt.", [
    document("financial", "financial_statement.txt", "Address: 42 Sample Street\nDocument reference: DEMO-0000"),
    document("identity", "identity_and_address_proof.txt", "Address: 7 Fictional Avenue\nDocument reference: DEMO-0000"),
    document("application", "loan_application.txt", "Address: 42 Sample Street"),
  ]);
  assert.equal(result.findings.some((item) => /document reference/i.test(item.title)), false);
  assert.equal(result.findings.some((item) => item.title === "Address differs across documents"), true);
});

test("matches a field when PDF extraction collapses several labeled facts onto one line", () => {
  const result = analyzeDocuments("session-8", "Compare based on applicant name", [
    document(
      "pdf-applicant",
      "applicant.pdf",
      "Applicant Verification Test — PDF Applicant name: Priya Sharma Annual revenue: INR 50 lakh Address: 10 Example Road",
    ),
    document("verification", "verification.txt", "Applicant name: Priya Sharma"),
  ]);

  const finding = result.findings.find((item) => item.title === "Applicant name matches across documents");
  assert.ok(finding);
  assert.equal(finding.verificationStatus, "consistent");
  assert.deepEqual(finding.missingInformation, []);
  assert.deepEqual(finding.extractedFacts.map((fact) => fact.value), ["Priya Sharma", "Priya Sharma"]);
  assert.equal(result.findings.some((item) => item.category === "missing_information"), false);
});
