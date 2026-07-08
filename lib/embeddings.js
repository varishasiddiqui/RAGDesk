

import { GoogleGenAI } from "@google/genai";

const EMBEDDING_MODEL = "gemini-embedding-001";

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
