import type { Action, AssertionResult, ExportOptions, GuideEdits, GuideSection, Issue, IssueAnalysis, PlaybackRunSummary } from '../types';

export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  profile: 'internal',
  redactSelectors: false,
  redactValues: false,
  redactUrls: false,
  includeDiagnostics: true,
};

function resolveExportOptions(overrides?: ExportOptions): ExportOptions {
  return { ...DEFAULT_EXPORT_OPTIONS, ...(overrides || {}) };
}

function redact(value: string | undefined, enabled: boolean, fallback = '[redacted]'): string {
  if (!value) return '';
  return enabled ? fallback : value;
}

// ── Shared Design System ──

export const BASE_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.6; color: #1f2937; background: #f3f4f6;
    padding: 40px 20px;
  }
  .page { max-width: 960px; margin: 0 auto; }

  /* ── Typography ── */
  h1 { font-size: 1.75em; font-weight: 700; color: #111827; margin-bottom: 4px; }
  h2 { font-size: 1.2em; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin: 32px 0 16px; }
  h3 { font-size: 1.05em; font-weight: 600; color: #111827; }
  p  { margin: 8px 0; }
  a  { color: #2563eb; text-decoration: none; }
  a:hover { text-decoration: underline; }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    background: #f1f5f9; color: #0f172a; padding: 2px 6px;
    border-radius: 4px; font-size: 0.875em; word-break: break-all;
  }
  pre {
    background: #1e293b; color: #e2e8f0; padding: 14px 16px;
    border-radius: 8px; font-size: 0.82em; overflow-x: auto;
    white-space: pre-wrap; max-height: 260px; margin: 10px 0;
  }

  /* ── Layout ── */
  .two-col   { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
  @media (max-width: 600px) { .two-col, .three-col { grid-template-columns: 1fr; } }

  /* ── Hero ── */
  .hero {
    background: linear-gradient(135deg, #1d4ed8 0%, #7c3aed 100%);
    color: #fff; border-radius: 12px; padding: 36px 32px; margin-bottom: 32px;
  }
  .hero h1 { color: #fff; font-size: 2em; }
  .hero .subtitle { color: rgba(255,255,255,0.8); font-size: 0.95em; margin-top: 6px; }
  .hero .meta { color: rgba(255,255,255,0.65); font-size: 0.8em; margin-top: 16px; }

  /* ── Cards ── */
  .card {
    background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
    padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }
  .card + .card { margin-top: 16px; }
  .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px,1fr)); gap: 16px; margin: 16px 0; }
  .card-accent { border-left: 4px solid #2563eb; }
  .card-accent-green  { border-left: 4px solid #16a34a; }
  .card-accent-red    { border-left: 4px solid #dc2626; }
  .card-accent-yellow { border-left: 4px solid #ca8a04; }
  .card-accent-purple { border-left: 4px solid #7c3aed; }
  .card h3 { margin-bottom: 8px; }

  /* ── Steps ── */
  .step {
    background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
    padding: 20px 24px; margin-bottom: 20px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }
  .step-header { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
  .step-num {
    display: inline-flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; border-radius: 50%;
    background: #2563eb; color: #fff; font-weight: 700; font-size: 0.85em; flex-shrink: 0;
  }
  .step-num.done { background: #16a34a; }
  .substep {
    border-left: 2px solid #e5e7eb; padding: 8px 0 8px 16px; margin: 8px 0;
    font-size: 0.93em; color: #374151;
  }
  .step-notes {
    background: #eff6ff; border-left: 3px solid #3b82f6;
    padding: 8px 12px; margin-bottom: 10px; border-radius: 0 6px 6px 0;
    font-size: 0.9em;
  }
  .selector { font-size: 0.82em; color: #6b7280; margin: 4px 0; }
  .timestamp { font-size: 0.78em; color: #9ca3af; }

  /* ── Callouts ── */
  .callout {
    display: flex; gap: 12px; align-items: flex-start;
    border-radius: 8px; padding: 12px 16px; margin: 16px 0;
    font-size: 0.93em;
  }
  .callout-note    { background: #eff6ff; border: 1px solid #bfdbfe; }
  .callout-warning { background: #fffbeb; border: 1px solid #fde68a; }
  .callout-tip     { background: #f0fdf4; border: 1px solid #bbf7d0; }
  .callout-danger  { background: #fef2f2; border: 1px solid #fecaca; }
  .callout-success { background: #f0fdf4; border: 1px solid #6ee7b7; }
  .callout-icon { font-size: 1.1em; flex-shrink: 0; margin-top: 1px; }
  .callout-body { flex: 1; line-height: 1.5; }
  .callout-body strong { display: block; margin-bottom: 2px; }

  /* ── Legacy guide-section support ── */
  .guide-section { display: flex; gap: 10px; align-items: flex-start; border-radius: 8px; padding: 12px 16px; margin: 16px 0; }
  .guide-note    { background: #eff6ff; border: 1px solid #bfdbfe; }
  .guide-warning { background: #fffbeb; border: 1px solid #fde68a; }
  .guide-tip     { background: #f0fdf4; border: 1px solid #bbf7d0; }
  .guide-callout { background: #faf5ff; border: 1px solid #e9d5ff; }
  .guide-html    { padding: 0; }
  .section-icon  { font-size: 1.1em; flex-shrink: 0; margin-top: 2px; }
  .section-body  { font-size: 0.95em; line-height: 1.5; }
  .guide-heading { color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin: 28px 0 16px; font-size: 1.15em; }

  /* ── Keyboard badges ── */
  .kbd {
    display: inline-block; background: #f8fafc; border: 1px solid #cbd5e1;
    border-bottom: 3px solid #94a3b8; border-radius: 5px;
    padding: 2px 7px; font-family: ui-monospace, monospace;
    font-size: 0.8em; color: #334155; vertical-align: middle;
  }

  /* ── Tables ── */
  .table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 0.9em; }
  .table th {
    background: #f1f5f9; text-align: left; padding: 9px 12px;
    font-weight: 600; border-bottom: 2px solid #e2e8f0; color: #374151;
  }
  .table td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .table tr:last-child td { border-bottom: none; }
  .table tr:hover td { background: #fafafa; }

  /* ── Checklist ── */
  .checklist { list-style: none; margin: 12px 0; padding: 0; }
  .checklist li { padding: 5px 0 5px 28px; position: relative; }
  .checklist li::before {
    content: '✓'; position: absolute; left: 0; color: #16a34a;
    font-weight: 700; font-size: 0.9em;
  }
  .checklist li.pending::before { content: '○'; color: #9ca3af; }
  .checklist li.warn::before   { content: '!'; color: #ca8a04; }

  /* ── Stats ── */
  .stats { display: flex; gap: 16px; flex-wrap: wrap; margin: 20px 0; }
  .stat {
    flex: 1; min-width: 100px; background: #fff; border: 1px solid #e5e7eb;
    border-radius: 10px; padding: 16px; text-align: center;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  }
  .stat .num { font-size: 2em; font-weight: 700; line-height: 1; }
  .stat .label { font-size: 0.78em; color: #6b7280; margin-top: 4px; }
  .stat-red    .num { color: #dc2626; }
  .stat-orange .num { color: #ea580c; }
  .stat-yellow .num { color: #ca8a04; }
  .stat-green  .num { color: #16a34a; }
  .stat-blue   .num { color: #2563eb; }
  .stat-purple .num { color: #7c3aed; }

  /* ── Severity / Type badges ── */
  .badge {
    display: inline-block; padding: 2px 9px; border-radius: 12px;
    font-size: 0.72em; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.04em; color: #fff; vertical-align: middle;
  }
  .badge-critical { background: #dc2626; }
  .badge-high     { background: #ea580c; }
  .badge-medium   { background: #ca8a04; }
  .badge-low      { background: #16a34a; }
  .badge-bug      { background: #6366f1; }
  .badge-feature  { background: #0891b2; }
  .badge-blue     { background: #2563eb; }
  .badge-gray     { background: #6b7280; }

  /* ── Timeline ── */
  .timeline { position: relative; padding-left: 28px; margin: 20px 0; }
  .timeline::before {
    content: ''; position: absolute; left: 8px; top: 6px; bottom: 6px;
    width: 2px; background: #e5e7eb; border-radius: 1px;
  }
  .timeline-item { position: relative; margin-bottom: 20px; }
  .timeline-item::before {
    content: ''; position: absolute; left: -24px; top: 6px;
    width: 12px; height: 12px; border-radius: 50%;
    background: #2563eb; border: 2px solid #fff;
    box-shadow: 0 0 0 2px #2563eb;
  }
  .timeline-item .tl-time { font-size: 0.78em; color: #9ca3af; margin-bottom: 2px; }
  .timeline-item .tl-title { font-weight: 600; color: #111827; }
  .timeline-item .tl-body { font-size: 0.9em; color: #4b5563; margin-top: 4px; }

  /* ── Screenshots ── */
  .screenshot-details { margin-top: 14px; }
  .screenshot-thumb {
    cursor: pointer; display: inline-flex; align-items: center;
    gap: 8px; list-style: none;
  }
  .screenshot-thumb::-webkit-details-marker { display: none; }
  .thumb {
    width: 180px; height: auto; border: 1px solid #e5e7eb;
    border-radius: 6px; transition: box-shadow 0.15s;
  }
  .thumb:hover { box-shadow: 0 3px 10px rgba(0,0,0,0.15); }
  .thumb-hint { font-size: 0.75em; color: #9ca3af; }
  .screenshot-details[open] .thumb-hint { display: none; }
  .full {
    max-width: 100%; height: auto; border: 1px solid #e5e7eb;
    border-radius: 6px; margin-top: 10px; display: block;
  }

  /* ── Error detail ── */
  .error-detail {
    background: #fff5f5; border: 1px solid #fecaca; border-radius: 6px;
    padding: 10px 14px; margin: 10px 0; font-size: 0.88em;
  }
  .error-detail p { margin: 3px 0; }
  .stack {
    background: #1e293b; color: #94a3b8; padding: 10px 12px;
    border-radius: 6px; font-size: 0.78em; overflow-x: auto;
    white-space: pre-wrap; max-height: 200px; margin-top: 6px;
  }

  /* ── Guide Chapter Breaks ── */
  .chapter-heading {
    font-size: 1.15em; font-weight: 700; color: #1d4ed8;
    border-left: 4px solid #2563eb; padding: 8px 14px;
    margin: 36px 0 20px; background: #eff6ff;
    border-radius: 0 8px 8px 0;
  }
  .step-count-strip {
    font-size: 0.75em; color: #9ca3af;
    text-align: right; margin-bottom: 4px; letter-spacing: 0.03em;
  }
  .step-skipped {
    border: 1px dashed #d1d5db; border-radius: 10px;
    padding: 10px 16px; margin-bottom: 12px;
    color: #9ca3af; font-size: 0.85em; background: #fafafa;
  }

  /* ── Issue Report Cards ── */
  .issue-card {
    background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
    padding: 20px; margin-bottom: 16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }
  .issue-card-critical { border-left: 5px solid #dc2626; background: #fff5f5; }
  .issue-card-high     { border-left: 5px solid #ea580c; background: #fff7ed; }
  .issue-card-medium   { border-left: 5px solid #ca8a04; background: #fefce8; }
  .issue-card-low      { border-left: 5px solid #16a34a; background: #f0fdf4; }
  .issue-card-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
  .issue-card-header h3 { margin: 0; flex: 1; min-width: 160px; }
  .issue-card-meta { font-size: 0.82em; color: #6b7280; margin: 4px 0; }
  .issue-card-notes {
    background: rgba(255,255,255,0.7); border-radius: 6px;
    padding: 8px 12px; margin: 8px 0; font-size: 0.92em;
  }

  /* ── Section Divider ── */
  .section-divider {
    display: flex; align-items: center; gap: 12px;
    margin: 32px 0 20px; color: #374151;
  }
  .section-divider::before,
  .section-divider::after { content: ''; flex: 1; border-top: 1px solid #e5e7eb; }
  .section-divider span {
    font-size: 0.8em; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.06em; white-space: nowrap;
  }

  /* ── Page Impact Table ── */
  .page-impact-row td:first-child { font-family: ui-monospace, monospace; font-size: 0.82em; }
  .page-impact-badge {
    display: inline-block; min-width: 22px; text-align: center;
    padding: 1px 6px; border-radius: 10px; font-size: 0.72em; font-weight: 700;
    color: #fff; background: #6b7280; margin-right: 4px;
  }
  .page-impact-badge.critical { background: #dc2626; }
  .page-impact-badge.high     { background: #ea580c; }

  /* ── Misc ── */
  .intro, .conclusion {
    background: #fff; border: 1px solid #e5e7eb;
    border-radius: 10px; padding: 18px 20px; margin-bottom: 28px;
  }
  footer {
    text-align: center; margin-top: 48px;
    font-size: 0.78em; color: #9ca3af;
    border-top: 1px solid #e5e7eb; padding-top: 20px;
  }
  .divider { border: none; border-top: 1px solid #e5e7eb; margin: 28px 0; }
  .muted  { color: #6b7280; font-size: 0.88em; }
  .bold   { font-weight: 700; }
  .center { text-align: center; }
  .mt-8  { margin-top: 8px; }
  .mt-16 { margin-top: 16px; }
  .mb-8  { margin-bottom: 8px; }
  .mb-16 { margin-bottom: 16px; }
  .page-url { font-size: 0.82em; color: #6b7280; }
`;

// ── Custom Guide Renderer ──

/**
 * Wrap AI-authored HTML body in the base shell with shared styles.
 * Replaces {{screenshot:N}} placeholders with base64 data URLs.
 */
export function renderCustomGuide(
  body: string,
  title: string,
  screenshots: Record<number, string>,
): string {
  const resolved = body.replace(/\{\{screenshot:(\d+)\}\}/g, (_, n) => {
    const src = screenshots[Number(n)];
    return src
      ? `<details class="screenshot-details">
          <summary class="screenshot-thumb">
            <img src="${src}" alt="Step ${n}" class="thumb" loading="lazy">
            <span class="thumb-hint">Click to enlarge</span>
          </summary>
          <img src="${src}" alt="Step ${n} full" class="full" loading="lazy">
        </details>`
      : '';
  });

  return `<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(title)}</title>
  <style>${BASE_STYLES}</style>
</head>
<body>
<div class="page">
${resolved}
  <footer>Generated by Sentinel Extension</footer>
</div>
</body>
</html>`;
}

/**
 * Wrap AI-authored HTML body in the base shell for issue reports.
 * Replaces {{screenshot:ISSUE_ID}} placeholders with base64 data URLs.
 */
export function renderCustomReport(
  body: string,
  title: string,
  issueScreenshots: Record<string, string>,
): string {
  const resolved = body.replace(/\{\{screenshot:([^}]+)\}\}/g, (_, id) => {
    const src = issueScreenshots[id];
    return src
      ? `<details class="screenshot-details">
          <summary class="screenshot-thumb">
            <img src="${src}" alt="Screenshot" class="thumb" loading="lazy">
            <span class="thumb-hint">Click to enlarge</span>
          </summary>
          <img src="${src}" alt="Screenshot full" class="full" loading="lazy">
        </details>`
      : '';
  });

  return `<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(title)}</title>
  <style>${BASE_STYLES}</style>
</head>
<body>
<div class="page">
${resolved}
  <footer>Generated by Sentinel Extension</footer>
</div>
</body>
</html>`;
}

// ── Standard Guide Generator ──

export function generateGuideHTML(actions: Action[], edits?: GuideEdits): string {
  const guideTitle = edits?.guideTitle || 'Sentinel Visual Guide';
  const introText = edits?.introText || '';
  const conclusionText = edits?.conclusionText || '';
  const exportOptions = resolveExportOptions(edits?.exportOptions);

  // Build ordered step list from edits (or fall back to all actions)
  const stepsData = edits
    ? edits.steps
        .filter(s => s.included)
        .map(s => ({ action: actions[s.originalIndex], edit: s }))
        .filter(s => s.action) // guard against stale indices
    : actions.map((a, i) => ({
        action: a,
        edit: { originalIndex: i, title: '', notes: '', includeScreenshot: true, included: true },
      }));

  // Build section map keyed by afterStep index (-1 = before all steps)
  const sectionMap = new Map<number, GuideSection[]>();
  for (const sec of (edits?.sections ?? [])) {
    const key = sec.afterStep ?? -1;
    if (!sectionMap.has(key)) sectionMap.set(key, []);
    sectionMap.get(key)!.push(sec);
  }

  function renderSections(afterStep: number): string {
    return (sectionMap.get(afterStep) ?? []).map(sec => {
      if (sec.type === 'html') return `<div class="guide-section guide-html">${sec.content}</div>`;
      if (sec.type === 'heading') return `<h2 class="guide-heading">${escapeHtml(sec.content)}</h2>`;
      const icon = sec.type === 'warning' ? '⚠️' : sec.type === 'tip' ? '💡' : 'ℹ️';
      return `<div class="guide-section guide-${sec.type}"><span class="section-icon">${icon}</span><div class="section-body">${escapeHtml(sec.content)}</div></div>`;
    }).join('');
  }

  const stepBlocks = stepsData.map(({ action, edit }, index) => {
    const desc = edit.title || action.description || action.type.toUpperCase();
    const showScreenshot = edit.includeScreenshot && action.screenshot;
    const selectorText = redact(action.selector, exportOptions.redactSelectors);
    const valueText = redact(action.value, exportOptions.redactValues);
    const urlText = redact(action.url, exportOptions.redactUrls, '[internal-url]');
    const screenshotHtml = showScreenshot
      ? `<details class="screenshot-details">
          <summary class="screenshot-thumb">
            <img src="${action.screenshot}" alt="Step ${index + 1}" class="thumb" loading="lazy">
            <span class="thumb-hint">Click to enlarge</span>
          </summary>
          <img src="${action.screenshot}" alt="Step ${index + 1} full" class="full" loading="lazy">
        </details>`
      : '';
    const notesHtml = edit.notes
      ? `<div class="step-notes"><p>${escapeHtml(edit.notes)}</p></div>`
      : '';
    return `
    <div class="step">
      <div class="step-header">
        <span class="step-num">${index + 1}</span>
        <h3>${escapeHtml(desc)}</h3>
      </div>
      ${notesHtml}
      ${selectorText ? `<p class="selector"><strong>Selector:</strong> <code>${escapeHtml(selectorText)}</code></p>` : ''}
      ${valueText ? `<p><strong>Value:</strong> <code>${escapeHtml(valueText)}</code></p>` : ''}
      ${urlText && exportOptions.includeDiagnostics ? `<p class="page-url"><strong>URL:</strong> <code>${escapeHtml(urlText)}</code></p>` : ''}
      ${exportOptions.includeDiagnostics && action.selectorConfidence !== undefined
        ? `<p class="muted">Selector confidence: ${Math.round(action.selectorConfidence * 100)}%</p>`
        : ''}
      <p class="timestamp">${new Date(action.timestamp).toLocaleString()}</p>
      ${screenshotHtml}
    </div>${renderSections(index)}`;
  });

  const steps = renderSections(-1) + stepBlocks.join('');

  const introHtml = introText ? `<div class="intro"><p>${escapeHtml(introText)}</p></div>` : '';
  const conclusionHtml = conclusionText ? `<div class="conclusion"><p>${escapeHtml(conclusionText)}</p></div>` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(guideTitle)}</title>
  <style>${BASE_STYLES}</style>
</head>
<body>
<div class="page">
  <div class="hero">
    <h1>${escapeHtml(guideTitle)}</h1>
    <p class="subtitle">${escapeHtml(exportOptions.profile === 'client' ? 'Client-safe handoff guide' : 'Internal guide with QA context')}</p>
    <p class="meta">Generated on ${new Date().toLocaleString()} &middot; ${stepsData.length} steps</p>
  </div>
  ${introHtml}
  ${steps}
  ${conclusionHtml}
  <footer>Generated by Sentinel Extension</footer>
</div>
</body>
</html>`;
}

export function generateIssueReportHTML(issues: Issue[], analysis?: IssueAnalysis): string {
  const bugs = issues.filter(i => i.type === 'bug');
  const features = issues.filter(i => i.type === 'feature-request');

  const severityColor: Record<string, string> = {
    critical: '#dc2626', high: '#ea580c', medium: '#ca8a04', low: '#16a34a',
  };
  const typeLabel: Record<string, string> = {
    bug: 'Bug', 'feature-request': 'Feature Request',
  };

  const cards = issues
    .map((issue) => {
      const sColor = severityColor[issue.severity] || '#666';
      const tLabel = typeLabel[issue.type] || issue.type;
      const typeBg = issue.type === 'bug' ? '#fef2f2' : '#f0f9ff';
      const typeBorder = issue.type === 'bug' ? '#fecaca' : '#bae6fd';

      const screenshotHtml = issue.screenshot
        ? `<details class="screenshot-details">
            <summary class="screenshot-thumb">
              <img src="${issue.screenshot}" alt="Screenshot" class="thumb" loading="lazy">
              <span class="thumb-hint">Click to enlarge</span>
            </summary>
            <img src="${issue.screenshot}" alt="Screenshot full" class="full" loading="lazy">
          </details>`
        : '';

      const errorHtml = issue.capturedError
        ? `<div class="error-detail">
            <p><strong>Source:</strong> ${escapeHtml(issue.capturedError.source)}</p>
            <p><strong>Error:</strong> ${escapeHtml(issue.capturedError.message)}</p>
            ${issue.capturedError.stack ? `<pre class="stack">${escapeHtml(issue.capturedError.stack)}</pre>` : ''}
            ${issue.capturedError.url ? `<p><strong>URL:</strong> <code>${escapeHtml(issue.capturedError.url)}</code></p>` : ''}
          </div>`
        : '';
      const correlationHtml = issue.correlatedStepIndices?.length
        ? `<p class="muted"><strong>Related steps:</strong> ${issue.correlatedStepIndices.map(index => `#${index + 1}`).join(', ')}</p>`
        : '';

      return `
    <div class="issue-card issue-card-${issue.severity}" style="background: ${typeBg}; border-color: ${typeBorder}; margin-bottom: 20px;">
      <div class="issue-header" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
        <span class="badge badge-bug" style="background:#6366f1;">${tLabel}</span>
        <span class="badge" style="background: ${sColor};">${issue.severity}</span>
        <h3 style="margin:0;">${escapeHtml(issue.title)}</h3>
      </div>
      <p class="page-url"><strong>Page:</strong> <code>${escapeHtml(issue.pageUrl)}</code></p>
      ${issue.selector ? `<p><strong>Element:</strong> <code>${escapeHtml(issue.selector)}</code></p>` : ''}
      ${issue.notes ? `<div style="margin:8px 0;padding:8px;background:rgba(255,255,255,0.7);border-radius:4px;"><strong>Notes:</strong><p>${escapeHtml(issue.notes)}</p></div>` : ''}
      ${correlationHtml}
      ${errorHtml}
      <p class="timestamp">${new Date(issue.createdAt).toLocaleString()}</p>
      ${screenshotHtml}
    </div>`;
    })
    .join('');

  const clusterHtml = analysis?.clusters?.length
    ? `
  <h2>Duplicate Clusters</h2>
  ${analysis.clusters.map(cluster => `
    <div class="callout callout-warning">
      <div class="callout-body">
        <strong>${escapeHtml(cluster.title)}</strong>
        <div>${cluster.issueIds.length} related issues &middot; ${escapeHtml(cluster.reason)}</div>
      </div>
    </div>
  `).join('')}`
    : '';

  const summaryText = analysis?.executiveSummary || `Generated report for ${issues.length} issue${issues.length === 1 ? '' : 's'}.`;

  return `<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(analysis?.recommendedTitle || 'Sentinel Issue Report')}</title>
  <style>${BASE_STYLES}</style>
</head>
<body>
<div class="page">
  <div class="hero">
    <h1>${escapeHtml(analysis?.recommendedTitle || 'Sentinel Issue Report')}</h1>
    <p class="subtitle">${escapeHtml(summaryText)}</p>
    <p class="meta">Generated on ${new Date().toLocaleString()}</p>
  </div>
  <div class="stats">
    <div class="stat stat-red"><div class="num">${bugs.length}</div><div class="label">Bugs</div></div>
    <div class="stat stat-purple"><div class="num">${features.length}</div><div class="label">Feature Requests</div></div>
    <div class="stat stat-blue"><div class="num">${issues.length}</div><div class="label">Total</div></div>
    ${analysis ? `<div class="stat stat-orange"><div class="num">${analysis.duplicateCount}</div><div class="label">Duplicates</div></div>` : ''}
  </div>
  ${clusterHtml}
  ${cards}
  <footer>Generated by Sentinel Extension</footer>
</div>
</body>
</html>`;
}

// ── Block-based Report Renderer ──

export interface ReportContext {
  issues: Issue[];
  actions: Action[];
  testResults: AssertionResult[];
  testSummary: PlaybackRunSummary | null;
}

export interface ReportBlock {
  type: string;
  [key: string]: unknown;
}

const STAT_COLORS: Record<string, string> = {
  red: 'stat-red', orange: 'stat-orange', yellow: 'stat-yellow',
  green: 'stat-green', blue: 'stat-blue', purple: 'stat-purple',
};

const SEVERITY_CARD: Record<string, string> = {
  critical: 'issue-card-critical', high: 'issue-card-high',
  medium: 'issue-card-medium', low: 'issue-card-low',
};

function renderIssueCard(issue: Issue): string {
  const typeLabel = issue.type === 'bug' ? 'Bug' : 'Feature';
  const typeBadge = issue.type === 'bug' ? 'badge-bug' : 'badge-feature';
  const screenshotHtml = issue.screenshot
    ? `<details class="screenshot-details">
        <summary class="screenshot-thumb">
          <img src="${issue.screenshot}" alt="Screenshot" class="thumb" loading="lazy">
          <span class="thumb-hint">Click to enlarge</span>
        </summary>
        <img src="${issue.screenshot}" alt="Screenshot full" class="full" loading="lazy">
      </details>`
    : '';
  const errorHtml = issue.capturedError
    ? `<div class="error-detail">
        <p><strong>Source:</strong> ${escapeHtml(issue.capturedError.source)}</p>
        <p><strong>Error:</strong> ${escapeHtml(issue.capturedError.message)}</p>
        ${issue.capturedError.url ? `<p><strong>URL:</strong> <code>${escapeHtml(issue.capturedError.url)}</code></p>` : ''}
        ${issue.capturedError.stack ? `<pre class="stack">${escapeHtml(issue.capturedError.stack)}</pre>` : ''}
      </div>`
    : '';
  const correlationHtml = issue.correlatedStepIndices?.length
    ? `<p class="muted"><strong>Related steps:</strong> ${issue.correlatedStepIndices.map(i => `#${i + 1}`).join(', ')}</p>`
    : '';
  return `<div class="issue-card ${SEVERITY_CARD[issue.severity] || ''}">
    <div class="issue-card-header">
      <span class="badge ${typeBadge}">${typeLabel}</span>
      <span class="badge badge-${issue.severity}">${issue.severity}</span>
      <h3>${escapeHtml(issue.title)}</h3>
    </div>
    <p class="issue-card-meta"><strong>Page:</strong> <code>${escapeHtml(issue.pageUrl)}</code></p>
    ${issue.selector ? `<p class="issue-card-meta"><strong>Element:</strong> <code>${escapeHtml(issue.selector)}</code></p>` : ''}
    ${issue.notes ? `<div class="issue-card-notes">${escapeHtml(issue.notes)}</div>` : ''}
    ${correlationHtml}
    ${errorHtml}
    <p class="timestamp">${new Date(issue.createdAt).toLocaleString()}</p>
    ${screenshotHtml}
  </div>`;
}

function renderStepCard(action: Action, index: number): string {
  const desc = action.description || action.type.toUpperCase();
  const screenshotHtml = action.screenshot
    ? `<details class="screenshot-details">
        <summary class="screenshot-thumb">
          <img src="${action.screenshot}" alt="Step ${index + 1}" class="thumb" loading="lazy">
          <span class="thumb-hint">Click to enlarge</span>
        </summary>
        <img src="${action.screenshot}" alt="Step ${index + 1} full" class="full" loading="lazy">
      </details>`
    : '';
  return `<div class="step">
    <div class="step-header">
      <span class="step-num">${index + 1}</span>
      <h3>${escapeHtml(desc)}</h3>
    </div>
    ${action.selector ? `<p class="selector"><strong>Selector:</strong> <code>${escapeHtml(action.selector)}</code></p>` : ''}
    ${action.value ? `<p><strong>Value:</strong> <code>${escapeHtml(action.value)}</code></p>` : ''}
    ${action.url ? `<p class="page-url"><strong>URL:</strong> <code>${escapeHtml(action.url)}</code></p>` : ''}
    ${action.selectorConfidence !== undefined ? `<p class="muted">Confidence: ${Math.round(action.selectorConfidence * 100)}%</p>` : ''}
    <p class="timestamp">${new Date(action.timestamp).toLocaleString()}</p>
    ${screenshotHtml}
  </div>`;
}

function renderTestResultsBlock(results: AssertionResult[], summary: PlaybackRunSummary | null): string {
  if (!summary && results.length === 0) return '<p class="muted">No test results available.</p>';

  let html = '';

  if (summary) {
    const allPassed = summary.failedSteps === 0 && summary.assertionFailCount === 0;
    const durationSec = summary.completedAt && summary.startedAt
      ? ((summary.completedAt - summary.startedAt) / 1000).toFixed(1)
      : null;
    html += `<div class="stats">
      <div class="stat ${allPassed ? 'stat-green' : 'stat-red'}">
        <div class="num">${allPassed ? 'PASS' : 'FAIL'}</div>
        <div class="label">Overall</div>
      </div>
      <div class="stat"><div class="num">${summary.completedSteps}/${summary.totalSteps}</div><div class="label">Steps</div></div>
      <div class="stat stat-red"><div class="num">${summary.failedSteps}</div><div class="label">Failed</div></div>
      <div class="stat stat-blue"><div class="num">${Math.round(summary.averageConfidence * 100)}%</div><div class="label">Confidence</div></div>
      ${summary.recoveredSteps > 0 ? `<div class="stat stat-orange"><div class="num">${summary.recoveredSteps}</div><div class="label">Recovered</div></div>` : ''}
      ${summary.flaky ? '<div class="stat stat-yellow"><div class="num">!</div><div class="label">Flaky</div></div>' : ''}
      ${durationSec ? `<div class="stat"><div class="num">${durationSec}s</div><div class="label">Duration</div></div>` : ''}
    </div>`;

    if (summary.stepMetrics?.some(m => m.warning)) {
      html += '<h3>Step Warnings</h3>';
      for (const m of summary.stepMetrics.filter(m => m.warning)) {
        html += `<div class="callout callout-warning"><span class="callout-icon">⚠️</span><div class="callout-body"><strong>Step ${m.index + 1}</strong> ${escapeHtml(m.warning!)}</div></div>`;
      }
    }
  }

  if (results.length > 0) {
    html += `<table class="table">
      <thead><tr><th>Status</th><th>Assertion</th><th>Expected</th><th>Actual</th><th>Attempts</th></tr></thead>
      <tbody>`;
    for (const r of results) {
      const status = r.passed
        ? '<span class="badge badge-low">PASS</span>'
        : '<span class="badge badge-critical">FAIL</span>';
      html += `<tr>
        <td>${status}</td>
        <td>${escapeHtml(r.assertion.type)}${r.assertion.selector ? ` <code>${escapeHtml(r.assertion.selector)}</code>` : ''}</td>
        <td>${r.assertion.expected ? escapeHtml(r.assertion.expected) : '—'}</td>
        <td>${r.actual ? escapeHtml(r.actual) : r.error ? `<span style="color:#dc2626">${escapeHtml(r.error)}</span>` : '—'}</td>
        <td>${r.attempts ?? 1}</td>
      </tr>`;
    }
    html += '</tbody></table>';
  }

  return html;
}

function renderContextBlock(issue: Issue): string {
  const ctx = issue.context;
  if (!ctx) return '<p class="muted">No runtime context captured for this issue.</p>';

  let html = '';

  if (ctx.networkLog?.length) {
    const failed = ctx.networkLog.filter(e => e.error || (e.status && e.status >= 400));
    const entries = failed.length > 0 ? failed : ctx.networkLog.slice(-10);
    html += `<h3>Network${failed.length > 0 ? ` (${failed.length} failed)` : ''}</h3>`;
    html += `<table class="table">
      <thead><tr><th>Method</th><th>URL</th><th>Status</th><th>Duration</th></tr></thead>
      <tbody>`;
    for (const e of entries) {
      const isFail = e.error || (e.status && e.status >= 400);
      const style = isFail ? ' style="color:#dc2626;font-weight:600"' : '';
      html += `<tr>
        <td><code>${escapeHtml(e.method)}</code></td>
        <td style="word-break:break-all;max-width:400px"><code>${escapeHtml(e.url)}</code></td>
        <td${style}>${e.error ? escapeHtml(e.error) : e.status ?? '—'}</td>
        <td>${e.durationMs !== undefined ? `${e.durationMs}ms` : '—'}</td>
      </tr>`;
    }
    html += '</tbody></table>';
  }

  if (ctx.consoleLog?.length) {
    const errors = ctx.consoleLog.filter(e => e.level === 'error' || e.level === 'warn');
    const entries = errors.length > 0 ? errors : ctx.consoleLog.slice(-10);
    html += `<h3>Console${errors.length > 0 ? ` (${errors.length} errors/warnings)` : ''}</h3>`;
    html += '<div style="margin:8px 0">';
    for (const e of entries) {
      const color = e.level === 'error' ? '#dc2626' : e.level === 'warn' ? '#ca8a04' : '#6b7280';
      html += `<div style="font-size:0.85em;margin:2px 0"><span class="badge" style="background:${color};font-size:0.7em">${e.level.toUpperCase()}</span> <code>${escapeHtml(e.message.slice(0, 200))}</code></div>`;
    }
    html += '</div>';
  }

  if (ctx.capturedErrors?.length) {
    html += '<h3>Captured Errors</h3>';
    for (const err of ctx.capturedErrors) {
      html += `<div class="error-detail">
        <p><strong>${escapeHtml(err.source)}</strong>: ${escapeHtml(err.message)}</p>
        ${err.stack ? `<pre class="stack">${escapeHtml(err.stack.split('\n').slice(0, 5).join('\n'))}</pre>` : ''}
      </div>`;
    }
  }

  return html;
}

function renderBlock(block: ReportBlock, ctx: ReportContext): string {
  switch (block.type) {
    case 'hero': {
      const title = (block.title as string) || '';
      const subtitle = (block.subtitle as string) || '';
      const meta = (block.meta as string) || new Date().toLocaleString();
      return `<div class="hero">
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ''}
        <p class="meta">${escapeHtml(meta)}</p>
      </div>`;
    }

    case 'stats': {
      const items = (block.items as Array<{ label: string; value: string | number; color?: string }>) || [];
      return `<div class="stats">${items.map(item =>
        `<div class="stat ${STAT_COLORS[item.color || ''] || ''}"><div class="num">${escapeHtml(String(item.value))}</div><div class="label">${escapeHtml(item.label)}</div></div>`
      ).join('')}</div>`;
    }

    case 'divider': {
      const label = (block.label as string) || '';
      return label
        ? `<div class="section-divider"><span>${escapeHtml(label)}</span></div>`
        : '<hr class="divider">';
    }

    case 'issue_card': {
      const issueId = block.issue_id as string;
      const issue = ctx.issues.find(i => i.id === issueId);
      if (!issue) return `<p class="muted">Issue ${escapeHtml(issueId)} not found.</p>`;
      return renderIssueCard(issue);
    }

    case 'step_card': {
      const stepIndex = block.step_index as number;
      const action = ctx.actions[stepIndex];
      if (!action) return `<p class="muted">Step ${stepIndex} not found.</p>`;
      return renderStepCard(action, stepIndex);
    }

    case 'test_results':
      return renderTestResultsBlock(ctx.testResults, ctx.testSummary);

    case 'context': {
      const ctxIssueId = block.issue_id as string;
      const ctxIssue = ctx.issues.find(i => i.id === ctxIssueId);
      if (!ctxIssue) return `<p class="muted">Issue ${escapeHtml(ctxIssueId)} not found.</p>`;
      return renderContextBlock(ctxIssue);
    }

    case 'callout': {
      const rawStyle = (block.style as string) || 'note';
      const validStyles = ['note', 'warning', 'tip', 'danger', 'success'];
      const style = validStyles.includes(rawStyle) ? rawStyle : 'note';
      const title = (block.title as string) || '';
      const body = (block.body as string) || '';
      const icons: Record<string, string> = { note: 'ℹ️', warning: '⚠️', tip: '💡', danger: '🚨', success: '✅' };
      return `<div class="callout callout-${style}">
        <span class="callout-icon">${icons[style] || 'ℹ️'}</span>
        <div class="callout-body">${title ? `<strong>${escapeHtml(title)}</strong>` : ''}${escapeHtml(body)}</div>
      </div>`;
    }

    case 'table': {
      const headers = (block.headers as string[]) || [];
      const rows = (block.rows as string[][]) || [];
      return `<table class="table">
        <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(row =>
          `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
        ).join('')}</tbody>
      </table>`;
    }

    case 'checklist': {
      const items = (block.items as Array<{ text: string; status?: string }>) || [];
      return `<ul class="checklist">${items.map(item => {
        const cls = item.status === 'pending' ? ' class="pending"' : item.status === 'warn' ? ' class="warn"' : '';
        return `<li${cls}>${escapeHtml(item.text)}</li>`;
      }).join('')}</ul>`;
    }

    case 'timeline': {
      const events = (block.events as Array<{ time: string; title: string; body?: string }>) || [];
      return `<div class="timeline">${events.map(e =>
        `<div class="timeline-item">
          <div class="tl-time">${escapeHtml(e.time)}</div>
          <div class="tl-title">${escapeHtml(e.title)}</div>
          ${e.body ? `<div class="tl-body">${escapeHtml(e.body)}</div>` : ''}
        </div>`
      ).join('')}</div>`;
    }

    case 'heading':
      return `<h2>${escapeHtml((block.text as string) || '')}</h2>`;

    case 'text':
      return `<p>${escapeHtml((block.content as string) || '')}</p>`;

    case 'html':
      return (block.content as string) || '';

    default:
      return `<!-- unknown block type: ${escapeHtml(block.type)} -->`;
  }
}

export function renderBlockReport(
  title: string,
  blocks: ReportBlock[],
  context: ReportContext,
): string {
  const body = blocks.map(b => renderBlock(b, context)).join('\n');
  return `<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(title)}</title>
  <style>${BASE_STYLES}</style>
</head>
<body>
<div class="page">
${body}
  <footer>Generated by Sentinel Extension</footer>
</div>
</body>
</html>`;
}
