import type { CharReferenceStat } from './types';

/**
 * Derives the intra[c]/antes[c] reference table from the frequency lexicon
 * itself: for each word, every letter that is not in the last position counts
 * as "followed by another letter" (intra); the last letter of the word counts
 * as "followed by a space/boundary" (antes). Weighted by word frequency.
 *
 * This approximates, without needing a running-text corpus, the normal
 * distribution of "letter c is followed by another letter" in Portuguese —
 * exactly what phase A of the ghost-space repair needs as a baseline.
 */
export function buildReferenceCharStats(
  wordFreqs: Iterable<readonly [string, number]>,
): Map<string, CharReferenceStat> {
  const intra = new Map<string, number>();
  const antes = new Map<string, number>();
  const letterRe = /\p{L}/u;

  for (const [rawWord, freq] of wordFreqs) {
    const word = rawWord.toLowerCase();
    const weight = Math.max(1, freq);
    for (let i = 0; i < word.length; i++) {
      const c = word[i];
      if (!letterRe.test(c)) continue;
      if (i < word.length - 1) {
        intra.set(c, (intra.get(c) ?? 0) + weight);
      } else {
        antes.set(c, (antes.get(c) ?? 0) + weight);
      }
    }
  }

  const chars = new Set<string>([...intra.keys(), ...antes.keys()]);
  const result = new Map<string, CharReferenceStat>();
  for (const c of chars) {
    const i = intra.get(c) ?? 0;
    const a = antes.get(c) ?? 0;
    result.set(c, { intra: i, antes: a, ratio: i / Math.max(1, i + a) });
  }
  return result;
}
