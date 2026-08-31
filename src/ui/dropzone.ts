export function createDropzone(onFiles: (files: File[]) => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'dropzone';
  el.tabIndex = 0;
  el.innerHTML = `
    <p><strong>Drag PDFs or TXTs here</strong>, or click to choose files.</p>
    <p style="font-size:0.85rem">Multiple files at once are accepted. Nothing leaves your browser.</p>
    <input type="file" accept=".pdf,.txt" multiple />
  `;

  const input = el.querySelector('input') as HTMLInputElement;

  el.addEventListener('click', () => input.click());
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') input.click();
  });

  input.addEventListener('change', () => {
    if (input.files && input.files.length > 0) {
      onFiles(Array.from(input.files));
      input.value = '';
    }
  });

  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.classList.add('dragover');
  });
  el.addEventListener('dragleave', () => el.classList.remove('dragover'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('dragover');
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
      /\.(pdf|txt)$/i.test(f.name),
    );
    if (files.length > 0) onFiles(files);
  });

  return el;
}
