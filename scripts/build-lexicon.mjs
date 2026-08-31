#!/usr/bin/env node
/**
 * Generates public/lexicon/pt_br.json from the raw sources in data/lexicon-src/:
 *
 * - hermitdave/FrequencyWords pt_br_50k.txt (MIT code, CC-BY-SA-4.0 data,
 *   derived from OpenSubtitles/OPUS subtitles): provides the frequency list
 *   (used for validity + ranking + stage 7's intra[c]/before[c] reference
 *   table).
 *
 * - LibreOffice's Hunspell pt-BR dictionary, pt_BR.dic (LGPLv3 / MPL,
 *   Raimundo Moura and the VERO team): provides additional valid words not
 *   among the top 50k by frequency — in particular hyphenated compound words
 *   ("guarda-chuva", "mal-estar"), which stage 5 (de-hyphenation) consults to
 *   decide whether to keep the hyphen.
 *
 * We only use the ROOT WORDS from the .dic (no affix-flag expansion from the
 * .aff) — see the README for this documented limitation. Run with
 * `npm run build:lexicon`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_DIR = join(ROOT, 'data', 'lexicon-src');
const OUT_DIR = join(ROOT, 'public', 'lexicon');

const MAX_FREQ_WORDS = 40000;

function readLines(path) {
  return readFileSync(path, 'utf-8').split(/\r?\n/).filter((l) => l.length > 0);
}

function buildFrequencyList() {
  const lines = readLines(join(SRC_DIR, 'pt_br_50k.txt'));
  /** @type {[string, number][]} */
  const words = [];
  for (const line of lines) {
    const [word, countStr] = line.split(' ');
    if (!word || !countStr) continue;
    const count = Number.parseInt(countStr, 10);
    if (!Number.isFinite(count)) continue;
    words.push([word.toLowerCase(), count]);
  }
  words.sort((a, b) => b[1] - a[1]);
  return words.slice(0, MAX_FREQ_WORDS);
}

function buildHunspellExtra(knownWords) {
  const lines = readLines(join(SRC_DIR, 'pt_BR.dic'));
  const extra = new Set();
  // The first line is the entry count, not a word.
  for (const line of lines.slice(1)) {
    const word = line.split('/')[0].trim().toLowerCase();
    if (word.length === 0) continue;
    if (/\s/.test(word)) continue; // single-word tokens only (hyphenated compounds ok)
    if (knownWords.has(word)) continue;
    extra.add(word);
  }
  return [...extra].sort();
}

function main() {
  console.log('Reading pt_br_50k.txt (FrequencyWords)...');
  const words = buildFrequencyList();
  const knownWords = new Set(words.map(([w]) => w));
  console.log(`  ${words.length} frequency words.`);

  console.log('Reading pt_BR.dic (Hunspell)...');
  const validExtra = buildHunspellExtra(knownWords);
  console.log(`  ${validExtra.length} additional validity words.`);

  const output = {
    version: '1',
    generatedAt: null, // deliberately omitted: keeps the file deterministic across builds
    sources: [
      'hermitdave/FrequencyWords pt_br_50k.txt (MIT code / CC-BY-SA-4.0 data)',
      'LibreOffice dictionaries pt_BR.dic (LGPLv3 / MPL) — root words only, no affix expansion',
    ],
    words,
    validExtra,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, 'pt_br.json');
  writeFileSync(outPath, JSON.stringify(output), 'utf-8');
  console.log(`Wrote ${outPath} (${(JSON.stringify(output).length / 1024).toFixed(0)} KB).`);
}

main();
