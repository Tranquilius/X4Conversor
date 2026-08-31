import { adaptiveThreshold } from '../util/otsu';
import type { DocLine, DocPage, ExtractedDoc, GlyphRun, OutlineEntry } from './types';

/**
 * Minimal interfaces of what this module needs from pdfjs-dist — kept
 * separate from the real package so the geometric reconstruction logic is
 * testable with synthetic objects, without loading an actual PDF. The caller
 * (worker) is responsible for loading `pdfjs-dist`, configuring
 * `GlobalWorkerOptions.workerSrc` with the local bundle's worker, and passing
 * the already-loaded document instance to `extractGeometry`.
 */
export interface PdfDocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageLike>;
  getOutline(): Promise<PdfOutlineNode[] | null>;
  getDestination(dest: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
}

export interface PdfPageLike {
  getViewport(params: { scale: number }): { width: number; height: number };
  getTextContent(params?: {
    disableCombineTextItems?: boolean;
  }): Promise<{ items: PdfTextItemLike[] }>;
}

export interface PdfTextItemLike {
  str: string;
  width: number;
  height: number;
  transform: number[];
  fontName: string;
  hasEOL?: boolean;
}

export interface PdfOutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items: PdfOutlineNode[];
}

export interface GeometryProgress {
  pageIndex: number;
  totalPages: number;
}

export interface GeometryResult {
  doc: ExtractedDoc;
  hasNoTextLayer: boolean;
  stats: { changed: number; details: string[] };
}

const LINE_Y_TOLERANCE_FACTOR = 0.3;

/**
 * Stage 2 (PDF only): extracts each glyph's position and reconstructs words
 * from the geometry, instead of trusting the library's default `str`
 * grouping. The threshold between intra-word and inter-word gap is computed
 * per font, adaptively (Otsu/k-means), from ALL gaps in the document — never
 * a fixed value. That's what avoids the ghost-space bug at the source, for PDFs.
 */
export async function extractGeometry(
  pdf: PdfDocumentLike,
  onProgress?: (p: GeometryProgress) => void,
): Promise<GeometryResult> {
  const totalPages = pdf.numPages;
  const rawPages: { index: number; width: number; height: number; runs: GlyphRun[] }[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent({ disableCombineTextItems: true });

    const runs: GlyphRun[] = textContent.items
      .filter((it) => typeof it.str === 'string' && it.str.length > 0)
      .map((it) => {
        const fontSize = Math.abs(it.transform[3]) || it.height || 1;
        return {
          str: it.str,
          x: it.transform[4],
          y: it.transform[5],
          width: it.width,
          height: it.height || fontSize,
          fontName: it.fontName,
          fontSize,
          hasEOL: Boolean(it.hasEOL),
        };
      });

    rawPages.push({ index: pageNum - 1, width: viewport.width, height: viewport.height, runs });
    onProgress?.({ pageIndex: pageNum - 1, totalPages });
  }

  const hasNoTextLayer = rawPages.every((p) => p.runs.every((r) => r.str.trim().length === 0));

  const thresholdByFont = computeThresholdsByFont(rawPages);
  const fallbackThreshold =
    thresholdByFont.size > 0
      ? [...thresholdByFont.values()].reduce((a, b) => a + b, 0) / thresholdByFont.size
      : 0.3;

  let reconstructed = 0;
  const pages: DocPage[] = rawPages.map((page) => {
    const lines: DocLine[] = groupIntoLines(page.runs).map((runs) => {
      let text = runs[0]?.str ?? '';
      for (let i = 1; i < runs.length; i++) {
        const prev = runs[i - 1];
        const run = runs[i];
        const gap = (run.x - (prev.x + prev.width)) / Math.max(1, prev.fontSize);
        const threshold = thresholdByFont.get(prev.fontName) ?? fallbackThreshold;
        const insertsSpace = gap >= threshold;
        if (!insertsSpace) reconstructed++;
        text += (insertsSpace ? ' ' : '') + run.str;
      }
      const first = runs[0];
      const last = runs[runs.length - 1];
      return {
        page: page.index,
        y: first.y,
        fontSize: first.fontSize,
        fontName: first.fontName,
        runs,
        text,
        xStart: first.x,
        xEnd: last.x + last.width,
      };
    });

    return { index: page.index, width: page.width, height: page.height, lines };
  });

  const outline = await extractOutline(pdf);

  return {
    doc: { sourceKind: 'pdf', pages, outline },
    hasNoTextLayer,
    stats: {
      changed: reconstructed,
      details: [
        `${reconstructed} glyph joins reconstructed via an adaptive per-font threshold ` +
          `(instead of the library's default grouping).`,
      ],
    },
  };
}

function computeThresholdsByFont(
  rawPages: { runs: GlyphRun[] }[],
): Map<string, number> {
  const gapsByFont = new Map<string, number[]>();
  for (const page of rawPages) {
    for (const line of groupIntoLines(page.runs)) {
      for (let i = 1; i < line.length; i++) {
        const prev = line[i - 1];
        const cur = line[i];
        const gap = (cur.x - (prev.x + prev.width)) / Math.max(1, prev.fontSize);
        if (Number.isFinite(gap)) {
          const list = gapsByFont.get(prev.fontName) ?? [];
          list.push(gap);
          gapsByFont.set(prev.fontName, list);
        }
      }
    }
  }

  const thresholds = new Map<string, number>();
  for (const [font, gaps] of gapsByFont) {
    thresholds.set(font, adaptiveThreshold(gaps).threshold);
  }
  return thresholds;
}

function groupIntoLines(runs: GlyphRun[]): GlyphRun[][] {
  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: GlyphRun[][] = [];
  let current: GlyphRun[] = [];
  let currentY: number | null = null;

  const closeLine = () => {
    if (current.length > 0) lines.push([...current].sort((a, b) => a.x - b.x));
    current = [];
    currentY = null;
  };

  for (const run of sorted) {
    const tolerance = run.fontSize * LINE_Y_TOLERANCE_FACTOR;
    if (currentY !== null && Math.abs(run.y - currentY) > tolerance) {
      closeLine();
    }
    current.push(run);
    currentY = currentY === null ? run.y : currentY;
    if (run.hasEOL) closeLine();
  }
  closeLine();
  return lines;
}

async function extractOutline(pdf: PdfDocumentLike): Promise<OutlineEntry[] | null> {
  let raw: PdfOutlineNode[] | null;
  try {
    raw = await pdf.getOutline();
  } catch {
    return null;
  }
  if (!raw || raw.length === 0) return null;

  const entries: OutlineEntry[] = [];
  const walk = async (nodes: PdfOutlineNode[], level: number): Promise<void> => {
    for (const node of nodes) {
      let pageIndex: number | null = null;
      try {
        if (typeof node.dest === 'string') {
          const dest = await pdf.getDestination(node.dest);
          if (dest && dest[0] !== undefined) pageIndex = await pdf.getPageIndex(dest[0]);
        } else if (Array.isArray(node.dest) && node.dest[0] !== undefined) {
          pageIndex = await pdf.getPageIndex(node.dest[0]);
        }
      } catch {
        pageIndex = null;
      }
      entries.push({ title: node.title, level, pageIndex });
      if (node.items?.length) await walk(node.items, level + 1);
    }
  };
  await walk(raw, 0);
  return entries;
}
