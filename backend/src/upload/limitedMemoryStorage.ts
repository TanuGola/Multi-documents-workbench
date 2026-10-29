import type { Request } from "express";
import type { StorageEngine } from "multer";

interface LimitedFile {
  buffer: Buffer;
  size: number;
  tooLarge: boolean;
}

export function limitedMemoryStorage(maxBytes: number): StorageEngine {
  return {
    _handleFile(
      _request: Request,
      file: Express.Multer.File,
      callback: (error: Error | null, info?: LimitedFile) => void,
    ) {
      const chunks: Buffer[] = [];
      let size = 0;
      let tooLarge = false;

      file.stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size <= maxBytes) {
          chunks.push(chunk);
        } else {
          tooLarge = true;
        }
      });
      file.stream.once("error", callback);
      file.stream.once("end", () => {
        callback(null, {
          buffer: Buffer.concat(chunks),
          size,
          tooLarge,
        });
      });
    },
    _removeFile(_request: Request, file: Express.Multer.File, callback: (error: Error | null) => void) {
      file.buffer = Buffer.alloc(0);
      callback(null);
    },
  };
}
