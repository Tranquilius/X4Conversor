import { describe, expect, it } from 'vitest';
import { detectDocumentLanguage } from '../../src/pipeline/language';
import type { Paragraph } from '../../src/pipeline/types';
import { makeTestLexicon } from './helpers/make-test-lexicon';

describe('document language detection', () => {
  const lexicon = makeTestLexicon();

  it('detects Portuguese text using the PT-BR lexicon', () => {
    const paragraphs: Paragraph[] = [
      { text: 'ela estava com sua punição, mas ele saiu com o irmão para comprar pão.', page: null },
    ];
    expect(detectDocumentLanguage(paragraphs, lexicon)).toBe('pt-BR');
  });

  it('falls back to English when few words match the PT-BR lexicon', () => {
    const paragraphs: Paragraph[] = [
      {
        text: 'The quick brown fox jumps over the lazy dog while the wind blows through the trees.',
        page: null,
      },
    ];
    expect(detectDocumentLanguage(paragraphs, lexicon)).toBe('en');
  });

  it('defaults to pt-BR when there is no text to sample', () => {
    expect(detectDocumentLanguage([], lexicon)).toBe('pt-BR');
  });
});
