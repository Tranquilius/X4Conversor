import { describe, expect, it } from 'vitest';
import { detectChapters } from '../../src/pipeline/08-chapters';
import type { OutlineEntry, Paragraph } from '../../src/pipeline/types';

describe('stage 8 — chapter detection', () => {
  it('uses the PDF outline when available', () => {
    const paragraphs: Paragraph[] = [
      { text: 'Texto da página 0.', page: 0 },
      { text: 'Texto da página 1.', page: 1 },
    ];
    const outline: OutlineEntry[] = [{ title: 'Capítulo 1', level: 0, pageIndex: 1 }];
    const result = detectChapters(paragraphs, outline);
    expect(result.output).toHaveLength(1);
    expect(result.output[0]).toMatchObject({ paragraphIndex: 1, title: 'Capítulo 1', source: 'outline' });
  });

  it('falls back to the short-heading heuristic when there is no outline', () => {
    const paragraphs: Paragraph[] = [
      { text: 'CAPÍTULO 1', page: null },
      { text: 'Era uma vez uma longa história que se seguia por muitas linhas.', page: null },
      { text: 'PRÓLOGO', page: null },
      { text: 'Mais texto comum de parágrafo, sem nada de especial aqui.', page: null },
    ];
    const result = detectChapters(paragraphs, null);
    expect(result.output.map((c) => c.paragraphIndex)).toEqual([0, 2]);
    expect(result.output.every((c) => c.source === 'heuristic')).toBe(true);
  });

  it('does not mistake an occasional long uppercase paragraph for a heading (>60 chars does not count)', () => {
    const longUpper = 'ESTE É UM TÍTULO MUITO LONGO QUE ULTRAPASSA O LIMITE DE SESSENTA CARACTERES DEFINIDO';
    const paragraphs: Paragraph[] = [{ text: longUpper, page: null }];
    const result = detectChapters(paragraphs, null);
    expect(result.output).toHaveLength(0);
  });

  it('also recognizes English chapter headings (CHAPTER, PROLOGUE, EPILOGUE, PART)', () => {
    const paragraphs: Paragraph[] = [
      { text: 'CHAPTER 1', page: null },
      { text: 'It was a long story that carried on for many lines.', page: null },
      { text: 'PROLOGUE', page: null },
      { text: 'Some more ordinary paragraph text, nothing special here.', page: null },
      { text: 'PART 2', page: null },
      { text: 'And the story continues.', page: null },
      { text: 'EPILOGUE', page: null },
    ];
    const result = detectChapters(paragraphs, null);
    expect(result.output.map((c) => c.paragraphIndex)).toEqual([0, 2, 4, 6]);
    expect(result.output.every((c) => c.source === 'heuristic')).toBe(true);
  });
});
