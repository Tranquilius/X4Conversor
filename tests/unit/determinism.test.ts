import { describe, expect, it } from 'vitest';
import { ingestFile } from '../../src/pipeline/01-ingest';
import { exportTxt } from '../../src/pipeline/09-export-txt';
import { runPipeline } from '../../src/pipeline/run-pipeline';
import { DEFAULT_OPTIONS } from '../../src/pipeline/types';
import { makeTestLexicon } from './helpers/make-test-lexicon';

describe('end-to-end determinism', () => {
  it('converting the same TXT twice produces exactly the same bytes', async () => {
    const lexicon = makeTestLexicon();
    const content = `CAPÍTULO 1

Ela estava m orta havia muito tempo, mas ninguém sabia.

Sua punição havia sido cum prida sem pressa.`;
    const buffer = new TextEncoder().encode(content).buffer as ArrayBuffer;

    async function convertOnce(): Promise<Uint8Array> {
      const ingested = ingestFile('teste.txt', buffer);
      const result = await runPipeline({
        fileName: 'teste.txt',
        ingested,
        lexicon,
        options: DEFAULT_OPTIONS,
      });
      return exportTxt(result.docModel, DEFAULT_OPTIONS.export.txt);
    }

    const out1 = await convertOnce();
    const out2 = await convertOnce();
    expect(Buffer.from(out1).equals(Buffer.from(out2))).toBe(true);
  });
});
