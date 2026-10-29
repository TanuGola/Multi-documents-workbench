import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { processDocument } from "../services/documentProcessor.js";
import type { StoredDocument } from "../types.js";
import { limitedMemoryStorage } from "../upload/limitedMemoryStorage.js";
import { saveDocuments } from "../db/persistence.js";

const router = Router();
const maxFileSizeBytes = Number(process.env.MAX_FILE_SIZE_MB ?? 10) * 1024 * 1024;
const maxFiles = Number(process.env.MAX_FILES ?? 10);
const sessions = new Map<string, StoredDocument[]>();

const upload = multer({
  storage: limitedMemoryStorage(maxFileSizeBytes),
  limits: { files: maxFiles },
});

router.post("/process", (request, response) => {
  upload.array("documents", maxFiles)(request, response, async (error) => {
    if (error instanceof multer.MulterError) {
      const message = error.code === "LIMIT_FILE_COUNT"
          ? `A maximum of ${maxFiles} files can be uploaded per request.`
          : "The uploaded files could not be processed.";
      response.status(400).json({ error: message });
      return;
    }
    if (error) {
      response.status(400).json({ error: "The uploaded files could not be processed." });
      return;
    }

    const files = (request.files ?? []) as Express.Multer.File[];
    if (files.length === 0) {
      response.status(400).json({ error: "At least one document is required." });
      return;
    }

    try {
      const processed = await Promise.all(files.map(processDocument));
      const sessionId = randomUUID();
      await saveDocuments(processed);
      sessions.set(sessionId, processed);
      response.status(200).json({ sessionId, files: processed });
    } catch (processingError) {
      response.status(500).json({ error: processingError instanceof Error ? processingError.message : "Documents could not be saved." });
    }
  });
});

export function getSessionDocuments(sessionId: string): StoredDocument[] | undefined {
  return sessions.get(sessionId);
}

export default router;
