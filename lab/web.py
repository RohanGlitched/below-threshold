"""What main.js calls. Every function returns a JSON string, so the page gets
plain data and never has to walk Python proxies."""

from __future__ import annotations

import json

from . import experiment
from .code import Spec

# Paths are written out in full so Qollab's runtime ships these files.
ATLAS_FILE = "data/atlas.json"
THEORY_FILE = "data/theory.json"
GAME_FILE = "data/game.json"

R = 2
DISTANCES = (3, 5, 7, 9)
DIALS = (0.0, 0.02, 0.04, 0.06, 0.08, 0.10)


def _read(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return None


def expand(run: dict) -> dict:
    """Rebuild a recorded run (stored compactly) into what the page draws."""
    if run.get("v") != 2:
        return run
    from .stats import summarize
    prof = run["profile"]
    r, q = run["r"], run["qs"][0]
    rows = [dict(x) for x in run["rows"]]
    for x in rows:
        x["events_per_shot"] = x["events"] / max(x["shots"], 1)
    sweep = {"q": q, **summarize(rows, r), "theory": [], "calibration": run.get("calibration")}
    samples = []
    for (L, c, bits, fired, paths, mw, mj, obs) in run.get("samples", []):
        samples.append({"logical": L, "count": c, "bits": bits, "fired": fired,
                        "pairs": [[p[0], p[-1], p] for p in paths],
                        "mwpm_ok": bool(mw), "major_ok": bool(mj), "obs": obs})
    out = {k: v for k, v in run.items() if k not in ("rows", "samples", "v")}
    out.update(ok=True, sweeps=[sweep], samples=samples, graph=experiment.graph(run["dmax"], r, prof, q),
               recorded=True)
    return out


def boot(backend) -> str:
    """The machine that was picked, what fits on it, and the recorded data."""
    prof = experiment.profile(backend)
    fits = []
    for d in DISTANCES:
        need = Spec(d, R, layout=prof["layout"]).qubits
        fits.append({"d": d, "qubits": need, "fits": need <= (prof.get("max_qubits") or 24)})
    return json.dumps({
        "profile": prof, "r": R, "distances": fits, "dials": list(DIALS),
        "atlas": {"runs": [expand(x) for x in (_read(ATLAS_FILE) or {}).get("runs", [])]},
        "theory": _read(THEORY_FILE) or {},
        "game": _read(GAME_FILE),
    })


def run(backend, q: float = 0.06, shots: int = 1600, twirl: bool = True) -> str:
    """One memory experiment at every distance that fits, in one job."""
    try:
        out = experiment.run(backend, ds=DISTANCES, r=R, qs=(float(q),), shots=int(shots),
                             instances=4, twirl=bool(twirl), predict_shots=0)
        _save(out)
        return out
    except Exception as exc:  # the page explains it; the console keeps the trace
        import traceback
        traceback.print_exc()
        msg = str(exc)
        kind = "one_job" if "one job" in msg.lower() else "failed"
        return json.dumps({"ok": False, "error": kind, "message": msg[:400]})


def _save(payload: str):
    """Put the run in Qollab's console as a JSON file anyone can download."""
    try:
        from js import sendFile
        sendFile("below-threshold-run.json", "application/json", payload)
    except Exception:
        pass


def circuit_text(d: int = 3, q: float = 0.06) -> str:
    """A small circuit, drawn as text, for the how-it-works section."""
    from .code import build_circuit
    qc = build_circuit(Spec(int(d), R, q=float(q)))
    return json.dumps({"text": str(qc.draw(output="text", fold=-1))})
