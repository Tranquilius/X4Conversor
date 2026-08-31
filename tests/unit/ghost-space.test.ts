import { describe, expect, it } from 'vitest';
import { ghostSpaceStage, analyzeGhostSpaces } from '../../src/pipeline/07-ghost-space';
import { CORRUPTED_PAIRS, MENOS_MES_GROUP_KEYS, NEGATIVE_CASES, PROPER_NOUNS } from '../../src/__fixtures__/corrupted';
import type { Paragraph, PipelineOptions } from '../../src/pipeline/types';
import { DEFAULT_OPTIONS } from '../../src/pipeline/types';
import { makeTestLexicon } from './helpers/make-test-lexicon';

const REPEATS = 5;

function toParagraphs(sentences: string[]): Paragraph[] {
  return sentences.map((text) => ({ text, page: null }));
}

function buildRepeatedDocument(extraSentences: string[] = []): Paragraph[] {
  const base = CORRUPTED_PAIRS.map((p) => p.entrada);
  const sentences: string[] = [];
  for (let i = 0; i < REPEATS; i++) {
    sentences.push(...base);
    sentences.push(`Kelsier olhou em volta, procurando Tresting perto de Hathsin.`);
  }
  sentences.push(...extraSentences);
  return toParagraphs(sentences);
}

function optionsWithOverrides(overrides: Record<string, boolean>): PipelineOptions {
  return {
    ...DEFAULT_OPTIONS,
    ghostSpaceGroupOverrides: overrides,
  };
}

describe('stage 7 — ghost space repair', () => {
  const lexicon = makeTestLexicon();

  it('phase A triggers the diagnosis and identifies "m" as a suspicious character', () => {
    const doc = buildRepeatedDocument();
    const analysis = analyzeGhostSpaces(doc, lexicon, []);
    expect(analysis.diagnostics.triggered).toBe(true);
    expect(analysis.diagnostics.suspiciousChars[0]?.char).toBe('m');
  });

  it('band 1: auto-merges with default options', () => {
    const doc = buildRepeatedDocument();
    const result = ghostSpaceStage(doc, lexicon, DEFAULT_OPTIONS);
    const joined = result.output.map((p) => p.text).join('\n');

    for (const pair of CORRUPTED_PAIRS.filter((p) => p.band === 1)) {
      expect(joined).toContain(pair.esperado);
    }
    expect(result.stats.changed).toBeGreaterThan(0);
  });

  it('band 2: does NOT auto-merge with default options (sits in the review queue)', () => {
    const doc = buildRepeatedDocument();
    const result = ghostSpaceStage(doc, lexicon, DEFAULT_OPTIONS);
    const joined = result.output.map((p) => p.text).join('\n');

    for (const pair of CORRUPTED_PAIRS.filter((p) => p.band === 2)) {
      expect(joined).toContain(pair.entrada);
      expect(joined).not.toContain(pair.esperado);
    }
  });

  it('band 2: merges when the group is explicitly accepted in review (phase D)', () => {
    const doc = buildRepeatedDocument();
    const band2Keys = CORRUPTED_PAIRS.filter((p) => p.band === 2).map((p) => p.groupKey);
    const overrides = Object.fromEntries(band2Keys.map((k) => [k, true]));
    const result = ghostSpaceStage(doc, lexicon, optionsWithOverrides(overrides));
    const joined = result.output.map((p) => p.text).join('\n');

    for (const pair of CORRUPTED_PAIRS.filter((p) => p.band === 2)) {
      expect(joined).toContain(pair.esperado);
    }
  });

  it('the "menos/mês" sentence produces two independent groups', () => {
    const doc = buildRepeatedDocument();
    const analysis = analyzeGhostSpaces(doc, lexicon, []);
    const keys = analysis.groups.map((g) => g.key);
    for (const expectedKey of MENOS_MES_GROUP_KEYS) {
      expect(keys).toContain(expectedKey);
    }
  });

  it('regression: "com o irmão" never becomes "como irmão" by default', () => {
    for (const neg of NEGATIVE_CASES) {
      const doc = buildRepeatedDocument([neg.entrada, neg.entrada, neg.entrada]);
      const result = ghostSpaceStage(doc, lexicon, DEFAULT_OPTIONS);
      const joined = result.output.map((p) => p.text).join('\n');
      expect(joined).not.toContain(neg.proibido);
      expect(joined).toContain(neg.entrada);
    }
  });

  it('proper nouns survive intact', () => {
    const doc = buildRepeatedDocument();
    const result = ghostSpaceStage(doc, lexicon, DEFAULT_OPTIONS);
    const joined = result.output.map((p) => p.text).join('\n');
    for (const name of PROPER_NOUNS) {
      expect(joined).toContain(name);
    }
  });

  it('a clean document comes out identical (the stage does not trigger)', () => {
    const clean: Paragraph[] = toParagraphs([
      'o gato subiu no telhado e dormiu cedo porque estava cansado.',
      'ele saiu com o irmão para comprar pão.',
    ]);
    const result = ghostSpaceStage(clean, lexicon, DEFAULT_OPTIONS);
    expect(result.output).toEqual(clean);
    expect(result.stats.changed).toBe(0);
  });

  it('disabling the stage in options changes nothing', () => {
    const doc = buildRepeatedDocument();
    const result = ghostSpaceStage(doc, lexicon, { ...DEFAULT_OPTIONS, ghostSpaceEnabled: false });
    expect(result.output).toEqual(doc);
    expect(result.stats.changed).toBe(0);
  });
});
