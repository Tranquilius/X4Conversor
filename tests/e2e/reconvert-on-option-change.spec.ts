import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('re-converts an already-ready document when an extraction-affecting option changes', async ({ page }) => {
  await page.goto('/');

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: 'quotes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('“Hello” and ‘world’ — together.', 'utf-8'),
  });

  const statusEl = page.locator('.document-status').first();
  await expect(statusEl).toHaveText('Ready', { timeout: 30_000 });

  // "Normalize curly quotes and dashes" is off by default (DEFAULT_OPTIONS),
  // so the first export must still contain the original curly punctuation.
  const exportButton = page.locator('button[data-format="txt"]');
  const [firstDownload] = await Promise.all([page.waitForEvent('download'), exportButton.click()]);
  const firstPath = await firstDownload.path();
  expect(firstPath).not.toBeNull();
  const before = readFileSync(firstPath as string, 'utf-8');
  expect(before).toContain('“Hello”');
  expect(before).toContain('—');

  // Flipping this option after the document is already "Ready" must
  // re-convert it (stage 3 char-clean only runs during extraction) rather
  // than silently leaving the already-extracted paragraphs untouched.
  // runConversion() hides the export row synchronously when it starts and
  // only reveals it again once the re-conversion finishes — a stronger,
  // less timing-sensitive signal than the transient "Processing…" text, and
  // one the old (buggy) refinalize()-only path never touched at all.
  await page.locator('input[data-opt="normalizeQuotesAndDashes"]').check();
  await expect(exportButton).toBeHidden();
  await expect(statusEl).toHaveText('Ready', { timeout: 30_000 });

  const [secondDownload] = await Promise.all([page.waitForEvent('download'), exportButton.click()]);
  const secondPath = await secondDownload.path();
  expect(secondPath).not.toBeNull();
  const after = readFileSync(secondPath as string, 'utf-8');
  expect(after).toContain('"Hello"');
  expect(after).toContain('-');
  expect(after).not.toContain('“Hello”');
  expect(after).not.toContain('—');
});
