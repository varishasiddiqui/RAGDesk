/**
 * In-memory vector store — replaces app/vector_store.py (ChromaDB).
 *
 * WHY IN-MEMORY?
 * --------------
 * Vercel's free tier doesn't give you a persistent disk. ChromaDB's
 * PersistentClient writes to `data/chroma_db/` on disk, which gets wiped
 * between serverless invocations. Instead, we keep vectors in a module-level
 * array attached to `globalThis` so every request handled by the same warm
 * serverless function instance sees the same data.
 *
 * To make sure ALL API routes share one memory space, the project uses a
 * single catch-all API route (app/api/[...slug]/route.js). If you split
 * routes into separate files, each becomes its own serverless function
 * with its own isolated memory — the store wouldn't be shared.
 *
 * The similarity math (cosine similarity) is identical to what ChromaDB
 * does under the hood for normalized embeddings, so retrieval quality
 * matches the original Python version.
 *
 * For a production app with many users, swap this file for a call to
 * Upstash Vector, Pinecone, or Supabase pgvector — the interface
 * (addChunksToStore / searchChunks / getCollectionStats) stays the same.
 */

// ---- Store shape -----------------------------------------------------------
// {
//   chunks:   Array<{ chunk_id, text, filename, page_number }>,
//   vectors:  Array<number[]>,           // parallel to chunks
//   norms:    Array<number>,             // precomputed L2 norms for cosine sim
// }

const STORE_KEY = "__ragdesk_vector_store__";

function getStore() {
  if (!globalThis[STORE_KEY]) {
    globalThis[STORE_KEY] = {
      chunks: [],
      vectors: [],
      norms: [],
    };
  }
  return globalThis[STORE_KEY];
}

/** L2 norm of a vector — used to normalise for cosine similarity. */
function l2Norm(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) {
    sum += vec[i] * vec[i];
  }
  return Math.sqrt(sum);
}

/**
 * Cosine similarity between a query vector and a stored document vector.
 * Returns a value in [-1, 1]; higher = more similar.
 *
 * ChromaDB returns `distance` (lower = better). We convert by returning
 * `1 - similarity` as the distance so the rest of the app keeps the same
 * "lower distance = better match" convention as the original.
 */
function cosineSimilarity(queryVec, queryNorm, docVec, docNorm) {
  if (queryNorm === 0 || docNorm === 0) return 0;
  let dot = 0;
  for (let i = 0; i < queryVec.length; i++) {
    dot += queryVec[i] * docVec[i];
  }
  return dot / (queryNorm * docNorm);
}

/**
 * Add chunks + their embedding vectors to the store.
 * @param {Array<{ chunk_id, text, filename, page_number }>} chunks
 * @param {number[][]} vectors — parallel to chunks
 * @returns {number} — count stored
 */
export function addChunksToStore(chunks, vectors) {
  const store = getStore();

  // Deduplicate by chunk_id (ChromaDB's `.add` upserts by id).
  const existingIds = new Set(store.chunks.map((c) => c.chunk_id));

  chunks.forEach((chunk, i) => {
    const vec = vectors[i];
    if (existingIds.has(chunk.chunk_id)) {
      // Replace the existing entry (upsert behaviour).
      const idx = store.chunks.findIndex((c) => c.chunk_id === chunk.chunk_id);
      store.chunks[idx] = chunk;
      store.vectors[idx] = vec;
      store.norms[idx] = l2Norm(vec);
    } else {
      store.chunks.push(chunk);
      store.vectors.push(vec);
      store.norms.push(l2Norm(vec));
      existingIds.add(chunk.chunk_id);
    }
  });

  return chunks.length;
}

/**
 * Quick sanity check: how many chunks are currently stored?
 * @returns {{ total_chunks_stored: number }}
 */
export function getCollectionStats() {
  const store = getStore();
  return { total_chunks_stored: store.chunks.length };
}

/**
 * Search the store for the top-k chunks most similar to the query vector.
 *
 * @param {number[]} queryVector
 * @param {number} topK
 * @returns {Array<{ chunk_id, text, filename, page_number, distance }>}
 *   `distance` is `1 - cosine_similarity` (0 = identical, 2 = opposite),
 *   matching ChromaDB's convention so the rest of the app is unchanged.
 */
export function searchChunks(queryVector, topK = 5) {
  const store = getStore();
  const queryNorm = l2Norm(queryVector);

  // Score every stored chunk.
  const scored = store.chunks.map((chunk, i) => {
    const sim = cosineSimilarity(queryVector, queryNorm, store.vectors[i], store.norms[i]);
    return {
      chunk_id: chunk.chunk_id,
      text: chunk.text,
      filename: chunk.filename,
      page_number: chunk.page_number,
      distance: 1 - sim, // ChromaDB-style distance (lower = better)
    };
  });

  // Sort by distance ascending (most similar first) and take top-k.
  scored.sort((a, b) => a.distance - b.distance);
  return scored.slice(0, topK);
}

/**
 * Clear the store (useful for tests / re-indexing from scratch).
 */
export function clearStore() {
  const store = getStore();
  store.chunks = [];
  store.vectors = [];
  store.norms = [];
}
