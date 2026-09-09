/**
 * Splits text into speakable sentence chunks for streaming TTS.
 * Uses Intl.Segmenter with smart abbreviation, decimal, and minimum-length
 * handling so speech sounds natural and uninterrupted.
 *
 * Enforces a minimum chunk threshold (default 28 chars for first chunk, 38 chars for subsequent)
 * so tiny isolated fragments (like "Hey!", "Sure,", "Hi.") are NEVER emitted alone.
 * Isolated fragments have shorter playback than TTS synthesis latency, which causes
 * buffer underruns and awkward 3-5 second dead silence pauses.
 */
export function splitIntoSentences(
  text: string,
  options?: { minFirstChars?: number; minChars?: number; maxClauseChars?: number },
): string[] {
  if (!text || !text.trim()) return [];

  const trimmed = text.trim();
  const minFirst = options?.minFirstChars ?? 28;
  const minLater = options?.minChars ?? 38;
  const maxClause = options?.maxClauseChars ?? 85;

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
    const matches = trimmed.match(/[^.!?。！？\n]+(?:[.!?。！？\n]+["')\]]*|$)/g);
    raw = matches ? matches.map((s) => s.trim()).filter(Boolean) : [trimmed];
  }

  const ABBREVS = /^(mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|approx|eg|ie|i\.e|e\.g)\.?$/i;
  const result: string[] = [];
  let current = "";

  for (const s of raw) {
    current = current ? current + " " + s : s;
    const lastWord = current.split(/\s+/).pop()?.toLowerCase() || "";
    const minThreshold = result.length === 0 ? minFirst : minLater;

    // Check if ends with real sentence terminal
    const hasTerminal = /[.!?。！？]["')\]]*$/.test(current) || current.includes("\n");

    // Only break if it's not ending on an abbreviation, has end punctuation, and meets min length
    if (!ABBREVS.test(lastWord) && hasTerminal && current.length >= minThreshold) {
      result.push(current.trim());
      current = "";
    }
  }

  if (current.trim()) {
    if (result.length > 0) {
      // If the leftover is very short (< 15 chars), append to previous sentence
      if (current.trim().length < 15) {
        result[result.length - 1] += " " + current.trim();
      } else {
        result.push(current.trim());
      }
    } else {
      result.push(current.trim());
    }
  }

  // Secondary pass: if any sentence is exceedingly long (> maxClause), break on commas or conjunctions
  const finalResult: string[] = [];
  for (const chunk of result) {
    if (chunk.length <= maxClause) {
      finalResult.push(chunk);
      continue;
    }
    // Break on comma, semicolon, or dash
    const parts = chunk.split(/(?<=[,;—:\-])\s+/);
    let acc = "";
    for (const part of parts) {
      const candidate = acc ? acc + " " + part : part;
      if (candidate.length >= maxClause && acc.length >= minLater) {
        finalResult.push(acc.trim());
        acc = part;
      } else {
        acc = candidate;
      }
    }
    if (acc.trim()) finalResult.push(acc.trim());
  }

  return finalResult.filter((s) => s.length > 0);
}

