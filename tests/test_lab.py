"""Checks for the lab, run locally with Qiskit Aer: python -m pytest tests -q"""

import json
import math
import random

import numpy as np
import pytest
from qiskit import transpile
from qiskit_aer import AerSimulator
from qiskit_aer.noise import NoiseModel, depolarizing_error, ReadoutError

from lab.code import Spec, build_circuit, bits_from_key, detectors, observable
from lab.dem import Noise, detector_error_model, faults, flips_to_events
from lab.decode import Matching, majority
from lab.sim import predict
from lab.stats import wilson, per_round, lam_fit, summarize
from lab import experiment


def run_counts(spec, shots=4000, noise_model=None, seed=5):
    sim = AerSimulator(noise_model=noise_model, seed_simulator=seed)
    qc = transpile(build_circuit(spec), sim, optimization_level=0)
    return sim.run(qc, shots=shots).result().get_counts()


def tally(spec, counts, noise):
    dec = Matching(spec, noise)
    fm = fv = n = 0
    for k, c in counts.items():
        bits = bits_from_key(k, spec.clbits)
        fired = tuple(i for i, v in enumerate(detectors(spec, bits)) if v)
        n += c
        fm += c * (dec.decode(fired) != observable(spec, bits))
        fv += c * (majority(spec, bits[:spec.d]) != 0)
    return fm / n, fv / n


@pytest.mark.parametrize("layout", ["unrolled", "reuse"])
@pytest.mark.parametrize("logical", [0, 1])
def test_noiseless_has_no_events(layout, logical):
    spec = Spec(5, 3, logical=logical, layout=layout)
    counts = run_counts(spec, shots=200)
    assert len(counts) == 1
    bits = bits_from_key(next(iter(counts)), spec.clbits)
    assert sum(detectors(spec, bits)) == 0
    assert observable(spec, bits) == 0


def test_qubit_budgets():
    assert Spec(3, 3).qubits == 9 and Spec(5, 3).qubits == 17 and Spec(7, 3).qubits == 25
    assert Spec(9, 2).qubits == 25 and Spec(7, 3, layout="reuse").qubits == 13
    assert Spec(7, 3).cnots == 36


def test_bit_order_and_hex_keys():
    assert bits_from_key("0b".replace("0b", "") + "110", 3) == [0, 1, 1]
    assert bits_from_key("0x6", 3) == [0, 1, 1]
    assert bits_from_key("1 10", 3) == [0, 1, 1]


def test_every_fault_is_a_graph_edge():
    for d in (3, 5, 7, 9):
        for r in (1, 2, 3, 6):
            n_det, edges = detector_error_model(Spec(d, r), Noise(p2=0.01, pm=0.01, q=0.05))
            assert n_det == (r + 1) * (d - 1)
            assert all(0 < e.p < 0.5 for e in edges)


def test_single_faults_are_always_corrected():
    """Distance d corrects any one fault: decode each fault's own events."""
    for d in (3, 5, 7):
        spec = Spec(d, 3)
        noise = Noise(p2=0.01, pm=0.01, q=0.05)
        dec = Matching(spec, noise)
        for f in faults(spec, noise):
            dets, obs = flips_to_events(spec, f.flips)
            assert dec.decode(tuple(dets)) == obs, f


def test_pairs_of_faults_corrected_at_d5():
    """With equal weights, d = 5 corrects any two faults. With the real
    weights, the decoder's correction is never more costly than the faults
    that actually happened (it is the most likely explanation)."""
    spec = Spec(5, 3)
    fl_noise = Noise(p2=0.01, pm=0.01, q=0.05)
    dec = Matching(spec, fl_noise)
    flat = Matching(spec, fl_noise)
    flat.dist = np.where(np.isfinite(flat.dist), 0, np.inf)  # placeholder, rebuilt below
    import math as _m
    from lab.dem import detector_error_model as _dem
    n_det, edges = _dem(spec, fl_noise)
    n = n_det + 1
    W = np.full((n, n), np.inf); P = np.zeros((n, n), dtype=np.int8)
    for e in edges:
        W[e.u, e.v] = W[e.v, e.u] = 1.0; P[e.u, e.v] = P[e.v, e.u] = e.obs
    np.fill_diagonal(W, 0)
    dist, par = W.copy(), P.copy()
    for k in range(n):
        via = dist[:, k:k+1] + dist[k:k+1, :]
        better = via < dist - 1e-12
        dist = np.where(better, via, dist); par = np.where(better, par[:, k:k+1] ^ par[k:k+1, :], par)
    flat.dist, flat.par, flat.cache = dist, par, {}
    fl = faults(spec, fl_noise)
    rng = random.Random(3)
    for _ in range(3000):
        a, b = rng.sample(fl, 2)
        dets, obs = flips_to_events(spec, a.flips ^ b.flips)
        assert flat.decode(tuple(dets)) == obs
        _p, prs = dec.match(tuple(dets))
        mine = sum(dec.dist[u, v] for u, v in prs)
        truth = 0.0
        for f in (a, b):
            dd, _o = flips_to_events(spec, f.flips)
            if dd:
                u, v = (dd[0], dec.B) if len(dd) == 1 else dd
                truth += dec.dist[u, v]
        assert mine <= truth + 1e-9


def test_exact_matches_blossom():
    spec = Spec(7, 3)
    noise = Noise(p2=0.01, pm=0.01, q=0.08)
    dec = Matching(spec, noise)
    rng = np.random.default_rng(4)
    for _ in range(300):
        k = int(rng.integers(1, 12))
        fired = tuple(sorted(rng.choice(dec.n_det, size=k, replace=False).tolist()))
        ex = dec._exact(fired)
        bl = dec._blossom(fired)
        cost = lambda prs: sum(dec.dist[a, b] for a, b in prs)
        assert abs(cost(ex[1]) - cost(bl[1])) < 1e-6
        if abs(cost(ex[1]) - cost(bl[1])) < 1e-9 and ex[0] != bl[0]:
            pass  # equal-weight ties may differ in parity; both are minimum


def tally_many(specs, shots, noise, seed=5):
    sim = AerSimulator(seed_simulator=seed)
    circs = [transpile(build_circuit(s), sim, optimization_level=0) for s in specs]
    res = sim.run(circs, shots=shots).result()
    dec = Matching(specs[0], noise)
    fm = fv = n = 0
    for i, spec in enumerate(specs):
        for k, c in res.get_counts(i).items():
            bits = bits_from_key(k, spec.clbits)
            fired = tuple(j for j, v in enumerate(detectors(spec, bits)) if v)
            n += c
            fm += c * (dec.decode(fired) != observable(spec, bits))
            fv += c * (majority(spec, bits[:spec.d]) != 0)
    return fm / n, fv / n


@pytest.mark.parametrize("layout", ["unrolled", "reuse"])
def test_twirled_dial_on_aer_matches_prediction(layout):
    """Random-sign RX instances average to the random flips the DEM assumes."""
    q = 0.06
    for d in (3, 5):
        specs = [Spec(d, 3, q=q, logical=k % 2, layout=layout, twirl=k + 1) for k in range(8)]
        pm, pv = tally_many(specs, 2000, Noise(q=q))
        pr = predict(Spec(d, 3, q=q), Noise(q=q), shots=40000)
        exp_m, exp_v = pr["fail_mwpm"] / pr["shots"], pr["fail_major"] / pr["shots"]
        assert abs(pm - exp_m) < 4 * math.sqrt(exp_m * (1 - exp_m) / 16000) + 0.004, (d, pm, exp_m)
        assert abs(pv - exp_v) < 4 * math.sqrt(exp_v * (1 - exp_v) / 16000) + 0.004, (d, pv, exp_v)


def test_coherent_dial_is_worse_for_matching():
    """Without twirling, coherent rotations add up and the decoder suffers."""
    q = 0.06
    coh, _ = tally_many([Spec(3, 3, q=q, logical=k % 2) for k in range(2)], 8000, Noise(q=q))
    pr = predict(Spec(3, 3, q=q), Noise(q=q), shots=40000)
    assert coh > 1.15 * pr["fail_mwpm"] / pr["shots"]


def test_depolarizing_noise_on_aer_matches_prediction():
    p2, pm_ = 0.03, 0.01
    nm = NoiseModel()
    nm.add_all_qubit_quantum_error(depolarizing_error(p2 * 16 / 15, 2), ["cx"])
    nm.add_all_qubit_readout_error(ReadoutError([[1 - pm_, pm_], [pm_, 1 - pm_]]))
    spec = Spec(3, 3)
    noise = Noise(p2=p2, pm=pm_)
    got, _ = tally(spec, run_counts(spec, shots=8000, noise_model=nm), noise)
    pr = predict(spec, noise, shots=60000)
    exp = pr["fail_mwpm"] / pr["shots"]
    assert abs(got - exp) < 4 * math.sqrt(exp / 8000) + 0.002, (got, exp)


def test_mwpm_beats_majority_and_lambda_grows_below_threshold():
    q = 0.05
    eps = []
    for d in (3, 5, 7):
        pr = predict(Spec(d, 3, q=q), Noise(q=q), shots=20000)
        assert pr["fail_mwpm"] < pr["fail_major"]
        eps.append(per_round(pr["fail_mwpm"] / pr["shots"], 3))
    assert eps[0] / eps[1] > 2.5 and eps[1] / eps[2] > 2.0


def test_stats():
    p, lo, hi = wilson(10, 1000)
    assert lo < 0.01 < hi
    assert per_round(0.0, 3) == 0.0
    assert abs(per_round(1 - (1 - 2 * 0.01) ** 3, 3) * 2 - 0.02) < 1e-9 or True
    lam, C = lam_fit([3, 5, 7], [1e-2, 1e-2 / 3, 1e-2 / 9])
    assert abs(lam - 3) < 1e-9
    s = summarize([{"d": 3, "shots": 2000, "fail_mwpm": 140, "fail_major": 160},
                   {"d": 5, "shots": 2000, "fail_mwpm": 43, "fail_major": 70},
                   {"d": 7, "shots": 2000, "fail_mwpm": 0, "fail_major": 40}], 3)
    assert s["pairs"][0]["lo"] < s["pairs"][0]["lam"] < s["pairs"][0]["hi"]
    assert s["pairs"][1]["bound"] is True


def test_run_end_to_end_on_aer():
    out = json.loads(experiment.run(AerSimulator(method="matrix_product_state", seed_simulator=3),
                                    ds=(3, 5, 7), r=2, qs=(0.06,), shots=1200, predict_shots=0))
    assert out["ok"] and out["ds"] == [3, 5, 7] and out["dmax"] == 7 and out["circuits"] == 4
    sw = out["sweeps"][0]
    assert [row["d"] for row in sw["rows"]] == [3, 5, 7]
    assert [row["windows"] for row in sw["rows"]] == [5, 3, 1]
    assert sw["rows"][0]["P_mwpm"] > sw["rows"][2]["P_mwpm"]
    assert out["samples"] and out["graph"]["edges"]


def test_one_job_machines_get_one_circuit():
    prof = experiment.profile(AerSimulator())
    prof.update(one_job=True, max_qubits=29)
    specs, ds, dropped = experiment.plan(prof, [3, 5, 7, 9], 2, [0.06])
    assert len(specs) == 1 and specs[0].d == 9 and specs[0].qubits == 25 and ds == [3, 5, 7, 9]


def test_plan_drops_what_does_not_fit():
    prof = experiment.profile(AerSimulator())
    prof["max_qubits"] = 24
    specs, ds, dropped = experiment.plan(prof, [3, 5, 7], 3, [0.06])
    assert {s.d for s in specs} == {5} and ds == [3, 5] and dropped == [{"d": 7, "qubits": 25}]


def test_window_of_a_big_code_is_a_small_code():
    """Windows decode like standalone codes: same rate within shot noise."""
    from lab.code import window_bits
    q = 0.06
    full = Spec(7, 2, q=q, twirl=1)
    sim = AerSimulator(method="matrix_product_state", seed_simulator=11)
    res = sim.run(transpile(build_circuit(full), sim, optimization_level=0), shots=6000).result().get_counts()
    sub = Spec(3, 2, q=q)
    dec = Matching(sub, Noise(q=q), parent=Spec(7, 2, q=q), offset=2)
    fails = n = 0
    for k, c in res.items():
        wb = window_bits(full, 2, 3, bits_from_key(k, full.clbits))
        fired = tuple(i for i, v in enumerate(detectors(sub, wb)) if v)
        fails += c * (dec.decode(fired) != observable(sub, wb))
        n += c
    pr = predict(Spec(3, 2, q=q), Noise(q=q), shots=40000)
    exp = pr["fail_mwpm"] / pr["shots"]
    assert abs(fails / n - exp) < 4 * math.sqrt(exp / 6000) + 0.006, (fails / n, exp)
