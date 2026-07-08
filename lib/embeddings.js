/**
 * Gemini embeddings — port of app/embeddings.py.
 *
 * Same model (gemini-embedding-001), same task types
 * (RETRIEVAL_DOCUMENT for indexing, RETRIEVAL_QUERY for search),
 * same function signatures.
 *
 * Original (Python / google-genai):
 *   client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
 *   EMBEDDING_MODEL = "gemini-embedding-001"
 *
 *   def embed_documents(texts):
 *       result = client.models.embed_content(
 *           model=EMBEDDING_MODEL, contents=texts,
 *           config=types.EmbedContentConfig(task_type="RETRIEVAL_DOCUMENT"))
 *       return [e.values for e in result.embeddings]
 *
 *   def embed_query(text):
 *       result = client.models.embed_content(
 *           model=EMBEDDING_MODEL, contents=text,
 *           config=types.EmbedContentConfig(task_type="RETRIEVAL_QUERY"))
 *       return result.embeddings[0].values
 */

import { GoogleGenAI } from "@google/genai";

const EMBEDDING_MODEL = "gemini-embedding-001";

// Lazy-init the client so the module doesn't crash on import when
// the key is absent (e.g. during build or local linting).
let _client = null;
function getClient() {
  if (_client) return _client;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env.local (local dev) or to Vercel Project Settings → Environment Variables."
    );
  }
  _client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return _client;
}

/**
 * Embed a batch of document texts for storage.
 * @param {string[]} texts
 * @returns {Promise<number[][]>} — one embedding vector per input text
 */
export async function embedDocuments(texts) {
  const client = getClient();
  const result = await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: texts,
    config: { taskType: "RETRIEVAL_DOCUMENT" },
  });
  return result.embeddings.map((e) => e.values);
}

/**
 * Embed a single search query.
 * @param {string} text
 * @returns {Promise<number[]>} — one embedding vector
 */
export async function embedQuery(text) {
  const client = getClient();
  const result = await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: { taskType: "RETRIEVAL_QUERY" },
  });
  return result.embeddings[0].values;
}
