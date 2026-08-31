import type { ReflowLine } from './06-reflow';
import type { DocLine, DocPage, StageResult } from './types';

const REPEAT_THRESHOLD = 0.6;
const EDGE_ZONE_FRACTION = 0.12;
const PAGE_NUMBER_RE = /^[ivxlcdm\d]+$/i;

function maskDigits(text: string): string {
  return text.replace(/\d+/g, '#');
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function lineGaps(lines: DocLine[]): number[] {
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    gaps.push(Math.abs(lines[i].y - lines[i - 1].y));
  }
  return gaps;
}

/**
 * Stage 4 (PDF only): removes repeated headers/footers and isolated page
 * numbers, and flattens DocPage[] into a line list (ReflowLine[]) with
 * indent/vertical-spacing signals derived from the geometry, for stage 6 to use.
 */
export function headersFootersStage(
  pages: DocPage[],
  options: { enabled: boolean } = { enabled: true },
): StageResult<ReflowLine[]> {
  const totalPages = pages.length;
  const occurrences = new Map<string, Set<number>>();

  for (const page of pages) {
    const seenOnThisPage = new Set<string>();
    for (const line of page.lines) {
      const masked = maskDigits(line.text.trim());
      if (masked.length === 0 || seenOnThisPage.has(masked)) continue;
      seenOnThisPage.add(masked);
      const set = occurrences.get(masked) ?? new Set<number>();
      set.add(page.index);
      occurrences.set(masked, set);
    }
  }

  const repeatedTexts = new Set<string>();
  for (const [masked, pagesSeen] of occurrences) {
    if (totalPages > 0 && pagesSeen.size / totalPages >= REPEAT_THRESHOLD) {
      repeatedTexts.add(masked);
    }
  }

  const output: ReflowLine[] = [];
  let removed = 0;
  const details: string[] = [];

  for (const page of pages) {
    const medianX = median(page.lines.map((l) => l.xStart));
    const medianGap = median(lineGaps(page.lines).filter((g) => g > 0));

    page.lines.forEach((line, i) => {
      const trimmed = line.text.trim();
      const masked = maskDigits(trimmed);
      const isEdgeZone =
        line.y < page.height * EDGE_ZONE_FRACTION ||
        line.y > page.height * (1 - EDGE_ZONE_FRACTION);
      const isRepeatedHeaderFooter = options.enabled && isEdgeZone && repeatedTexts.has(masked);
      const isIsolatedPageNumber =
        options.enabled &&
        isEdgeZone &&
        trimmed.length > 0 &&
        trimmed.length <= 6 &&
        PAGE_NUMBER_RE.test(trimmed);

      if (isRepeatedHeaderFooter || isIsolatedPageNumber) {
        removed++;
        if (details.length < 100) {
          details.push(`Removed (p.${page.index + 1}): "${trimmed}"`);
        }
        return;
      }

      const indented =
        medianX > 0 ? line.xStart > medianX + line.fontSize * 0.5 : undefined;
      const gapAbove = i > 0 ? Math.abs(line.y - page.lines[i - 1].y) : null;
      const extraGapAbove =
        gapAbove !== null && medianGap > 0 ? gapAbove > medianGap * 1.6 : undefined;

      output.push({ text: line.text, page: page.index, indented, extraGapAbove });
    });
  }

  return { output, stats: { stage: 'headers-footers', changed: removed, details } };
}
