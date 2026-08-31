/**
 * Input→expected pairs for the ghost-space repair (stage 7).
 *
 * The actual sentences are Portuguese on purpose — this tool repairs PT-BR
 * text, so the fixtures exercise the real target language, not a stand-in.
 *
 * `band` reflects phase C's classification:
 * - 1 = at least one side is invalid on its own; auto-merges by default.
 * - 2 = both sides are valid on their own (ambiguous); only merges if the
 *   group is accepted in review (phase D) — by default, with no bigram
 *   model, it sits in the review queue.
 */
export interface CorruptedPair {
  id: string;
  band: 1 | 2;
  /** Expected group key in GhostSpaceGroup.key ("left right", lowercase). */
  groupKey: string;
  entrada: string;
  esperado: string;
}

export const CORRUPTED_PAIRS: CorruptedPair[] = [
  {
    id: 'como',
    band: 2,
    groupKey: 'com o',
    entrada: 'só vi cicatrizes com o essas',
    esperado: 'só vi cicatrizes como essas',
  },
  {
    id: 'uma',
    band: 2,
    groupKey: 'um a',
    entrada: 'em um a única pessoa',
    esperado: 'em uma única pessoa',
  },
  {
    id: 'morta',
    band: 1,
    groupKey: 'm orta',
    entrada: 'ela estava m orta',
    esperado: 'ela estava morta',
  },
  {
    id: 'cumprida',
    band: 1,
    groupKey: 'cum prida',
    entrada: 'sua punição havia sido cum prida',
    esperado: 'sua punição havia sido cumprida',
  },
  {
    id: 'morrer',
    band: 1,
    groupKey: 'm orrer',
    entrada: 'trabalhou até m orrer',
    esperado: 'trabalhou até morrer',
  },
  {
    id: 'menos-mes',
    band: 1,
    groupKey: 'm enos', // + second group "m ês", see MENOS_MES_GROUP_KEYS below
    entrada: 'durou m enos de um m ês',
    esperado: 'durou menos de um mês',
  },
  {
    id: 'maos',
    band: 1,
    groupKey: 'm ãos',
    entrada: 'olhou para suas m ãos',
    esperado: 'olhou para suas mãos',
  },
  {
    id: 'embora',
    band: 2,
    groupKey: 'em bora',
    entrada: 'em bora ele soubesse',
    esperado: 'embora ele soubesse',
  },
];

/** The "menos-mes" example produces two independent groups in the same sentence. */
export const MENOS_MES_GROUP_KEYS = ['m enos', 'm ês'];

export interface NegativeCase {
  id: string;
  entrada: string;
  /** Form the tool must NEVER produce by default (without an accepted review). */
  proibido: string;
}

export const NEGATIVE_CASES: NegativeCase[] = [
  {
    id: 'com-o-irmao',
    entrada: 'ele saiu com o irmão',
    proibido: 'ele saiu como irmão',
  },
];

export interface HyphenCase {
  id: string;
  linha1: string;
  linha2: string;
  /** The compound word must keep the hyphen after de-hyphenation. */
  esperadoComHifen: string;
}

export const HYPHEN_CASES: HyphenCase[] = [
  {
    id: 'guarda-chuva',
    linha1: 'ela pegou o guarda-',
    linha2: 'chuva antes de sair',
    esperadoComHifen: 'guarda-chuva',
  },
  {
    id: 'mal-estar',
    linha1: 'sentiu um mal-',
    linha2: 'estar profundo',
    esperadoComHifen: 'mal-estar',
  },
];

/** Fictional proper nouns that must not be corrupted by stage 7. */
export const PROPER_NOUNS = ['Kelsier', 'Tresting', 'Hathsin'];
