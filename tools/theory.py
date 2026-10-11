"""Precompute the classical predictions the page draws (data/theory.json).

For every machine's noise prior and a grid of dial settings: logical error
per shot and per round at each distance, for both decoders, from the same
detector error model the decoder uses. Run: python tools/theory.py
"""
import json
import os
import sys
import time
from multiprocessing import Pool

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lab.code import Spec
from lab.dem import Noise
from lab.sim import predict
from lab.stats import per_round
from lab.experiment import PRIORS

R = 2
DS = (3, 5, 7, 9)
QS = [round(0.01 * k, 2) for k in range(0, 15)]
MODELS = ["ideal", "aria-1", "aria-2", "forte-1", "forte-enterprise-1", "ibm_heron_r2", "ibm_heron_r3", "ibm_nighthawk"]
SQUARE_QS = [0.02, 0.04, 0.06, 0.08, 0.09, 0.10, 0.11, 0.12, 0.13, 0.14, 0.16, 0.18, 0.20]
SHOTS = int(os.environ.get("SHOTS", "20000"))


def job(args):
    kind, model, q, d, r = args
    p2, pm = PRIORS[model]
    noise = Noise(p2=p2, pm=pm, q=q)
    if p2 == 0 and pm == 0 and q == 0:
        return (kind, model, q, d, r, 0.0, 0.0)
    # IBM noise models run the measure-and-reset layout (Nighthawk without reset),
    # the others fresh ancillas, so the prediction matches what each machine ran
    layout = "reuse" if model.startswith("ibm") else "unrolled"
    pr = predict(Spec(d, r, q=q, layout=layout, reset=(model != "ibm_nighthawk")), noise, shots=SHOTS, seed=1000 + d)
    return (kind, model, q, d, r, pr["fail_mwpm"] / pr["shots"], pr["fail_major"] / pr["shots"])


if __name__ == "__main__":
    t0 = time.time()
    only_square = os.environ.get("ONLY_SQUARE") == "1"
    only_models = [m for m in os.environ.get("ONLY_MODELS", "").split(",") if m]
    models = only_models or MODELS
    jobs = [] if only_square else [("sweep", m, q, d, R) for m in models for q in QS for d in DS]
    # threshold panel: rounds grow with distance (r = d), ideal machine
    if not only_models:
        jobs += [("square", "ideal", q, d, d) for q in SQUARE_QS for d in (3, 5, 7)]
    jobs.sort(key=lambda j: -(j[3] * j[2]))  # slow ones first
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "theory.json")
    if only_square and os.path.exists(path):
        out = json.load(open(path, encoding="utf-8"))
        out["square"] = {}
    elif only_models and os.path.exists(path):
        out = json.load(open(path, encoding="utf-8"))
        for m in only_models:
            out["models"][m] = []
    else:
        out = {"r": R, "shots": SHOTS, "distances": list(DS), "dials": QS, "models": {}, "square": {}}
    out["square_dials"] = SQUARE_QS
    with Pool(max(1, os.cpu_count() - 1)) as pool:
        for i, (kind, m, q, d, r, pm_, pv_) in enumerate(pool.imap_unordered(job, jobs)):
            row = {"d": d, "q": q, "r": r, "P_mwpm": pm_, "P_major": pv_,
                   "eps_mwpm": per_round(pm_, r), "eps_major": per_round(pv_, r)}
            if kind == "sweep":
                out["models"].setdefault(m, []).append(row)
            else:
                out["square"].setdefault("ideal", []).append(row)
            if i % 20 == 0:
                print(i, "/", len(jobs), round(time.time() - t0), "s", flush=True)
    for v in list(out["models"].values()) + list(out["square"].values()):
        v.sort(key=lambda x: (x["q"], x["d"]))
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print("wrote", path, os.path.getsize(path), "bytes in", round(time.time() - t0), "s")
