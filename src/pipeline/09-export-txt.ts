import type { DocModel } from './types';

export interface TxtExportOptions {
  bom: boolean;
  eol: 'LF' | 'CRLF';
}

/**
 * Stage 9 (TXT): serializes the paragraphs to plain UTF-8 text. Deterministic —
 * same input + same options always produce the same bytes.
 */
export function exportTxt(doc: DocModel, options: TxtExportOptions): Uint8Array {
  const eol = options.eol === 'CRLF' ? '\r\n' : '\n';
  const body = doc.paragraphs.map((p) => p.text).join(eol + eol);
  const bodyBytes = new TextEncoder().encode(body);

  if (!options.bom) return bodyBytes;

  const out = new Uint8Array(3 + bodyBytes.length);
  out.set([0xef, 0xbb, 0xbf], 0);
  out.set(bodyBytes, 3);
  return out;
}
