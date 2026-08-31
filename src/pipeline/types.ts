/** Types shared across all pipeline stages. */

export interface StageStats {
  stage: string;
  changed: number;
  details: string[];
}

export interface StageResult<T> {
  output: T;
  stats: StageStats;
}

// ---------------------------------------------------------------------------
// Geometric model (stage 2, PDF only)
// ---------------------------------------------------------------------------

export interface GlyphRun {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName: string;
  fontSize: number;
  hasEOL: boolean;
}

export interface DocLine {
  page: number;
  y: number;
  fontSize: number;
  fontName: string;
  runs: GlyphRun[];
  /** Line text already reconstructed from the gaps between glyphs (stage 2). */
  text: string;
  xStart: number;
  xEnd: number;
}

export interface DocPage {
  index: number;
  width: number;
  height: number;
  lines: DocLine[];
}

export interface OutlineEntry {
  title: string;
  level: number;
  pageIndex: number | null;
}

export interface ExtractedDoc {
  sourceKind: 'pdf' | 'txt';
  pages: DocPage[];
  outline: OutlineEntry[] | null;
}

// ---------------------------------------------------------------------------
// Text model (from stage 6 onward)
// ---------------------------------------------------------------------------

export interface Paragraph {
  text: string;
  /** Source page, when known (PDF); null for TXT. */
  page: number | null;
}

export interface ChapterMark {
  paragraphIndex: number;
  title: string;
  source: 'outline' | 'heuristic';
}

export interface DocModel {
  paragraphs: Paragraph[];
  chapters: ChapterMark[];
  outline: OutlineEntry[] | null;
}

// ---------------------------------------------------------------------------
// Ghost space repair (stage 7)
// ---------------------------------------------------------------------------

export interface SuspiciousChar {
  char: string;
  intra: number;
  antes: number;
  ratio: number;
  referenceRatio: number;
}

export interface GhostSpaceDiagnostics {
  suspiciousChars: SuspiciousChar[];
  totalSuspiciousCuts: number;
  singleLetterArtifacts: number;
  triggered: boolean;
  summary: string;
}

export type ConfidenceBand = 1 | 2 | 3;

export interface GhostSpaceOccurrence {
  paragraphIndex: number;
  charOffset: number;
  left: string;
  right: string;
  merged: string;
  contextBefore: string;
  contextAfter: string;
}

export interface GhostSpaceGroup {
  key: string;
  left: string;
  right: string;
  merged: string;
  band: ConfidenceBand;
  occurrences: GhostSpaceOccurrence[];
  /** Default decision: band 1 = true, band 2/3 = false until the user reviews it. */
  accepted: boolean;
}

export interface GhostSpaceResult {
  diagnostics: GhostSpaceDiagnostics;
  groups: GhostSpaceGroup[];
  paragraphs: Paragraph[];
}

// ---------------------------------------------------------------------------
// User options
// ---------------------------------------------------------------------------

export interface PipelineOptions {
  normalizeQuotesAndDashes: boolean;
  removeHeadersFooters: boolean;
  ghostSpaceEnabled: boolean;
  /** Review decisions persisted per group (key -> accept?). Overrides the band's default. */
  ghostSpaceGroupOverrides: Record<string, boolean>;
  extraLexiconWords: string[];
  export: {
    txt: {
      bom: boolean;
      eol: 'LF' | 'CRLF';
    };
  };
}

export const DEFAULT_OPTIONS: PipelineOptions = {
  normalizeQuotesAndDashes: false,
  removeHeadersFooters: true,
  ghostSpaceEnabled: true,
  ghostSpaceGroupOverrides: {},
  extraLexiconWords: [],
  export: {
    txt: { bom: false, eol: 'LF' },
  },
};

// ---------------------------------------------------------------------------
// Change report (stage 9)
// ---------------------------------------------------------------------------

export interface ChangeLogEntry {
  stage: string;
  description: string;
  contextBefore?: string;
  contextAfter?: string;
}

export interface PipelineReport {
  fileName: string;
  stats: StageStats[];
  changeLog: ChangeLogEntry[];
  warnings: string[];
}
