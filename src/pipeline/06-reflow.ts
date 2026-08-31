import type { Paragraph, StageResult } from './types';

export interface ReflowLine {
  text: string;
  page: number | null;
  /** Indent greater than the page median (only available for PDF via geometry). */
  indented?: boolean;
  /** Vertical spacing above greater than the median (only available for PDF). */
  extraGapAbove?: boolean;
}

const DIALOGUE_DASH_RE = /^[–—]/;
const SENTENCE_END_RE = /["'’”)]?[.?!…]["'’”)]?$/;

/**
 * Stage 6: paragraph reflow. Joins physical lines that belong to the same
 * paragraph. Signals for a new paragraph (used when available):
 * - a blank line before it;
 * - indent/vertical spacing above the median (PDF geometry);
 * - starts with a dialogue dash;
 * - the previous line ends in sentence-final punctuation AND is noticeably
 *   shorter than the document's median line length (doesn't fill the column
 *   width) — a heuristic that works for both PDF and hard-wrapped TXT,
 *   without depending on geometry.
 */
export function reflowStage(lines: ReflowLine[]): StageResult<Paragraph[]> {
  const nonBlankLengths = lines
    .map((l) => l.text.trim())
    .filter((t) => t.length > 0)
    .map((t) => t.length)
    .sort((a, b) => a - b);
  const median =
    nonBlankLengths.length > 0 ? nonBlankLengths[Math.floor(nonBlankLengths.length / 2)] : 0;
  const shortLineThreshold = median * 0.7;

  const paragraphs: Paragraph[] = [];
  let current: string[] = [];
  let currentPage: number | null = null;
  let precededByBlank = true;
  let prevLineText: string | null = null;
  let mergedLineCount = 0;

  const flush = () => {
    if (current.length === 0) return;
    paragraphs.push({ text: current.join(' ').replace(/\s+/g, ' ').trim(), page: currentPage });
    current = [];
  };

  for (const line of lines) {
    const trimmed = line.text.trim();
    if (trimmed.length === 0) {
      precededByBlank = true;
      prevLineText = null;
      continue;
    }

    const prevEndsSentence =
      prevLineText !== null &&
      SENTENCE_END_RE.test(prevLineText) &&
      prevLineText.length < shortLineThreshold;

    const startsNewParagraph =
      current.length === 0 ||
      precededByBlank ||
      line.indented === true ||
      line.extraGapAbove === true ||
      DIALOGUE_DASH_RE.test(trimmed) ||
      prevEndsSentence;

    if (startsNewParagraph) {
      flush();
      currentPage = line.page;
    } else {
      mergedLineCount++;
    }
    current.push(trimmed);
    prevLineText = trimmed;
    precededByBlank = false;
  }
  flush();

  return {
    output: paragraphs,
    stats: {
      stage: 'reflow',
      changed: mergedLineCount,
      details: [`${lines.length} lines → ${paragraphs.length} paragraphs.`],
    },
  };
}
