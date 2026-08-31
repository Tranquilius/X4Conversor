import type { GhostSpaceGroup } from '../pipeline/types';

export interface ReviewPanelView {
  el: HTMLElement;
  render(groups: GhostSpaceGroup[], diagnosticsSummary: string, overrides: Record<string, boolean>): void;
}

/**
 * Phase D of the UI: batch review of ghost-space groups. Each group shows the
 * pattern, the occurrence count, and can be expanded to see examples with
 * context. Accept/reject applies to the whole group.
 */
export function createReviewPanel(onOverrideChange: (key: string, accepted: boolean) => void): ReviewPanelView {
  const el = document.createElement('div');
  el.className = 'panel';
  el.hidden = true;

  function render(
    groups: GhostSpaceGroup[],
    diagnosticsSummary: string,
    overrides: Record<string, boolean>,
  ): void {
    if (groups.length === 0) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    el.innerHTML = `
      <h2>Ghost space review</h2>
      <p class="diagnostics-summary">${escapeHtml(diagnosticsSummary)}</p>
      <div class="group-list"></div>
    `;
    const list = el.querySelector('.group-list') as HTMLElement;

    for (const group of groups) {
      const accepted = overrides[group.key] ?? group.accepted;
      const row = document.createElement('div');
      row.className = 'group-row';
      row.innerHTML = `
        <input type="checkbox" ${accepted ? 'checked' : ''} />
        <span>"${escapeHtml(group.left)} ${escapeHtml(group.right)}"</span>
        <span class="arrow">→</span>
        <span>"${escapeHtml(group.merged)}"</span>
        <span class="count">${group.occurrences.length} occurrence${group.occurrences.length === 1 ? '' : 's'} · band ${group.band}</span>
        <button type="button" class="toggle-examples">view examples</button>
        <div class="examples"></div>
      `;

      const checkbox = row.querySelector('input') as HTMLInputElement;
      checkbox.addEventListener('change', () => {
        onOverrideChange(group.key, checkbox.checked);
      });

      const toggleBtn = row.querySelector('.toggle-examples') as HTMLButtonElement;
      const examplesEl = row.querySelector('.examples') as HTMLElement;
      toggleBtn.addEventListener('click', () => {
        const expanded = row.classList.toggle('expanded');
        if (expanded && examplesEl.childElementCount === 0) {
          for (const occ of group.occurrences.slice(0, 5)) {
            const line = document.createElement('div');
            line.textContent = `…${occ.contextBefore}${occ.left} ${occ.right}${occ.contextAfter}…`;
            examplesEl.appendChild(line);
          }
        }
      });

      list.appendChild(row);
    }
  }

  return { el, render };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
