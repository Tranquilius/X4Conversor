import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'corrupted-book.txt');

test('converts a corrupted TXT, reviews an ambiguous group, and exports a corrected TXT', async ({ page }) => {
  await page.goto('/');

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(FIXTURE);

  // The phase D review panel must appear with the ghost-space groups.
  const reviewPanel = page.locator('.panel', { hasText: 'Ghost space review' });
  await expect(reviewPanel).toBeVisible({ timeout: 30_000 });

  // The ambiguous "com o" → "como" group must appear, and is NOT checked by default.
  const comoRow = reviewPanel.locator('.group-row', { hasText: '"como"' });
  await expect(comoRow).toBeVisible();
  const comoCheckbox = comoRow.locator('input[type="checkbox"]');
  await expect(comoCheckbox).not.toBeChecked();

  // Accept the group — simulates the user's phase D review.
  await comoCheckbox.check();

  // "m enos" → "menos": with the full lexicon (Hunspell), both "m" (metre
  // abbreviation) and "enos" (an obscure dictionary entry) exist as
  // standalone words — so phase C classifies this pair as ambiguous (band 2),
  // not band 1. We accept it here too, to exercise the same review flow with
  // a second group.
  const menosRow = reviewPanel.locator('.group-row', { hasText: '"menos"' });
  if (await menosRow.isVisible()) {
    await menosRow.locator('input[type="checkbox"]').check();
  }

  // Export TXT and check the downloaded content.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button[data-format="txt"]').click(),
  ]);

  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const content = readFileSync(downloadPath as string, 'utf-8');

  // Band 1 (unambiguous) already fixed automatically:
  expect(content).toContain('estava morta');
  expect(content).toContain('sido cumprida');
  expect(content).toContain('até morrer');
  expect(content).toContain('menos de um mês');
  expect(content).toContain('suas mãos');

  // Band 2 accepted in review:
  expect(content).toContain('cicatrizes como essas');

  // Band 2 not yet accepted ("em bora" was left unchecked) stays split:
  expect(content).toContain('Em bora ele soubesse');
});
