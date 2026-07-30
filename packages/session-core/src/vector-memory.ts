export interface MemoryEntry {
  id: string;
  topic: string;
  content: string;
  embedding: number[];
  timestamp: number;
}

export class DurableVectorMemory {
  private readonly entries: MemoryEntry[] = [];

  public storeMemory(topic: string, content: string): MemoryEntry {
    const entry: MemoryEntry = {
      id: crypto.randomUUID(),
      topic,
      content,
      embedding: this.mockEmbedding(content),
      timestamp: Date.now()
    };
    this.entries.push(entry);
    return entry;
  }

  public queryMemory(query: string, limit = 3): MemoryEntry[] {
    if (this.entries.length === 0) return [];
    const queryVec = this.mockEmbedding(query);

    return [...this.entries]
      .map((entry) => ({
        entry,
        similarity: cosineSimilarity(queryVec, entry.embedding)
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map((item) => item.entry);
  }

  private mockEmbedding(text: string): number[] {
    const hash = text.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const vec: number[] = [];
    for (let i = 0; i < 8; i++) {
      vec.push(Math.sin(hash + i));
    }
    return vec;
  }
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i]! * vecB[i]!;
    normA += vecA[i]! * vecA[i]!;
    normB += vecB[i]! * vecB[i]!;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-9);
}
