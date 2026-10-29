import { randomUUID } from "node:crypto";
import path from "node:path";
import { extractPdf } from "../parsers/pdfParser.js";
import { extractTxt } from "../parsers/txtParser.js";
import type { ProcessedDocument, StoredDocument } from "../types.js";

const ALLOWED_EXTENSIONS = new Set([".pdf", ".txt"]);

function baseResult(file: Express.Multer.File): ProcessedDocument {
  return {
    id: randomUUID(),
    filename: path.basename(file.originalname),
    status: "unreadable",
    mimeType: file.mimetype,
    sizeBytes: file.size,
    characterCount: 0,
  };
}

export async function processDocument(
  file: Express.Multer.File,
): Promise<StoredDocument> {
  const result = baseResult(file);
  const extension = path.extname(result.filename).toLowerCase();

  if ((file as Express.Multer.File & { tooLarge?: boolean }).tooLarge) {
    return { ...result, status: "oversized", error: "The file exceeds the 10 MB limit.", extractedText: "" };
  }

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return { ...result, status: "unsupported", error: "Only PDF and TXT files are supported.", extractedText: "" };
  }

  if (file.size === 0) {
    return { ...result, status: "empty", error: "The file is empty.", extractedText: "" };
  }

  try {
    const extractedText = extension === ".pdf"
      ? await extractPdf(file.buffer)
      : extractTxt(file.buffer);
    const normalizedText = extractedText.trim();

    if (normalizedText.length === 0) {
      return {
        ...result,
        status: extension === ".pdf" ? "scanned_pdf" : "empty",
        error: extension === ".pdf"
          ? "No text layer was found. This PDF may be scanned or image-only."
          : "The file contains no text.",
        extractedText: "",
      };
    }

    return {
      ...result,
      status: "processed",
      characterCount: normalizedText.length,
      extractedText: normalizedText,
    };
  } catch {
    return {
      ...result,
      status: extension === ".pdf" ? "corrupt" : "unreadable",
      error: "The file could not be read safely.",
      extractedText: "",
    };
  }
}
