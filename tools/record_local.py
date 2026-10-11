"""Record a run on an IBM noise model locally, in the compact format data/runs uses.

Qollab's IBM "machines" are Qiskit Aer simulators built from qiskit-ibm-runtime's
fake backends, so the same noise model runs here. Used after a decoder change,
when a recorded run's raw counts are gone and the row needs re-recording:

    python tools/record_local.py miami berlin
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import experiment

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def compact(out, run_s):
    sw = out["sweeps"][0]
    rows = [{k: x[k] for k in ("d", "qubits", "shots", "n_eff", "windows", "fail_mwpm", "fail_major", "events")} for x in sw["rows"]]
    cal = sw.get("calibration")
    if cal:
        cal = {k: cal[k] for k in ("d", "shots", "fail_prior", "fail_learned", "kinds")}
    samples = [[s["logical"], s["count"], s["bits"], s["fired"], [p[2] for p in s["pairs"]], int(s["mwpm_ok"]), int(s["major_ok"]), s["obs"]]
               for s in out["samples"]]
    return {"v": 2, "profile": out["profile"], "r": out["r"], "ds": out["ds"], "qs": out["qs"], "dmax": out["dmax"],
            "shots_per_circuit": out["shots_per_circuit"], "circuits": out["circuits"], "instances": out["instances"],
            "twirl": out["twirl"], "seed": out.get("seed"), "qubits": out["qubits"], "swaps": out["swaps"], "rows": rows,
            "run_s": int(run_s), "when": out["when"], "calibration": cal, "samples": samples, "recorded_locally": True}

for name in sys.argv[1:]:
    import qiskit_ibm_runtime.fake_provider as fp
    backend = getattr(fp, "Fake" + name.title())()
    t0 = time.time()
    out = json.loads(experiment.run(backend, ds=(3, 5, 7, 9), r=2, qs=(0.06,), shots=1600, instances=4, twirl=True, predict_shots=0))
    assert out["ok"], out
    rec = compact(out, time.time() - t0)
    p = os.path.join(root, "data", "runs", f"ibm-{name.lower()}.json")
    json.dump(rec, open(p, "w", encoding="utf-8"), separators=(",", ":"))
    f = out["sweeps"][0]["fit"]
    print(name, "lambda", round(f["lam"], 3), (round(f["lo"], 3), round(f["hi"], 3)), [(r["d"], r["fail_mwpm"], r["shots"]) for r in rec["rows"]], "->", p)
