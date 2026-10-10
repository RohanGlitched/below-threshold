"""Detector error model: every single fault the circuit can suffer, and which
detection events (and whether the logical bit) it flips.

This is what Stim computes for professional experiments, written out by hand
for the repetition code so it runs anywhere Python does. The bit-flip code only
sees X components (a Z error commutes with Z-basis readout), so a fault is just
a set of qubits whose value flips, pushed through the remaining CNOTs (an X on a
CNOT's control copies onto its target).

Noise model, per backend:
  p2  probability a CNOT leaves a Pauli error on its pair (depolarizing)
  pm  probability a measured bit is read wrong
  q   the noise dial: bit flip on each data qubit before each round and before
      the final readout
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from .code import Spec, cnot_schedule, anc_bit, window_map


@dataclass
class Noise:
    p2: float = 0.0
    pm: float = 0.0
    q: float = 0.0

    def key(self):
        return (round(self.p2, 6), round(self.pm, 6), round(self.q, 6))


@dataclass
class Fault:
    where: str            # "dial", "cnot" or "readout"
    t: int                # round (dial: injection step; cnot: round; readout: -1)
    qubits: tuple         # unrolled-layout qubits flipped at that moment
    p: float
    flips: int = 0        # bitmask over classical bits after propagation


@dataclass
class Edge:
    u: int                # detector index
    v: int                # detector index, or the boundary node
    obs: int              # 1 if this fault flips the logical bit
    p: float
    kinds: set = field(default_factory=set)


def _unrolled_cnots(spec: Spec):
    d = spec.d
    out = []
    for (t, i, j, _k) in cnot_schedule(spec):
        out.append((j, d + t * (d - 1) + i))
    return out


def faults(spec: Spec, noise: Noise) -> list[Fault]:
    d, r = spec.d, spec.r
    cn = _unrolled_cnots(spec)
    per_round = 2 * (d - 1)
    out: list[Fault] = []

    def push(slot, mask):
        for (c, t) in cn[slot:]:
            if (mask >> c) & 1:
                mask ^= 1 << t
        return mask

    if noise.q > 0:
        for step in range(r + 1):
            slot = step * per_round
            for j in range(d):
                out.append(Fault("dial", step, (j,), noise.q, push(slot, 1 << j)))
        for t in range(r):
            for i in range(d - 1):
                b = anc_bit(spec, t, i)
                out.append(Fault("dial", t, (b,), noise.q, 1 << b))

    if noise.p2 > 0:
        # Of the 15 two-qubit Paulis, 4 flip only the control, 4 only the
        # target, 4 both, and 3 neither (Z-type). Each flipping class: 4p2/15.
        for k, (c, t) in enumerate(cn):
            rnd = k // per_round
            for pat, qs in (((1 << c), (c,)), ((1 << t), (t,)), ((1 << c) | (1 << t), (c, t))):
                out.append(Fault("cnot", rnd, qs, 4 * noise.p2 / 15, push(k + 1, pat)))

    if noise.pm > 0:
        for b in range(spec.clbits):
            out.append(Fault("readout", -1, (b,), noise.pm, 1 << b))
    return out


def flips_to_events(spec: Spec, flips: int):
    """Detectors and logical flip caused by flipping the classical bits in `flips`."""
    bits = [(flips >> k) & 1 for k in range(spec.clbits)]
    d = spec.d
    layers = [[bits[anc_bit(spec, t, i)] for i in range(d - 1)] for t in range(spec.r)]
    layers.append([bits[i] ^ bits[i + 1] for i in range(d - 1)])
    dets = []
    prev = [0] * (d - 1)
    for L, layer in enumerate(layers):
        for i in range(d - 1):
            if layer[i] ^ prev[i]:
                dets.append(L * (d - 1) + i)
        prev = layer
    return tuple(dets), bits[0]


def _xor_p(a: float, b: float) -> float:
    return a * (1 - b) + b * (1 - a)


def window_faults(spec: Spec, noise: Noise, parent: Spec | None = None, offset: int = 0) -> list[Fault]:
    """Faults of `spec`, or of the window of `parent` that `spec` describes.

    For a window, every fault of the whole circuit is projected onto the
    window's bits, so the edge qubits' extra CNOTs (to checks outside the
    window) are counted too."""
    if parent is None:
        return faults(spec, noise)
    m = window_map(parent, offset, spec.d)
    out = []
    for f in faults(parent, noise):
        x = 0
        for k, b in enumerate(m):
            if (f.flips >> b) & 1:
                x |= 1 << k
        if x:
            out.append(Fault(f.where, f.t, f.qubits, f.p, x))
    return out


def detector_error_model(spec: Spec, noise: Noise, parent: Spec | None = None, offset: int = 0):
    """Merge faults into graph edges. Node `n_det` is the boundary."""
    n_det = (spec.r + 1) * (spec.d - 1)
    B = n_det
    merged: dict = {}
    for f in window_faults(spec, noise, parent, offset):
        dets, obs = flips_to_events(spec, f.flips)
        if not dets and not obs:
            continue
        if len(dets) > 2:
            raise ValueError(f"fault {f} fires {len(dets)} detectors; not a graph")
        if len(dets) == 0:
            # Flips the logical bit and no detector: undetectable. Only a
            # final readout flip of data 0 in a d=1 code does this.
            continue
        u, v = (dets[0], B) if len(dets) == 1 else dets
        key = (u, v, obs)
        e = merged.get(key)
        if e is None:
            merged[key] = Edge(u, v, obs, f.p, {f.where})
        else:
            e.p = _xor_p(e.p, f.p)
            e.kinds.add(f.where)
    return n_det, list(merged.values())


def edge_kind(spec: Spec, e: Edge, B: int) -> str:
    """Name an edge by its shape in the space-time graph."""
    c = spec.d - 1
    if e.v == B:
        return "boundary"
    tu, iu = divmod(e.u, c)
    tv, iv = divmod(e.v, c)
    if tu == tv:
        return "space"
    if iu == iv:
        return "time"
    return "diagonal"
