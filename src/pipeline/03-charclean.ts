import {
  expandLigatures,
  nbspToSpace,
  nfc,
  normalizeQuotesAndDashes,
  stripInvisibleChars,
} from '../util/text';
import type { Paragraph, StageResult } from './types';

export interface CharCleanOptions {
  normalizeQuotesAndDashes: boolean;
}

/** Stage 3: Unicode normalization and cleanup of invisible characters/ligatures. */
export function charCleanStage(
  paragraphs: Paragraph[],
  options: CharCleanOptions,
): StageResult<Paragraph[]> {
  let changed = 0;
  const details: string[] = [];

  const output = paragraphs.map((p) => {
    let text = nfc(p.text);

    const ligatureBefore = text;
    text = expandLigatures(text);
    if (text !== ligatureBefore) changed++;

    const invisible = stripInvisibleChars(text);
    text = invisible.text;
    if (invisible.removed > 0) changed += invisible.removed;

    const nbsp = nbspToSpace(text);
    text = nbsp.text;
    if (nbsp.count > 0) changed += nbsp.count;

    if (options.normalizeQuotesAndDashes) {
      const quotes = normalizeQuotesAndDashes(text);
      text = quotes.text;
      if (quotes.changed > 0) changed += quotes.changed;
    }

    return { ...p, text };
  });

  if (changed > 0) {
    details.push(`${changed} characters normalized (NFC, ligatures, invisible chars, NBSP).`);
  }

  return { output, stats: { stage: 'char-clean', changed, details } };
}
