
import { getDocumentProxy } from "unpdf";

/**
 * Extract text from a PDF, page by page.
 *
 * @param {ArrayBuffer | Uint8Array} pdfData — raw PDF bytes
 * @returns {Promise<Array<{ page_number: number, text: string }>>}
 */
export async function extractTextByPage(pdfData) {
  // unpdf accepts a Uint8Array (or ArrayBuffer via the loader).
  const data =
    pdfData instanceof Uint8Array ? pdfData : new Uint8Array(pdfData);

  const pdf = await getDocumentProxy(data);
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Concatenate all text items on the page. PDF.js returns an array of
    // text run objects; joining their `.str` property reconstructs the page text.
    const text = content.items
      .map((item) => item.str)
      .join(" ")
      .replace(/\s+/g, " ") // collapse runs of whitespace
      .trim();

    pages.push({
      page_number: i, // human-friendly, starts at 1 (same as original)
      text,
    });
  }

  return pages;
}
