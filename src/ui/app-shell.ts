import { hashFile } from '../util/hash';
import { DEFAULT_OPTIONS, type ChapterMark, type PipelineOptions, type PipelineReport } from '../pipeline/types';
import { loadPrefs, loadReviewDecisions, savePrefs, saveReviewDecisions } from '../storage/local-prefs';
import type { WorkerRequest, WorkerResponse } from '../worker/worker-protocol';
import { createChapterEditor } from './chapter-editor';
import { createDropzone } from './dropzone';
import { createOptionsPanel } from './options-panel';
import { createProgressView } from './progress';
import { createReviewPanel } from './review-panel';
import { saveMultipleFiles, saveSingleFile, type ExportedFile } from './save-file';

function createPipelineWorker(): Worker {
  return new Worker(new URL('../worker/pipeline.worker.ts', import.meta.url), { type: 'module' });
}

function summaryFromReport(report: PipelineReport): string {
  const ghost = report.stats.find((s) => s.stage === 'ghost-space');
  return ghost?.details[0] ?? '';
}

type ExportFormat = 'txt' | 'epub' | 'report';

interface DocumentEntry {
  id: string;
  file: File;
  fileHash: string | null;
  /** Cloned from the shared template at drop time; carries this document's own ghost-space overrides from then on. */
  options: PipelineOptions;
  status: 'processing' | 'ready' | 'error';
  card: HTMLElement;
  statusEl: HTMLElement;
  warningsEl: HTMLElement;
  progressView: ReturnType<typeof createProgressView>;
  reviewPanel: ReturnType<typeof createReviewPanel>;
  chapterEditor: ReturnType<typeof createChapterEditor>;
  exportRow: HTMLElement;
}

export function mountApp(root: HTMLElement): void {
  let optionsTemplate: PipelineOptions = loadPrefs(DEFAULT_OPTIONS);
  const worker = createPipelineWorker();
  let reqCounter = 0;
  let docCounter = 0;

  const documents = new Map<string, DocumentEntry>();
  const pending = new Map<string, (msg: WorkerResponse) => void>();
  const progressRoutes = new Map<string, string>(); // requestId -> documentId

  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data;
    if (msg.type === 'progress') {
      const docId = progressRoutes.get(msg.requestId);
      const doc = docId ? documents.get(docId) : undefined;
      doc?.progressView.update(msg.stage, msg.fraction);
      return;
    }
    const handler = pending.get(msg.requestId);
    if (handler) {
      pending.delete(msg.requestId);
      handler(msg);
    }
  });

  function send(req: WorkerRequest): Promise<WorkerResponse> {
    return new Promise((resolve, reject) => {
      pending.set(req.requestId, (msg) => {
        if (msg.type === 'error') reject(new Error(msg.message));
        else resolve(msg);
      });
      worker.postMessage(req);
    });
  }

  function nextRequestId(): string {
    reqCounter += 1;
    return `req-${reqCounter}`;
  }

  const header = document.createElement('div');
  header.innerHTML = `
    <h1>X4Conversor</h1>
    <p class="subtitle">
      Converts PDFs and TXTs into clean EPUB/TXT files for the Xteink X4 e-ink reader — all
      processed in your browser, no file is ever sent to a server.
    </p>
  `;
  root.appendChild(header);

  const dropzone = createDropzone((files) => {
    void handleFiles(files);
  });
  root.appendChild(dropzone);

  const optionsPanel = createOptionsPanel(
    () => optionsTemplate,
    (next) => {
      // removeHeadersFooters/normalizeQuotesAndDashes are consumed by
      // extractAndReflow (stages 1-6, run once at initial conversion) — NOT
      // by finalizeDocument (stages 7-8, what refinalize() re-runs). Without
      // this check, flipping either of those two checkboxes after a document
      // is already converted would silently do nothing to it.
      const needsReconvert =
        optionsTemplate.removeHeadersFooters !== next.removeHeadersFooters ||
        optionsTemplate.normalizeQuotesAndDashes !== next.normalizeQuotesAndDashes;
      optionsTemplate = next;
      savePrefs(optionsTemplate);
      void applyOptionsToDocuments(needsReconvert);
    },
  );
  root.appendChild(optionsPanel.el);

  const resultsList = document.createElement('div');
  root.appendChild(resultsList);

  const batchExportRow = document.createElement('div');
  batchExportRow.className = 'export-row';
  batchExportRow.hidden = true;
  batchExportRow.innerHTML = `
    <button type="button" class="primary" data-batch-format="txt">Export all as TXT</button>
    <button type="button" class="secondary" data-batch-format="epub">Export all as EPUB</button>
  `;
  root.appendChild(batchExportRow);
  batchExportRow.querySelectorAll('button[data-batch-format]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const format = (btn as HTMLButtonElement).dataset.batchFormat as 'txt' | 'epub';
      void doBatchExport(format);
    });
  });

  function updateBatchExportVisibility(): void {
    const readyCount = Array.from(documents.values()).filter((d) => d.status === 'ready').length;
    batchExportRow.hidden = readyCount < 2;
  }

  const kofiRow = document.createElement('div');
  kofiRow.className = 'kofi-row';
  kofiRow.innerHTML = `
    <a class="kofi-button" href="https://ko-fi.com/tranquilius" target="_blank" rel="noopener noreferrer">
      <span class="kofi-button-icon" aria-hidden="true">☕</span>
      <span>Support this project on Ko-fi</span>
    </a>
  `;
  root.appendChild(kofiRow);

  async function handleFiles(files: File[]): Promise<void> {
    // Processed one at a time, sequentially, but every file keeps its own
    // card and its own worker-side state — earlier results stay downloadable
    // once later files finish.
    for (const file of files) {
      await convertOne(file);
    }
  }

  function createDocumentCard(fileName: string): {
    card: HTMLElement;
    statusEl: HTMLElement;
    warningsEl: HTMLElement;
    progressView: ReturnType<typeof createProgressView>;
    reviewPanel: ReturnType<typeof createReviewPanel>;
    chapterEditor: ReturnType<typeof createChapterEditor>;
    exportRow: HTMLElement;
  } {
    const card = document.createElement('div');
    card.className = 'document-card';

    const headerEl = document.createElement('div');
    headerEl.className = 'document-card-header';
    headerEl.innerHTML = `<strong></strong><span class="document-status"></span>`;
    (headerEl.querySelector('strong') as HTMLElement).textContent = fileName;
    const statusEl = headerEl.querySelector('.document-status') as HTMLElement;
    card.appendChild(headerEl);

    const warningsEl = document.createElement('div');
    card.appendChild(warningsEl);

    const progressView = createProgressView();
    card.appendChild(progressView.el);

    const reviewPanel = createReviewPanel((key, accepted) => {
      const doc = findDocByCard(card);
      if (!doc || !doc.fileHash) return;
      doc.options = {
        ...doc.options,
        ghostSpaceGroupOverrides: { ...doc.options.ghostSpaceGroupOverrides, [key]: accepted },
      };
      const decisions = loadReviewDecisions(doc.fileHash);
      decisions[key] = accepted;
      saveReviewDecisions(doc.fileHash, decisions);
      void refinalize(doc);
    });
    card.appendChild(reviewPanel.el);

    const chapterEditor = createChapterEditor((chapters: ChapterMark[]) => {
      const doc = findDocByCard(card);
      if (!doc) return;
      void refinalizeWithChapters(doc, chapters);
    });
    card.appendChild(chapterEditor.el);

    const exportRow = document.createElement('div');
    exportRow.className = 'export-row';
    exportRow.hidden = true;
    exportRow.innerHTML = `
      <button type="button" class="primary" data-format="txt">Export TXT</button>
      <button type="button" class="secondary" data-format="epub">Export EPUB</button>
      <button type="button" class="secondary" data-format="report">Download report</button>
    `;
    exportRow.querySelectorAll('button[data-format]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const doc = findDocByCard(card);
        if (!doc) return;
        const format = (btn as HTMLButtonElement).dataset.format as ExportFormat;
        void doExport(doc, format);
      });
    });
    card.appendChild(exportRow);

    resultsList.appendChild(card);
    return { card, statusEl, warningsEl, progressView, reviewPanel, chapterEditor, exportRow };
  }

  function findDocByCard(card: HTMLElement): DocumentEntry | undefined {
    for (const doc of documents.values()) {
      if (doc.card === card) return doc;
    }
    return undefined;
  }

  /**
   * Runs the full convert pipeline (stages 1-6 in the worker, via a fresh
   * 'convert' message) against `doc.file` and applies the result to its
   * already-existing card. Used both for a document's first conversion and
   * to re-convert one whose extraction-affecting options changed after the
   * fact (see applyOptionsToDocuments) — unlike refinalize(), which only
   * cheaply re-runs stages 7-8 and cannot pick up such a change.
   */
  async function runConversion(doc: DocumentEntry): Promise<void> {
    doc.status = 'processing';
    doc.statusEl.textContent = 'Processing…';
    doc.warningsEl.innerHTML = '';
    doc.exportRow.hidden = true;
    doc.progressView.show();
    doc.progressView.update('geometria', 0);

    try {
      const buffer = await doc.file.arrayBuffer();
      doc.fileHash = await hashFile(buffer);
      const savedDecisions = loadReviewDecisions(doc.fileHash);
      doc.options = { ...doc.options, ghostSpaceGroupOverrides: savedDecisions };

      const requestId = nextRequestId();
      progressRoutes.set(requestId, doc.id);
      const msg = await send({
        type: 'convert',
        requestId,
        documentId: doc.id,
        fileName: doc.file.name,
        fileBuffer: buffer,
        options: doc.options,
      });
      progressRoutes.delete(requestId);

      if (msg.type !== 'convert-done') return;

      if (msg.hasNoTextLayer) {
        doc.warningsEl.innerHTML =
          '<div class="warning">This PDF does not seem to have a text layer (image-only ' +
          'pages). Run OCR before converting — for example, with ' +
          '<code>ocrmypdf input.pdf output.pdf</code> — then upload the result here.</div>';
      }

      doc.reviewPanel.render(msg.ghostSpaceGroups, summaryFromReport(msg.report), doc.options.ghostSpaceGroupOverrides);
      doc.chapterEditor.render(msg.chapters);
      doc.exportRow.hidden = false;
      doc.status = 'ready';
      doc.statusEl.textContent = 'Ready';
    } catch (err) {
      doc.warningsEl.innerHTML = `<div class="warning">Error converting "${doc.file.name}": ${
        err instanceof Error ? err.message : String(err)
      }</div>`;
      doc.status = 'error';
      doc.statusEl.textContent = 'Error';
    } finally {
      doc.progressView.hide();
      updateBatchExportVisibility();
    }
  }

  async function convertOne(file: File): Promise<void> {
    docCounter += 1;
    const id = `doc-${docCounter}`;
    const parts = createDocumentCard(file.name);
    const doc: DocumentEntry = {
      id,
      file,
      fileHash: null,
      options: { ...optionsTemplate },
      status: 'processing',
      card: parts.card,
      statusEl: parts.statusEl,
      warningsEl: parts.warningsEl,
      progressView: parts.progressView,
      reviewPanel: parts.reviewPanel,
      chapterEditor: parts.chapterEditor,
      exportRow: parts.exportRow,
    };
    documents.set(id, doc);
    await runConversion(doc);
  }

  /**
   * Applies the latest optionsTemplate to every open document. When an
   * extraction-affecting option changed (needsReconvert), ready documents
   * are fully re-converted, one at a time — same sequential policy as
   * handleFiles(), and it keeps two re-convert calls from racing on the
   * same document's worker-side state. Otherwise the cheap refinalize()
   * path is used, same as before.
   */
  async function applyOptionsToDocuments(needsReconvert: boolean): Promise<void> {
    for (const doc of documents.values()) {
      doc.options = { ...optionsTemplate, ghostSpaceGroupOverrides: doc.options.ghostSpaceGroupOverrides };
      if (doc.status !== 'ready') continue;
      if (needsReconvert) {
        await runConversion(doc);
      } else {
        void refinalize(doc);
      }
    }
  }

  async function refinalize(doc: DocumentEntry): Promise<void> {
    const msg = await send({ type: 'finalize', requestId: nextRequestId(), documentId: doc.id, options: doc.options });
    if (msg.type !== 'finalize-done') return;
    doc.reviewPanel.render(msg.ghostSpaceGroups, summaryFromReport(msg.report), doc.options.ghostSpaceGroupOverrides);
    doc.chapterEditor.render(msg.chapters);
  }

  async function refinalizeWithChapters(doc: DocumentEntry, chapters: ChapterMark[]): Promise<void> {
    const msg = await send({
      type: 'finalize',
      requestId: nextRequestId(),
      documentId: doc.id,
      options: doc.options,
      chapterOverride: chapters,
    });
    if (msg.type !== 'finalize-done') return;
    doc.reviewPanel.render(msg.ghostSpaceGroups, summaryFromReport(msg.report), doc.options.ghostSpaceGroupOverrides);
  }

  async function exportOne(doc: DocumentEntry, format: ExportFormat): Promise<ExportedFile | null> {
    const msg = await send({
      type: 'export',
      requestId: nextRequestId(),
      documentId: doc.id,
      format,
      options: doc.options,
      epubMeta: { title: doc.file.name.replace(/\.(pdf|txt)$/i, '') },
    });
    if (msg.type !== 'export-done') return null;
    return { fileName: msg.fileName, data: msg.data, mimeType: msg.mimeType };
  }

  async function doExport(doc: DocumentEntry, format: ExportFormat): Promise<void> {
    const exported = await exportOne(doc, format);
    if (!exported) return;
    await saveSingleFile(exported);
  }

  async function doBatchExport(format: 'txt' | 'epub'): Promise<void> {
    const readyDocs = Array.from(documents.values()).filter((d) => d.status === 'ready');
    const exported: ExportedFile[] = [];
    for (const doc of readyDocs) {
      const file = await exportOne(doc, format);
      if (file) exported.push(file);
    }
    if (exported.length === 0) return;
    await saveMultipleFiles(exported);
  }
}
