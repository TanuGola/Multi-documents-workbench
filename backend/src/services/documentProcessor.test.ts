import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { processDocument } from "./documentProcessor.js";

function file(filename: string, buffer: Buffer, extra: Record<string, unknown> = {}) {
  return {
    fieldname: "documents", originalname: filename, encoding: "7bit", mimetype: "application/octet-stream",
    destination: "", filename, path: "", size: buffer.length, buffer, ...extra,
  } as unknown as Express.Multer.File;
}

async function syntheticPdf(text: string): Promise<Buffer> {
  const document = await PDFDocument.create();
  const page = document.addPage();
  if (text) {
    const font = await document.embedFont(StandardFonts.Helvetica);
    page.drawText(text, { x: 20, y: 700, font });
  }
  return Buffer.from(await document.save({ useObjectStreams: false }));
}

test("extracts TXT content", async () => {
  const result = await processDocument(file("notes.txt", Buffer.from("Company revenue: 100"), { mimetype: "text/plain" }));
  assert.equal(result.status, "processed");
  assert.equal(result.extractedText, "Company revenue: 100");
});

test("extracts synthetic PDF content", async () => {
  const result = await processDocument(file("report.pdf", await syntheticPdf("Revenue: 100"), { mimetype: "application/pdf" }));
  assert.equal(result.status, "processed");
  assert.match(result.extractedText, /Revenue: 100/);
});

test("keeps invalid document statuses isolated", async () => {
  const results = await Promise.all([
    processDocument(file("empty.txt", Buffer.alloc(0))),
    processDocument(file("broken.pdf", Buffer.from("not a pdf"))),
    processDocument(file("image.png", Buffer.from("data"))),
    processDocument(file("large.txt", Buffer.from("data"), { tooLarge: true })),
  ]);
  assert.deepEqual(results.map((result) => result.status), ["empty", "corrupt", "unsupported", "oversized"]);
});

test("duplicate filenames receive distinct IDs", async () => {
  const [first, second] = await Promise.all([
    processDocument(file("same.txt", Buffer.from("one"))),
    processDocument(file("same.txt", Buffer.from("two"))),
  ]);
  assert.notEqual(first.id, second.id);
});

test("image-only PDFs are reported as scanned PDFs", async () => {
  const result = await processDocument(file("scan.pdf", await syntheticPdf(""), { mimetype: "application/pdf" }));
  assert.equal(result.status, "scanned_pdf");
});
