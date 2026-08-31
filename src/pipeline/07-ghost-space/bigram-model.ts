import type { BigramModel } from '../../lexicon/types';

export interface BigramScore {
  mergeIsMoreLikely: boolean;
  splitLogProb: number;
  mergedLogProb: number;
}

/**
 * Compares P(right | left) — staying split — with the best evidence of
 * P(next_word | merged) recorded for the merged form — merging.
 *
 * Returns `null` when the model has no data at all for the pair, and phase C
 * should then send the candidate to the review queue instead of deciding on
 * its own (exactly what the spec's algorithm calls for). The lexicon shipped
 * in v1 doesn't include a real bigram corpus (see README), so this is always
 * the path taken by default — but the function is ready for a loaded model
 * in the future.
 */
export function scoreBigram(
  left: string,
  right: string,
  merged: string,
  bigram: BigramModel,
): BigramScore | null {
  const splitKey = `${left.toLowerCase()}|${right.toLowerCase()}`;
  const splitLogProb = bigram.splitLogProb.get(splitKey);
  if (splitLogProb === undefined) return null;

  const prefix = `${merged.toLowerCase()}|`;
  let bestMerged = -Infinity;
  for (const [key, prob] of bigram.mergedLogProb) {
    if (key.startsWith(prefix) && prob > bestMerged) bestMerged = prob;
  }
  if (bestMerged === -Infinity) return null;

  return {
    mergeIsMoreLikely: bestMerged > splitLogProb,
    splitLogProb,
    mergedLogProb: bestMerged,
  };
}
