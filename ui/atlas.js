// Figure 4: one row per machine, Λ with its interval on a shared axis.
import { el, linear, size, fmtPct } from './svg.js';

const FAMILY = { ionq: 'Trapped ions', ibm: 'Superconducting', ideal: 'No noise' };

export function renderAtlas(host, runs, currentModel, q = 0.06) {
  host.innerHTML = '';
  const rows = runs.filter((r) => r.ok && Math.abs((r.qs?.[0] ?? -1) - q) < 1e-9 && r.twirl !== false && r.sweeps?.[0]?.fit);
  if (!rows.length) {
    host.innerHTML = '<p class="atlas-empty">No recorded runs yet at this dial setting. Run the experiment and it appears here.</p>';
    return;
  }
  const order = { ionq: 0, ibm: 1, ideal: 2 };
  rows.sort((a, b) => (order[a.profile.family] - order[b.profile.family]) || (b.sweeps[0].fit.lam - a.sweeps[0].fit.lam));
  const head = document.createElement('div');
  head.className = 'atlas-row head';
  head.setAttribute('role', 'row');
  head.innerHTML = '<span role="columnheader">Machine</span><span role="columnheader" class="atlas-bar-cell">Λ with 95% interval</span><span role="columnheader" class="atlas-num">Λ</span><span role="columnheader" class="atlas-num atlas-d3">d = 3 error per round</span>';
  host.appendChild(head);
  for (const run of rows) {
    const fit = run.sweeps[0].fit;
    const d3 = run.sweeps[0].rows.find((x) => x.d === 3);
    const row = document.createElement('div');
    row.className = 'atlas-row' + (run.profile.model === currentModel ? ' you' : '');
    row.setAttribute('role', 'row');
    const name = document.createElement('span');
    name.className = 'atlas-name';
    name.setAttribute('role', 'cell');
    const dot = document.createElement('span');
    dot.className = 'machine-dot ' + (run.profile.family === 'ionq' ? '' : run.profile.family);
    dot.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.innerHTML = `${escape(shortName(run.profile.label))}<small>${FAMILY[run.profile.family] || ''}${run.profile.model === currentModel ? ' · your machine' : ''}</small>`;
    name.append(dot, label);
    const barCell = document.createElement('span');
    barCell.className = 'atlas-bar-cell';
    barCell.setAttribute('role', 'cell');
    barCell.appendChild(bar(fit));
    const lam = document.createElement('span');
    lam.className = 'atlas-num';
    lam.setAttribute('role', 'cell');
    lam.textContent = fit.lam.toFixed(2);
    const e3 = document.createElement('span');
    e3.className = 'atlas-num atlas-d3';
    e3.setAttribute('role', 'cell');
    e3.textContent = d3 ? fmtPct(d3.eps_mwpm) : '—';
    row.append(name, barCell, lam, e3);
    host.appendChild(row);
  }
}

function bar(fit) {
  const svg = el('svg', { class: 'atlas-bar', role: 'presentation' });
  const w = 300, h = 22;
  size(svg, w, h);
  svg.setAttribute('preserveAspectRatio', 'none');
  const x = linear(0.5, 4.5, 6, w - 6);
  el('line', { x1: x(0.5), x2: x(4.5), y1: 11, y2: 11, stroke: 'var(--line-soft)', 'stroke-width': 2 }, svg);
  for (const v of [1, 2, 3, 4]) el('line', { x1: x(v), x2: x(v), y1: 6, y2: 16, stroke: v === 1 ? 'var(--fail)' : 'var(--line)' }, svg);
  el('line', { x1: x(2.14), x2: x(2.14), y1: 3, y2: 19, stroke: 'var(--ink-3)', 'stroke-dasharray': '2 2' }, svg);
  if (fit.lo && fit.hi) el('rect', { x: x(Math.max(0.5, fit.lo)), y: 7, width: Math.max(2, x(Math.min(4.5, fit.hi)) - x(Math.max(0.5, fit.lo))), height: 8, rx: 4, fill: 'rgba(159,182,255,.35)' }, svg);
  el('circle', { cx: x(Math.min(4.45, Math.max(0.55, fit.lam))), cy: 11, r: 4.5, fill: 'var(--glow)' }, svg);
  return svg;
}

export function shortName(label) {
  return String(label || '').replace(' noise model', '').replace('(hardware)', '· hardware');
}

function escape(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
