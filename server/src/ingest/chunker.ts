export interface Chunk {
  index: number;
  page: number;
  text: string;
}

export interface ChunkOptions {
  maxChars?: number;
  overlapChars?: number;
}

interface Unit {
  text: string;
  /** Separator placed before this unit when it joins a non-empty chunk. */
  sep: string;
}

const SENTENCE = /[^.!?]+[.!?]+\s*|[^.!?]+$/g;

function hardCut(text: string, size: number): string[] {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size));
  return parts;
}

/** Splits a page into units no longer than `limit`: paragraph, then sentence, then hard cut. */
function toUnits(page: string, limit: number): Unit[] {
  const units: Unit[] = [];
  const paragraphs = page
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const paragraph of paragraphs) {
    if (paragraph.length <= limit) {
      units.push({ text: paragraph, sep: "\n\n" });
      continue;
    }
    let first = true;
    for (const sentence of paragraph.match(SENTENCE) ?? []) {
      const pieces = sentence.length <= limit ? [sentence] : hardCut(sentence, limit);
      for (const piece of pieces) {
        units.push({ text: piece, sep: first ? "\n\n" : "" });
        first = false;
      }
    }
  }
  return units;
}

/**
 * Splits pages into overlapping chunks. Each chunk after the first on a page starts with
 * the last `overlapChars` characters of its predecessor; chunks never cross page boundaries.
 */
export function chunkPages(pages: { page: number; text: string }[], opts: ChunkOptions = {}): Chunk[] {
  const maxChars = opts.maxChars ?? 3200;
  const overlapChars = opts.overlapChars ?? 480;
  if (overlapChars >= maxChars) throw new RangeError("overlapChars must be smaller than maxChars");
  const budget = maxChars - overlapChars;

  const chunks: Chunk[] = [];
  for (const { page, text } of pages) {
    const bodies: string[] = [];
    let current = "";
    for (const unit of toUnits(text, budget)) {
      const addition = (current ? unit.sep : "") + unit.text;
      if (current && current.length + addition.length > budget) {
        bodies.push(current);
        current = unit.text;
      } else {
        current += addition;
      }
    }
    if (current) bodies.push(current);

    let previous = "";
    for (const body of bodies) {
      const chunkText = ((overlapChars > 0 ? previous.slice(-overlapChars) : "") + body).trimEnd();
      if (!chunkText.trim()) continue;
      chunks.push({ index: chunks.length, page, text: chunkText });
      previous = chunkText;
    }
  }
  return chunks;
}
