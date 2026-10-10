"""A fast classical prediction of the same experiment.

Every fault in the detector error model either happens or doesn't, and its
effect on the classical record is a fixed bit pattern, so a shot is the XOR of
the patterns of the faults that fired. Sampling that takes milliseconds in
NumPy and gives the curve the quantum run is compared against: what this
noise model predicts, next to what the machine measured.
"""

from __future__ import annotations

import numpy as np

from .code import Spec
from .dem import Noise, faults
from .decode import Matching, majority


def sample_bits(spec: Spec, noise: Noise, shots: int, rng) -> np.ndarray:
    fl = faults(spec, noise)
    n = spec.clbits
    if not fl:
        out = np.zeros((shots, n), dtype=np.uint8)
    else:
        pats = np.array([[(f.flips >> k) & 1 for k in range(n)] for f in fl], dtype=np.uint8)
        probs = np.array([f.p for f in fl])
        hits = (rng.random((shots, len(fl))) < probs[None, :]).astype(np.uint8)
        out = (hits.astype(np.int32) @ pats.astype(np.int32)) % 2
        out = out.astype(np.uint8)
    if spec.logical:
        out[:, :spec.d] ^= 1
    return out


def predict(spec: Spec, noise: Noise, shots: int = 20000, seed: int = 11, decoder: Matching | None = None):
    """Simulated failure counts for both decoders."""
    rng = np.random.default_rng(seed)
    bits = sample_bits(spec, noise, shots, rng)
    dec = decoder or Matching(spec, noise)
    rows, counts = np.unique(bits, axis=0, return_counts=True)
    fail_m = fail_v = 0
    d = spec.d
    for row, c in zip(rows, counts):
        b = [int(x) for x in row]
        obs = b[0] ^ spec.logical
        fired = _fired(spec, b)
        if dec.decode(fired) != obs:
            fail_m += int(c)
        if majority(spec, b[:d]) != 0:
            fail_v += int(c)
    return {"shots": shots, "fail_mwpm": fail_m, "fail_major": fail_v}


def _fired(spec: Spec, b):
    from .code import detectors
    det = detectors(spec, b)
    return tuple(i for i, v in enumerate(det) if v)
