import { describe, expect, it } from 'vitest';
import { headersFootersStage } from '../../src/pipeline/04-headers-footers';
import type { DocLine, DocPage } from '../../src/pipeline/types';

function makeLine(text: string, y: number, xStart = 50): DocLine {
  return { page: 0, y, fontSize: 12, fontName: 'F1', runs: [], text, xStart, xEnd: xStart + text.length * 6 };
}

function makePage(index: number, footerText: string, bodyLines: string[]): DocPage {
  const height = 800;
  return {
    index,
    width: 600,
    height,
    lines: [
      makeLine('MEU LIVRO — CAPÍTULO 3', height - 20), // repeated header (top, high y)
      ...bodyLines.map((t, i) => makeLine(t, height - 100 - i * 20)),
      makeLine(footerText, 15), // footer (bottom, low y)
    ],
  };
}

describe('stage 4 — header/footer removal', () => {
  it('removes a repeated header and an isolated page number on >=60% of pages', () => {
    const pages: DocPage[] = [
      makePage(0, '1', ['Era uma vez uma história.']),
      makePage(1, '2', ['A história continuava aqui.']),
      makePage(2, '3', ['E terminava nesta página.']),
    ];

    const result = headersFootersStage(pages);
    const texts = result.output.map((l) => l.text);

    expect(texts).not.toContain('MEU LIVRO — CAPÍTULO 3');
    expect(texts).not.toContain('1');
    expect(texts).not.toContain('2');
    expect(texts).not.toContain('3');
    expect(texts).toContain('Era uma vez uma história.');
    expect(texts).toContain('A história continuava aqui.');
    expect(result.stats.changed).toBeGreaterThanOrEqual(6); // 3 headers + 3 footers
  });

  it('does not remove body text that does not repeat', () => {
    const pages: DocPage[] = [makePage(0, '1', ['Texto único desta página.'])];
    const result = headersFootersStage(pages);
    const texts = result.output.map((l) => l.text);
    expect(texts).toContain('Texto único desta página.');
  });
});
