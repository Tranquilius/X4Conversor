import { idbGet, idbSet } from '../storage/indexeddb';
import { buildReferenceCharStats } from './build-reference-stats';
import type { BigramModel, Lexicon } from './types';

const CACHE_KEY = 'lexicon-v1';

interface RawLexiconFile {
  version: string;
  /** [word, frequency] from FrequencyWords pt_br_50k, sorted by frequency desc. */
  words: [string, number][];
  /** Words from the Hunspell pt-BR dictionary not covered by `words` (validity only, no frequency). */
  validExtra: string[];
}

let cached: Lexicon | null = null;
let inFlight: Promise<Lexicon> | null = null;

export async function loadLexicon(baseUrl = import.meta.env.BASE_URL): Promise<Lexicon> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const fromIdb = await idbGet<Lexicon>(CACHE_KEY).catch(() => undefined);
    if (fromIdb) {
      cached = fromIdb;
      return cached;
    }

    const url = `${baseUrl}lexicon/pt_br.json`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to load lexicon (${url}): HTTP ${res.status}`);
    }
    const raw = (await res.json()) as RawLexiconFile;

    const valid = new Set<string>();
    const logFreq = new Map<string, number>();
    for (const [word, freq] of raw.words) {
      const lower = word.toLowerCase();
      valid.add(lower);
      logFreq.set(lower, Math.log(freq + 1));
    }
    for (const word of raw.validExtra) {
      valid.add(word.toLowerCase());
    }

    const referenceCharStats = buildReferenceCharStats(raw.words);

    // v1 does not ship a real bigram corpus — see limitations in the README.
    // Phase C (stage 7) treats an empty model as "no data" and sends all of
    // Band 2 to manual review, exactly as the algorithm itself intends.
    const bigram: BigramModel = { splitLogProb: new Map(), mergedLogProb: new Map() };

    const lexicon: Lexicon = { valid, logFreq, referenceCharStats, bigram };
    cached = lexicon;
    await idbSet(CACHE_KEY, lexicon).catch(() => {
      // cache is an optimization; if IndexedDB fails (private mode etc.), we carry on without it.
    });
    return lexicon;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export function clearLexiconCache(): void {
  cached = null;
}
