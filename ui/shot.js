// Figure 2: one measured shot as an ion-camera frame, and its decoding graph.
import { el, clear, size, reduceMotion } from './svg.js';

// ------------------------------------------------------------------ camera

export class Camera {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.shot = null;
    this.meta = null;
    this.sweep = 1;
    this.raf = 0;
    this.resize = this.resize.bind(this);
    if (typeof ResizeObserver === 'function') new ResizeObserver(this.resize).observe(canvas);
    else addEventListener('resize', this.resize);
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(280, r.width);
    this.h = Math.max(100, r.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  show(shot, meta) {
    this.shot = shot;
    this.meta = meta;
    cancelAnimationFrame(this.raf);
    if (reduceMotion()) {
      this.sweep = 1;
      this.draw();
      return;
    }
    const t0 = performance.now();
    const step = (now) => {
      this.sweep = Math.min(1, (now - t0) / 900);
      this.draw();
      if (this.sweep < 1) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  // Ions in a harmonic trap sit closer together in the middle of the chain.
  positions(n) {
    const a = 0.16, out = [];
    for (let k = 0; k < n; k++) {
      const u = n === 1 ? 0 : (k - (n - 1) / 2) / ((n - 1) / 2);
      out.push(u * (1 - a) + a * u * u * u);
    }
    return out;
  }

  draw() {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#04060a');
    bg.addColorStop(0.5, '#070a11');
    bg.addColorStop(1, '#04060a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // trap electrodes, out of focus
    ctx.fillStyle = 'rgba(120,140,180,0.05)';
    ctx.fillRect(0, h * 0.12, w, 6);
    ctx.fillRect(0, h * 0.62, w, 6);
    if (!this.shot || !this.meta) {
      ctx.fillStyle = '#5c6678';
      ctx.font = '13px "Public Sans", system-ui, sans-serif';
      ctx.fillText('Waiting for shots…', 16, h / 2);
      return;
    }
    const { d, r } = this.meta;
    const bits = this.shot.bits.split('').map(Number);
    const n = bits.length;
    const pos = this.positions(n);
    const pad = 26, cy = h * 0.4;
    const X = (u) => pad + ((u + 1) / 2) * (w - 2 * pad);
    const spacing = (w - 2 * pad) / Math.max(1, n - 1);
    const rad = Math.max(5, Math.min(13, spacing * 0.42));
    const sweepX = pad + this.sweep * (w - 2 * pad + 40) - 20;

    // groups: data first, then the ancillas of each round
    const groups = [{ from: 0, to: d - 1, label: 'data' }];
    for (let t = 0; t < r; t++) groups.push({ from: d + t * (d - 1), to: d + (t + 1) * (d - 1) - 1, label: `round ${t + 1} checks` });

    for (let k = 0; k < n; k++) {
      const x = X(pos[k]);
      const lit = bits[k] === 1 && x <= sweepX;
      const isData = k < d;
      if (lit) {
        const g = ctx.createRadialGradient(x, cy, 0, x, cy, rad * 2.6);
        g.addColorStop(0, isData ? 'rgba(232,238,255,1)' : 'rgba(214,236,255,1)');
        g.addColorStop(0.18, isData ? 'rgba(170,190,255,0.95)' : 'rgba(140,210,255,0.9)');
        g.addColorStop(0.5, isData ? 'rgba(109,140,255,0.35)' : 'rgba(90,170,240,0.3)');
        g.addColorStop(1, 'rgba(60,80,200,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, cy, rad * 2.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // a dark ion is invisible on a real camera; a faint ring marks its place
        ctx.strokeStyle = 'rgba(120,135,165,0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, cy, rad * 0.45, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // the readout laser sweeping across
    if (this.sweep < 1) {
      const lg = ctx.createLinearGradient(sweepX - 30, 0, sweepX + 4, 0);
      lg.addColorStop(0, 'rgba(159,182,255,0)');
      lg.addColorStop(1, 'rgba(159,182,255,0.22)');
      ctx.fillStyle = lg;
      ctx.fillRect(sweepX - 30, 0, 34, h);
    }
    // group brackets and labels
    ctx.font = '11.5px "Public Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const gr of groups) {
      const a = X(pos[gr.from]) - rad * 0.8, b = X(pos[gr.to]) + rad * 0.8;
      const y = h * 0.74;
      ctx.strokeStyle = gr.label === 'data' ? 'rgba(159,182,255,0.55)' : 'rgba(125,136,155,0.5)';
      ctx.beginPath();
      ctx.moveTo(a, y - 5); ctx.lineTo(a, y); ctx.lineTo(b, y); ctx.lineTo(b, y - 5);
      ctx.stroke();
      ctx.fillStyle = gr.label === 'data' ? '#b8c8ff' : '#8a94a7';
      if (b - a > 40) ctx.fillText(gr.label, (a + b) / 2, y + 16);
    }
    ctx.textAlign = 'left';
  }
}

// ------------------------------------------------------------- the graph

export function renderGraph(svg, graph, shot, opts = {}) {
  clear(svg);
  const { d, r } = graph;
  const C = d - 1, L = r + 1;
  const w = 620, h = 70 + L * 64;
  size(svg, w, h);
  const left = 70, right = w - 40, top = 54;
  const colW = (right - left) / C;
  const X = (i) => left + colW * (i + 0.5);
  const Y = (t) => top + 26 + t * 64;
  const node = (k) => ({ x: X(k % C), y: Y(Math.floor(k / C)), i: k % C, t: Math.floor(k / C) });
  const B = graph.nodes;

  // data qubits along the top, between the checks that read them
  const bits = shot ? shot.bits.split('').map(Number) : null;
  for (let j = 0; j < d; j++) {
    const x = left + colW * j;
    el('line', { x1: x, x2: x, y1: top - 6, y2: Y(r) + 18, stroke: 'var(--line-soft)', 'stroke-dasharray': '1 5' }, svg);
    const v = bits ? bits[j] : 0;
    el('circle', { cx: x, cy: top - 22, r: 7, fill: v ? 'var(--glow)' : 'var(--panel-2)', stroke: v ? '#dfe7ff' : 'var(--line)', 'stroke-width': 1.2 }, svg);
    el('text', { x, y: top - 38, 'text-anchor': 'middle', text: `q${j}` }, svg);
  }
  el('text', { x: 6, y: top - 18, text: 'final data', class: 'row-label' }, svg);
  // boundary rails
  el('line', { class: 'boundary', x1: left - 18, x2: left - 18, y1: Y(0) - 18, y2: Y(r) + 18 }, svg);
  el('line', { class: 'boundary', x1: right + 18, x2: right + 18, y1: Y(0) - 18, y2: Y(r) + 18 }, svg);
  for (let t = 0; t <= r; t++) el('text', { class: 'row-label', x: 6, y: Y(t) + 4, text: t < r ? `round ${t + 1}` : 'final' }, svg);

  // every edge of the decoding graph, faintly
  for (const [u, v, kind] of graph.edges) {
    const a = node(u);
    if (v === B) {
      const bx = a.i < C / 2 ? left - 18 : right + 18;
      el('line', { class: 'edge', x1: a.x, y1: a.y, x2: bx, y2: a.y }, svg);
    } else {
      const b = node(v);
      el('line', { class: 'edge', x1: a.x, y1: a.y, x2: b.x, y2: b.y }, svg);
    }
  }
  // matched paths
  const fired = new Set(shot ? shot.fired : []);
  if (shot) {
    for (const [a, b, path] of shot.pairs) {
      const pts = [];
      let lastInner = null;
      for (const k of path) {
        if (k === B) {
          const ref = lastInner ?? node(a);
          pts.push({ x: ref.i < C / 2 ? left - 18 : right + 18, y: ref.y });
        } else {
          const p = node(k);
          lastInner = p;
          pts.push(p);
        }
      }
      if (pts.length < 2) continue;
      const dstr = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join('');
      const path_ = el('path', { class: 'match', d: dstr }, svg);
      if (!reduceMotion() && opts.animate !== false) {
        const len = path_.getTotalLength ? path_.getTotalLength() : 200;
        path_.style.strokeDasharray = `${len}`;
        path_.style.strokeDashoffset = `${len}`;
        path_.style.transition = 'stroke-dashoffset .7s ease .5s';
        requestAnimationFrame(() => requestAnimationFrame(() => { path_.style.strokeDashoffset = '0'; }));
      }
    }
  }
  for (let k = 0; k < B; k++) {
    const p = node(k);
    el('circle', { class: fired.has(k) ? 'node lit' : 'node', cx: p.x, cy: p.y, r: fired.has(k) ? 7 : 5 }, svg);
  }
}

// Plain-language reading of one shot.
export function describeShot(shot) {
  const prep = shot.logical;
  const majOut = shot.major_ok ? prep : 1 - prep;
  const mwOut = shot.mwpm_ok ? prep : 1 - prep;
  const ev = shot.fired.length;
  let say;
  if (ev === 0) say = 'No check changed in any round: nothing to correct, and both decoders read the stored bit.';
  else if (shot.mwpm_ok && !shot.major_ok) say = `Most of the data qubits ended up flipped, so a vote reads the wrong bit. The matching decoder used the ${ev} detection events to trace the flips through time and undid them.`;
  else if (!shot.mwpm_ok && shot.major_ok) say = `A rare case: the most likely explanation of these ${ev} events was the wrong one, while the final vote happened to land right.`;
  else if (!shot.mwpm_ok) say = `Too many flips for this distance: the most likely explanation of these ${ev} events points the wrong way. This is a logical error.`;
  else say = `${ev} detection event${ev === 1 ? '' : 's'}, explained by the shortest chains of flips. The stored bit survives.`;
  return { prep, majOut, mwOut, say };
}
