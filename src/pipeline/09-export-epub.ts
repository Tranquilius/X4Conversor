import JSZip from 'jszip';
import { hashFile } from '../util/hash';
import type { ChapterMark, Paragraph } from './types';

export interface EpubOptions {
  title: string;
  author?: string;
  language?: string;
  /**
   * Applies a CSS/layout profile tuned for small, CSS-limited e-ink EPUB
   * readers — the Xteink X4's built-in reader in particular — instead of
   * the general-purpose default. Defaults to true when omitted, since that
   * is this app's actual target device.
   */
  einkOptimized?: boolean;
}

interface EpubChapter {
  id: string;
  title: string;
  href: string;
  paragraphs: Paragraph[];
}

// Fixed date written to every zip entry — JSZip uses the current date by
// default, which would break the deterministic-output requirement (same
// input + same options ⇒ same bytes) if left unfixed.
const FIXED_ZIP_DATE = new Date(Date.UTC(2000, 0, 1));

// The book's own content can be Portuguese or English (this tool converts
// both), so the generic labels used when no real chapter title is available
// — "Conteúdo"/"Capítulo N" vs. "Content"/"Chapter N" — follow the resolved
// `language` option instead of being hardcoded to one language.
function isPortuguese(language?: string): boolean {
  return (language ?? 'pt-BR').toLowerCase().startsWith('pt');
}

function splitIntoChapters(
  paragraphs: Paragraph[],
  chapters: ChapterMark[],
  language: string | undefined,
): EpubChapter[] {
  const pt = isPortuguese(language);
  if (chapters.length === 0) {
    return [
      { id: 'chapter-1', title: pt ? 'Conteúdo' : 'Content', href: 'chap-001.xhtml', paragraphs },
    ];
  }
  const sorted = [...chapters].sort((a, b) => a.paragraphIndex - b.paragraphIndex);
  const result: EpubChapter[] = [];

  // Paragraphs before the first detected chapter mark (title page, preface,
  // dedication...) fall outside every chapter's [start, end) slice below and
  // would otherwise be silently dropped from the EPUB entirely.
  if (sorted[0].paragraphIndex > 0) {
    result.push({
      id: 'chapter-0',
      title: pt ? 'Conteúdo' : 'Content',
      href: 'chap-000.xhtml',
      paragraphs: paragraphs.slice(0, sorted[0].paragraphIndex),
    });
  }

  sorted.forEach((ch, i) => {
    const start = ch.paragraphIndex;
    const end = i + 1 < sorted.length ? sorted[i + 1].paragraphIndex : paragraphs.length;
    const num = String(i + 1).padStart(3, '0');
    result.push({
      id: `chapter-${i + 1}`,
      title: ch.title || (pt ? `Capítulo ${i + 1}` : `Chapter ${i + 1}`),
      href: `chap-${num}.xhtml`,
      paragraphs: paragraphs.slice(start, end),
    });
  });

  return result;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// General-purpose profile (einkOptimized: false) — no embedded fonts, no JS,
// no flex/grid/float/fixed positioning. This is the original v1 CSS, kept
// as an escape hatch / point of comparison.
const CSS_DEFAULT = `body { font-family: serif; line-height: 1.4; margin: 1em; }
p { margin: 0 0 0.8em 0; text-indent: 1.2em; }
h1 { font-size: 1.3em; text-align: center; margin: 1.5em 0 1em 0; }
`;

// "Optimize for e-ink" profile (einkOptimized: true, the default) — tuned for
// the Xteink X4's built-in EPUB reader (480x800). User and community reports
// (e.g. readme.club's X4 guide) describe paragraph indentation as unreliable
// and body text running edge-to-edge with no visible margin on this firmware
// — consistent with a minimal CSS parser that silently drops a declaration
// it does not recognize rather than degrading it gracefully. So this profile:
//  - uses longhand margin-* on every rule instead of the one-value `margin`
//    shorthand, which is the most likely thing such a parser mishandles;
//  - insets the sides by a percentage rather than a fixed em/px value, so
//    the margin stays proportional to the 480px-wide screen regardless of
//    the reader's own font-size setting;
//  - adds a defensive word-break so one long unbroken token cannot push a
//    line past the right edge;
//  - drops text-indent (reported non-functional on current X4 firmware) in
//    favor of paragraph spacing via margin-bottom, which degrades safely
//    even where CSS support is minimal.
const CSS_EINK = `body { font-family: serif; line-height: 1.3; margin-top: 1em; margin-right: 6%; margin-bottom: 1em; margin-left: 6%; word-wrap: break-word; overflow-wrap: break-word; }
p { margin-top: 0; margin-right: 0; margin-bottom: 0.9em; margin-left: 0; }
h1 { font-size: 1.2em; text-align: center; margin-top: 1.3em; margin-right: 0; margin-bottom: 1em; margin-left: 0; }
`;

function chapterXhtml(chapter: EpubChapter, language: string | undefined): string {
  const body = chapter.paragraphs.map((p) => `<p>${escapeXml(p.text)}</p>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(language ?? 'pt-BR')}">
<head>
<meta charset="utf-8"/>
<title>${escapeXml(chapter.title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
<h1>${escapeXml(chapter.title)}</h1>
${body}
</body>
</html>
`;
}

function containerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;
}

function contentOpf(chapters: EpubChapter[], options: EpubOptions, uid: string): string {
  const manifestItems = chapters
    .map((c) => `    <item id="${c.id}" href="${c.href}" media-type="application/xhtml+xml"/>`)
    .join('\n');
  const spineItems = chapters.map((c) => `    <itemref idref="${c.id}"/>`).join('\n');
  const creator = options.author ? `\n    <dc:creator>${escapeXml(options.author)}</dc:creator>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${escapeXml(options.title)}</dc:title>
    <dc:language>${escapeXml(options.language ?? 'pt-BR')}</dc:language>
    <dc:identifier id="BookId">${escapeXml(uid)}</dc:identifier>${creator}
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
${manifestItems}
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>
`;
}

function tocNcx(chapters: EpubChapter[], options: EpubOptions, uid: string): string {
  const navPoints = chapters
    .map(
      (c, i) => `    <navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(c.title)}</text></navLabel>
      <content src="${c.href}"/>
    </navPoint>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(uid)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(options.title)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>
`;
}

/**
 * Stage 9 (EPUB): assembles a minimal EPUB 2, compatible with the X4 reader's
 * limited parser. `mimetype` is the first file in the zip, uncompressed, with
 * the exact content `application/epub+zip` — a format requirement that
 * homegrown generators frequently get wrong.
 */
export async function exportEpub(
  paragraphs: Paragraph[],
  chapterMarks: ChapterMark[],
  options: EpubOptions,
): Promise<Uint8Array> {
  const einkOptimized = options.einkOptimized ?? true;
  const zip = new JSZip();

  zip.file('mimetype', 'application/epub+zip', {
    compression: 'STORE',
    date: FIXED_ZIP_DATE,
  });

  zip.file('META-INF/container.xml', containerXml(), { date: FIXED_ZIP_DATE });

  const chapters = splitIntoChapters(paragraphs, chapterMarks, options.language);

  // Content-derived, not just title-derived, so two different books that
  // happen to share a title (or both fall back to "sem-titulo") still get
  // distinct identifiers — reading systems use dc:identifier to tell books
  // apart (library de-dup, reading-position sync), and a collision there can
  // make two unrelated books look like the same one. Hashing keeps this
  // deterministic: the same paragraphs + title always produce the same uid.
  const slug = options.title.trim().toLowerCase().replace(/\s+/g, '-') || 'sem-titulo';
  const hashInput = new TextEncoder().encode([options.title, ...paragraphs.map((p) => p.text)].join('\n'))
    .buffer as ArrayBuffer;
  const contentHash = (await hashFile(hashInput)).slice(0, 16);
  const uid = `urn:x4conversor:${slug}-${contentHash}`;

  zip.file('OEBPS/content.opf', contentOpf(chapters, options, uid), { date: FIXED_ZIP_DATE });
  zip.file('OEBPS/toc.ncx', tocNcx(chapters, options, uid), { date: FIXED_ZIP_DATE });
  zip.file('OEBPS/style.css', einkOptimized ? CSS_EINK : CSS_DEFAULT, { date: FIXED_ZIP_DATE });
  for (const chapter of chapters) {
    zip.file(`OEBPS/${chapter.href}`, chapterXhtml(chapter, options.language), { date: FIXED_ZIP_DATE });
  }

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
