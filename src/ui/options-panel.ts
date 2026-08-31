import type { PipelineOptions } from '../pipeline/types';

export interface OptionsPanelView {
  el: HTMLElement;
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
      <label><input type="checkbox" data-opt="txtBom" /> Include BOM (Byte Order Mark) in TXT</label>
      <label>
        TXT line ending:
        <select data-opt="txtEol">
          <option value="LF">LF (default)</option>
          <option value="CRLF">CRLF</option>
        </select>
      </label>
    </div>
  `;

  const checkboxes = {
    removeHeadersFooters: el.querySelector('[data-opt="removeHeadersFooters"]') as HTMLInputElement,
    ghostSpaceEnabled: el.querySelector('[data-opt="ghostSpaceEnabled"]') as HTMLInputElement,
    normalizeQuotesAndDashes: el.querySelector(
      '[data-opt="normalizeQuotesAndDashes"]',
    ) as HTMLInputElement,
    txtBom: el.querySelector('[data-opt="txtBom"]') as HTMLInputElement,
  };
  const eolSelect = el.querySelector('[data-opt="txtEol"]') as HTMLSelectElement;

  function syncFromOptions(o: PipelineOptions): void {
    checkboxes.removeHeadersFooters.checked = o.removeHeadersFooters;
    checkboxes.ghostSpaceEnabled.checked = o.ghostSpaceEnabled;
    checkboxes.normalizeQuotesAndDashes.checked = o.normalizeQuotesAndDashes;
    checkboxes.txtBom.checked = o.export.txt.bom;
    eolSelect.value = o.export.txt.eol;
  }
  syncFromOptions(getOptions());

  function emitChange(): void {
    const next: PipelineOptions = {
      ...getOptions(),
      removeHeadersFooters: checkboxes.removeHeadersFooters.checked,
      ghostSpaceEnabled: checkboxes.ghostSpaceEnabled.checked,
      normalizeQuotesAndDashes: checkboxes.normalizeQuotesAndDashes.checked,
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

  return { el };
}
