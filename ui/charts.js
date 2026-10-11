// Figures 1, 3 and 5, and the Λ ruler. Hand-built SVG.
import { el, clear, linear, log10, logTicks, fmtPct, fmtSci, size } from './svg.js';

const W = 640, H = 360, M = { l: 62, r: 22, t: 18, b: 46 };

function frame(svg, w = W, h = H) {
  clear(svg);
  size(svg, w, h);
  return { x0: M.l, x1: w - M.r, y0: h - M.b, y1: M.t };
}

function yAxisLog(svg, f, y, lo, hi, label) {
  const g = el('g', { class: 'grid' }, svg);
  for (const t of logTicks(lo, hi)) {
    const yy = y(t.v);
    el('line', { x1: f.x0, x2: f.x1, y1: yy, y2: yy, opacity: t.major ? 1 : 0.5 }, g);
    el('text', { x: f.x0 - 8, y: yy + 4, 'text-anchor': 'end', text: fmtSci(t.v) }, svg);
  }
  el('text', { class: 'axis-title', x: 14, y: (f.y0 + f.y1) / 2, transform: `rotate(-90 14 ${(f.y0 + f.y1) / 2})`, 'text-anchor': 'middle', text: label }, svg);
}

function bounds(vals, pad = 2.2) {
  const v = vals.filter((x) => Number.isFinite(x) && x > 0);
  if (!v.length) return [1e-4, 1e-1];
  let lo = Math.min(...v) / pad, hi = Math.max(...v) * pad;
  lo = 10 ** Math.floor(Math.log10(lo));
  hi = Math.min(1, 10 ** Math.ceil(Math.log10(hi)));
  if (hi / lo < 100) lo = hi / 100;
  return [lo, hi];
}

// Figure 1: logical error per round against distance.
export function renderEps(svg, sweep, theoryRows) {
  const f = frame(svg);
  const rows = sweep.rows;
  const ds = rows.map((r) => r.d);
  const all = [];
  rows.forEach((r) => {
    all.push(r.eps_mwpm, r.eps_major, r.eps_mwpm_hi, r.eps_mwpm_lo || r.eps_mwpm / 3);
    if (r.zero_mwpm) all.push(0.5 * 3 / r.shots / 2);
  });
  (theoryRows || []).forEach((t) => all.push(t.eps_mwpm));
  const [lo, hi] = bounds(all);
  const x = linear(2, 10, f.x0, f.x1);
  const y = log10(lo, hi, f.y0, f.y1);
  yAxisLog(svg, f, y, lo, hi, 'Logical error per round');
  for (const d of [3, 5, 7, 9]) {
    el('text', { x: x(d), y: f.y0 + 20, 'text-anchor': 'middle', text: `d = ${d}` }, svg);
    el('line', { class: 'axis-line', x1: x(d), x2: x(d), y1: f.y0, y2: f.y0 + 5 }, svg);
  }
  el('line', { class: 'axis-line', x1: f.x0, x2: f.x1, y1: f.y0, y2: f.y0 }, svg);
  el('text', { class: 'axis-title', x: (f.x0 + f.x1) / 2, y: f.y0 + 40, 'text-anchor': 'middle', text: 'Code distance (data qubits)' }, svg);

  // prediction
  const th = (theoryRows || []).filter((t) => ds.includes(t.d) && t.eps_mwpm > 0);
  if (th.length > 1) {
    el('path', { d: th.map((t, i) => `${i ? 'L' : 'M'}${x(t.d)},${y(t.eps_mwpm)}`).join(''), fill: 'none', stroke: 'var(--ink-3)', 'stroke-width': 1.4, 'stroke-dasharray': '5 5' }, svg);
    const last = th[th.length - 1];
    el('text', { x: x(last.d) + 8, y: y(last.eps_mwpm) + 4, text: 'model', fill: 'var(--ink-3)' }, svg);
  }
  // majority vote: open circles
  const maj = rows.filter((r) => r.eps_major > 0);
  if (maj.length > 1) el('path', { d: maj.map((r, i) => `${i ? 'L' : 'M'}${x(r.d) + 6},${y(r.eps_major)}`).join(''), fill: 'none', stroke: 'var(--ink-3)', 'stroke-width': 1 }, svg);
  for (const r of maj) el('circle', { cx: x(r.d) + 6, cy: y(r.eps_major), r: 4.5, fill: 'var(--void)', stroke: 'var(--ink-2)', 'stroke-width': 1.5 }, svg);
  // matching: filled, glowing, with 95% intervals
  const mw = rows.filter((r) => r.eps_mwpm > 0);
  if (mw.length > 1) el('path', { d: mw.map((r, i) => `${i ? 'L' : 'M'}${x(r.d) - 6},${y(r.eps_mwpm)}`).join(''), fill: 'none', stroke: 'var(--glow-2)', 'stroke-width': 2 }, svg);
  for (const r of rows) {
    const cx = x(r.d) - 6;
    if (r.eps_mwpm > 0) {
      const a = y(Math.max(r.eps_mwpm_lo, lo)), b = y(Math.min(r.eps_mwpm_hi, hi));
      el('line', { x1: cx, x2: cx, y1: a, y2: b, stroke: 'var(--glow)', 'stroke-width': 1.5 }, svg);
      el('line', { x1: cx - 4, x2: cx + 4, y1: a, y2: a, stroke: 'var(--glow)', 'stroke-width': 1.5 }, svg);
      el('line', { x1: cx - 4, x2: cx + 4, y1: b, y2: b, stroke: 'var(--glow)', 'stroke-width': 1.5 }, svg);
      el('circle', { cx, cy: y(r.eps_mwpm), r: 5.5, fill: 'var(--glow)', style: 'filter: drop-shadow(0 0 5px rgba(159,182,255,.8))' }, svg);
    } else {
      // no failures: an upper bound (rule of three)
      const ub = r.eps_mwpm_hi;
      el('path', { d: `M${cx - 5},${y(ub) - 6} L${cx + 5},${y(ub) - 6} L${cx},${y(ub) + 3} Z`, fill: 'var(--glow)' }, svg);
      el('text', { x: cx + 9, y: y(ub) + 2, text: 'no failures' }, svg);
    }
  }
  // legend
  const lg = el('g', { transform: `translate(${f.x1 - 170}, ${f.y1 + 6})` }, svg);
  el('circle', { cx: 6, cy: 6, r: 5, fill: 'var(--glow)' }, lg);
  el('text', { x: 18, y: 10, text: 'Matching decoder' }, lg);
  el('circle', { cx: 6, cy: 26, r: 4.5, fill: 'var(--void)', stroke: 'var(--ink-2)', 'stroke-width': 1.5 }, lg);
  el('text', { x: 18, y: 30, text: 'Majority vote' }, lg);
  el('line', { x1: 0, x2: 12, y1: 46, y2: 46, stroke: 'var(--ink-3)', 'stroke-dasharray': '4 3', 'stroke-width': 1.4 }, lg);
  el('text', { x: 18, y: 50, text: 'Prediction' }, lg);
}

// The Λ ruler: your value among the published ones.
export function renderRuler(host, fit, refs = RULER_REFS) {
  host.innerHTML = '';
  const svg = el('svg', { class: 'chart', role: 'presentation' });
  host.appendChild(svg);
  const w = 320, h = 92;
  size(svg, w, h);
  const x = linear(0.5, 4.5, 14, w - 14);
  el('line', { x1: x(0.5), x2: x(4.5), y1: 44, y2: 44, stroke: 'var(--line)', 'stroke-width': 2 }, svg);
  el('rect', { x: x(0.5), y: 40, width: x(1) - x(0.5), height: 8, fill: 'rgba(255,122,114,.25)' }, svg);
  el('text', { x: x(0.5), y: 66, text: 'above', fill: 'var(--fail)' }, svg);
  el('text', { x: x(0.5), y: 79, text: 'threshold', fill: 'var(--fail)' }, svg);
  for (const v of [2, 3, 4]) {
    el('line', { x1: x(v), x2: x(v), y1: 40, y2: 48, stroke: 'var(--ink-3)' }, svg);
    el('text', { x: x(v), y: 62, 'text-anchor': 'middle', text: v }, svg);
  }
  refs.forEach((r, i) => {
    el('line', { x1: x(r.v), x2: x(r.v), y1: 30, y2: 44, stroke: 'var(--ink-2)', 'stroke-width': 1.2 }, svg);
    el('text', { x: x(r.v), y: 24 - (i % 2) * 12, 'text-anchor': 'middle', text: r.label, fill: 'var(--ink-2)' }, svg);
  });
  if (fit && Number.isFinite(fit.lam)) {
    const v = Math.min(4.4, Math.max(0.55, fit.lam));
    if (fit.lo && fit.hi) el('rect', { x: x(Math.max(0.5, fit.lo)), y: 39, width: Math.max(2, x(Math.min(4.5, fit.hi)) - x(Math.max(0.5, fit.lo))), height: 10, rx: 5, fill: 'rgba(159,182,255,.35)' }, svg);
    el('circle', { cx: x(v), cy: 44, r: 7, fill: 'var(--glow)', style: 'filter: drop-shadow(0 0 6px rgba(159,182,255,.9))' }, svg);
    el('text', { x: x(v), y: 84, 'text-anchor': 'middle', text: `you, ${fit.lam.toFixed(2)}`, fill: 'var(--glow)', 'font-weight': 600 }, svg);
  }
}

export const RULER_REFS = [
  { v: 2.14, label: 'Willow 2024' },
  { v: 2.99, label: 'Google 2021' },
];

// Figure 3: the threshold, from the r = d prediction.
export function renderThreshold(svg, square, q) {
  const f = frame(svg);
  const rows = square || [];
  const qs = [...new Set(rows.map((r) => r.q))].sort((a, b) => a - b);
  const x = linear(0, Math.max(0.2, ...qs), f.x0, f.x1);
  const vals = rows.map((r) => r.P_mwpm).filter((v) => v > 0);
  const lo = 1e-4, hi = 1;
  const y = log10(lo, hi, f.y0, f.y1);
  yAxisLog(svg, f, y, lo, hi, 'Chance the memory fails');
  for (let t = 0; t <= 0.2001; t += 0.04) {
    el('text', { x: x(t), y: f.y0 + 20, 'text-anchor': 'middle', text: `${Math.round(t * 100)}%` }, svg);
    el('line', { class: 'axis-line', x1: x(t), x2: x(t), y1: f.y0, y2: f.y0 + 5 }, svg);
  }
  el('line', { class: 'axis-line', x1: f.x0, x2: f.x1, y1: f.y0, y2: f.y0 }, svg);
  el('text', { class: 'axis-title', x: (f.x0 + f.x1) / 2, y: f.y0 + 40, 'text-anchor': 'middle', text: 'Noise dial: flip chance per qubit per step' }, svg);

  const cross = crossing(rows);
  if (cross) {
    el('rect', { x: x(cross), y: f.y1, width: f.x1 - x(cross), height: f.y0 - f.y1, fill: 'rgba(255,122,114,.07)' }, svg);
    el('line', { x1: x(cross), x2: x(cross), y1: f.y1, y2: f.y0, stroke: 'var(--fail)', 'stroke-dasharray': '3 4' }, svg);
    el('text', { x: x(cross) + 6, y: f.y1 + 14, text: `threshold ≈ ${(cross * 100).toFixed(0)}%`, fill: 'var(--fail)' }, svg);
  }
  const colors = { 3: '#7d8db0', 5: '#8aa1d6', 7: 'var(--glow)' };
  for (const d of [3, 5, 7]) {
    const pts = rows.filter((r) => r.d === d && r.P_mwpm > 0).sort((a, b) => a.q - b.q);
    if (pts.length < 2) continue;
    el('path', { d: pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.q)},${y(p.P_mwpm)}`).join(''), fill: 'none', stroke: colors[d], 'stroke-width': d === 7 ? 2.4 : 1.8 }, svg);
    const first = pts[0];
    el('text', { x: x(first.q) - 6, y: y(first.P_mwpm) + 4, 'text-anchor': 'end', text: `d=${d}`, fill: colors[d] }, svg);
  }
  if (Number.isFinite(q)) {
    el('line', { x1: x(q), x2: x(q), y1: f.y1, y2: f.y0, stroke: 'var(--event)', 'stroke-width': 1.5 }, svg);
    el('text', { x: x(q) + 6, y: f.y0 - 8, text: 'your dial', fill: 'var(--event)' }, svg);
  }
  return cross;
}

// Where the d = 3 and d = 7 curves meet, by linear interpolation in q.
export function crossing(rows) {
  const by = (d) => rows.filter((r) => r.d === d).sort((a, b) => a.q - b.q);
  const a = by(3), b = by(7);
  for (let i = 1; i < a.length && i < b.length; i++) {
    const g0 = b[i - 1].P_mwpm - a[i - 1].P_mwpm, g1 = b[i].P_mwpm - a[i].P_mwpm;
    if (g0 < 0 && g1 >= 0) return a[i - 1].q + (a[i].q - a[i - 1].q) * (-g0 / (g1 - g0));
  }
  return null;
}

// Figure 7: coherent vs twirled at every distance, log scale, with the ratio.
export function renderTwirl(svg, groups) {
  const w = 620, h = 330;
  const f = frame(svg, w, h);
  const vals = groups.flatMap((g) => [g.coh, g.tw]).filter((v) => v > 0);
  const [lo, hi] = bounds(vals, 1.8);
  const y = log10(lo, hi, f.y0, f.y1);
  yAxisLog(svg, f, y, lo, hi, 'Logical error per shot');
  const gw = (f.x1 - f.x0) / groups.length;
  const bw = Math.min(40, gw / 3.4);
  groups.forEach((g, i) => {
    const cx = f.x0 + gw * i + gw / 2;
    [[g.coh, 'var(--event)', -1], [g.tw, 'var(--glow)', 1]].forEach(([v, c, side]) => {
      if (!(v > 0)) return;
      const x = cx + side * (bw / 2 + 3) - bw / 2;
      el('rect', { x, y: y(v), width: bw, height: Math.max(1, f.y0 - y(v)), rx: 3, fill: c }, svg);
    });
    if (g.coh > 0 && g.tw > 0) {
      el('text', { x: cx, y: Math.min(y(g.coh), y(g.tw)) - 10, 'text-anchor': 'middle', text: `${(g.coh / g.tw).toFixed(1)}×`, fill: 'var(--ink)', 'font-weight': 600 }, svg);
    }
    el('text', { x: cx, y: f.y0 + 20, 'text-anchor': 'middle', text: `d = ${g.d}`, fill: 'var(--ink-2)' }, svg);
  });
  const lg = el('g', { transform: `translate(${f.x0 + 6}, ${f.y1 + 4})` }, svg);
  [['Every rotation the same way', 'var(--event)'], ['Twirled', 'var(--glow)']].forEach(([t, c], i) => {
    el('rect', { x: i * 220, y: 0, width: 11, height: 11, rx: 2, fill: c }, lg);
    el('text', { x: i * 220 + 17, y: 10, text: t }, lg);
  });
}

// Figure 4: error mechanisms by kind, dial-only vs learned vs assumed.
export const KIND_LABEL = {
  space: ['Data qubit flips', 'neighbouring checks, same round'],
  time: ['Faulty checks', 'same check, next round'],
  boundary: ['Flips at the ends', 'one check and the edge'],
  diagonal: ['Flips mid-round', 'diagonal, from gate errors'],
};

export function renderCal(svg, cal) {
  const kinds = ['space', 'time', 'boundary', 'diagonal'].filter((k) => cal.kinds.learned[k] !== undefined);
  const narrow = (svg.parentElement ? svg.parentElement.getBoundingClientRect().width : 600) < 520;
  const w = 620, rowH = narrow ? 96 : 58, h = 30 + kinds.length * rowH + 34;
  clear(svg);
  size(svg, w, h);
  const vals = kinds.flatMap((k) => [cal.kinds.learned[k], cal.kinds.prior[k] || 0, (cal.kinds.dial || {})[k] || 0]);
  const hi = Math.max(0.02, ...vals) * 1.18;
  const x0 = narrow ? 4 : 210, x1 = w - (narrow ? 110 : 60);
  const x = linear(0, hi, x0, x1);
  for (let t = 0; t <= hi + 1e-9; t += hi > 0.06 ? 0.02 : 0.01) {
    el('line', { x1: x(t), x2: x(t), y1: 18, y2: h - 30, stroke: 'var(--line-soft)' }, svg);
    el('text', { x: x(t), y: h - 8, 'text-anchor': 'middle', text: fmtPct(t) }, svg);
  }
  kinds.forEach((k, i) => {
    const y0 = 30 + i * rowH;
    const [a, b] = KIND_LABEL[k];
    let y = y0;
    if (narrow) {
      el('text', { x: 4, y: y0 + 4, text: a, fill: 'var(--ink)' }, svg);
      y = y0 + 22;
    } else {
      el('text', { x: 0, y: y0 + 14, text: a, fill: 'var(--ink)', 'font-size': 13 }, svg);
      el('text', { x: 0, y: y0 + 31, text: b }, svg);
    }
    const dial = (cal.kinds.dial || {})[k] || 0;
    const lv = cal.kinds.learned[k];
    const pv = cal.kinds.prior[k] || 0;
    const bh = narrow ? 34 : 22;
    el('rect', { x: x0, y: y + 4, width: Math.max(1, x(lv) - x0), height: bh, rx: 3, fill: 'var(--glow)', opacity: 0.85 }, svg);
    if (dial > 0) el('rect', { x: x0, y: y + 1, width: Math.max(1, x(dial) - x0), height: bh + 6, rx: 3, fill: 'none', stroke: 'var(--event)', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, svg);
    el('line', { x1: x(pv), x2: x(pv), y1: y - 2, y2: y + bh + 10, stroke: 'var(--ink-2)', 'stroke-width': 2 }, svg);
    el('text', { x: Math.max(x(lv), x(pv), x(dial)) + 8, y: y + 4 + bh * 0.7, text: fmtPct(lv), fill: 'var(--ink)' }, svg);
  });
}
