import type { Lexicon } from '../lexicon/types';
import type { Paragraph } from './types';

export type DetectedLanguage = 'pt-BR' | 'en';

const SAMPLE_WORD_LIMIT = 2000;
const PT_RATIO_THRESHOLD = 0.3;
const WORD_RE = /\p{L}+/gu;

/**
 * Best-effort document language detection: pt-BR vs. en. Reuses the already-
 * loaded PT-BR lexicon instead of shipping a second wordlist — samples words
 * from the document and measures what fraction are recognized as valid
 * Portuguese words. A high ratio means pt-BR; otherwise falls back to en,
 * since English is the app's other realistic audience and a safe default for
 * anything that isn't clearly Portuguese.
 */
export function detectDocumentLanguage(paragraphs: Paragraph[], lexicon: Lexicon): DetectedLanguage {
  let checked = 0;
  let hits = 0;

  outer: for (const p of paragraphs) {
    WORD_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WORD_RE.exec(p.text))) {
      const word = m[0].toLowerCase();
      if (word.length < 2) continue; // single letters aren't informative here
      checked++;
      if (lexicon.valid.has(word)) hits++;
      if (checked >= SAMPLE_WORD_LIMIT) break outer;
    }
  }

  if (checked === 0) return 'pt-BR';
  return hits / checked >= PT_RATIO_THRESHOLD ? 'pt-BR' : 'en';
}
