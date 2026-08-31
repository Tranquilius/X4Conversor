/** Text utilities shared across pipeline stages. */

// Single-letter tokens that are valid PT-BR words (aside from initials/roman numerals).
export const VALID_SINGLE_LETTER_WORDS = new Set(['a', 'e', 'o', 'à']); // a, e, o, à

// Roman numerals only count as such in uppercase — a lone lowercase "m" or "i" in
// the middle of running text is almost always an extraction artifact, never a
// chapter numeral.
const ROMAN_NUMERAL_RE = /^[IVXLCDM]+$/;

export function isRomanNumeral(token: string): boolean {
  return token.length > 0 && ROMAN_NUMERAL_RE.test(token);
}

export function isValidSingleLetterToken(token: string): boolean {
  const lower = token.toLowerCase();
  if (VALID_SINGLE_LETTER_WORDS.has(lower)) return true;
  if (isRomanNumeral(token)) return true;
  // Capitalized initials followed by a period (e.g. "J." in "J. R. R. Tolkien") are
  // handled separately by the caller; here we only evaluate the bare letter.
  return false;
}

// Splits into "word" tokens (sequences of Unicode letters, including accents) and
// keeps punctuation/whitespace as separate tokens, so exact reconstruction is possible.
const WORD_SPLIT_RE = /(\p{L}+)/u;

export function splitWordsKeepDelimiters(text: string): string[] {
  return text.split(WORD_SPLIT_RE).filter((s) => s.length > 0);
}

export function isWordToken(token: string): boolean {
  return /^\p{L}+$/u.test(token);
}

export function isUpperCaseWord(token: string): boolean {
  return isWordToken(token) && token === token.toUpperCase() && token !== token.toLowerCase();
}

export function isCapitalized(token: string): boolean {
  if (!isWordToken(token)) return false;
  const first = token[0];
  return first === first.toUpperCase() && first !== first.toLowerCase();
}

// Ligatures U+FB00–U+FB06: ff fi fl ffi ffl st(long-s+t) st
const LIGATURE_MAP: Record<string, string> = {
  'ﬀ': 'ff',
  'ﬁ': 'fi',
  'ﬂ': 'fl',
  'ﬃ': 'ffi',
  'ﬄ': 'ffl',
  'ﬅ': 'st', // long s + t
  'ﬆ': 'st',
};

const LIGATURE_RE = /[ﬀ-ﬆ]/g;

export function expandLigatures(text: string): string {
  return text.replace(LIGATURE_RE, (ch) => LIGATURE_MAP[ch] ?? ch);
}

// Invisible characters to strip from mid-text: soft hyphen (U+00AD), ZWSP (U+200B),
// ZWNJ (U+200C), ZWJ (U+200D), BOM/ZWNBSP (U+FEFF).
const INVISIBLE_RE = /[­​‌‍﻿]/g;

export function stripInvisibleChars(text: string): { text: string; removed: number } {
  let removed = 0;
  const out = text.replace(INVISIBLE_RE, () => {
    removed++;
    return '';
  });
  return { text: out, removed };
}

const NBSP_RE = / /g;

export function nbspToSpace(text: string): { text: string; count: number } {
  let count = 0;
  const out = text.replace(NBSP_RE, () => {
    count++;
    return ' ';
  });
  return { text: out, count };
}

// Curly single quotes (U+2018 U+2019 U+201A U+201B) and double quotes (U+201C U+201D U+201E U+201F),
// en/em dashes (U+2013 U+2014).
const CURLY_QUOTES_RE = /[‘’‚‛]/g;
const CURLY_DOUBLE_QUOTES_RE = /[“”„‟]/g;
const DASHES_RE = /[–—]/g;

export function normalizeQuotesAndDashes(text: string): { text: string; changed: number } {
  let changed = 0;
  let out = text.replace(CURLY_QUOTES_RE, () => {
    changed++;
    return "'";
  });
  out = out.replace(CURLY_DOUBLE_QUOTES_RE, () => {
    changed++;
    return '"';
  });
  out = out.replace(DASHES_RE, () => {
    changed++;
    return '-';
  });
  return { text: out, changed };
}

export function nfc(text: string): string {
  return text.normalize('NFC');
}
