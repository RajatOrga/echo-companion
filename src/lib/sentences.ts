/**
 * Splits text into speakable sentence chunks for streaming TTS.
 * Uses Intl.Segmenter with smart abbreviation and decimal handling
 * so speech sounds natural and uninterrupted.
 */
export function splitIntoSentences(text: string): string[] {
  if (!text || !text.trim()) return [];

  const trimmed = text.trim();

  // Try standard Intl.Segmenter if available
  let raw: string[] = [];
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    try {
      const seg = new Intl.Segmenter("en", { granularity: "sentence" });
      raw = Array.from(seg.segment(trimmed))
        .map((s) => s.segment.trim())
        .filter(Boolean);
    } catch {
      raw = [];
    }
  }

  // Regex fallback if Intl.Segmenter is absent or failed
  if (raw.length === 0) {
    const matches = trimmed.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g);
    raw = matches ? matches.map((s) => s.trim()).filter(Boolean) : [trimmed];
  }

  const ABBREVS = /^(mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|approx|eg|ie|i\.e|e\.g)\.?$/i;
  const result: string[] = [];
  let current = "";

  for (const s of raw) {
    current = current ? current + " " + s : s;
    const lastWord = current.split(/\s+/).pop()?.toLowerCase() || "";
    // Only break if it's not ending on an abbreviation, has some length, and has end punctuation
    if (!ABBREVS.test(lastWord) && current.length >= 10 && /[.!?]["')\]]*$/.test(current)) {
      result.push(current);
      current = "";
    }
  }

  if (current.trim()) {
    if (result.length > 0) {
      result[result.length - 1] += " " + current.trim();
    } else {
      result.push(current.trim());
    }
  }

  return result.filter((s) => s.length > 0);
}
