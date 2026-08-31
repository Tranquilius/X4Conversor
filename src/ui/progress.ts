export interface ProgressView {
  el: HTMLElement;
  update(stage: string, fraction: number): void;
  hide(): void;
  show(): void;
}

export function createProgressView(): ProgressView {
  const el = document.createElement('div');
  el.className = 'panel';
  el.hidden = true;
  el.innerHTML = `
    <h2>Processing…</h2>
    <p class="stage-label" style="margin:0 0 0.25rem;color:var(--muted)"></p>
    <div class="progress-bar"><div></div></div>
  `;

  const label = el.querySelector('.stage-label') as HTMLElement;
  const bar = el.querySelector('.progress-bar > div') as HTMLElement;

  return {
    el,
    update(stage, fraction) {
      const stageNames: Record<string, string> = {
        geometria: 'Extracting text from PDF',
        dehyphenate: 'Removing line-break hyphenation',
        reflow: 'Regrouping paragraphs',
        'ghost-space': 'Repairing ghost spaces',
      };
      label.textContent = `${stageNames[stage] ?? stage}… ${Math.round(fraction * 100)}%`;
      bar.style.width = `${Math.round(fraction * 100)}%`;
    },
    hide() {
      el.hidden = true;
    },
    show() {
      el.hidden = false;
    },
  };
}
