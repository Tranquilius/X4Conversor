import type { ChapterMark } from '../pipeline/types';

export interface ChapterEditorView {
  el: HTMLElement;
  render(chapters: ChapterMark[]): void;
  getChapters(): ChapterMark[];
}

/** Stage 8 in the UI: list of detected chapters, editable before exporting. */
export function createChapterEditor(onChange: (chapters: ChapterMark[]) => void): ChapterEditorView {
  const el = document.createElement('div');
  el.className = 'panel';
  el.hidden = true;
  let current: ChapterMark[] = [];

  function render(chapters: ChapterMark[]): void {
    current = chapters.map((c) => ({ ...c }));
    el.hidden = current.length === 0;
    el.innerHTML = `
      <h2>Detected chapters</h2>
      <p style="color:var(--muted);font-size:0.9rem;margin-top:0">
        Edit the titles or remove incorrect entries before exporting.
      </p>
      <ul class="chapter-list"></ul>
    `;
    const list = el.querySelector('.chapter-list') as HTMLElement;

    current.forEach((chapter, idx) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span style="color:var(--muted);font-size:0.85rem">${chapter.source === 'outline' ? 'PDF' : 'auto'}</span>
        <input type="text" value="${escapeAttr(chapter.title)}" />
        <button type="button" class="secondary remove-btn" title="Remove">✕</button>
      `;
      const input = li.querySelector('input') as HTMLInputElement;
      input.addEventListener('input', () => {
        current[idx] = { ...current[idx], title: input.value };
        onChange(current);
      });
      const removeBtn = li.querySelector('.remove-btn') as HTMLButtonElement;
      removeBtn.addEventListener('click', () => {
        current = current.filter((_, i) => i !== idx);
        onChange(current);
        render(current);
      });
      list.appendChild(li);
    });
  }

  return {
    el,
    render,
    getChapters: () => current,
  };
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
