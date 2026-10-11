"""Rewrite the README results table from data/atlas.json."""
import json, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, root)
from lab.web import expand
from lab.stats import lam_fit

theory = json.load(open(os.path.join(root, "data", "theory.json"), encoding="utf-8"))

def predicted(model, q=0.06):
    """Lambda the error model predicts from the machine's published specs, fitted like the data."""
    pts = sorted([t for t in theory["models"].get(model, []) if abs(t["q"] - q) < 1e-9 and t["eps_mwpm"] > 0], key=lambda t: t["d"])
    lam, _ = lam_fit([t["d"] for t in pts], [t["eps_mwpm"] for t in pts])
    return lam

runs = json.load(open(os.path.join(root, "data", "atlas.json"), encoding="utf-8"))["runs"]
rows = []
for r in runs:
    e = expand(r)
    f = e["sweeps"][0]["fit"]
    rows.append((r["profile"]["family"], r["profile"]["label"].replace(" noise model", "").replace(" (hardware)", ", **real hardware**"), r.get("twirl", True),
                 f["lam"], f["lo"], f["hi"], r["qubits"], r["shots_per_circuit"] * r["circuits"], r.get("runs", 1), predicted(r["profile"]["model"])))
order = {"ionq": 0, "ibm": 1, "ideal": 2}
rows.sort(key=lambda x: (order[x[0]], "hardware" not in x[1], not x[2], -x[3]))
fam = {"ionq": "trapped ions", "ibm": "superconducting", "ideal": "no noise"}
lines = ["| Machine (noise model unless marked, dial at 6%) | Kind | Qubits | Shots | Λ measured | 95% interval | Λ predicted from specs |",
         "|---|---|---|---|---|---|---|"]
for fm, lab, tw, l, lo, hi, q, sh, n, pr in rows:
    name = lab + ("" if tw else ", **twirling off**")
    lines.append(f"| {name} | {fam[fm]} | {q} | {sh:,}{' (2 runs)' if n > 1 else ''} | **{l:.2f}** | {lo:.2f} – {hi:.2f} | {'' if not tw or pr is None else f'{pr:.2f}'} |")
lines.append(f"| *The dial alone, no machine noise (model)* | | | | *{predicted('ideal'):.2f}* | | |")
lines.append("| *Google Willow, surface code, native noise (2024)* | superconducting | 101 | | *2.14* | ± 0.02 | |")
lines.append("| *Google Sycamore, repetition code, native noise (2021)* | superconducting | 21 | | *2.99* | ± 0.09 | |")
p = os.path.join(root, "README.md")
s = open(p, encoding="utf-8").read()
a = s.index("| Machine (noise model")
b = s.index("\n\n", a)
s = s[:a] + "\n".join(lines) + s[b:]
open(p, "w", encoding="utf-8").write(s)
print(len(rows), "machines in the table")
