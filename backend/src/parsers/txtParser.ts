export function extractTxt(buffer: Buffer): string {
  return buffer.toString("utf8").replace(/^\uFEFF/, "");
}
