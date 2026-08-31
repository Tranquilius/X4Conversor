import { describe, expect, it } from 'vitest';
import { extractGeometry, type PdfDocumentLike, type PdfTextItemLike } from '../../src/pipeline/02-geometry';

const FONT_SIZE = 12;
// DECLARED width (Widths table) is the same for every glyph, including 'm' —
// that's exactly the assumption that breaks when 'm' needs more visual room
// than declared. The TRUE ADVANCE (the next glyph's x position, coming from
// the content stream) is larger for 'm' than the declared width, which
// produces an artificial gap right after it:
// gap = next.x - (current.x + current.declared_width).
const DECLARED_WIDTH = 6.4;
const TRUE_ADVANCE_NORMAL = 7.0; // normal intra-word gap: 0.6 (7.0-6.4)
const TRUE_ADVANCE_M = 9.0; // "ghost" gap after m: 2.6 (9.0-6.4) — still much smaller than a real space
const SPACE_WIDTH = 20.8; // real inter-word gap: 14.4 (20.8-6.4)

/**
 * Builds glyph-by-glyph text items (as `disableCombineTextItems: true` would
 * produce) for a line of words, with 'm' declared at the same width as other
 * glyphs but a larger true advance — reproducing the defect described in the
 * problem without relying on any "naive" reference extraction.
 */
function buildLineItems(
  words: string[],
  y: number,
  x0 = 72,
  fontName = 'F1',
): PdfTextItemLike[] {
  const items: PdfTextItemLike[] = [];
  let x = x0;
  words.forEach((word, wordIdx) => {
    if (wordIdx > 0) x += SPACE_WIDTH;
    for (const ch of word) {
      items.push({
        str: ch,
        width: DECLARED_WIDTH,
        height: FONT_SIZE,
        transform: [FONT_SIZE, 0, 0, FONT_SIZE, x, y],
        fontName,
      });
      x += ch === 'm' ? TRUE_ADVANCE_M : TRUE_ADVANCE_NORMAL;
    }
  });
  return items;
}

function makeMockPdf(items: PdfTextItemLike[]): PdfDocumentLike {
  return {
    numPages: 1,
    async getPage() {
      return {
        getViewport: () => ({ width: 600, height: 800 }),
        getTextContent: async () => ({ items }),
      };
    },
    async getOutline() {
      return null;
    },
    async getDestination() {
      return null;
    },
    async getPageIndex() {
      return 0;
    },
  };
}

describe('stage 2 — geometric extraction (adaptive per-font threshold)', () => {
  it('reconstructs "como" without a ghost space despite the wrong "m" width', async () => {
    // Repeats the line several times at different y positions to accumulate
    // enough gap samples for Otsu's method to find the real bimodal threshold.
    const lines = Array.from({ length: 8 }, (_, i) =>
      buildLineItems(['cicatrizes', 'como', 'essas'], 700 - i * 20),
    ).flat();

    const result = await extractGeometry(makeMockPdf(lines));
    const page = result.doc.pages[0];

    expect(page.lines.length).toBe(8);
    for (const line of page.lines) {
      expect(line.text).toContain('como');
      expect(line.text).not.toContain('m o'); // must not insert a ghost space after "m"
      expect(line.text).toBe('cicatrizes como essas');
    }
    expect(result.stats.changed).toBeGreaterThan(0);
  });

  it('detects a page with no text layer (image only)', async () => {
    const blankItems: PdfTextItemLike[] = [
      { str: '   ', width: 0, height: 0, transform: [1, 0, 0, 1, 0, 0], fontName: 'F1' },
    ];
    const result = await extractGeometry(makeMockPdf(blankItems.filter((i) => i.str.trim().length > 0)));
    expect(result.hasNoTextLayer).toBe(true);
  });

  it('honors hasEOL as a forced line break', async () => {
    const items = buildLineItems(['linha'], 700);
    items[items.length - 1].hasEOL = true;
    items.push(...buildLineItems(['outra'], 700)); // same y, but EOL must split them

    const result = await extractGeometry(makeMockPdf(items));
    expect(result.doc.pages[0].lines.length).toBe(2);
  });
});
