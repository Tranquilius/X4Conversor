import type { PipelineReport } from './types';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Stage 9 (report): HTML summary of every change applied, for auditing. */
export function exportReportHtml(report: PipelineReport): string {
  const statsRows = report.stats
    .map((s) => `      <tr><td>${escapeHtml(s.stage)}</td><td>${s.changed}</td></tr>`)
    .join('\n');

  const changeRows = report.changeLog
    .map((c) => {
      const context =
        c.contextBefore || c.contextAfter
          ? ` <code>${escapeHtml(c.contextBefore ?? '')}[…]${escapeHtml(c.contextAfter ?? '')}</code>`
          : '';
      return `    <li><strong>${escapeHtml(c.stage)}:</strong> ${escapeHtml(c.description)}${context}</li>`;
    })
    .join('\n');

  const warningsList = report.warnings.map((w) => `    <li>${escapeHtml(w)}</li>`).join('\n');
  const warningsSection =
    report.warnings.length > 0 ? `  <h2>Warnings</h2>\n  <ul>\n${warningsList}\n  </ul>\n` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Conversion report — ${escapeHtml(report.fileName)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 1.5rem; }
  th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; }
  code { background: #f0f0f0; padding: 0.1rem 0.3rem; }
  h1, h2 { border-bottom: 1px solid #ddd; padding-bottom: 0.3rem; }
</style>
</head>
<body>
  <h1>Conversion report</h1>
  <p><strong>File:</strong> ${escapeHtml(report.fileName)}</p>
  <h2>Summary by stage</h2>
  <table>
    <thead><tr><th>Stage</th><th>Changes</th></tr></thead>
    <tbody>
${statsRows}
    </tbody>
  </table>
${warningsSection}  <h2>Detailed changes</h2>
  <ul>
${changeRows}
  </ul>
</body>
</html>
`;
}
