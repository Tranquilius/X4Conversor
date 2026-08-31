import type { BigramModel, CharReferenceStat, Lexicon } from '../../../src/lexicon/types';

/**
 * Controlled lexicon for tests: validates exactly the words used in the
 * fixtures, and fixes referenceCharStats by hand instead of deriving it from
 * a real corpus — this keeps the tests deterministic and focused on the
 * algorithm's logic (phases A–D), independent of what a small sample corpus
 * would produce statistically. `buildReferenceCharStats` has its own
 * dedicated test to validate the derivation from real frequencies.
 */
export function makeTestLexicon(overrides?: Partial<Lexicon>): Lexicon {
  const validWords = [
    'a', 'e', 'o', 'à', 'de', 'que', 'em', 'um', 'uma', 'com', 'para', 'por', 'se',
    'só', 'vi', 'cicatrizes', 'essas', 'única', 'pessoa', 'ela', 'estava', 'sua',
    'punição', 'havia', 'sido', 'trabalhou', 'até', 'durou', 'menos', 'mês',
    'olhou', 'suas', 'mãos', 'ele', 'soubesse', 'saiu', 'irmão',
    'como', 'bora', 'embora', 'morta', 'cumprida', 'morrer', 'comum',
    'guarda-chuva', 'chuva', 'guarda', 'mal-estar', 'mal', 'estar', 'antes',
    'pegou', 'o', 'sentiu', 'profundo', 'gato', 'subiu', 'no', 'telhado',
    'e', 'dormiu', 'cedo', 'porque', 'estava', 'cansado',
  ];

  const valid = new Set(validWords);
  const logFreq = new Map<string, number>();
  for (const w of valid) logFreq.set(w, Math.log(101));

  const referenceCharStats = new Map<string, CharReferenceStat>([
    // In healthy PT-BR, 'm' frequently appears followed by another letter
    // (tempo, sempre, campo, mesmo, importante...). Fixed high on purpose.
    ['m', { intra: 950, antes: 50, ratio: 0.95 }],
    // 's' tends to end words (plurals); should never be flagged.
    ['s', { intra: 200, antes: 800, ratio: 0.2 }],
    ['a', { intra: 600, antes: 400, ratio: 0.6 }],
    ['o', { intra: 550, antes: 450, ratio: 0.55 }],
    ['t', { intra: 500, antes: 200, ratio: 0.71 }],
  ]);

  const bigram: BigramModel = { splitLogProb: new Map(), mergedLogProb: new Map() };

  return { valid, logFreq, referenceCharStats, bigram, ...overrides };
}
