import type { Lexicon } from '../../lexicon/types';
import { isValidSingleLetterToken } from '../../util/text';
import type { GhostSpaceDiagnostics, Paragraph, SuspiciousChar } from '../types';

/**
 * Minimum sample of occurrences (antes+intra) for a letter to be evaluated —
 * avoids false positives on short documents where the sample is too small to
 * be statistically meaningful.
 */
const MIN_OCCURRENCES_FOR_SIGNAL = 30;

/**
 * A letter is only a candidate "suspicious cut character" if, in the
 * reference lexicon, it normally appears mid-word with a reasonable
 * frequency (reference ratio >= 0.3). Letters that naturally end a lot of
 * words (like 's' in plurals) don't enter this evaluation.
 */
const MIN_REFERENCE_RATIO = 0.3;

/**
 * Anomaly factor: a letter is suspicious when the ratio observed in the
 * document drops below 25% of what the reference predicts.
 */
const ANOMALY_FACTOR = 0.25;

/** Minimum total suspicious cuts (sum of `antes[c]`) to trigger stage 7. */
const MIN_TOTAL_CUTS = 15;

const LETTER_RE = /\p{L}/u;
const SINGLE_LETTER_ARTIFACT_RE = /(?<![\p{L}])(\p{L})(?![\p{L}])/gu;

export function diagnoseGhostSpaces(paragraphs: Paragraph[], lexicon: Lexicon): GhostSpaceDiagnostics {
  const intraDoc = new Map<string, number>();
  const antesDoc = new Map<string, number>();

  for (const p of paragraphs) {
    const text = p.text;
    for (let i = 0; i < text.length; i++) {
      const raw = text[i];
      if (!LETTER_RE.test(raw)) continue;
      const c = raw.toLowerCase();
      const next = text[i + 1];
      if (next === undefined) continue;
      if (next === ' ') {
        antesDoc.set(c, (antesDoc.get(c) ?? 0) + 1);
      } else if (LETTER_RE.test(next)) {
        intraDoc.set(c, (intraDoc.get(c) ?? 0) + 1);
      }
    }
  }

  const suspiciousChars: SuspiciousChar[] = [];
  for (const [c, ref] of lexicon.referenceCharStats) {
    if (ref.ratio < MIN_REFERENCE_RATIO) continue;
    const antes = antesDoc.get(c) ?? 0;
    const intra = intraDoc.get(c) ?? 0;
    const total = antes + intra;
    if (total < MIN_OCCURRENCES_FOR_SIGNAL) continue;
    const docRatio = intra / total;
    if (docRatio < ref.ratio * ANOMALY_FACTOR) {
      suspiciousChars.push({ char: c, intra, antes, ratio: docRatio, referenceRatio: ref.ratio });
    }
  }
  suspiciousChars.sort((a, b) => b.antes - a.antes);

  const singleLetterArtifacts = countSingleLetterArtifacts(paragraphs);
  const totalSuspiciousCuts = suspiciousChars.reduce((sum, s) => sum + s.antes, 0);
  const triggered = suspiciousChars.length > 0 && totalSuspiciousCuts >= MIN_TOTAL_CUTS;

  return {
    suspiciousChars,
    totalSuspiciousCuts,
    singleLetterArtifacts,
    triggered,
    summary: buildSummary(suspiciousChars, totalSuspiciousCuts, triggered),
  };
}

function countSingleLetterArtifacts(paragraphs: Paragraph[]): number {
  let count = 0;
  for (const p of paragraphs) {
    const text = p.text;
    SINGLE_LETTER_ARTIFACT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SINGLE_LETTER_ARTIFACT_RE.exec(text))) {
      const letter = m[1];
      const endIdx = m.index + m[0].length;
      if (text[endIdx] === '.') continue; // likely an initial: "J. R. R. Tolkien"
      if (!isValidSingleLetterToken(letter)) count++;
    }
  }
  return count;
}

function buildSummary(suspicious: SuspiciousChar[], totalCuts: number, triggered: boolean): string {
  if (!triggered || suspicious.length === 0) {
    return 'No anomalous spacing pattern detected; the document looks clean.';
  }
  const top = suspicious[0];
  const pct = totalCuts > 0 ? Math.round((top.antes / totalCuts) * 100) : 0;
  const severity =
    top.intra === 0
      ? `the letter "${top.char}" never appears followed by another letter in this document`
      : `the letter "${top.char}" almost never appears followed by another letter (${Math.round(top.ratio * 100)}% of expected)`;
  return `${totalCuts} suspicious cuts detected; ${pct}% occur after "${top.char}"; ${severity} — systematic corruption.`;
}
