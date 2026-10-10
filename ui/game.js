// "Be the decoder": pair up detection events yourself, then compare with the
// matching decoder and with what really happened.
import { el, clear, size } from './svg.js';

export class Game {
  constructor(svg, ui, data) {
    this.svg = svg;
    this.ui = ui;
    this.data = data;
    this.i = 0;
    this.pairs = [];
    this.sel = null;
    this.checked = false;
    this.score = { you: 0, mwpm: 0, done: 0 };
    ui.undo.addEventListener('click', () => this.undo());
    ui.check.addEventListener('click', () => this.check());
    ui.next.addEventListener('click', () => this.next());
    this.draw();
  }

  get p() { return this.data.puzzles[this.i % this.data.puzzles.length]; }

  open() {
    const used = new Set(this.pairs.flat().filter((k) => k !== this.data.boundary));
    return this.p.fired.filter((k) => !used.has(k));
  }

  pick(k) {
    if (this.checked) return;
    const B = this.data.boundary;
    if (k === B) {
      if (this.sel === null) { this.say('Pick a lit node first, then the edge it should run to.'); return; }
      this.pairs.push([this.sel, B]);
      this.sel = null;
    } else if (this.sel === null) {
      this.sel = k;
    } else if (this.sel === k) {
      this.sel = null;
    } else {
      this.pairs.push([this.sel, k]);
      this.sel = null;
    }
    this.draw();
  }

  undo() {
    if (this.checked) return;
    if (this.sel !== null) this.sel = null;
    else this.pairs.pop();
    this.draw();
  }

  check() {
    if (this.checked || this.open().length) return;
    const par = this.data.par;
    let flip = 0;
    for (const [a, b] of this.pairs) flip ^= par[a][b];
    const p = this.p;
    this.youOk = flip === p.obs;
    this.mwOk = p.mwpm.flip === p.obs;
    this.score.done += 1;
    this.score.you += this.youOk ? 1 : 0;
    this.score.mwpm += this.mwOk ? 1 : 0;
    this.checked = true;
    this.draw();
  }

  next() {
    this.i += 1;
    this.pairs = [];
    this.sel = null;
    this.checked = false;
    this.draw();
  }

  say(text) { this.ui.say.textContent = text; }

  draw() {
    const { d, r, boundary: B } = this.data;
    const p = this.p;
    const svg = this.svg;
    clear(svg);
    const C = d - 1, L = r + 1;
    const w = 560, h = 60 + L * 78;
    size(svg, w, h);
    const left = 92, right = w - 92, top = 40;
    const colW = (right - left) / C;
    const X = (i) => left + colW * (i + 0.5);
    const Y = (t) => top + t * 78;
    const node = (k) => ({ x: X(k % C), y: Y(Math.floor(k / C)), i: k % C });
    const railL = left - 34, railR = right + 34;
    const fired = new Set(p.fired);
    const open = new Set(this.open());

    for (let t = 0; t <= r; t++) el('text', { x: 4, y: Y(t) + 4, text: t < r ? `round ${t + 1}` : 'final', class: 'row-label' }, svg);
    // rails: the two ends of the code, where a chain of flips can leave
    for (const [x, label] of [[railL, 'left edge'], [railR, 'right edge']]) {
      const g = el('g', { class: 'rail', tabindex: this.checked ? -1 : 0, role: 'button', 'aria-label': `Send the selected event to the ${label}` }, svg);
      el('rect', { x: x - 10, y: Y(0) - 22, width: 20, height: Y(r) - Y(0) + 44, rx: 10, fill: this.sel !== null && !this.checked ? 'rgba(243,182,94,.12)' : 'transparent', stroke: 'var(--line)', 'stroke-dasharray': '3 4' }, g);
      el('text', { x, y: Y(r) + 40, 'text-anchor': 'middle', text: label }, g);
      this.bind(g, B);
    }
    // faint graph edges
    for (const [u, v] of this.data.graph.edges) {
      const a = node(u);
      if (v === B) el('line', { class: 'edge', x1: a.x, y1: a.y, x2: a.i < C / 2 ? railL : railR, y2: a.y }, svg);
      else { const b = node(v); el('line', { class: 'edge', x1: a.x, y1: a.y, x2: b.x, y2: b.y }, svg); }
    }
    const seg = (a, b, cls, sideFrom) => {
      const A = node(a);
      if (b === B) {
        const ref = sideFrom ?? A;
        return el('line', { class: cls, x1: A.x, y1: A.y, x2: ref.i < C / 2 ? railL : railR, y2: A.y }, svg);
      }
      const Bn = node(b);
      return el('line', { class: cls, x1: A.x, y1: A.y, x2: Bn.x, y2: Bn.y }, svg);
    };
    for (const [a, b] of this.pairs) seg(a, b, 'yours');
    if (this.checked) {
      // what really happened
      for (const [u, v] of p.truth) seg(u, v, 'truth').setAttribute('transform', 'translate(0 7)');
      // the matching decoder's answer, along its paths
      for (const [, , path] of p.mwpm.pairs) {
        let last = null;
        const pts = path.map((k) => {
          if (k === B) { const ref = last || node(path[0]); return { x: ref.i < C / 2 ? railL : railR, y: ref.y }; }
          last = node(k); return last;
        });
        el('path', { class: 'mwpm-path', transform: 'translate(0 -7)', d: pts.map((q, j) => `${j ? 'L' : 'M'}${q.x},${q.y}`).join('') }, svg);
      }
    }
    for (let k = 0; k < B; k++) {
      const q = node(k);
      const lit = fired.has(k);
      const g = el('g', { class: 'gnode' + (lit ? ' lit' : '') + (open.has(k) ? ' open' : '') + (this.sel === k ? ' sel' : ''), tabindex: lit && !this.checked ? 0 : -1, role: lit ? 'button' : null, 'aria-label': lit ? `Detection event, round ${Math.floor(k / C) + 1}, check ${k % C + 1}` : null }, svg);
      el('circle', { cx: q.x, cy: q.y, r: lit ? 11 : 4.5 }, g);
      if (lit) {
        el('circle', { class: 'hit', cx: q.x, cy: q.y, r: 20, fill: 'transparent' }, g);
        this.bind(g, k);
      }
    }

    // panel
    const ui = this.ui;
    ui.score.innerHTML = `<b>You ${this.score.you}</b> · Matching ${this.score.mwpm} <span>after ${this.score.done} of ${this.data.puzzles.length}</span>`;
    ui.count.textContent = `Puzzle ${(this.i % this.data.puzzles.length) + 1} of ${this.data.puzzles.length} · ${p.fired.length} detection events`;
    const left_ = this.open().length;
    ui.check.disabled = this.checked || left_ > 0;
    ui.undo.disabled = this.checked || (!this.pairs.length && this.sel === null);
    ui.next.hidden = !this.checked;
    ui.check.hidden = this.checked;
    if (!this.checked) {
      this.say(left_ === 0
        ? 'Every event is explained. Check your answer.'
        : this.sel !== null
          ? 'Now pick the event it pairs with, or an edge of the code.'
          : `${left_} event${left_ === 1 ? '' : 's'} left to explain. Click one to start a pair.`);
    } else {
      const you = this.youOk ? 'Your correction kept the stored bit.' : 'Your correction flipped the stored bit: a logical error.';
      const mw = this.mwOk ? 'Matching got it too.' : 'Matching got this one wrong as well: the most likely explanation is not always the true one.';
      this.say(`${you} ${mw} Red dashes show the flips that really happened; the blue path is the matching decoder's answer.`);
    }
  }

  bind(g, k) {
    g.addEventListener('click', () => this.pick(k));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.pick(k); } });
  }
}
