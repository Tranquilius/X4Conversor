import { describe, expect, it } from 'vitest';
import { reflowStage, type ReflowLine } from '../../src/pipeline/06-reflow';

describe('stage 6 — paragraph reflow', () => {
  it('joins lines split by a hard break within the same block (TXT)', () => {
    const lines: ReflowLine[] = [
      { text: 'Esta é a primeira linha de um parágrafo', page: null },
      { text: 'que continua na segunda linha do mesmo', page: null },
      { text: 'bloco de texto.', page: null },
      { text: '', page: null },
      { text: 'Este é outro parágrafo, separado por linha em branco.', page: null },
    ];
    const result = reflowStage(lines);
    expect(result.output).toHaveLength(2);
    expect(result.output[0].text).toBe(
      'Esta é a primeira linha de um parágrafo que continua na segunda linha do mesmo bloco de texto.',
    );
    expect(result.output[1].text).toBe('Este é outro parágrafo, separado por linha em branco.');
  });

  it('a dialogue dash starts a new paragraph even without a blank line', () => {
    const lines: ReflowLine[] = [
      { text: '– Você vai mesmo?', page: null },
      { text: '– Vou sim, respondeu ele.', page: null },
    ];
    const result = reflowStage(lines);
    expect(result.output).toHaveLength(2);
  });

  it('an indent detected via geometry (PDF) starts a new paragraph', () => {
    const lines: ReflowLine[] = [
      { text: 'texto continuando a linha anterior sem recuo', page: 1, indented: false },
      { text: 'novo parágrafo com recuo detectado', page: 1, indented: true },
    ];
    const result = reflowStage(lines);
    expect(result.output).toHaveLength(2);
  });

  it('a short line ending in sentence-final punctuation signals the end of a paragraph', () => {
    const lines: ReflowLine[] = [
      { text: 'esta linha preenche a largura inteira da coluna do documento', page: 1 },
      { text: 'até aqui.', page: 1 },
      { text: 'este é o parágrafo seguinte, também preenchendo a coluna inteira', page: 1 },
    ];
    const result = reflowStage(lines);
    expect(result.output).toHaveLength(2);
    expect(result.output[0].text).toContain('até aqui.');
  });
});
