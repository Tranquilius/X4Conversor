import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { exportEpub } from '../../src/pipeline/09-export-epub';
import type { ChapterMark, Paragraph } from '../../src/pipeline/types';

function parseFirstLocalFileEntry(bytes: Uint8Array): {
  fileName: string;
  compressionMethod: number;
  content: Uint8Array;
} {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = dv.getUint32(0, true);
  if (signature !== 0x04034b50) {
    throw new Error('Invalid local file header signature — not a well-formed zip.');
  }
  const compressionMethod = dv.getUint16(8, true);
  const compressedSize = dv.getUint32(18, true);
  const fileNameLength = dv.getUint16(26, true);
  const extraFieldLength = dv.getUint16(28, true);
  const fileName = new TextDecoder('ascii').decode(bytes.slice(30, 30 + fileNameLength));
  const contentStart = 30 + fileNameLength + extraFieldLength;
  const content = bytes.slice(contentStart, contentStart + compressedSize);
  return { fileName, compressionMethod, content };
}

const paragraphs: Paragraph[] = [
  { text: 'CAPÍTULO 1', page: null },
  { text: 'Era uma vez uma história muito interessante sobre um leitor de e-ink.', page: null },
  { text: 'Ela continuava por mais um pouco, só para preencher o parágrafo.', page: null },
  { text: 'CAPÍTULO 2', page: null },
  { text: 'E assim terminou o segundo capítulo, de forma breve.', page: null },
];

const chapters: ChapterMark[] = [
  { paragraphIndex: 0, title: 'Capítulo 1', source: 'heuristic' },
  { paragraphIndex: 3, title: 'Capítulo 2', source: 'heuristic' },
];

describe('stage 9 — EPUB export', () => {
  it('"mimetype" is the first entry in the zip, uncompressed, with the exact content', async () => {
    const bytes = await exportEpub(paragraphs, chapters, { title: 'Livro de Teste' });
    const first = parseFirstLocalFileEntry(bytes);
    expect(first.fileName).toBe('mimetype');
    expect(first.compressionMethod).toBe(0); // 0 = STORE (uncompressed)
    expect(new TextDecoder().decode(first.content)).toBe('application/epub+zip');
  });

  it('contains container.xml, content.opf, toc.ncx, and one XHTML per chapter', async () => {
    const bytes = await exportEpub(paragraphs, chapters, { title: 'Livro de Teste' });
    const zip = await JSZip.loadAsync(bytes);

    expect(zip.file('META-INF/container.xml')).not.toBeNull();
    expect(zip.file('OEBPS/content.opf')).not.toBeNull();
    expect(zip.file('OEBPS/toc.ncx')).not.toBeNull();
    expect(zip.file('OEBPS/chap-001.xhtml')).not.toBeNull();
    expect(zip.file('OEBPS/chap-002.xhtml')).not.toBeNull();

    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('chap-001.xhtml');
    expect(opf).toContain('chap-002.xhtml');

    const ncx = await zip.file('OEBPS/toc.ncx')!.async('string');
    expect(ncx).toContain('Capítulo 1');
    expect(ncx).toContain('Capítulo 2');

    const chap1 = await zip.file('OEBPS/chap-001.xhtml')!.async('string');
    expect(chap1).toContain('Era uma vez uma história');
    expect(chap1).not.toContain('E assim terminou');
  });

  it('CSS uses no flex, grid, float, or fixed positioning', async () => {
    const bytes = await exportEpub(paragraphs, [], { title: 'Livro de Teste' });
    const zip = await JSZip.loadAsync(bytes);
    const css = await zip.file('OEBPS/style.css')!.async('string');
    expect(css).not.toMatch(/flex|grid|float|position\s*:\s*fixed/i);
  });

  it('is deterministic: same input and options produce the same bytes', async () => {
    const bytes1 = await exportEpub(paragraphs, chapters, { title: 'Livro de Teste' });
    const bytes2 = await exportEpub(paragraphs, chapters, { title: 'Livro de Teste' });
    expect(Buffer.from(bytes1).equals(Buffer.from(bytes2))).toBe(true);
  });

  it('uses English fallback labels and xml:lang for an English book with no detected chapters', async () => {
    const englishParagraphs: Paragraph[] = [
      { text: 'Once upon a time there was a story.', page: null },
    ];
    const bytes = await exportEpub(englishParagraphs, [], { title: 'Test Book', language: 'en' });
    const zip = await JSZip.loadAsync(bytes);

    const ncx = await zip.file('OEBPS/toc.ncx')!.async('string');
    expect(ncx).toContain('Content');
    expect(ncx).not.toContain('Conteúdo');

    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<dc:language>en</dc:language>');

    const chap1 = await zip.file('OEBPS/chap-001.xhtml')!.async('string');
    expect(chap1).toContain('xml:lang="en"');
  });

  it('defaults to Portuguese fallback labels when no language is given', async () => {
    const bytes = await exportEpub(paragraphs, [], { title: 'Livro de Teste' });
    const zip = await JSZip.loadAsync(bytes);
    const ncx = await zip.file('OEBPS/toc.ncx')!.async('string');
    expect(ncx).toContain('Conteúdo');
  });
});

describe('stage 9 — EPUB export: e-ink optimization toggle', () => {
  it('defaults to the e-ink profile (longhand margins, no bare "margin:" shorthand) when einkOptimized is omitted', async () => {
    const bytes = await exportEpub(paragraphs, chapters, { title: 'Livro de Teste' });
    const zip = await JSZip.loadAsync(bytes);
    const css = await zip.file('OEBPS/style.css')!.async('string');
    expect(css).toContain('margin-left: 6%');
    expect(css).not.toMatch(/\bmargin\s*:\s*1em/);
  });

  it('einkOptimized: false restores the general-purpose profile', async () => {
    const bytes = await exportEpub(paragraphs, chapters, {
      title: 'Livro de Teste',
      einkOptimized: false,
    });
    const zip = await JSZip.loadAsync(bytes);
    const css = await zip.file('OEBPS/style.css')!.async('string');
    expect(css).toContain('margin: 1em');
    expect(css).not.toContain('margin-left: 6%');
  });

  it('e-ink profile still uses no flex, grid, float, or fixed positioning', async () => {
    const bytes = await exportEpub(paragraphs, [], { title: 'Livro de Teste', einkOptimized: true });
    const zip = await JSZip.loadAsync(bytes);
    const css = await zip.file('OEBPS/style.css')!.async('string');
    expect(css).not.toMatch(/flex|grid|float|position\s*:\s*fixed/i);
  });
});

describe('stage 9 — EPUB export: front matter before the first chapter', () => {
  it('keeps paragraphs that appear before the first detected chapter mark', async () => {
    const paragraphsWithFrontMatter: Paragraph[] = [
      { text: 'Este livro é dedicado a quem gosta de ler.', page: null },
      { text: 'CAPÍTULO 1', page: null },
      { text: 'O conteúdo do primeiro capítulo.', page: null },
    ];
    const chaptersStartingLate: ChapterMark[] = [
      { paragraphIndex: 1, title: 'Capítulo 1', source: 'heuristic' },
    ];
    const bytes = await exportEpub(paragraphsWithFrontMatter, chaptersStartingLate, {
      title: 'Livro de Teste',
    });
    const zip = await JSZip.loadAsync(bytes);

    expect(zip.file('OEBPS/chap-000.xhtml')).not.toBeNull();
    const frontMatter = await zip.file('OEBPS/chap-000.xhtml')!.async('string');
    expect(frontMatter).toContain('dedicado a quem gosta de ler');

    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('chap-000.xhtml');
    const ncx = await zip.file('OEBPS/toc.ncx')!.async('string');
    expect(ncx).toContain('chap-000.xhtml');
  });

  it('adds no extra file when the first chapter mark is already at paragraph 0', async () => {
    const bytes = await exportEpub(paragraphs, chapters, { title: 'Livro de Teste' });
    const zip = await JSZip.loadAsync(bytes);
    expect(zip.file('OEBPS/chap-000.xhtml')).toBeNull();
  });
});

describe('stage 9 — EPUB export: dc:identifier uniqueness', () => {
  it('gives two books with the same title but different content different identifiers', async () => {
    const bookA: Paragraph[] = [{ text: 'Conteúdo do livro A.', page: null }];
    const bookB: Paragraph[] = [{ text: 'Conteúdo completamente diferente do livro B.', page: null }];

    const bytesA = await exportEpub(bookA, [], { title: 'Mesmo Título' });
    const bytesB = await exportEpub(bookB, [], { title: 'Mesmo Título' });

    const opfA = await (await JSZip.loadAsync(bytesA)).file('OEBPS/content.opf')!.async('string');
    const opfB = await (await JSZip.loadAsync(bytesB)).file('OEBPS/content.opf')!.async('string');

    const idA = /<dc:identifier[^>]*>([^<]+)<\/dc:identifier>/.exec(opfA)?.[1];
    const idB = /<dc:identifier[^>]*>([^<]+)<\/dc:identifier>/.exec(opfB)?.[1];

    expect(idA).toBeTruthy();
    expect(idB).toBeTruthy();
    expect(idA).not.toBe(idB);
  });

  it('gives the same book the same identifier across repeated exports', async () => {
    const bytes1 = await exportEpub(paragraphs, chapters, { title: 'Livro de Teste' });
    const bytes2 = await exportEpub(paragraphs, chapters, { title: 'Livro de Teste' });

    const opf1 = await (await JSZip.loadAsync(bytes1)).file('OEBPS/content.opf')!.async('string');
    const opf2 = await (await JSZip.loadAsync(bytes2)).file('OEBPS/content.opf')!.async('string');
    expect(opf1).toBe(opf2);
  });
});
