import type { ChapterMark, OutlineEntry, Paragraph, StageResult } from './types';

// Both Portuguese and English patterns are checked unconditionally — the
// same heuristic runs regardless of the detected document language, since a
// wrong guess would otherwise silently disable chapter detection.
const CHAPTER_PATTERNS: RegExp[] = [
  /^CAP[IÍ]TULO\s+[\dIVXLCM]+\b/i,
  /^CHAPTER\s+[\dIVXLCM]+\b/i,
  /^PR[OÓ]LOGO$/i,
  /^PROLOGUE$/i,
  /^EP[IÍ]LOGO$/i,
  /^EPILOGUE$/i,
  /^PARTE\s+[\dIVXLCM]+\b/i,
  /^PART\s+[\dIVXLCM]+\b/i,
  /^[IVXLCM]+$/, // lone roman numeral
  /^\d{1,3}$/, // lone number
];

const MAX_HEADING_LENGTH = 60;

function isAllCaps(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, '');
  return letters.length > 0 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

function looksLikeChapterHeading(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_HEADING_LENGTH) return false;
  if (CHAPTER_PATTERNS.some((re) => re.test(trimmed))) return true;
  // Whole line in caps, short: likely a chapter/section heading.
  return isAllCaps(trimmed);
}

/**
 * Stage 8: chapter detection. Priority 1: PDF outline/bookmarks, mapped to
 * the paragraph whose page matches. Priority 2 (always runs, even with an
 * outline, as a complement): heuristic for short, isolated lines that look
 * like headings.
 */
export function detectChapters(
  paragraphs: Paragraph[],
  outline: OutlineEntry[] | null,
): StageResult<ChapterMark[]> {
  const chapters: ChapterMark[] = [];
  const details: string[] = [];

  if (outline && outline.length > 0) {
    for (const entry of outline) {
      if (entry.pageIndex === null) continue;
      const paragraphIndex = paragraphs.findIndex((p) => p.page === entry.pageIndex);
      if (paragraphIndex === -1) continue;
      chapters.push({ paragraphIndex, title: entry.title.trim(), source: 'outline' });
    }
    details.push(`${chapters.length} chapters identified via PDF bookmarks.`);
  }

  if (chapters.length === 0) {
    paragraphs.forEach((p, idx) => {
      if (looksLikeChapterHeading(p.text)) {
        chapters.push({ paragraphIndex: idx, title: p.text.trim(), source: 'heuristic' });
      }
    });
    details.push(`${chapters.length} chapters identified via short-heading heuristic.`);
  }

  chapters.sort((a, b) => a.paragraphIndex - b.paragraphIndex);

  return {
    output: chapters,
    stats: { stage: 'chapters', changed: chapters.length, details },
  };
}
