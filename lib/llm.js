/**
 * LLM answer generation — port of app/llm.py.
 *
 * Same model (gemini-2.5-flash), same prompt structure, same citation format.
 * The prompt instructs the model to answer ONLY from the provided sources
 * and to cite each claim as [Source N].
 *
 * Original (Python / google-genai):
 *   client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
 *   CHAT_MODEL = "gemini-2.5-flash"
 *
 *   def build_context_block(chunks):
 *       blocks = []
 *       for i, chunk in enumerate(chunks, start=1):
 *           blocks.append(
 *               f"[Source {i} | {chunk['filename']}, page {chunk['page_number']}]\n{chunk['text']}")
 *       return "\n\n".join(blocks)
 *
 *   def generate_answer(question, chunks):
 *       prompt = f"""You are a document assistant. Answer the question using ONLY
 *       the sources provided below..."""
 *       response = client.models.generate_content(model=CHAT_MODEL, contents=prompt)
 *       return response.text
 */

import { GoogleGenAI } from "@google/genai";

const CHAT_MODEL = "gemini-2.5-flash";

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
 * Build the "[Source N | filename, page N]\n<text>" block that's injected
 * into the LLM prompt so the model knows which source each fact came from.
 *
 * @param {Array<{ filename: string, page_number: number, text: string }>} chunks
 * @returns {string}
 */
export function buildContextBlock(chunks) {
  const blocks = chunks.map((chunk, i) => {
    const n = i + 1; // 1-indexed, matching the Python `enumerate(chunks, start=1)`
    return `[Source ${n} | ${chunk.filename}, page ${chunk.page_number}]\n${chunk.text}`;
  });
  return blocks.join("\n\n");
}

/**
 * Generate a grounded answer to the question using ONLY the provided chunks.
 * @param {string} question
 * @param {Array<{ filename, page_number, text }>} chunks
 * @returns {Promise<string>} — the model's answer, with [Source N] citations
 */
export async function generateAnswer(question, chunks) {
  const client = getClient();
  const contextBlock = buildContextBlock(chunks);

  // Prompt is preserved verbatim from the Python original so answer
  // style and citation behaviour match exactly.
  const prompt = `You are a document assistant. Answer the question using ONLY
the sources provided below. Do not use any outside knowledge.

For every claim you make, cite the source in brackets, e.g. [Source 1].
If the sources don't contain enough information to answer, say so clearly
instead of guessing.

--- SOURCES ---
${contextBlock}

--- QUESTION ---
${question}

--- ANSWER (with citations) ---`;

  const response = await client.models.generateContent({
    model: CHAT_MODEL,
    contents: prompt,
  });
  return response.text;
}
