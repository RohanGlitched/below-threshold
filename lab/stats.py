"""Turning failure counts into the numbers the papers report.

Logical error per round, as in Google's 2021 repetition-code paper:
    2 P_L = 1 - (1 - 2 eps)^r   so   eps = (1 - (1 - 2 P_L)^(1/r)) / 2
Suppression factor between distances d and d + 2:
    Lambda = eps_d / eps_(d+2)
and a single Lambda fitted across every distance from
    eps_d = C / Lambda^((d + 1) / 2).
"""

from __future__ import annotations

import math

import numpy as np

Z95 = 1.959963984540054


def wilson(k: int, n: int, z: float = Z95):
    if n <= 0:
        return (0.0, 0.0, 1.0)
    p = k / n
    den = 1 + z * z / n
    mid = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return (p, max(0.0, mid - half), min(1.0, mid + half))


def per_round(P: float, r: int) -> float:
    if P >= 0.5:
        return 0.5
    if P <= 0:
        return 0.0
    return 0.5 * (1 - (1 - 2 * P) ** (1.0 / r))


def lam_fit(ds, eps, weights=None):
    """Weighted least squares of ln eps against (d + 1) / 2. Returns (Lambda, C)."""
    xs, ys, ws = [], [], []
    for i, (d, e) in enumerate(zip(ds, eps)):
        if e and e > 0:
            xs.append((d + 1) / 2)
            ys.append(math.log(e))
            ws.append(1.0 if weights is None else max(weights[i], 1e-9))
    if len(xs) < 2:
        return (None, None)
    x, y, w = np.array(xs), np.array(ys), np.array(ws)
    W = w.sum()
    mx, my = (w * x).sum() / W, (w * y).sum() / W
    sxx = (w * (x - mx) ** 2).sum()
    if sxx <= 0:
        return (None, None)
    slope = (w * (x - mx) * (y - my)).sum() / sxx
    icpt = my - slope * mx
    return (math.exp(-slope), math.exp(icpt))


def summarize(rows, r: int, draws: int = 2000, seed: int = 7):
    """rows: [{"d", "shots", "fail_mwpm", "fail_major"}], sorted by d.

    Adds P_L with Wilson intervals, eps per round, pairwise Lambda and the
    fitted Lambda, each with a 95% interval from a parametric bootstrap."""
    rng = np.random.default_rng(seed)
    out = {"rows": [], "pairs": [], "fit": None}
    for row in rows:
        n = row["shots"]
        n_eff = row.get("n_eff") or n
        res = dict(row)
        for name in ("mwpm", "major"):
            k = row[f"fail_{name}"]
            p = k / n if n else 0.0
            # interval from the independent sample size, centred on the full rate
            _p, lo, hi = wilson(round(p * n_eff), n_eff)
            lo, hi = min(lo, p), max(hi, p)
            res[f"P_{name}"] = p
            res[f"P_{name}_lo"] = lo
            res[f"P_{name}_hi"] = hi
            res[f"eps_{name}"] = per_round(p, r)
            res[f"eps_{name}_lo"] = per_round(lo, r)
            res[f"eps_{name}_hi"] = per_round(hi, r)
            # rule of three: with no failures, P < 3/n at 95%
            res[f"zero_{name}"] = k == 0
        out["rows"].append(res)

    # bootstrap: resample each distance's failures from its measured rate
    ds = [row["d"] for row in rows]
    ns = np.array([row.get("n_eff") or row["shots"] for row in rows])
    ks = np.array([round(row["fail_mwpm"] / max(row["shots"], 1) * (row.get("n_eff") or row["shots"])) for row in rows])
    ps = np.where(ns > 0, ks / np.maximum(ns, 1), 0)
    sim = rng.binomial(ns[None, :], ps[None, :], size=(draws, len(rows)))
    eps_sim = 0.5 * (1 - np.clip(1 - 2 * sim / np.maximum(ns, 1), 1e-12, None) ** (1.0 / r))

    for a in range(len(rows) - 1):
        b = a + 1
        ea, eb = out["rows"][a]["eps_mwpm"], out["rows"][b]["eps_mwpm"]
        kb_raw = rows[b]["fail_mwpm"]
        pair = {"from": ds[a], "to": ds[b], "lam": None, "lo": None, "hi": None, "bound": False}
        if kb_raw == 0 and ks[a] > 0:
            # no failures at the larger distance: Lambda is only bounded below
            ub = per_round(3.0 / ns[b], r)
            pair.update(lam=ea / ub, bound=True)
        elif ea > 0 and eb > 0:
            ok = (eps_sim[:, a] > 0) & (eps_sim[:, b] > 0)
            ratio = eps_sim[ok, a] / eps_sim[ok, b]
            pair.update(lam=ea / eb)
            if ratio.size > 20:
                pair.update(lo=float(np.percentile(ratio, 2.5)), hi=float(np.percentile(ratio, 97.5)))
        out["pairs"].append(pair)

    eps = [row["eps_mwpm"] for row in out["rows"]]
    # weights on the same footing as the bootstrap: failures counted over the
    # non-overlapping windows, so the point estimate sits inside its own interval
    w = [int(k) for k in ks]
    lam, C = lam_fit(ds, eps, w)
    if lam is not None:
        fits = []
        for s in range(draws):
            l2, _ = lam_fit(ds, list(eps_sim[s]), list(sim[s]))
            if l2 is not None and math.isfinite(l2):
                fits.append(l2)
        lo = float(np.percentile(fits, 2.5)) if len(fits) > 20 else None
        hi = float(np.percentile(fits, 97.5)) if len(fits) > 20 else None
        out["fit"] = {"lam": lam, "C": C, "lo": lo, "hi": hi}
    return out
