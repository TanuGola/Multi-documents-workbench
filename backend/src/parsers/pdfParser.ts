import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const standardFontDataUrl = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../node_modules/pdfjs-dist/standard_fonts",
);

export async function extractPdf(buffer: Buffer): Promise<string> {
  const document = await getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl: `${standardFontDataUrl}${path.sep}`,
  }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
  }
  return pages.join("\n");
}
