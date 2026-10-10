"""Run the memory experiment on whatever machine was picked in Qollab's dialog.

Everything the page needs comes back as one JSON string: the machine, the
circuits, the measured failures per distance for both decoders, error per
round, Lambda with intervals, a classical prediction under the same noise, and
a handful of real shots with their matchings to draw.

IonQ backends accept one job per run, so every circuit goes into a single
backend.run([...]) call on every backend.
"""

from __future__ import annotations

import json
import math
import time

from .code import Spec, build_circuit, bits_from_key, detectors, observable, window_bits, unreset
from .dem import Noise, edge_kind, detector_error_model
from .decode import Matching, majority
from .sim import predict
from .stats import summarize

# Decoder priors per machine family: two-qubit Pauli error and readout error.
# IonQ Aria models: IonQ's published depolarizing parameters (15/16 r2q), no
# readout term. Forte / Forte Enterprise: IonQ characterization snapshot in
# arXiv 2603.03801 Table I. IBM: medians from IBM's dashboard, Oct 2026.
PRIORS = {
    "ideal": (0.0, 0.0),
    "aria-1": (0.0133 * 15 / 16, 0.0),
    "aria-2": (0.01856 * 15 / 16, 0.0),
    "forte-1": (0.0151 * 1.25, 0.0054),
    "forte-enterprise-1": (0.0085 * 1.25, 0.0061),
    "ibm_heron_r2": (0.0045, 0.0095),
    "ibm_heron_r3": (0.0030, 0.0045),
    "ibm_nighthawk": (0.0065, 0.018),
    "ibm": (0.0045, 0.01),
}

IBM_REV = {
    "fez": "ibm_heron_r2", "marrakesh": "ibm_heron_r2", "kingston": "ibm_heron_r2",
    "boston": "ibm_heron_r3", "pittsburgh": "ibm_heron_r3", "aachen": "ibm_heron_r3",
    "miami": "ibm_nighthawk", "berlin": "ibm_nighthawk",
}


def _opt(backend, name):
    try:
        opts = backend.options
        v = getattr(opts, name, None)
        if v is None and hasattr(opts, "get"):
            v = opts.get(name)
        return v
    except Exception:
        return None


def profile(backend) -> dict:
    """What this machine is, how big, and the noise the decoder should assume."""
    name = str(getattr(backend, "name", "") or "")
    if callable(name):
        name = name()
    low = name.lower()
    nq = getattr(backend, "num_qubits", None)
    try:
        nq = int(nq) if nq is not None else None
    except Exception:
        nq = None
    cls = type(backend).__name__
    noise_model = str(_opt(backend, "noise_model") or "")
    p = {"name": name, "cls": cls, "qubits": nq, "noise_model": noise_model}

    if "ionq" in low or "ionq" in cls.lower():
        target = noise_model.lower() or ("ideal" if "simulator" in low else low)
        hardware = "simulator" not in low and "sim" not in cls.lower() and "qpu" in low
        key = next((k for k in ("forte-enterprise-1", "forte-1", "aria-2", "aria-1") if k in target or k in low), "ideal")
        p.update(family="ionq", hardware=hardware, model=key,
                 label=_ionq_label(key, hardware), layout="unrolled", one_job=True)
        p["max_qubits"] = nq or (29 if "forte" in key else 25)
        if key.startswith("aria"):
            # IonQ warns that circuits at a simulator's qubit limit may fail; the
            # 25-qubit Aria models stalled on a full-width circuit, so stay below it
            p["max_qubits"] = min(p["max_qubits"], 21)
    elif "fake" in low or "ibm" in low or "aer" in cls.lower() and "fake" in cls.lower():
        dev = next((k for k in IBM_REV if k in low), None)
        key = IBM_REV.get(dev, "ibm")
        p.update(family="ibm", hardware=False, model=key,
                 label=f"IBM {dev.title() if dev else name} noise model", layout="reuse", one_job=False)
        p["max_qubits"] = 25
        try:
            p["reset"] = "reset" in set(backend.target.operation_names)
        except Exception:
            p["reset"] = True
    elif "braket" in low or "braket" in cls.lower():
        # A 25-qubit statevector is 512 MB in the browser: keep local ideal runs small.
        p.update(family="ideal", hardware=False, model="ideal", label="AWS Braket local simulator",
                 layout="unrolled", one_job=False, max_qubits=min(nq or 25, 21))
    else:
        p.update(family="ideal", hardware=False, model="ideal", label="Built-in simulator",
                 layout="unrolled", one_job=False, max_qubits=min(nq or 24, 21))
    p2, pm = PRIORS.get(p["model"], (0.0, 0.0))
    p["prior"] = {"p2": p2, "pm": pm}
    return p


def _ionq_label(key, hardware):
    names = {"forte-enterprise-1": "IonQ Forte Enterprise 1", "forte-1": "IonQ Forte 1",
             "aria-1": "IonQ Aria 1", "aria-2": "IonQ Aria 2", "ideal": "IonQ ideal simulator"}
    base = names.get(key, "IonQ")
    if key == "ideal":
        return base
    return base + (" (hardware)" if hardware else " noise model")


def plan(prof: dict, ds, r: int, qs, instances: int = 4, twirl: bool = True):
    """The circuits for one run.

    Only the largest distance that fits is built; every smaller distance is
    read from windows inside it. IonQ's runners take one job of one circuit
    per run, so there it is a single circuit; local simulators get
    `instances` copies that alternate the logical value and, when twirling,
    draw fresh dial signs.
    Returns (specs, distances decoded, dropped)."""
    layout = prof.get("layout", "unrolled")
    cap = prof.get("max_qubits") or 24
    fit = [d for d in ds if Spec(d, r, layout=layout).qubits <= cap]
    dropped = [{"d": d, "qubits": Spec(d, r, layout=layout).qubits} for d in ds if d not in fit]
    if not fit:
        return [], [], dropped
    dmax = max(fit)
    n = 1 if prof.get("one_job") else max(1, instances)
    specs = []
    for q in qs:
        for k in range(n):
            specs.append(Spec(dmax, r, q=q, logical=k % 2, layout=layout,
                              twirl=(k + 1) if (twirl and q > 0) else 0, reset=prof.get("reset", True)))
    return specs, sorted(fit), dropped


def _transpile_for(backend, prof, circuits):
    from qiskit import transpile
    if prof["family"] == "ibm":
        # A straight path through the coupling map keeps the reuse layout free
        # of SWAPs: data and ancillas alternate along a line.
        out = []
        for qc in circuits:
            n = qc.num_qubits
            d = (n + 1) // 2
            line = _line(backend, n)
            layout = None
            if line:
                layout = [0] * n
                for j in range(d):
                    layout[j] = line[2 * j]
                for i in range(d - 1):
                    layout[d + i] = line[2 * i + 1]
            out.append(transpile(qc, backend=backend, initial_layout=layout,
                                 optimization_level=1, seed_transpiler=7))
        return out
    if prof["family"] == "ionq":
        try:
            return transpile(circuits, backend=backend, optimization_level=0)
        except Exception:
            return circuits
    return circuits


def _line(backend, n, budget=20000):
    """A simple path of n physical qubits, found by depth-first search with a
    step budget (square lattices have many dead ends); None lets the
    transpiler place the circuit itself."""
    try:
        cmap = backend.coupling_map
        if cmap is None:
            return list(range(n))
        adj = {}
        for a, b in cmap.get_edges():
            adj.setdefault(a, set()).add(b)
            adj.setdefault(b, set()).add(a)
    except Exception:
        return None
    steps = [0]

    def dfs(path, seen):
        if len(path) == n:
            return True
        steps[0] += 1
        if steps[0] > budget:
            return False
        for nb in sorted(adj[path[-1]], key=lambda v: len(adj[v])):
            if nb not in seen:
                path.append(nb)
                seen.add(nb)
                if dfs(path, seen):
                    return True
                path.pop()
                seen.discard(nb)
        return False

    for s0 in sorted(adj, key=lambda v: len(adj[v]))[:40]:
        path = [s0]
        if dfs(path, {s0}):
            return path
        if steps[0] > budget:
            break
    return None


def _counts_list(result, n):
    out = []
    for i in range(n):
        c = result.get_counts(i)
        out.append({str(k): int(v) for k, v in dict(c).items()})
    return out


def analyze(prof, specs, counts_list, r, qs, ds, predict_shots=20000):
    """Decode every distance from windows of the big code.

    Each distinct window bitstring is decoded once. Overlapping windows share
    qubits, so the rate uses every window but the error bars count only
    non-overlapping ones (`n_eff`)."""
    p2, pm = prof["prior"]["p2"], prof["prior"]["pm"]
    layout = prof.get("layout", "unrolled")
    by_q, samples, decoders = {}, [], {}
    full_shots = {}  # q -> {fired: count} at the full distance, for calibration
    for spec, counts in zip(specs, counts_list):
        dmax = spec.d
        noise = Noise(p2=p2, pm=pm, q=spec.q)
        parsed = [(unreset(spec, bits_from_key(k, spec.clbits)), c) for k, c in counts.items()]
        total = sum(c for _b, c in parsed)
        for dw in ds:
            sub = Spec(dw, r, q=spec.q, logical=spec.logical, layout=layout)
            wins = list(range(0, dmax - dw + 1))
            row = by_q.setdefault(spec.q, {}).setdefault(dw, {
                "d": dw, "qubits": Spec(dw, r, layout=layout).qubits, "cnots": sub.cnots, "shots": 0,
                "n_eff": 0, "windows": len(wins), "fail_mwpm": 0, "fail_major": 0, "events": 0, "distinct": 0})
            row["n_eff"] += total * max(1, dmax // dw)
            for j in wins:
                key = (dw, spec.q, j, dmax)
                dec = decoders.get(key)
                if dec is None:
                    parent = Spec(dmax, r, q=spec.q, layout=layout)
                    dec = decoders[key] = Matching(Spec(dw, r, q=spec.q, layout=layout), noise,
                                                   parent=None if dw == dmax else parent, offset=j)
                seen = {}
                for bits, c in parsed:
                    wb = tuple(window_bits(spec, j, dw, bits)) if dw != dmax else tuple(bits)
                    seen[wb] = seen.get(wb, 0) + c
                for wb, c in seen.items():
                    wl = list(wb)
                    fired = tuple(i for i, v in enumerate(detectors(sub, wl)) if v)
                    obs = observable(sub, wl)
                    pred, pairs = dec.match(fired)
                    mw_fail = pred != obs
                    mj_fail = majority(sub, wl[:dw]) != 0
                    row["shots"] += c
                    row["events"] += c * len(fired)
                    row["distinct"] += 1
                    row["fail_mwpm"] += c * int(mw_fail)
                    row["fail_major"] += c * int(mj_fail)
                    if dw == dmax:
                        fs = full_shots.setdefault(spec.q, {})
                        fs[(fired, obs)] = fs.get((fired, obs), 0) + c
                    if dw == dmax and spec.q == qs[0]:
                        samples.append({
                            "logical": spec.logical, "count": c, "bits": "".join(map(str, wl)),
                            "fired": list(fired), "pairs": [[int(a), int(b), dec.path(int(a), int(b))] for a, b in pairs],
                            "mwpm_ok": not mw_fail, "major_ok": not mj_fail, "obs": obs})

    sweeps = []
    for q in qs:
        rows = [by_q[q][d] for d in ds if d in by_q.get(q, {})]
        if not rows:
            continue
        for row in rows:
            row["events_per_shot"] = row["events"] / max(row["shots"], 1)
        summary = summarize(rows, r)
        theory = []
        for row in rows:
            if predict_shots <= 0:
                continue
            spec = Spec(row["d"], r, q=q, layout=layout)
            noise = Noise(p2=p2, pm=pm, q=q)
            if noise.p2 == 0 and noise.pm == 0 and q == 0:
                theory.append({"d": row["d"], "P_mwpm": 0.0, "P_major": 0.0})
                continue
            pr = predict(spec, noise, shots=predict_shots)
            theory.append({"d": row["d"], "P_mwpm": pr["fail_mwpm"] / pr["shots"],
                           "P_major": pr["fail_major"] / pr["shots"], "shots": pr["shots"]})
        sweeps.append({"q": q, **summary, "theory": theory,
                       "calibration": _calibrate(prof, Spec(max(ds), r, q=q, layout=layout), full_shots.get(q, {}))})

    # interesting shots first: decoder disagreements, then failures, then busy ones
    # the story shots first: matching right where the vote is wrong, then
    # the other disagreements, then busy shots
    samples.sort(key=lambda s: (not (s["mwpm_ok"] and not s["major_ok"]), s["mwpm_ok"] == s["major_ok"],
                                -len(s["fired"]), -s["count"]))
    return sweeps, samples[:24]


def _calibrate(prof, spec, shots):
    """Re-decode the full code with edge weights learned from its own shots."""
    from .calibrate import learn, summary
    if not shots:
        return None
    noise = Noise(p2=prof["prior"]["p2"], pm=prof["prior"]["pm"], q=spec.q)
    n_det, prior, learned, N = learn(spec, noise, [(f, c) for (f, _o), c in shots.items()])
    dec_p = Matching(spec, noise)
    dec_l = Matching(spec, edges=learned)
    fail_p = sum(c for (f, o), c in shots.items() if dec_p.decode(f) != o)
    fail_l = sum(c for (f, o), c in shots.items() if dec_l.decode(f) != o)
    B = n_det
    pmap = {(e.u, e.v): e.p for e in prior}
    kinds = summary(spec, prior, learned, B)
    # what the dial alone would produce, to show how much the machine adds
    _n, dial_only = detector_error_model(spec, Noise(q=spec.q))
    kinds["dial"] = summary(spec, dial_only, dial_only, B)["prior"]
    return {
        "d": spec.d, "shots": N, "fail_prior": fail_p, "fail_learned": fail_l,
        "kinds": kinds,
        "edges": [[e.u, e.v, edge_kind(spec, e, B), round(pmap.get((e.u, e.v), 0.0), 5), round(e.p, 5)] for e in learned],
    }


def graph(d, r, prof, q):
    """The decoding graph for drawing: edges with their kind and probability."""
    spec = Spec(d, r, q=q, layout=prof.get("layout", "unrolled"))
    noise = Noise(p2=prof["prior"]["p2"], pm=prof["prior"]["pm"], q=q)
    m = Matching(spec, noise)
    return {"d": d, "r": r, "nodes": m.n_det, "edges": [
        [e.u, e.v, edge_kind(spec, e, m.B), round(e.p, 6), e.obs] for e in m.edges]}


def run(backend, ds=(3, 5, 7, 9), r=2, qs=(0.06,), shots=1000, instances=4, twirl=True, predict_shots=4000):
    t0 = time.time()
    prof = profile(backend)
    ds, qs = list(ds), list(qs)
    specs, ds_run, dropped = plan(prof, ds, r, qs, instances, twirl)
    if not specs:
        return json.dumps({"ok": False, "error": "too_small", "profile": prof, "dropped": dropped})
    circuits = [build_circuit(s) for s in specs]
    t1 = time.time()
    circuits = _transpile_for(backend, prof, circuits)
    swaps = 0
    two_q = []
    for qc in circuits:
        ops = qc.count_ops()
        swaps += int(ops.get("swap", 0))
        two_q.append(int(sum(v for k, v in ops.items() if k in ("cx", "cz", "ecr", "zz", "ms", "swap"))))
    per = max(1, int(shots * len(qs) // len(specs)))
    t2 = time.time()
    # A lone circuit goes on its own: IonQ's runners take a single-circuit job.
    job = backend.run(circuits[0] if len(circuits) == 1 else circuits, shots=per)
    result = job.result()
    t3 = time.time()
    counts_list = _counts_list(result, len(circuits))
    sweeps, samples = analyze(prof, specs, counts_list, r, qs, ds_run, predict_shots=predict_shots)
    t4 = time.time()
    dmax = specs[0].d
    return json.dumps({
        "ok": True, "profile": prof, "r": r, "ds": ds_run, "qs": qs, "dropped": dropped, "dmax": dmax,
        "shots_per_circuit": per, "circuits": len(circuits), "instances": len(specs) // len(qs), "twirl": twirl,
        "qubits": specs[0].qubits, "swaps": swaps, "two_qubit_gates": two_q,
        "sweeps": sweeps, "samples": samples, "graph": graph(dmax, r, prof, qs[0]),
        "timing": {"build": t1 - t0, "transpile": t2 - t1, "run": t3 - t2, "decode": t4 - t3},
        "when": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime()),
    })
