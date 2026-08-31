/// <reference lib="webworker" />
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadLexicon } from '../lexicon/loader';
import type { Lexicon } from '../lexicon/types';
import { ingestFile } from '../pipeline/01-ingest';
import type { PdfDocumentLike } from '../pipeline/02-geometry';
import { exportEpub } from '../pipeline/09-export-epub';
import { exportReportHtml } from '../pipeline/09-export-report';
import { exportTxt } from '../pipeline/09-export-txt';
import type { DetectedLanguage } from '../pipeline/language';
import { extractAndReflow, finalizeDocument, type ExtractResult } from '../pipeline/run-pipeline';
import type { DocModel, PipelineReport } from '../pipeline/types';
import type {
  ConvertRequestMessage,
  ExportRequestMessage,
  FinalizeRequestMessage,
  WorkerRequest,
  WorkerResponse,
} from './worker-protocol';

declare const self: DedicatedWorkerGlobalScope;

// pdf.js worker served from our own bundle — never from a CDN.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).href;

const PREVIEW_PARAGRAPH_COUNT = 30;

interface WorkerState {
  extracted: ExtractResult;
  lexicon: Lexicon;
  docModel: DocModel;
  report: PipelineReport;
  detectedLanguage: DetectedLanguage;
}

let state: WorkerState | null = null;

function post(msg: WorkerResponse, transfer: Transferable[] = []): void {
  self.postMessage(msg, transfer);
}

async function handleConvert(msg: ConvertRequestMessage): Promise<void> {
  const lexicon = await loadLexicon();
  const ingested = ingestFile(msg.fileName, msg.fileBuffer);

  let pdfDocument: PdfDocumentLike | undefined;
  if (ingested.kind === 'pdf') {
    const pdf: PDFDocumentProxy = await pdfjsLib.getDocument({ data: msg.fileBuffer }).promise;
    // The real pdfjs-dist instance is structurally compatible with the
    // minimal PdfDocumentLike defined in src/pipeline/02-geometry.ts.
    // Check it against the installed version (`getPage`, `getTextContent`,
    // `getOutline`, `getDestination`, `getPageIndex`) if you upgrade the lib.
    pdfDocument = pdf as unknown as PdfDocumentLike;
  }

  const extracted = await extractAndReflow({
    fileName: msg.fileName,
    ingested,
    pdfDocument,
    lexicon,
    options: msg.options,
    onProgress: (stage, fraction) =>
      post({ type: 'progress', requestId: msg.requestId, stage, fraction }),
  });

  const finalized = finalizeDocument({ extracted, lexicon, options: msg.options });
  state = {
    extracted,
    lexicon,
    docModel: finalized.docModel,
    report: finalized.report,
    detectedLanguage: finalized.detectedLanguage,
  };

  post({
    type: 'convert-done',
    requestId: msg.requestId,
    report: finalized.report,
    ghostSpaceGroups: finalized.ghostSpaceGroups,
    chapters: finalized.docModel.chapters,
    paragraphCount: finalized.docModel.paragraphs.length,
    hasNoTextLayer: extracted.hasNoTextLayer,
    paragraphPreview: finalized.docModel.paragraphs
      .slice(0, PREVIEW_PARAGRAPH_COUNT)
      .map((p) => p.text),
  });
}

function handleFinalize(msg: FinalizeRequestMessage): void {
  if (!state) {
    post({ type: 'error', requestId: msg.requestId, message: 'No document converted yet.' });
    return;
  }
  const finalized = finalizeDocument({
    extracted: state.extracted,
    lexicon: state.lexicon,
    options: msg.options,
    chapterOverride: msg.chapterOverride,
  });
  state = {
    ...state,
    docModel: finalized.docModel,
    report: finalized.report,
    detectedLanguage: finalized.detectedLanguage,
  };

  post({
    type: 'finalize-done',
    requestId: msg.requestId,
    report: finalized.report,
    ghostSpaceGroups: finalized.ghostSpaceGroups,
    chapters: finalized.docModel.chapters,
  });
}

async function handleExport(msg: ExportRequestMessage): Promise<void> {
  if (!state) {
    post({ type: 'error', requestId: msg.requestId, message: 'No document ready to export.' });
    return;
  }
  const { docModel, report, extracted, detectedLanguage } = state;
  const baseName = extracted.fileName.replace(/\.(pdf|txt)$/i, '');

  if (msg.format === 'txt') {
    const bytes = exportTxt(docModel, msg.options.export.txt);
    post(
      {
        type: 'export-done',
        requestId: msg.requestId,
        format: 'txt',
        fileName: `${baseName}.txt`,
        data: bytes.buffer as ArrayBuffer,
        mimeType: 'text/plain;charset=utf-8',
      },
      [bytes.buffer as ArrayBuffer],
    );
    return;
  }

  if (msg.format === 'epub') {
    const bytes = await exportEpub(docModel.paragraphs, docModel.chapters, {
      title: msg.epubMeta?.title ?? baseName,
      author: msg.epubMeta?.author,
      language: msg.epubMeta?.language ?? detectedLanguage,
    });
    post(
      {
        type: 'export-done',
        requestId: msg.requestId,
        format: 'epub',
        fileName: `${baseName}.epub`,
        data: bytes.buffer as ArrayBuffer,
        mimeType: 'application/epub+zip',
      },
      [bytes.buffer as ArrayBuffer],
    );
    return;
  }

  const html = exportReportHtml(report);
  const bytes = new TextEncoder().encode(html);
  post(
    {
      type: 'export-done',
      requestId: msg.requestId,
      format: 'report',
      fileName: `${baseName}-report.html`,
      data: bytes.buffer,
      mimeType: 'text/html;charset=utf-8',
    },
    [bytes.buffer],
  );
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  void (async () => {
    try {
      if (msg.type === 'convert') await handleConvert(msg);
      else if (msg.type === 'finalize') handleFinalize(msg);
      else if (msg.type === 'export') await handleExport(msg);
    } catch (err) {
      post({
        type: 'error',
        requestId: msg.requestId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  })();
});
