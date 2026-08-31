import { hashFile } from '../util/hash';
import { DEFAULT_OPTIONS, type ChapterMark, type PipelineOptions, type PipelineReport } from '../pipeline/types';
import { loadPrefs, loadReviewDecisions, savePrefs, saveReviewDecisions } from '../storage/local-prefs';
import type { WorkerRequest, WorkerResponse } from '../worker/worker-protocol';
import { createChapterEditor } from './chapter-editor';
import { createDropzone } from './dropzone';
import { createOptionsPanel } from './options-panel';
import { createProgressView } from './progress';
import { createReviewPanel } from './review-panel';

function createPipelineWorker(): Worker {
  return new Worker(new URL('../worker/pipeline.worker.ts', import.meta.url), { type: 'module' });
}

function summaryFromReport(report: PipelineReport): string {
  const ghost = report.stats.find((s) => s.stage === 'ghost-space');
  return ghost?.details[0] ?? '';
}

function downloadBlob(data: ArrayBuffer, fileName: string, mimeType: string): void {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function mountApp(root: HTMLElement): void {
  let options: PipelineOptions = loadPrefs(DEFAULT_OPTIONS);
  const worker = createPipelineWorker();
  let currentFile: File | null = null;
  let currentFileHash: string | null = null;
  let reqCounter = 0;

  const pending = new Map<string, (msg: WorkerResponse) => void>();

  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data;
    if (msg.type === 'progress') {
      progressView.update(msg.stage, msg.fraction);
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

  const warningsEl = document.createElement('div');
  root.appendChild(warningsEl);

  const dropzone = createDropzone((files) => {
    void handleFiles(files);
  });
  root.appendChild(dropzone);

  const progressView = createProgressView();
  root.appendChild(progressView.el);

  const optionsPanel = createOptionsPanel(
    () => options,
    (next) => {
      options = next;
      savePrefs(options);
      void refinalize();
    },
  );
  root.appendChild(optionsPanel.el);

  const reviewPanel = createReviewPanel((key, accepted) => {
    if (!currentFileHash) return;
    options = {
      ...options,
      ghostSpaceGroupOverrides: { ...options.ghostSpaceGroupOverrides, [key]: accepted },
    };
    const decisions = loadReviewDecisions(currentFileHash);
    decisions[key] = accepted;
    saveReviewDecisions(currentFileHash, decisions);
    void refinalize();
  });
  root.appendChild(reviewPanel.el);

  const chapterEditor = createChapterEditor((chapters: ChapterMark[]) => {
    void refinalizeWithChapters(chapters);
  });
  root.appendChild(chapterEditor.el);

  const exportRow = document.createElement('div');
  exportRow.className = 'export-row';
  exportRow.hidden = true;
  exportRow.innerHTML = `
    <button type="button" class="primary" data-format="txt">Export TXT</button>
    <button type="button" class="secondary" data-format="epub">Export EPUB</button>
    <button type="button" class="secondary" data-format="report">Download report</button>
  `;
  root.appendChild(exportRow);
  exportRow.querySelectorAll('button[data-format]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const format = (btn as HTMLButtonElement).dataset.format as 'txt' | 'epub' | 'report';
      void doExport(format);
    });
  });

  async function handleFiles(files: File[]): Promise<void> {
    // v1: processes one file at a time, sequentially.
    for (const file of files) {
      await convertOne(file);
    }
  }

  async function convertOne(file: File): Promise<void> {
    currentFile = file;
    warningsEl.innerHTML = '';
    exportRow.hidden = true;
    progressView.show();
    progressView.update('geometria', 0);

    try {
      const buffer = await file.arrayBuffer();
      currentFileHash = await hashFile(buffer);
      const savedDecisions = loadReviewDecisions(currentFileHash);
      options = { ...options, ghostSpaceGroupOverrides: savedDecisions };

      const msg = await send({
        type: 'convert',
        requestId: nextRequestId(),
        fileName: file.name,
        fileBuffer: buffer,
        options,
      });

      if (msg.type !== 'convert-done') return;

      if (msg.hasNoTextLayer) {
        warningsEl.innerHTML =
          '<div class="warning">This PDF does not seem to have a text layer (image-only ' +
          'pages). Run OCR before converting — for example, with ' +
          '<code>ocrmypdf input.pdf output.pdf</code> — then upload the result here.</div>';
      }

      reviewPanel.render(msg.ghostSpaceGroups, summaryFromReport(msg.report), options.ghostSpaceGroupOverrides);
      chapterEditor.render(msg.chapters);
      exportRow.hidden = false;
    } catch (err) {
      warningsEl.innerHTML = `<div class="warning">Error converting "${file.name}": ${
        err instanceof Error ? err.message : String(err)
      }</div>`;
    } finally {
      progressView.hide();
    }
  }

  async function refinalize(): Promise<void> {
    if (!currentFile) return;
    const msg = await send({ type: 'finalize', requestId: nextRequestId(), options });
    if (msg.type !== 'finalize-done') return;
    reviewPanel.render(msg.ghostSpaceGroups, summaryFromReport(msg.report), options.ghostSpaceGroupOverrides);
    chapterEditor.render(msg.chapters);
  }

  async function refinalizeWithChapters(chapters: ChapterMark[]): Promise<void> {
    if (!currentFile) return;
    const msg = await send({
      type: 'finalize',
      requestId: nextRequestId(),
      options,
      chapterOverride: chapters,
    });
    if (msg.type !== 'finalize-done') return;
    reviewPanel.render(msg.ghostSpaceGroups, summaryFromReport(msg.report), options.ghostSpaceGroupOverrides);
  }

  async function doExport(format: 'txt' | 'epub' | 'report'): Promise<void> {
    if (!currentFile) return;
    const msg = await send({
      type: 'export',
      requestId: nextRequestId(),
      format,
      options,
      epubMeta: { title: currentFile.name.replace(/\.(pdf|txt)$/i, '') },
    });
    if (msg.type !== 'export-done') return;
    downloadBlob(msg.data, msg.fileName, msg.mimeType);
  }
}
