export interface IngestedText {
  kind: 'txt';
  text: string;
  encodingUsed: 'utf-8' | 'windows-1252';
}

export interface IngestedPdf {
  kind: 'pdf';
  data: ArrayBuffer;
}

export type IngestedFile = IngestedText | IngestedPdf;

// Mojibake heuristic: presence of Ã, Â, or the replacement character (U+FFFD)
// above a threshold relative to the text length.
const MOJIBAKE_RE = /[ÃÂ�]/g;
const MOJIBAKE_THRESHOLD = 0.005;

export function decodeText(buffer: ArrayBuffer): {
  text: string;
  encodingUsed: 'utf-8' | 'windows-1252';
} {
  const bytes = stripUtf8Bom(new Uint8Array(buffer));

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!looksLikeMojibake(text)) {
      return { text, encodingUsed: 'utf-8' };
    }
  } catch {
    // strict decoding failed; falls through to windows-1252 below.
  }

  const text = new TextDecoder('windows-1252').decode(bytes);
  return { text, encodingUsed: 'windows-1252' };
}

function stripUtf8Bom(bytes: Uint8Array): Uint8Array {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.subarray(3);
  }
  return bytes;
}

function looksLikeMojibake(text: string): boolean {
  const matches = text.match(MOJIBAKE_RE);
  if (!matches) return false;
  return matches.length / Math.max(1, text.length) > MOJIBAKE_THRESHOLD;
}

export function ingestFile(fileName: string, buffer: ArrayBuffer): IngestedFile {
  if (fileName.toLowerCase().endsWith('.pdf')) {
    return { kind: 'pdf', data: buffer };
  }
  const { text, encodingUsed } = decodeText(buffer);
  return { kind: 'txt', text, encodingUsed };
}
