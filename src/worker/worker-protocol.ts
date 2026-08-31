import type { ChapterMark, GhostSpaceGroup, PipelineOptions, PipelineReport } from '../pipeline/types';

export interface ConvertRequestMessage {
  type: 'convert';
  requestId: string;
  /** Identifies this document across convert/finalize/export calls, so the worker can hold state for several documents at once. */
  documentId: string;
  fileName: string;
  fileBuffer: ArrayBuffer;
  options: PipelineOptions;
}

export interface FinalizeRequestMessage {
  type: 'finalize';
  requestId: string;
  documentId: string;
  /** Reapplies stage 7/8 over the already-extracted paragraphs (cheap, no re-parsing). */
  options: PipelineOptions;
  chapterOverride?: ChapterMark[];
}

export interface ExportRequestMessage {
  type: 'export';
  requestId: string;
  documentId: string;
  format: 'txt' | 'epub' | 'report';
  options: PipelineOptions;
  epubMeta?: { title: string; author?: string; language?: string };
}

export type WorkerRequest = ConvertRequestMessage | FinalizeRequestMessage | ExportRequestMessage;

export interface ProgressMessage {
  type: 'progress';
  requestId: string;
  stage: string;
  fraction: number;
}

export interface ConvertDoneMessage {
  type: 'convert-done';
  requestId: string;
  report: PipelineReport;
  ghostSpaceGroups: GhostSpaceGroup[];
  chapters: ChapterMark[];
  paragraphCount: number;
  hasNoTextLayer: boolean;
  /** First few paragraphs, just to give a light UI preview without sending the whole book. */
  paragraphPreview: string[];
}

export interface FinalizeDoneMessage {
  type: 'finalize-done';
  requestId: string;
  report: PipelineReport;
  ghostSpaceGroups: GhostSpaceGroup[];
  chapters: ChapterMark[];
}

export interface ExportDoneMessage {
  type: 'export-done';
  requestId: string;
  format: 'txt' | 'epub' | 'report';
  fileName: string;
  data: ArrayBuffer;
  mimeType: string;
}

export interface ErrorMessage {
  type: 'error';
  requestId: string;
  message: string;
}

export type WorkerResponse =
  | ProgressMessage
  | ConvertDoneMessage
  | FinalizeDoneMessage
  | ExportDoneMessage
  | ErrorMessage;
