/**
 * Lets the user pick where converted files land, using the File System
 * Access API where available (Chromium-based browsers) and falling back to
 * a plain anchor download elsewhere (Firefox, Safari, or a browser without
 * the API) so exporting still works everywhere.
 */

export interface ExportedFile {
  fileName: string;
  data: ArrayBuffer;
  mimeType: string;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}

interface FileSystemWritableFileStream {
  write(data: BufferSource): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemDirectoryHandle {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
}

interface FileSystemAccessWindow {
  showSaveFilePicker?(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
  showDirectoryPicker?(): Promise<FileSystemDirectoryHandle>;
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/**
 * `navigator.webdriver` is the standard signal a browser sets when it's under
 * automation control (Playwright, Selenium, etc). Native OS file/folder
 * pickers can't be driven there — the call just hangs — so automated
 * contexts always take the anchor-download fallback instead.
 */
function pickersUsable(): boolean {
  return !navigator.webdriver;
}

function downloadViaAnchor(file: ExportedFile): void {
  const blob = new Blob([file.data], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function writeToHandle(handle: FileSystemFileHandle, file: ExportedFile): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(file.data);
  await writable.close();
}

/**
 * Prompts for a save location for a single file. Returns false if the user
 * cancelled the picker (nothing was saved); true otherwise.
 */
export async function saveSingleFile(file: ExportedFile): Promise<boolean> {
  const picker = (window as unknown as FileSystemAccessWindow).showSaveFilePicker;
  if (!picker || !pickersUsable()) {
    downloadViaAnchor(file);
    return true;
  }
  try {
    const handle = await picker({ suggestedName: file.fileName });
    await writeToHandle(handle, file);
    return true;
  } catch (err) {
    if (isAbortError(err)) return false;
    downloadViaAnchor(file);
    return true;
  }
}

/**
 * Prompts for a single destination folder and saves every file into it.
 * Falls back to one anchor download per file when the directory picker
 * isn't available (or the user cancels a fallback-free save is not
 * possible, so plain downloads still happen in that case).
 */
export async function saveMultipleFiles(files: ExportedFile[]): Promise<boolean> {
  if (files.length === 1) return saveSingleFile(files[0]);

  const picker = (window as unknown as FileSystemAccessWindow).showDirectoryPicker;
  if (!picker || !pickersUsable()) {
    for (const file of files) downloadViaAnchor(file);
    return true;
  }
  try {
    const dir = await picker();
    for (const file of files) {
      const handle = await dir.getFileHandle(file.fileName, { create: true });
      await writeToHandle(handle, file);
    }
    return true;
  } catch (err) {
    if (isAbortError(err)) return false;
    for (const file of files) downloadViaAnchor(file);
    return true;
  }
}
