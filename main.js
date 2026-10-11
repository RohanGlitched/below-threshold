// Below threshold: page logic. The quantum work and the decoding live in
// lab/ (Python); this file draws the page and calls it through Qollab's
// JS-to-Python bridge with the backend picked in the Select QPU dialog.
import * as web from 'lab.web';
import { renderEps, renderRuler, renderThreshold, renderTwirl, renderCal, KIND_LABEL, crossing } from './ui/charts.js';
import { Camera, renderGraph, describeShot } from './ui/shot.js';
import { renderAtlas, shortName } from './ui/atlas.js';
import { fmtPct } from './ui/svg.js';
import { Game } from './ui/game.js';
import { Trap3D } from './ui/trap3d.js';

const $ = (id) => document.getElementById(id);
const state = { info: null, run: null, live: false, shot: 0, timer: 0, playing: true, sentJob: false, wired: false };
const SHOT_CHOICES = [400, 800, 1600, 3200];
const camera = new Camera($('camera'));
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// three.js comes from Qollab's runtime under the bare name 'three' (Qollab
// bundles the project's static imports, so the trap module is imported above);
// building the trap is wrapped so the page still works without WebGL: the
// camera frame and the graph carry the shot instead.
let trap = null;
try {
  trap = new Trap3D($('trap3d'), $('trap3d-label'));
  if (!trap.ok) trap = null;
  window.__bt = { trap };
} catch (err) {
  console.warn('3D trap unavailable:', err);
  trap = null;
}
if (!trap) {
  $('trap3d').classList.add('no-webgl');
  document.querySelector('.trap3d-wrap').hidden = true;
  $('camera-trap-note').hidden = true;
}

function familyText(prof) {
  if (prof.family === 'ionq') return prof.hardware ? 'Trapped ytterbium ions · real IonQ hardware' : 'IonQ’s noise model of its trapped-ion machine · simulated on IonQ’s cloud';
  if (prof.family === 'ibm') return 'IBM’s noise model of a superconducting chip · simulated in your browser';
  return 'No noise of its own · runs in your browser';
}

console.log('Below threshold: loading the lab…');

// The page sits in Qollab's sandboxed frame. Its host page can ask for the
// status (or press Run) with postMessage, which is how the lab is tested end
// to end on Qollab. Nothing else listens or answers.
globalThis.addEventListener('message', (e) => {
  if (!e.data || typeof e.data.bt !== 'string') return;
  if (e.origin !== 'https://qollab.xyz' && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(e.origin)) return;
  if (e.data.bt === 'run') runExperiment(e.data.shots);
  if (e.data.bt === 'dump' && state.run) {
    const { graph, ...rest } = state.run;
    (e.source || window.parent).postMessage({ bt: 'dump', run: JSON.stringify(rest) }, '*');
    return;
  }
  const fit = state.run && state.run.sweeps && state.run.sweeps[0].fit;
  (e.source || window.parent).postMessage({ bt: 'state', status: $('status').textContent, live: state.live,
    machine: state.info && state.info.profile.label, lambda: fit ? fit.lam : null,
    atlas: state.info && state.info.atlas ? state.info.atlas.runs.length : 0,
    rows: state.run ? state.run.sweeps[0].rows.map((r) => [r.d, r.fail_mwpm, r.shots]) : null }, '*');
});
try {
  await boot();
} catch (err) {
  console.error(err);
  $('machine-name').textContent = 'Could not read the machine';
  setStatus('The lab could not start: ' + (err && err.message ? err.message : String(err)), 'err');
} finally {
  if (!state.wired) wireControls();
  $('go').disabled = false;
}
// Keep the run alive so the page can call Python again (Run the experiment,
// the circuit drawing). Press Stop in Qollab's runner to end it.
await new Promise(() => {});

async function boot() {
  setStatus('Loading the lab…');
  state.info = JSON.parse(await web.boot.callPromising(backend));
  const prof = state.info.profile;
  $('machine-name').textContent = shortName(prof.label);
  $('machine-meta').textContent = `${familyText(prof)} · up to ${prof.max_qubits} qubits for this lab`;
  $('machine-dot').className = 'machine-dot ' + (prof.family === 'ionq' ? '' : prof.family);
  $('fits').innerHTML = '';
  for (const f of state.info.distances) {
    const li = document.createElement('li');
    li.className = f.fits ? '' : 'no';
    li.innerHTML = `<b>d = ${f.d}</b> · ${f.qubits} qubits${f.fits ? '' : '<span class="visually-hidden">, too many qubits for this machine</span>'}`;
    li.title = f.fits ? 'Fits on this machine' : 'Too many qubits for this machine';
    $('fits').appendChild(li);
  }
  // Figure 2 draws every shot as an ion chain; say so when the machine is not one
  if (prof.family === 'ionq') {
    $('shot-source').textContent = 'Real shots from the run above, on the full distance-9 code (distance 7 on smaller machines). Each qubit is one ion.';
    $('camera-family').hidden = true;
  } else {
    $('shot-source').textContent = `Real shots from the run above, drawn as the circuit would run on an ion trap. Your machine is ${prof.family === 'ibm' ? 'a noise model of a superconducting chip' : 'an ideal simulator'}, so the ion picture illustrates the gate schedule, not that machine's layout.`;
    $('camera-family').hidden = false;
  }
  state.run = pickRecorded();
  renderAll();
  if (state.info.game && state.info.game.puzzles && state.info.game.puzzles.length) {
    new Game($('game-graph'), {
      score: $('game-score'), count: $('game-count'), say: $('game-say'),
      undo: $('game-undo'), check: $('game-check'), next: $('game-next'),
    }, state.info.game);
  } else {
    $('fig-game').hidden = true;
  }
  wireControls();
  $('go').disabled = false;
  if (state.run) setStatus(`Showing a run recorded on ${shortName(state.run.profile.label)}. Press the button to measure your own.`);
  else setStatus('Press the button to run the experiment.');
  console.log(`Below threshold is ready on ${prof.label} (${prof.family}, up to ${prof.max_qubits} qubits).`);
}

function pickRecorded() {
  const runs = (state.info.atlas && state.info.atlas.runs) || [];
  const model = state.info.profile.model;
  const usable = runs.filter((r) => r.ok && r.twirl !== false && r.samples && r.samples.length);
  const label = state.info.profile.label;
  return usable.find((r) => r.profile.label === label && Math.abs(r.qs[0] - 0.06) < 1e-9)
    || usable.find((r) => r.profile.model === model && Math.abs(r.qs[0] - 0.06) < 1e-9)
    || usable.find((r) => r.profile.model === 'forte-enterprise-1')
    || usable[0] || null;
}

// ------------------------------------------------------------------ render

function renderAll() {
  const run = state.run;
  const theory = state.info.theory || {};
  const q = run ? run.qs[0] : Number($('dial').value) / 100;
  if (run) {
    const sweep = run.sweeps[0];
    const fit = sweep.fit;
    $('lambda').textContent = fit ? fit.lam.toFixed(2) : '—';
    $('lambda-ci').textContent = fit && fit.lo ? `95% interval ${fit.lo.toFixed(2)} – ${fit.hi.toFixed(2)}` : 'Not enough failures to bound it yet';
    $('lambda-say').textContent = lambdaSentence(fit, sweep);
    renderRuler($('ruler'), fit);
    const model = run.profile.model;
    const trows = ((theory.models || {})[model] || []).filter((t) => Math.abs(t.q - q) < 1e-9);
    renderEps($('chart-eps'), sweep, trows);
    const circ = run.circuits === 1 ? `one ${run.qubits}-qubit circuit` : `${run.circuits} copies of a ${run.qubits}-qubit circuit`;
    $('result-source').textContent = `${state.live && !run.recorded ? 'Measured just now' : 'Recorded'} on ${shortName(run.profile.label)}${run.recorded_locally ? ' (re-run in Qiskit Aer locally on the same noise model)' : ''} · ${circ}, one job · ${(run.shots_per_circuit * run.circuits).toLocaleString()} shots${run.runs > 1 ? ` from ${run.runs} runs, pooled` : ''} · dial ${Math.round(q * 100)}% · ${run.r} rounds${run.twirl === false ? ' · not twirled' : ''}${run.when ? ' · ' + run.when : ''}`;
    renderTable(sweep);
    renderCalibration(run, sweep.calibration);
    state.shot = 0;
    showShot();
    if (trap && run.graph) {
      trap.onReadout = () => {
        state.shot += 1;
        showShot();
        return state.run.samples[state.shot % state.run.samples.length];
      };
      trap.load(run.graph.d, run.graph.r, run.samples[0]);
    }
    startPlayback();
  }
  const cross = renderThreshold($('chart-thr'), (theory.square || {}).ideal || [], Number($('dial').value) / 100);
  if (cross) $('thr-value').textContent = `${Math.round(cross * 100)}%`;
  renderAtlas($('atlas'), atlasRuns(), state.info.profile.label, 0.06, predictedLambda());
  renderTwirlFigure();
}

// Lambda the error model predicts for each machine from its published specs at
// the 6% dial, fitted the same way as the measurements (theory.json).
function predictedLambda() {
  const models = (state.info.theory || {}).models || {};
  const out = {};
  for (const [model, rows] of Object.entries(models)) {
    const pts = rows.filter((t) => Math.abs(t.q - 0.06) < 1e-9 && t.eps_mwpm > 0).sort((a, b) => a.d - b.d);
    if (pts.length < 2) continue;
    const xs = pts.map((t) => (t.d + 1) / 2), ys = pts.map((t) => Math.log(t.eps_mwpm));
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let sxy = 0, sxx = 0;
    xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; });
    if (sxx > 0) out[model] = Math.exp(-sxy / sxx);
  }
  return out;
}

function lambdaSentence(fit, sweep) {
  if (!fit) return 'Too few failures at the larger sizes to measure Λ. Turn the dial up or add shots.';
  const rows = sweep.rows || [];
  if (!rows.length) return '';
  const a = rows[0], b = rows[rows.length - 1];
  const ratio = a.eps_mwpm > 0 && b.eps_mwpm > 0 ? a.eps_mwpm / b.eps_mwpm : null;
  const head = fit.lam > 1
    ? `Below threshold: each step up in size divided the error per round by about ${fit.lam.toFixed(1)}.`
    : 'Above threshold: growing the code made things worse.';
  const tail = ratio ? ` From ${a.qubits} to ${b.qubits} qubits, the logical error per round fell ${ratio.toFixed(1)}×.` : '';
  return head + tail;
}

function renderCalibration(run, cal) {
  const fig = $('fig-cal');
  if (!cal || !cal.kinds) { fig.hidden = true; return; }
  fig.hidden = false;
  renderCal($('chart-cal'), cal);
  const L = cal.kinds.learned, D = cal.kinds.dial || {}, P = cal.kinds.prior || {};
  const excess = (k) => (L[k] !== undefined && D[k] !== undefined ? L[k] - D[k] : null);
  const ex = ['space', 'time'].map(excess).filter((v) => v !== null);
  const add = ex.length ? ex.reduce((a, b) => a + b, 0) / ex.length : null;
  $('cal-source').textContent = `Learned from ${(cal.shots || 0).toLocaleString()} shots of the distance-${cal.d} code on ${shortName(run.profile.label)}.`;
  const parts = [];
  parts.push(`<p>Two checks that share an error mechanism fire together more often than chance, and the excess is that mechanism's probability. Google calibrated its decoders this way; here it runs on the shots this machine returned.</p>`);
  if (add !== null) {
    parts.push(`<p>A data qubit flipped in <strong>${fmtPct(L.space)}</strong> of steps and a check misread in <strong>${fmtPct(L.time)}</strong>. The dial alone accounts for ${fmtPct(D.space)} and ${fmtPct(D.time)}, so ${add > 0.0005 ? `the machine itself adds about <strong>${fmtPct(add)}</strong> per step: its gates and readout, seen through the code.` : 'the machine adds almost nothing on top: its own noise is far below the dial.'}</p>`);
  }
  if (Number.isFinite(cal.fail_prior) && Number.isFinite(cal.fail_learned)) {
    const gap = cal.fail_prior - cal.fail_learned;
    const noise = 2 * Math.sqrt(Math.max(1, cal.fail_prior + cal.fail_learned) / 2);
    const verdict = gap > noise ? '. Knowing the machine pays off.'
      : gap < -noise ? '. Here the specs did better: a few thousand shots leave the rare edges poorly measured.'
        : ': the same within shot noise, so the published specs were already a fair description.';
    parts.push(`<p>Decoding the distance-${cal.d} shots again with the learned weights gives <strong>${cal.fail_learned}</strong> logical errors, against ${cal.fail_prior} with the weights assumed from the specs${verdict}</p>`);
  }
  $('cal-say').innerHTML = parts.join('');
}

function renderTable(sweep) {
  const tb = $('numbers').querySelector('tbody');
  tb.innerHTML = '';
  sweep.rows.forEach((r, i) => {
    const pair = sweep.pairs[i];
    const tr = document.createElement('tr');
    const lam = pair ? (pair.bound ? `> ${pair.lam.toFixed(1)}` : (pair.lam ? pair.lam.toFixed(2) : '—')) : '';
    tr.innerHTML = `<td>d = ${r.d}</td><td>${r.qubits}</td><td>${r.windows ?? 1}</td><td>${r.shots.toLocaleString()}</td>`
      + `<td>${r.fail_mwpm.toLocaleString()} · ${fmtPct(r.P_mwpm)}</td>`
      + `<td>${r.fail_major.toLocaleString()} · ${fmtPct(r.P_major)}</td>`
      + `<td>${fmtPct(r.eps_mwpm)}</td><td>${lam}</td>`;
    tb.appendChild(tr);
  });
}

function atlasRuns() {
  const runs = [...((state.info.atlas && state.info.atlas.runs) || [])];
  if (state.live && state.run) {
    // your fresh run replaces the recorded one for this machine
    const i = runs.findIndex((r) => r.profile.label === state.run.profile.label && r.qs[0] === state.run.qs[0] && r.twirl === state.run.twirl);
    if (i >= 0) runs.splice(i, 1);
    runs.unshift(state.run);
  }
  return runs;
}

function renderTwirlFigure() {
  const runs = atlasRuns().filter((r) => r.ok && Math.abs(r.qs[0] - 0.06) < 1e-9);
  // a coherent run and a twirled run on the same machine
  const coh = runs.find((r) => r.twirl === false);
  const tw = coh && runs.find((r) => r.twirl !== false && r.profile.label === coh.profile.label);
  const svg = $('chart-twirl');
  if (!coh || !tw) {
    svg.innerHTML = '';
    $('twirl-source').textContent = 'Turn twirling off and run to see the difference on your machine.';
    return;
  }
  const groups = coh.sweeps[0].rows.map((c) => {
    const t = tw.sweeps[0].rows.find((x) => x.d === c.d);
    return t ? { d: c.d, coh: c.P_mwpm, tw: t.P_mwpm } : null;
  }).filter(Boolean);
  renderTwirl(svg, groups);
  const last = groups[groups.length - 1];
  const fc = coh.sweeps[0].fit, ft = tw.sweeps[0].fit;
  $('twirl-source').textContent = `Measured on ${shortName(coh.profile.label)}, dial at 6%, matching decoder.`;
  $('twirl-cap').textContent = `Logical error per shot, with every rotation the same way and with random signs. The cost of coherence grows with the code: ${last && last.tw > 0 ? `${(last.coh / last.tw).toFixed(1)}× more failures at distance ${last.d}` : ''}${fc && ft ? `, and Λ falls from ${ft.lam.toFixed(2)} to ${fc.lam.toFixed(2)}` : ''}.`;
}

// --------------------------------------------------------------- one shot

function showShot(announce = false) {
  const run = state.run;
  if (!run || !run.samples || !run.samples.length) return;
  const s = run.samples[state.shot % run.samples.length];
  const meta = { d: run.graph.d, r: run.graph.r };
  camera.show(s, meta);
  renderGraph($('chart-graph'), run.graph, s);
  const v = describeShot(s);
  $('v-prep').textContent = `logical ${v.prep}`;
  $('v-events').textContent = String(s.fired.length);
  $('v-major').innerHTML = `reads ${v.majOut} <span class="${s.major_ok ? 'yes' : 'no'}">${s.major_ok ? '✓' : '✗'}</span>`;
  $('v-mwpm').innerHTML = `reads ${v.mwOut} <span class="${s.mwpm_ok ? 'yes' : 'no'}">${s.mwpm_ok ? '✓' : '✗'}</span>`;
  $('shot-say').textContent = v.say;
  $('shot-count').textContent = `Shot ${(state.shot % run.samples.length) + 1} of ${run.samples.length} shown · distance ${meta.d} · seen ${s.count}× in ${run.shots_per_circuit} shots`;
  // only spoken when the reader asked for this shot; autoplay stays silent
  if (announce) $('camera-text').textContent = `Readout ${s.bits.split('').join(' ')}. ${v.say}`;
}

function startPlayback() {
  clearInterval(state.timer);
  if (!state.playing || trap) return; // the 3D replay advances shots at each readout
  state.timer = setInterval(() => {
    state.shot += 1;
    showShot();
  }, 5200);
}

// One switch for both Pause buttons: the 3D replay when it exists, else the timer.
function setPlaying(on) {
  state.playing = on;
  for (const id of ['shot-play', 'trap3d-play']) {
    const b = $(id);
    b.textContent = on ? 'Pause' : 'Play';
    b.setAttribute('aria-pressed', String(on));
  }
  if (trap) trap.setPlaying(on);
  if (on) startPlayback(); else clearInterval(state.timer);
}

// ---------------------------------------------------------------- controls

function wireControls() {
  state.wired = true;
  const dial = $('dial');
  const out = $('dial-out');
  const syncDial = () => {
    out.textContent = `${dial.value}%`;
    dial.setAttribute('aria-valuetext', `${dial.value}%`);
    const sq = state.info && state.info.theory && state.info.theory.square;
    renderThreshold($('chart-thr'), (sq || {}).ideal || [], Number(dial.value) / 100);
  };
  dial.addEventListener('input', syncDial);
  syncDial();
  $('go').addEventListener('click', () => runExperiment());
  $('trap3d-play').addEventListener('click', () => setPlaying(!state.playing));
  $('shot-play').addEventListener('click', () => setPlaying(!state.playing));
  $('shot-prev').addEventListener('click', () => { state.shot = Math.max(0, state.shot - 1); showShot(true); startPlayback(); });
  $('shot-next').addEventListener('click', () => { state.shot += 1; showShot(true); startPlayback(); });
  // Figure 4 picks a narrow or wide layout from its width; follow resizes
  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const cal = state.run && state.run.sweeps && state.run.sweeps[0].calibration;
      if (cal && cal.kinds) renderCal($('chart-cal'), cal);
    }, 200);
  });
  const det = document.querySelector('details.circuit');
  det.addEventListener('toggle', async () => {
    if (!det.open || det.dataset.loaded) return;
    det.dataset.loaded = '1';
    try {
      const c = JSON.parse(await web.circuit_text.callPromising(3, Number(dial.value) / 100));
      $('circuit-text').textContent = c.text;
    } catch (err) {
      $('circuit-text').textContent = 'The circuit drawing could not load.';
    }
  });
}

async function runExperiment(shotsOverride) {
  if (!state.info) return;
  const prof = state.info.profile;
  console.log(`Running the experiment on ${prof.label}…`);
  if (prof.one_job && state.sentJob) {
    setStatus('IonQ machines take one job per run. Press Stop, then Run, to send another.', 'err');
    return;
  }
  const q = Number($('dial').value) / 100;
  const shots = SHOT_CHOICES.includes(Number(shotsOverride)) ? Number(shotsOverride) : Number($('shots').value);
  const twirl = $('twirl').checked;
  const fits = state.info.distances.filter((f) => f.fits);
  const circuits = prof.one_job ? 1 : 4;
  const go = $('go');
  go.disabled = true;
  go.classList.add('busy');
  go.textContent = 'Running…';
  const t0 = performance.now();
  setStatus(`Sending ${circuits === 1 ? 'one circuit' : circuits + ' circuits'} to ${shortName(prof.label)} as one job, then decoding every code size inside it. ${prof.hardware ? 'This is real hardware: the job waits in IonQ’s queue, which can take minutes to hours. Keep this tab open.' : prof.family === 'ionq' ? 'IonQ simulates every shot on its cloud; allow two to three minutes. The figures below are live meanwhile.' : prof.family === 'ibm' ? 'The IBM noise model simulates every shot in your browser; allow a few minutes.' : ''}`);
  const tick = setInterval(() => {
    go.textContent = `Running… ${Math.round((performance.now() - t0) / 1000)} s`;
  }, 1000);
  try {
    const res = JSON.parse(await web.run.callPromising(backend, q, shots, twirl));
    // a job that reached the machine counts; a failure before that leaves the Run free
    if (res.ok || res.error === 'one_job') state.sentJob = true;
    if (!res.ok) {
      const msg = res.error === 'one_job'
        ? 'IonQ machines take one job per run. Press Stop, then Run, to send another.'
        : res.error === 'too_small'
          ? 'None of the code sizes fit on this machine.'
          : `The run failed: ${res.message || 'unknown error'}. The console below has the details.`;
      setStatus(msg, 'err');
      return;
    }
    state.run = res;
    state.live = true;
    renderAll();
    const secs = Math.round((performance.now() - t0) / 1000);
    const fit = res.sweeps[0].fit;
    setStatus(`Done in ${secs} s: ${res.circuits === 1 ? 'one circuit' : res.circuits + ' circuits'}, one job${fit ? `, Λ = ${fit.lam.toFixed(2)}` : ''}. Your run is also saved in the console as a JSON file.`, 'done');
    console.log(`Run finished in ${secs} s on ${prof.label}: ` + res.sweeps[0].rows.map((r) => `d=${r.d} ${r.fail_mwpm}/${r.shots} fail`).join(', ') + (fit ? `; Λ = ${fit.lam.toFixed(2)} (${fit.lo ? fit.lo.toFixed(2) : '?'}–${fit.hi ? fit.hi.toFixed(2) : '?'})` : ''));
    document.getElementById('fig-result').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  } catch (err) {
    console.error(err);
    const text = String(err && err.message ? err.message : err);
    if (/one job/i.test(text)) state.sentJob = true;
    setStatus(/one job/i.test(text)
      ? 'IonQ machines take one job per run. Press Stop, then Run, to send another.'
      : `The run failed: ${text.slice(0, 200)}`, 'err');
  } finally {
    clearInterval(tick);
    go.classList.remove('busy');
    go.textContent = 'Run the experiment';
    go.disabled = prof.one_job && state.sentJob;
    if (go.disabled) go.title = 'IonQ machines take one job per run. Press Stop, then Run, to send another.';
  }
}

function setStatus(text, kind = '') {
  const s = $('status');
  s.textContent = text;
  s.className = 'status' + (kind ? ' ' + kind : '');
}
