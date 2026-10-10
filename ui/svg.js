// Small SVG helpers: scales, axes and elements, no dependencies.

const NS = 'http://www.w3.org/2000/svg';

export function el(name, attrs = {}, parent) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  if (parent) parent.appendChild(node);
  return node;
}

export function clear(svg) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

export function linear(d0, d1, r0, r1) {
  const f = (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
  f.invert = (p) => d0 + ((p - r0) / (r1 - r0 || 1)) * (d1 - d0);
  return f;
}

export function log10(d0, d1, r0, r1) {
  const a = Math.log10(d0), b = Math.log10(d1);
  const f = (v) => r0 + ((Math.log10(Math.max(v, 1e-12)) - a) / (b - a || 1)) * (r1 - r0);
  return f;
}

// Decade ticks (1e-4, 1e-3 …) plus 2× and 5× marks when the range is short.
export function logTicks(lo, hi) {
  const out = [];
  const a = Math.floor(Math.log10(lo)), b = Math.ceil(Math.log10(hi));
  const short = b - a <= 2;
  for (let e = a; e <= b; e++) {
    for (const m of short ? [1, 2, 5] : [1]) {
      const v = m * 10 ** e;
      if (v >= lo * 0.999 && v <= hi * 1.001) out.push({ v, major: m === 1 });
    }
  }
  return out;
}

export function fmtPct(v, digits = 2) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (v === 0) return '0%';
  const p = v * 100;
  if (p >= 10) return p.toFixed(0) + '%';
  if (p >= 1) return p.toFixed(1) + '%';
  if (p >= 0.1) return p.toFixed(2) + '%';
  return p.toPrecision(digits) + '%';
}

export function fmtSci(v) {
  if (!Number.isFinite(v) || v <= 0) return '0';
  const e = Math.floor(Math.log10(v));
  if (e >= -4) {
    const p = v * 100;
    return (p >= 1 ? p.toFixed(0) : p >= 0.1 ? p.toFixed(1) : p >= 0.01 ? p.toFixed(2) : p.toFixed(3)) + '%';
  }
  const m = v / 10 ** e;
  return `${m.toFixed(1)}×10${sup(e)}`;
}

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export function sup(n) {
  return String(n).split('').map((c) => SUP[c] ?? c).join('');
}

export function size(svg, w, h) {
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
}

export const reduceMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
