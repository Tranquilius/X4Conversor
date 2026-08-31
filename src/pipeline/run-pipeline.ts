import type { Lexicon } from '../lexicon/types';
import {
  expandLigatures,
  nbspToSpace,
  nfc,
  normalizeQuotesAndDashes,
  stripInvisibleChars,
} from '../util/text';
import type { IngestedFile } from './01-ingest';
import { extractGeometry, type PdfDocumentLike } from './02-geometry';
import { charCleanStage } from './03-charclean';
import { headersFootersStage } from './04-headers-footers';
import { dehyphenateStage } from './05-dehyphenate';
import { reflowStage, type ReflowLine } from './06-reflow';
import { analyzeGhostSpaces, applyGhostSpaceGroups } from './07-ghost-space';
import { detectChapters } from './08-chapters';
import { detectDocumentLanguage, type DetectedLanguage } from './language';
import type {
  ChangeLogEntry,
  ChapterMark,
  DocModel,
  DocPage,
  GhostSpaceGroup,
  OutlineEntry,
  Paragraph,
  PipelineOptions,
  PipelineReport,
  StageStats,
} from './types';

export interface ExtractInput {
  fileName: string;
  ingested: IngestedFile;
  /** Required when `ingested.kind === 'pdf'`: instance already loaded by the worker. */
  pdfDocument?: PdfDocumentLike;
  /** Loaded once at app startup (independent of the file); used by de-hyphenation. */
  lexicon: Lexicon;
  options: Pick<PipelineOptions, 'normalizeQuotesAndDashes' | 'removeHeadersFooters'>;
  onProgress?: (stage: string, fraction: number) => void;
}

/** Result of the expensive phase (stages 1–6): PDF parsing only happens here. */
export interface ExtractResult {
  fileName: string;
  paragraphs: Paragraph[];
  outline: OutlineEntry[] | null;
  hasNoTextLayer: boolean;
  statsSoFar: StageStats[];
  warningsSoFar: string[];
}

function cleanLineText(text: string, options: Pick<PipelineOptions, 'normalizeQuotesAndDashes'>): string {
  let t = nfc(text);
  t = expandLigatures(t);
  t = stripInvisibleChars(t).text;
  t = nbspToSpace(t).text;
  if (options.normalizeQuotesAndDashes) t = normalizeQuotesAndDashes(t).text;
  return t;
}

function cleanPagesText(
  pages: DocPage[],
  options: Pick<PipelineOptions, 'normalizeQuotesAndDashes'>,
): { pages: DocPage[]; changed: number } {
  let changed = 0;
  const cleanedPages = pages.map((page) => ({
    ...page,
    lines: page.lines.map((line) => {
      const cleaned = cleanLineText(line.text, options);
      if (cleaned !== line.text) changed++;
      return { ...line, text: cleaned };
    }),
  }));
  return { pages: cleanedPages, changed };
}

/**
 * Expensive phase: stages 1 (ingestion) through 6 (reflow). For PDF, this
 * includes page-by-page parsing via pdf.js — the pipeline's real cost. The
 * result is independent of the lexicon and of stage 7's review decisions, so
 * the worker runs this ONCE per file and reuses it for every subsequent
 * finalization (e.g. when the user accepts/rejects groups in phase D).
 */
export async function extractAndReflow(input: ExtractInput): Promise<ExtractResult> {
  const { fileName, ingested, options } = input;
  const stats: StageStats[] = [];
  const warnings: string[] = [];
  let outline: OutlineEntry[] | null = null;
  let hasNoTextLayer = false;
  let lines: ReflowLine[];

  if (ingested.kind === 'pdf') {
    if (!input.pdfDocument) {
      throw new Error('PDF document not loaded — pdfDocument is required for PDF input.');
    }
    const geometry = await extractGeometry(input.pdfDocument, (p) => {
      input.onProgress?.('geometria', (p.pageIndex + 1) / p.totalPages);
    });
    stats.push({
      stage: 'geometry',
      changed: geometry.stats.changed,
      details: geometry.stats.details,
    });
    hasNoTextLayer = geometry.hasNoTextLayer;
    if (hasNoTextLayer) {
      warnings.push(
        'This PDF does not seem to have a text layer (image-only). Run OCR before ' +
          'converting (for example, with "ocrmypdf") — this tool does not do OCR.',
      );
    }
    outline = geometry.doc.outline;

    const cleaned = cleanPagesText(geometry.doc.pages, options);
    stats.push({ stage: 'char-clean', changed: cleaned.changed, details: [] });

    const hf = headersFootersStage(cleaned.pages, { enabled: options.removeHeadersFooters });
    stats.push(hf.stats);
    lines = hf.output;
  } else {
    const rawLines = ingested.text.split(/\r\n|\r|\n/).map((text) => ({ text, page: null }));
    const cleaned = charCleanStage(rawLines, options);
    stats.push(cleaned.stats);
    lines = cleaned.output;
  }

  const dehyph = dehyphenateStage(lines, input.lexicon);
  stats.push(dehyph.stats);
  input.onProgress?.('dehyphenate', 1);

  const reflowed = reflowStage(dehyph.output);
  stats.push(reflowed.stats);
  input.onProgress?.('reflow', 1);

  return {
    fileName,
    paragraphs: reflowed.output,
    outline,
    hasNoTextLayer,
    statsSoFar: stats,
    warningsSoFar: warnings,
  };
}

export interface FinalizeInput {
  extracted: ExtractResult;
  lexicon: Lexicon;
  options: PipelineOptions;
  /** Chapter list already edited by the user; if omitted, stage 8 runs normally. */
  chapterOverride?: ChapterMark[];
}

export interface FinalizeResult {
  docModel: DocModel;
  report: PipelineReport;
  ghostSpaceGroups: GhostSpaceGroup[];
  detectedLanguage: DetectedLanguage;
}

/**
 * Cheap phase: stage 7 (ghost-space repair) and stage 8 (chapters), from the
 * already-extracted paragraphs. Does no I/O and never reprocesses the PDF —
 * safe to call repeatedly as the user adjusts the phase D review or edits the
 * chapter list, while keeping deterministic output for the same inputs.
 */
export function finalizeDocument(input: FinalizeInput): FinalizeResult {
  const { extracted, lexicon, options } = input;
  const stats: StageStats[] = [...extracted.statsSoFar];

  let ghostSpaceGroups: GhostSpaceGroup[] = [];
  let finalParagraphs = extracted.paragraphs;
  if (options.ghostSpaceEnabled) {
    const analysis = analyzeGhostSpaces(extracted.paragraphs, lexicon, options.extraLexiconWords);
    ghostSpaceGroups = analysis.groups;
    if (analysis.diagnostics.triggered) {
      const applied = applyGhostSpaceGroups(
        extracted.paragraphs,
        analysis.groups,
        options.ghostSpaceGroupOverrides,
      );
      finalParagraphs = applied.output;
      stats.push({
        stage: 'ghost-space',
        changed: applied.stats.changed,
        details: [analysis.diagnostics.summary, ...applied.stats.details],
      });
    } else {
      stats.push({ stage: 'ghost-space', changed: 0, details: [analysis.diagnostics.summary] });
    }
  } else {
    stats.push({ stage: 'ghost-space', changed: 0, details: [] });
  }

  const chapters =
    input.chapterOverride ?? detectChapters(finalParagraphs, extracted.outline).output;
  if (!input.chapterOverride) {
    stats.push({ stage: 'chapters', changed: chapters.length, details: [] });
  }

  const docModel: DocModel = { paragraphs: finalParagraphs, chapters, outline: extracted.outline };

  const changeLog: ChangeLogEntry[] = [];
  for (const s of stats) {
    for (const d of s.details) {
      changeLog.push({ stage: s.stage, description: d });
    }
  }

  const report: PipelineReport = {
    fileName: extracted.fileName,
    stats,
    changeLog,
    warnings: extracted.warningsSoFar,
  };

  const detectedLanguage = detectDocumentLanguage(finalParagraphs, lexicon);

  return { docModel, report, ghostSpaceGroups, detectedLanguage };
}

/** Convenience for use outside the worker (tests, scripts): extracts and finalizes in one step. */
export async function runPipeline(
  input: ExtractInput & { options: PipelineOptions },
): Promise<FinalizeResult & { hasNoTextLayer: boolean }> {
  const extracted = await extractAndReflow(input);
  const finalized = finalizeDocument({ extracted, lexicon: input.lexicon, options: input.options });
  return { ...finalized, hasNoTextLayer: extracted.hasNoTextLayer };
}
