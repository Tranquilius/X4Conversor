import type { GhostSpaceOccurrence, Paragraph, SuspiciousChar } from '../types';

const PAIR_RE = /(\p{L}+) (\p{L}+)/gu;
const CONTEXT_RADIUS = 40;

export type RawCandidate = GhostSpaceOccurrence;

/**
 * Phase B: for every "word space word" boundary in the text, generates a
 * merge candidate when the left token ends in a suspicious character (phase
 * A) OR when either side is not a valid word on its own.
 *
 * The regex cursor advances right after the left token (not the whole pair),
 * to capture overlapping candidates: in "com o essas" this generates both
 * ("com","o") and ("o","essas") as independent candidates — phase C decides
 * which one (if any) makes sense.
 */
export function generateCandidates(
  paragraphs: Paragraph[],
  suspiciousChars: SuspiciousChar[],
  isValidWord: (token: string) => boolean,
): RawCandidate[] {
  const suspiciousSet = new Set(suspiciousChars.map((s) => s.char));
  const candidates: RawCandidate[] = [];

  paragraphs.forEach((p, paragraphIndex) => {
    const text = p.text;
    PAIR_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PAIR_RE.exec(text))) {
      const left = m[1];
      const right = m[2];
      const lastCharLeft = left[left.length - 1].toLowerCase();
      const leftEndsSuspicious = suspiciousSet.has(lastCharLeft);
      const leftInvalid = !isValidWord(left);
      const rightInvalid = !isValidWord(right);

      if (leftEndsSuspicious || leftInvalid || rightInvalid) {
        candidates.push({
          paragraphIndex,
          charOffset: m.index,
          left,
          right,
          merged: left + right,
          contextBefore: text.slice(Math.max(0, m.index - CONTEXT_RADIUS), m.index),
          contextAfter: text.slice(
            m.index + m[0].length,
            m.index + m[0].length + CONTEXT_RADIUS,
          ),
        });
      }

      PAIR_RE.lastIndex = m.index + left.length + 1;
    }
  });

  return candidates;
}
