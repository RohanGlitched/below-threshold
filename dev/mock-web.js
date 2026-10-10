// Stands in for the Python module lab.web during local design work.
const get = async (f) => (await fetch(f)).text();
const fn = (impl) => ({ callPromising: impl, callPromisingKwargs: impl });
const params = new URLSearchParams(location.search);

export const boot = fn(async () => {
  const b = JSON.parse(await get('./boot.json'));
  b.theory = JSON.parse(await get('../data/theory.json'));
  b.game = JSON.parse(await get('../data/game.json'));
  let atlas = b.atlas;
  if (!atlas || !atlas.runs || !atlas.runs.length) {
    const runs = [JSON.parse(await get('./run-6.json'))];
    try { runs.push(JSON.parse(await get('./run-6-coherent.json'))); } catch (e) {}
    atlas = { runs };
  }
  b.atlas = atlas;
  if (params.get('machine') === 'ibm') Object.assign(b.profile, { family: 'ibm', model: 'ibm_heron_r2', label: 'IBM Fez noise model', one_job: false, layout: 'reuse', max_qubits: 25 });
  return JSON.stringify(b);
});

export const run = fn(async (backend, q, shots, twirl) => {
  await new Promise((r) => setTimeout(r, 2500));
  const r = JSON.parse(await get(twirl === false ? './run-6-coherent.json' : './run-6.json'));
  r.when = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  return JSON.stringify(r);
});

export const circuit_text = fn(async () => JSON.stringify({ text: '(circuit drawing comes from Qiskit on Qollab)' }));
