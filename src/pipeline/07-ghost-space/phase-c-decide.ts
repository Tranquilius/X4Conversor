import type { BigramModel, Lexicon } from '../../lexicon/types';
import { isWordValid } from '../../lexicon/types';
import { isValidSingleLetterToken } from '../../util/text';
import type { ConfidenceBand, GhostSpaceOccurrence } from '../types';
import { scoreBigram } from './bigram-model';
import type { RawCandidate } from './phase-b-candidates';

export type DecidedCandidate = GhostSpaceOccurrence & { band: ConfidenceBand };

export function isTokenValid(
  token: string,
  lexicon: Lexicon,
  extra: Set<string>,
  localLexicon: Set<string>,
): boolean {
  if (token.length === 1) {
    return isValidSingleLetterToken(token) || isWordValid(lexicon, token, extra);
  }
  return isWordValid(lexicon, token, extra) || localLexicon.has(token.toLowerCase());
}

/**
 * Phase C: classifies each candidate into one of three confidence bands.
 *
 * - Band 1: at least one side is not a valid word, and the merge is. Auto-merge.
 * - Band 2: both sides are valid, and the merge is too. Ambiguous — needs a
 *   bigram to decide on its own; without a model, goes to review.
 * - Band 3: the merge is not a valid word in any lexicon. Never merges.
 */
export function decideCandidates(
  candidates: RawCandidate[],
  lexicon: Lexicon,
  extra: Set<string>,
  localLexicon: Set<string>,
): DecidedCandidate[] {
  return candidates.map((c) => {
    const leftValid = isTokenValid(c.left, lexicon, extra, localLexicon);
    const rightValid = isTokenValid(c.right, lexicon, extra, localLexicon);
    const mergedValid = isTokenValid(c.merged, lexicon, extra, localLexicon);

    let band: ConfidenceBand;
    if (mergedValid && (!leftValid || !rightValid)) {
      band = 1;
    } else if (mergedValid && leftValid && rightValid) {
      band = 2;
    } else {
      band = 3;
    }
    return { ...c, band };
  });
}

export function defaultAcceptForBand(candidate: DecidedCandidate, bigram: BigramModel): boolean {
  if (candidate.band === 1) return true;
  if (candidate.band === 3) return false;
  const score = scoreBigram(candidate.left, candidate.right, candidate.merged, bigram);
  if (score === null) return false;
  return score.mergeIsMoreLikely;
}
