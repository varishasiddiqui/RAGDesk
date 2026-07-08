/**
 * PDF text extraction — replaces app/pdf_utils.py (PyMuPDF).
 *
 * Uses `unpdf` (a serverless-friendly wrapper around Mozilla's PDF.js)
 * to extract text page-by-page. The output format matches the original
 * Python implementation: an array of { page_number, text } objects.
 *
 * Original (Python / PyMuPDF):
 *   def extract_text_by_page(pdf_path):
 *       doc = fitz.open(pdf_path)
 *       pages = []
 *       for page_index in range(len(doc)):
 *           page = doc[page_index]
 *           text = page.get_text()
 *           pages.append({"page_number": page_index + 1, "text": text.strip()})
 *       doc.close()
 *       return pages
 */

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
