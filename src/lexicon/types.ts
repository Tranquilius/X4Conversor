export interface CharReferenceStat {
  intra: number;
  antes: number;
  /** Proportion of occurrences where the letter is followed by another letter (vs. a space/word end). */
  ratio: number;
}

export interface BigramModel {
  /** P(right | left) in log space, for the pair staying split. Key: "left|right". */
  splitLogProb: Map<string, number>;
  /** P(next_word | merged) in log space. Key: "merged|next_word". */
  mergedLogProb: Map<string, number>;
}

export interface Lexicon {
  /** Words (lowercase) considered valid in PT-BR: union of FrequencyWords ∪ Hunspell. */
  valid: Set<string>;
  /** log-frequency per word (lowercase), only for the ones present in FrequencyWords. */
  logFreq: Map<string, number>;
  /** intra[c]/antes[c] reference table, derived from the lexicon itself at init time. */
  referenceCharStats: Map<string, CharReferenceStat>;
  /**
   * Bigram model for disambiguating Band 2 (stage 7, phase C).
   * v1 does not ship a real bigram corpus (see README / limitations) — so the model
   * comes empty by default, and phase C correctly sends all of Band 2 to manual
   * review, exactly as the spec's algorithm requires when no bigram model is available.
   */
  bigram: BigramModel;
}

export function isWordValid(lexicon: Lexicon, word: string, extra: Set<string>): boolean {
  const lower = word.toLowerCase();
  return lexicon.valid.has(lower) || extra.has(lower);
}
