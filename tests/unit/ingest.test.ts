import { describe, expect, it } from 'vitest';
import { decodeText, ingestFile } from '../../src/pipeline/01-ingest';

function utf8Bytes(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

describe('stage 1 — ingestion / encoding detection', () => {
  it('leaves clean UTF-8 text as is', () => {
    const original = 'Não há erro algum aqui: café, ação, coração.';
    const result = decodeText(utf8Bytes(original));
    expect(result.encodingUsed).toBe('utf-8');
    expect(result.text).toBe(original);
  });

  it('strips a leading UTF-8 BOM', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('texto')]);
    const result = decodeText(withBom.buffer);
    expect(result.text).toBe('texto');
  });

  it('detects mojibake (repeated Ã) and redecodes as windows-1252', () => {
    // Simulates a TXT that was already saved wrong once: valid UTF-8 bytes, but
    // whose text content carries the classic mojibake signature ("Ã£", "Ã§" etc.)
    const mojibakeText = Array(20).fill('nÃ£o Ã© bom, seÃ§Ã£o quebrada').join(' ');
    const result = decodeText(utf8Bytes(mojibakeText));
    expect(result.encodingUsed).toBe('windows-1252');
  });

  it('decodes real windows-1252 bytes (strict UTF-8 decoding fails)', () => {
    // 'é' in windows-1252 is the single byte 0xE9, which is not a valid UTF-8 sequence.
    const bytes = new Uint8Array([...new TextEncoder().encode('caf'), 0xe9]);
    const result = decodeText(bytes.buffer);
    expect(result.encodingUsed).toBe('windows-1252');
    expect(result.text).toBe('café');
  });

  it('routes by file extension', () => {
    const pdf = ingestFile('livro.pdf', new ArrayBuffer(4));
    expect(pdf.kind).toBe('pdf');
    const txt = ingestFile('livro.txt', utf8Bytes('olá'));
    expect(txt.kind).toBe('txt');
  });
});
