import { describe, expect, it } from 'vitest';
import { dehyphenateStage } from '../../src/pipeline/05-dehyphenate';
import { HYPHEN_CASES } from '../../src/__fixtures__/corrupted';
import type { Paragraph } from '../../src/pipeline/types';
import { makeTestLexicon } from './helpers/make-test-lexicon';

describe('stage 5 — line-break de-hyphenation', () => {
  const lexicon = makeTestLexicon();

  it('keeps the hyphen when the compound form exists in the lexicon', () => {
    for (const c of HYPHEN_CASES) {
      const lines: Paragraph[] = [
        { text: c.linha1, page: 1 },
        { text: c.linha2, page: 1 },
      ];
      const result = dehyphenateStage(lines, lexicon);
      expect(result.output).toHaveLength(1);
      expect(result.output[0].text).toContain(c.esperadoComHifen);
      expect(result.stats.changed).toBe(1);
    }
  });

  it('removes the hyphen on ordinary line breaks (compound form not in the lexicon)', () => {
    const lines: Paragraph[] = [
      { text: 'aquilo era muito impor-', page: 1 },
      { text: 'tante para ela.', page: 1 },
    ];
    const result = dehyphenateStage(lines, lexicon);
    expect(result.output).toHaveLength(1);
    expect(result.output[0].text).toBe('aquilo era muito importante para ela.');
  });

  it('leaves lines without a break hyphen untouched', () => {
    const lines: Paragraph[] = [
      { text: 'primeira linha normal', page: 1 },
      { text: 'segunda linha normal', page: 1 },
    ];
    const result = dehyphenateStage(lines, lexicon);
    expect(result.output).toEqual(lines);
    expect(result.stats.changed).toBe(0);
  });

  it('does not join when the next line starts with a capital letter (likely a new sentence, not a continuation)', () => {
    const lines: Paragraph[] = [
      { text: 'ele terminou o texto-', page: 1 },
      { text: 'Depois foi embora.', page: 1 },
    ];
    const result = dehyphenateStage(lines, lexicon);
    expect(result.output).toHaveLength(2);
    expect(result.stats.changed).toBe(0);
  });
});
