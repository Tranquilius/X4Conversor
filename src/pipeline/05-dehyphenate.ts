import type { Lexicon } from '../lexicon/types';
import type { Paragraph, StageResult } from './types';

const HYPHEN_END_RE = /\p{L}-$/u;
const LOWER_START_RE = /^\p{Ll}/u;
const LAST_WORD_RE = /(\p{L}+)-$/u;
const FIRST_WORD_RE = /^(\p{L}+)/u;

/**
 * Stage 5: line-break de-hyphenation. Operates at physical-line granularity
 * (one entry per line, before stage 6's reflow). Consults the lexicon to
 * decide whether the hyphen should be preserved (compound word, e.g.
 * "guarda-chuva") or removed (ordinary line-break hyphen).
 */
export function dehyphenateStage(lines: Paragraph[], lexicon: Lexicon): StageResult<Paragraph[]> {
  const output: Paragraph[] = [];
  let changed = 0;
  const details: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    const next = lines[i + 1];
    const trimmedCurrent = current.text.trimEnd();
    const trimmedNext = next?.text.trimStart();

    if (
      next &&
      trimmedNext !== undefined &&
      HYPHEN_END_RE.test(trimmedCurrent) &&
      LOWER_START_RE.test(trimmedNext)
    ) {
      const lastWordMatch = trimmedCurrent.match(LAST_WORD_RE);
      const firstWordMatch = trimmedNext.match(FIRST_WORD_RE);

      if (lastWordMatch && firstWordMatch) {
        const wordBeforeHyphen = lastWordMatch[1];
        const wordAfterHyphen = firstWordMatch[1];
        const hyphenatedForm = `${wordBeforeHyphen}-${wordAfterHyphen}`.toLowerCase();
        const keepHyphen = lexicon.valid.has(hyphenatedForm);

        const beforeLastWord = trimmedCurrent.slice(
          0,
          trimmedCurrent.length - lastWordMatch[0].length,
        );
        const restOfNext = trimmedNext.slice(firstWordMatch[0].length);
        const joinedWord = keepHyphen
          ? `${wordBeforeHyphen}-${wordAfterHyphen}`
          : wordBeforeHyphen + wordAfterHyphen;

        output.push({ text: `${beforeLastWord}${joinedWord}${restOfNext}`, page: current.page });
        changed++;
        details.push(
          keepHyphen
            ? `"${wordBeforeHyphen}-" + "${wordAfterHyphen}" → "${joinedWord}" (hyphen kept: compound word)`
            : `"${wordBeforeHyphen}-" + "${wordAfterHyphen}" → "${joinedWord}"`,
        );
        i++; // the next line has already been merged in
        continue;
      }
    }

    output.push(current);
  }

  return { output, stats: { stage: 'dehyphenate', changed, details } };
}
