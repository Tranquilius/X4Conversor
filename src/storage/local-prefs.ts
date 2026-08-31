import type { PipelineOptions } from '../pipeline/types';

const PREFS_KEY = 'x4conversor:prefs:v1';
const REVIEW_PREFIX = 'x4conversor:review:';

export function loadPrefs(defaults: PipelineOptions): PipelineOptions {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PipelineOptions>;
    return { ...defaults, ...parsed, export: { txt: { ...defaults.export.txt, ...parsed.export?.txt } } };
  } catch {
    return defaults;
  }
}

export function savePrefs(options: PipelineOptions): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(options));
  } catch {
    // localStorage unavailable (private mode etc.) — carry on without persisting.
  }
}

/** Phase D review decisions, persisted per file hash (survives a reload). */
export function loadReviewDecisions(fileHash: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(REVIEW_PREFIX + fileHash);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function saveReviewDecisions(fileHash: string, decisions: Record<string, boolean>): void {
  try {
    localStorage.setItem(REVIEW_PREFIX + fileHash, JSON.stringify(decisions));
  } catch {
    // same as above
  }
}
