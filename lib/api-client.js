
async function parseJsonOrThrow(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    
  }

  if (!res.ok) {
    const detail = body?.detail || res.statusText || "Request failed";
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }

  return body;
}

/**
 * Upload one PDF and automatically run the full pipeline:
 * extract → chunk → embed → store. 
 * @param {File} file
 * @returns {Promise<{ uploaded: Array<{filename, total_pages, chunks_stored}>, count, collection_stats }>}
 */
export async function uploadPdf(file) {
  const formData = new FormData();
  formData.append("files", file);

  const res = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  return parseJsonOrThrow(res);
}

/** Ask a question against everything stored so far. */
export async function askQuestion(question, topK = 5) {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, top_k: topK }),
  });

  return parseJsonOrThrow(res);
}

/** Quick health check — useful for showing a "backend offline" state. */
export async function checkHealth() {
  const res = await fetch("/api/health");
  return parseJsonOrThrow(res);
}

/** Retrieve raw matching chunks for a question (debug endpoint). */
export async function retrieveChunks(question, topK = 5) {
  const res = await fetch("/api/retrieve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, top_k: topK }),
  });

  return parseJsonOrThrow(res);
}

/** Vector store stats — how many chunks are indexed. */
export async function getStats() {
  const res = await fetch("/api/stats");
  return parseJsonOrThrow(res);
}
