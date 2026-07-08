

/**
 * Split a single string into overlapping chunks.
 *
 * @param {string} text — the text to split
 * @param {number} chunkSize — characters per chunk (default 800)
 * @param {number} overlap — characters shared between consecutive chunks (default 150)
 * @returns {string[]} — array of chunk strings
 */
export function chunkText(text, chunkSize = 800, overlap = 150) {
  text = text.trim();
  if (!text) return [];

  const chunks = [];
  let start = 0;
  const textLength = text.length;

  while (start < textLength) {
    const end = start + chunkSize;
    const chunk = text.slice(start, end).trim();

    if (chunk) {
      // skip empty chunks (can happen at the very end)
      chunks.push(chunk);
    }

    // Move the window forward, but step back by `overlap`
    // so consecutive chunks share some text.
    start += chunkSize - overlap;
  }

  return chunks;
}

/**
 * Chunk an array of pages (each { page_number, text }) into chunk objects.
 *
 * @param {Array<{ page_number: number, text: string }>} pages
 * @param {string} filename — used to build stable chunk IDs
 * @param {number} chunkSize
 * @param {number} overlap
 * @returns {Array<{ chunk_id: string, filename: string, page_number: number, text: string }>}
 */
export function chunkPages(pages, filename, chunkSize = 800, overlap = 150) {
  const allChunks = [];

  for (const page of pages) {
    const pageChunks = chunkText(page.text, chunkSize, overlap);

    pageChunks.forEach((chunk, i) => {
      allChunks.push({
        chunk_id: `${filename}_p${page.page_number}_c${i}`,
        filename,
        page_number: page.page_number,
        text: chunk,
      });
    });
  }

  return allChunks;
}
