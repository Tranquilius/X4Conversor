import type { Lexicon } from '../../lexicon/types';
import { isCapitalized } from '../../util/text';
import type {
  GhostSpaceGroup,
  GhostSpaceResult,
  Paragraph,
  PipelineOptions,
  StageResult,
} from '../types';
import { diagnoseGhostSpaces } from './phase-a-diagnose';
import { generateCandidates } from './phase-b-candidates';
import { decideCandidates, defaultAcceptForBand, isTokenValid } from './phase-c-decide';

/** Proper nouns: any capitalized token with 3+ occurrences becomes a valid local word. */
const LOCAL_LEXICON_MIN_COUNT = 3;
const WORD_RE = /\p{L}+/gu;

function buildLocalLexicon(paragraphs: Paragraph[]): Set<string> {
  const counts = new Map<string, number>();
  for (const p of paragraphs) {
    WORD_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WORD_RE.exec(p.text))) {
      const token = m[0];
      if (token.length > 1 && isCapitalized(token)) {
        const lower = token.toLowerCase();
        counts.set(lower, (counts.get(lower) ?? 0) + 1);
      }
    }
  }
  const local = new Set<string>();
  for (const [word, count] of counts) {
    if (count >= LOCAL_LEXICON_MIN_COUNT) local.add(word);
  }
  return local;
}

/** Phase D: groups decided candidates by pattern (left+right), for batch review. */
function groupCandidates(
  decided: ReturnType<typeof decideCandidates>,
  lexicon: Lexicon,
): GhostSpaceGroup[] {
  const map = new Map<string, GhostSpaceGroup>();
  for (const c of decided) {
    const key = `${c.left.toLowerCase()} ${c.right.toLowerCase()}`;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        left: c.left,
        right: c.right,
        merged: c.merged,
        band: c.band,
        occurrences: [],
        accepted: defaultAcceptForBand(c, lexicon.bigram),
      };
      map.set(key, group);
    }
    group.occurrences.push({
      paragraphIndex: c.paragraphIndex,
      charOffset: c.charOffset,
      left: c.left,
      right: c.right,
      merged: c.merged,
      contextBefore: c.contextBefore,
      contextAfter: c.contextAfter,
    });
  }
  return [...map.values()].sort((a, b) => b.occurrences.length - a.occurrences.length);
}

/** Analyzes the document and produces the diagnostics (phase A) + review groups (phases B–D). */
export function analyzeGhostSpaces(
  paragraphs: Paragraph[],
  lexicon: Lexicon,
  extraWords: string[] = [],
): GhostSpaceResult {
  const extra = new Set(extraWords.map((w) => w.toLowerCase()));
  const diagnostics = diagnoseGhostSpaces(paragraphs, lexicon);

  if (!diagnostics.triggered) {
    return { diagnostics, groups: [], paragraphs };
  }

  const localLexicon = buildLocalLexicon(paragraphs);
  const isValid = (token: string) => isTokenValid(token, lexicon, extra, localLexicon);

  const rawCandidates = generateCandidates(paragraphs, diagnostics.suspiciousChars, isValid);
  const decided = decideCandidates(rawCandidates, lexicon, extra, localLexicon);
  const groups = groupCandidates(decided, lexicon);

  return { diagnostics, groups, paragraphs };
}

/**
 * Applies the accepted groups (respecting user overrides, key = `group.key`)
 * to the paragraph text. Processes occurrences in position order per
 * paragraph, adjusting offsets as each merge shortens the text by 1
 * character, and skips an occurrence that overlaps the previous merge
 * (defensive safeguard).
 */
export function applyGhostSpaceGroups(
  paragraphs: Paragraph[],
  groups: GhostSpaceGroup[],
  overrides: Record<string, boolean>,
): StageResult<Paragraph[]> {
  interface Edit {
    offset: number;
    left: string;
    right: string;
    merged: string;
  }

  const byParagraph = new Map<number, Edit[]>();
  for (const g of groups) {
    const accepted = overrides[g.key] ?? g.accepted;
    if (!accepted) continue;
    for (const occ of g.occurrences) {
      const list = byParagraph.get(occ.paragraphIndex) ?? [];
      list.push({ offset: occ.charOffset, left: occ.left, right: occ.right, merged: occ.merged });
      byParagraph.set(occ.paragraphIndex, list);
    }
  }

  let changed = 0;
  const details: string[] = [];
  const MAX_DETAILS = 200;

  const output = paragraphs.map((p, idx) => {
    const edits = byParagraph.get(idx);
    if (!edits || edits.length === 0) return p;
    edits.sort((a, b) => a.offset - b.offset);

    let text = p.text;
    let shift = 0;
    let lastConsumedEnd = -1;

    for (const e of edits) {
      if (e.offset < lastConsumedEnd) continue; // overlap: keeps the first merge
      const originalLen = e.left.length + 1 + e.right.length;
      const start = e.offset + shift;
      text = text.slice(0, start) + e.merged + text.slice(start + originalLen);
      shift += e.merged.length - originalLen;
      lastConsumedEnd = e.offset + originalLen;
      changed++;
      if (details.length < MAX_DETAILS) {
        details.push(`"${e.left} ${e.right}" → "${e.merged}"`);
      }
    }

    return { ...p, text };
  });

  return { output, stats: { stage: 'ghost-space-apply', changed, details } };
}

export type GhostSpaceStageOptions = Pick<
  PipelineOptions,
  'ghostSpaceEnabled' | 'ghostSpaceGroupOverrides' | 'extraLexiconWords'
>;

/** The full stage 7 as a pure function: analysis + application in one step. */
export function ghostSpaceStage(
  paragraphs: Paragraph[],
  lexicon: Lexicon,
  options: GhostSpaceStageOptions,
): StageResult<Paragraph[]> {
  if (!options.ghostSpaceEnabled) {
    return { output: paragraphs, stats: { stage: 'ghost-space', changed: 0, details: [] } };
  }

  const analysis = analyzeGhostSpaces(paragraphs, lexicon, options.extraLexiconWords);
  if (!analysis.diagnostics.triggered) {
    return {
      output: paragraphs,
      stats: { stage: 'ghost-space', changed: 0, details: [analysis.diagnostics.summary] },
    };
  }

  const applied = applyGhostSpaceGroups(
    paragraphs,
    analysis.groups,
    options.ghostSpaceGroupOverrides,
  );
  return {
    output: applied.output,
    stats: {
      stage: 'ghost-space',
      changed: applied.stats.changed,
      details: [analysis.diagnostics.summary, ...applied.stats.details],
    },
  };
}

export { diagnoseGhostSpaces } from './phase-a-diagnose';
