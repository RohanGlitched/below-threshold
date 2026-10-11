// The circuit as the ions see it: a 3D chain in a surface trap, replaying the
// real gate schedule of the run, then the readout of a real shot.
// three.js is provided by Qollab's runtime under the bare name 'three'.
import * as THREE from 'three';

const GLOW = new THREE.Color('#9fb6ff');
const ANC = new THREE.Color('#8fd6ff');
const DIM = new THREE.Color('#3a4a6a');
const DIM_ANC = new THREE.Color('#2f5a66');
const BEAM = new THREE.Color('#c58bff'); // 355 nm Raman light, false colour
const UV = new THREE.Color('#6d7bff');

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,255,255,0.8)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// The real schedule: per round, a dial rotation on every data qubit, then the
// left CNOTs, then the right CNOTs; finally the readout.
export function schedule(d, r) {
  const steps = [];
  for (let t = 0; t < r; t++) {
    steps.push({ kind: 'dial', qubits: [...Array(d).keys()], round: t });
    for (const k of [0, 1]) {
      for (let i = 0; i < d - 1; i++) steps.push({ kind: 'cx', c: i + k, t: d + t * (d - 1) + i, round: t });
    }
  }
  steps.push({ kind: 'dial', qubits: [...Array(d + r * (d - 1)).keys()], round: r });
  steps.push({ kind: 'read', round: r });
  return steps;
}

export class Trap3D {
  constructor(host, label) {
    this.host = host;
    this.label = label;
    this.playing = true;
    this.visible = true;
    this.ok = true;
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    } catch (e) {
      this.ok = false;
      host.classList.add('no-webgl');
      return;
    }
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    this.renderer.setClearColor('#05070b');
    host.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#05070b', 18, 46);
    this.camera = new THREE.PerspectiveCamera(32, 2, 0.1, 100);
    this.tex = glowTexture();
    this.scene.add(new THREE.AmbientLight('#8090b0', 0.6));
    const key = new THREE.DirectionalLight('#c9d6ff', 1.1);
    key.position.set(-6, 10, 8);
    this.scene.add(key);
    this.buildTrap();
    this.resize = this.resize.bind(this);
    if (typeof ResizeObserver === 'function') new ResizeObserver(this.resize).observe(host);
    if (typeof IntersectionObserver === 'function') {
      new IntersectionObserver((es) => { this.visible = es[0].isIntersecting; if (this.visible) this.kick(); }, { threshold: 0.05 }).observe(host);
    }
    this.resize();
    this.t0 = performance.now();
    this.raf = 0;
  }

  buildTrap() {
    // a surface-electrode chip: segmented rails below the chain
    const chip = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: '#2b3342', metalness: 0.85, roughness: 0.38 });
    const gap = new THREE.MeshStandardMaterial({ color: '#0b0f17', metalness: 0.2, roughness: 0.9 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(30, 0.2, 7), gap);
    base.position.y = -1.6;
    chip.add(base);
    for (const z of [-2.2, -0.75, 0.75, 2.2]) {
      const w = Math.abs(z) > 1 ? 1.2 : 1.1;
      for (let s = -14; s < 14; s += 1.4) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, w), metal);
        seg.position.set(s + 0.7, -1.46, z);
        chip.add(seg);
      }
    }
    this.scene.add(chip);
    this.chip = chip;
  }

  // Ions in a harmonic trap sit closer together in the middle.
  layout(n) {
    const a = 0.16, span = Math.min(24, 1.0 * (n - 1));
    const xs = [];
    for (let k = 0; k < n; k++) {
      const u = n === 1 ? 0 : (k - (n - 1) / 2) / ((n - 1) / 2);
      xs.push((u * (1 - a) + a * u * u * u) * span / 2);
    }
    return xs;
  }

  load(d, r, shot, opts = {}) {
    if (!this.ok) return;
    if (this.ions) for (const o of this.ions) { this.scene.remove(o.group); o.core.material.dispose(); o.glow.material.dispose(); }
    if (this.beams) for (const b of this.beams) { this.scene.remove(b); b.material.dispose(); }
    if (this.beamGeo) this.beamGeo.dispose();
    if (this.ionGeo) this.ionGeo.dispose();
    this.d = d; this.r = r; this.shot = shot;
    const n = d + r * (d - 1);
    const xs = this.layout(n);
    const geo = this.ionGeo = new THREE.SphereGeometry(0.2, 24, 16);
    this.ions = xs.map((x, k) => {
      const group = new THREE.Group();
      group.position.set(x, 0, 0);
      const core = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: k < d ? '#cfd8ee' : '#bfe3ea', emissive: (k < d ? DIM : DIM_ANC).clone(), emissiveIntensity: 1, roughness: 0.3 }));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, color: k < d ? GLOW : ANC, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.setScalar(2.2);
      group.add(core, glow);
      this.scene.add(group);
      return { group, core, glow, x, data: k < d, rest: k < d ? DIM : DIM_ANC, pulse: 0, lit: 0 };
    });
    // two Raman beams, shown on the pair a gate addresses
    const beamGeo = this.beamGeo = new THREE.CylinderGeometry(0.05, 0.14, 9, 12, 1, true);
    this.beams = [0, 1].map(() => {
      const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: BEAM, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.y = 4.5;
      this.scene.add(m);
      return m;
    });
    this.steps = schedule(d, r);
    this.stepMs = opts.stepMs || 260;
    this.t0 = performance.now();
    this.kick();
  }

  resize() {
    if (!this.ok) return;
    const w = Math.max(280, this.host.clientWidth), h = Math.max(200, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.kick();
  }

  seek(ms) { this.playing = false; this.elapsed = ms; this.kick(); }

  setPlaying(on) { this.playing = on; if (on) { this.t0 = performance.now() - (this.elapsed || 0); this.kick(); } }

  kick() { if (!this.raf && this.ok) this.raf = requestAnimationFrame((t) => this.frame(t)); }

  frame(now) {
    this.raf = 0;
    if (!this.ions) return;
    if (!this.reduceQuery) this.reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
    const reduce = this.reduceQuery.matches;
    const total = this.steps.length * this.stepMs + 2600; // hold the readout
    if (this.playing) this.elapsed = Math.max(0, now - this.t0) % total;
    const el = reduce ? total - 1 : this.elapsed;
    const idx = Math.floor(el / this.stepMs);
    const frac = (el % this.stepMs) / this.stepMs;
    const step = this.steps[Math.min(idx, this.steps.length - 1)];
    const reading = idx >= this.steps.length - 1;
    if (reading && !this.wasReading && this.onReadout) this.shot = this.onReadout() || this.shot;
    this.wasReading = reading;
    const bits = this.shot ? this.shot.bits.split('').map(Number) : [];

    // camera: a slow drift along the chain
    const n = this.ions.length;
    const span = Math.abs(this.ions[n - 1].x - this.ions[0].x);
    const ang = reduce ? 0.2 : 0.25 * Math.sin(now / 9000);
    const dist = 4 + span * 0.5;
    this.camera.position.set(Math.sin(ang) * dist * 0.45, dist * 0.3, Math.cos(ang) * dist);
    this.camera.lookAt(0, -0.35, 0);

    for (const ion of this.ions) { ion.pulse *= 0.86; }
    this.beams.forEach((b) => { b.material.opacity *= 0.7; });
    let text = '';
    if (!reading) {
      if (step.kind === 'dial') {
        for (const q of step.qubits) if (this.ions[q]) this.ions[q].pulse = Math.max(this.ions[q].pulse, 0.55 * (1 - frac));
        text = step.round < this.r ? `Round ${step.round + 1}: the noise dial nudges every data ion` : 'Last nudge on every ion before readout';
      } else if (step.kind === 'cx') {
        const a = this.ions[step.c], b = this.ions[step.t];
        [a, b].forEach((ion, j) => {
          const beam = this.beams[j];
          beam.position.x = ion.x;
          beam.material.opacity = 0.95 * Math.sin(Math.PI * frac);
          ion.pulse = Math.max(ion.pulse, 0.85);
        });
        // the shared motion: the whole chain sways a little during a gate
        const sway = 0.04 * Math.sin(frac * Math.PI * 4) * Math.sin(Math.PI * frac);
        for (const ion of this.ions) ion.group.position.z = sway;
        text = `Round ${step.round + 1}: data ion ${step.c} → check ion ${step.t - this.d - step.round * (this.d - 1) + 1}, entangled through the chain's shared motion`;
      }
    } else {
      for (const ion of this.ions) ion.group.position.z = 0;
      this.beams.forEach((bm) => { bm.material.opacity = 0; });
      text = 'Readout: ions in state 1 scatter the 369.5 nm light and glow; ions in state 0 stay dark';
    }
    this.ions.forEach((ion, k) => {
      const target = reading ? (bits[k] ? 1 : 0) : 0;
      const sweepIn = reading ? Math.min(1, Math.max(0, ((el - (this.steps.length - 1) * this.stepMs) / 700) * n - k) / 2) : 0;
      ion.lit = target * (reading ? sweepIn : 0);
      const glow = Math.max(ion.lit, ion.pulse * 0.7);
      ion.glow.material.opacity = Math.min(1, glow * 1.1);
      ion.glow.scale.setScalar(1.4 + 2.2 * glow);
      ion.core.material.emissive.copy(ion.rest).lerp(ion.data ? GLOW : ANC, glow);
    });
    if (this.label && this.label.textContent !== text) this.label.textContent = text;
    this.renderer.render(this.scene, this.camera);
    if (this.visible && this.playing && !reduce) this.raf = requestAnimationFrame((t) => this.frame(t));
  }
}
