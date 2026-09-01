import type { PipelineOptions } from '../pipeline/types';

export interface OptionsPanelView {
  el: HTMLElement;
}

function parseWordList(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

/**
 * `getOptions` is read on every change (not a copy fixed at creation time) —
 * the options state in app-shell.ts can change through other paths (e.g.
 * per-file review overrides) between mounting and the user interacting here.
 */
export function createOptionsPanel(
  getOptions: () => PipelineOptions,
  onChange: (options: PipelineOptions) => void,
): OptionsPanelView {
  const el = document.createElement('div');
  el.className = 'panel';
  el.innerHTML = `
    <h2>Options</h2>
    <div class="options-grid">
      <label><input type="checkbox" data-opt="removeHeadersFooters" /> Remove repeated headers/footers (PDF)</label>
      <label><input type="checkbox" data-opt="ghostSpaceEnabled" /> Repair ghost spaces</label>
      <label><input type="checkbox" data-opt="normalizeQuotesAndDashes" /> Normalize curly quotes and dashes</label>
      <label><input type="checkbox" data-opt="epubEinkOptimized" /> Optimize EPUB layout for e-ink readers (Xteink X4)</label>
      <label><input type="checkbox" data-opt="txtBom" /> Include BOM (Byte Order Mark) in TXT</label>
      <label>
        TXT line ending:
        <select data-opt="txtEol">
          <option value="LF">LF (default)</option>
          <option value="CRLF">CRLF</option>
        </select>
      </label>
      <label class="full-row">
        Extra dictionary words (proper nouns, one per line or comma-separated) — protects them
        from ghost-space repair:
        <textarea data-opt="extraLexiconWords" rows="3" placeholder="Ex: Aslan, Perséfone, Wakanda"></textarea>
      </label>
    </div>
  `;

  const checkboxes = {
    removeHeadersFooters: el.querySelector('[data-opt="removeHeadersFooters"]') as HTMLInputElement,
    ghostSpaceEnabled: el.querySelector('[data-opt="ghostSpaceEnabled"]') as HTMLInputElement,
    normalizeQuotesAndDashes: el.querySelector(
      '[data-opt="normalizeQuotesAndDashes"]',
    ) as HTMLInputElement,
    epubEinkOptimized: el.querySelector('[data-opt="epubEinkOptimized"]') as HTMLInputElement,
    txtBom: el.querySelector('[data-opt="txtBom"]') as HTMLInputElement,
  };
  const eolSelect = el.querySelector('[data-opt="txtEol"]') as HTMLSelectElement;
  const lexiconTextarea = el.querySelector('[data-opt="extraLexiconWords"]') as HTMLTextAreaElement;

  function syncFromOptions(o: PipelineOptions): void {
    checkboxes.removeHeadersFooters.checked = o.removeHeadersFooters;
    checkboxes.ghostSpaceEnabled.checked = o.ghostSpaceEnabled;
    checkboxes.normalizeQuotesAndDashes.checked = o.normalizeQuotesAndDashes;
    checkboxes.epubEinkOptimized.checked = o.epubEinkOptimized;
    checkboxes.txtBom.checked = o.export.txt.bom;
    eolSelect.value = o.export.txt.eol;
    // Only overwrite the textarea when its parsed content actually differs —
    // otherwise every keystroke's round trip through emitChange -> onChange
    // -> syncFromOptions would fight the user's cursor position and any
    // formatting (blank lines, trailing comma) they're mid-typing.
    if (parseWordList(lexiconTextarea.value).join('\n') !== o.extraLexiconWords.join('\n')) {
      lexiconTextarea.value = o.extraLexiconWords.join('\n');
    }
  }
  syncFromOptions(getOptions());

  function emitChange(): void {
    const next: PipelineOptions = {
      ...getOptions(),
      removeHeadersFooters: checkboxes.removeHeadersFooters.checked,
      ghostSpaceEnabled: checkboxes.ghostSpaceEnabled.checked,
      normalizeQuotesAndDashes: checkboxes.normalizeQuotesAndDashes.checked,
      epubEinkOptimized: checkboxes.epubEinkOptimized.checked,
      extraLexiconWords: parseWordList(lexiconTextarea.value),
      export: {
        txt: {
          bom: checkboxes.txtBom.checked,
          eol: eolSelect.value as 'LF' | 'CRLF',
        },
      },
    };
    onChange(next);
  }

  for (const input of Object.values(checkboxes)) {
    input.addEventListener('change', emitChange);
  }
  eolSelect.addEventListener('change', emitChange);
  lexiconTextarea.addEventListener('change', emitChange);

  return { el };
}
