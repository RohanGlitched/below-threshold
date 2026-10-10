"""Puzzles for "Be the decoder": real samples from the same error model, where
the player pairs up detection events and we know what actually happened."""

from __future__ import annotations

import numpy as np

from .code import Spec
from .dem import Noise, faults, flips_to_events
from .decode import Matching, majority
from .experiment import graph


def puzzles(n: int = 6, d: int = 5, r: int = 2, q: float = 0.07, seed: int = 2026) -> dict:
    spec = Spec(d, r, q=q)
    noise = Noise(q=q)
    dec = Matching(spec, noise)
    fl = faults(spec, noise)
    probs = np.array([f.p for f in fl])
    rng = np.random.default_rng(seed)
    hard, easy = [], []
    for _ in range(4000):
        if len(hard) >= n and len(easy) >= n:
            break
        hits = np.flatnonzero(rng.random(len(fl)) < probs)
        if len(hits) < 2:
            continue
        x = 0
        for h in hits:
            x ^= fl[int(h)].flips
        dets, obs = flips_to_events(spec, x)
        if not (3 <= len(dets) <= 7):
            continue
        bits = [(x >> k) & 1 for k in range(spec.clbits)]
        pred, pairs = dec.match(tuple(dets))
        maj_wrong = majority(spec, bits[:d]) != 0
        truth = []
        for h in hits:
            de, ob = flips_to_events(spec, fl[int(h)].flips)
            if de:
                truth.append([int(de[0]), int(de[1]) if len(de) > 1 else dec.B, int(ob), fl[int(h)].where])
        item = {
            "fired": [int(v) for v in dets], "obs": int(obs), "bits": "".join(map(str, bits)),
            "mwpm": {"flip": int(pred), "pairs": [[int(a), int(b), dec.path(int(a), int(b))] for a, b in pairs]},
            "majority_ok": not maj_wrong, "truth": truth,
        }
        (hard if (maj_wrong or pred != obs) else easy).append(item)
    k = n // 2
    picked = easy[: n - min(k, len(hard))] + hard[:k]
    rng.shuffle(picked)
    B = dec.B
    return {
        "d": d, "r": r, "q": q, "boundary": B,
        "par": dec.par.astype(int).tolist(),
        "dist": [[round(float(v), 3) for v in row] for row in dec.dist],
        "graph": graph(d, r, {"layout": "unrolled", "prior": {"p2": 0.0, "pm": 0.0}}, q),
        "puzzles": picked,
    }
