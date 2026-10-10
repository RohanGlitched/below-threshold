"""Learn the decoding graph from the shots themselves.

Every edge of the graph is an independent error mechanism that flips its two
detectors together. Two detectors that share an edge fire together more often
than chance, and the excess gives that edge's probability (Google Quantum AI,
Nature 595, 383, 2021, supplementary "p_ij" method):

    p_ij = 1/2 - 1/2 sqrt(1 - 4 (<x_i x_j> - <x_i><x_j>) / (1 - 2<x_i> - 2<x_j> + 4<x_i x_j>))

A boundary edge has only one detector; what is left of that detector's firing
rate after its other edges are accounted for is the boundary edge:

    1 - 2<x_i> = (1 - 2 p_iB) * prod_j (1 - 2 p_ij)

The decoder then weights edges by what this machine actually did, not by what
its data sheet says.
"""

from __future__ import annotations

import math

import numpy as np

from .dem import Edge, detector_error_model, edge_kind

P_MIN, P_MAX = 1e-4, 0.45


def moments(n_det: int, shots):
    """shots: iterable of (fired detector tuple, count). Returns N, <x>, <xx>."""
    N = 0
    m1 = np.zeros(n_det)
    m2 = np.zeros((n_det, n_det))
    for fired, c in shots:
        N += c
        if not fired:
            continue
        idx = np.array(fired, dtype=int)
        m1[idx] += c
        m2[np.ix_(idx, idx)] += c
    if N:
        m1 /= N
        m2 /= N
    return N, m1, m2


def learn(spec, prior_noise, shots):
    """Edges of `spec`'s graph with probabilities estimated from `shots`."""
    n_det, prior = detector_error_model(spec, prior_noise)
    # every kind of edge must exist to be learned, even where the prior says 0
    from .dem import Noise
    shape = Noise(p2=max(prior_noise.p2, 1e-3), pm=max(prior_noise.pm, 1e-3), q=prior_noise.q)
    _n, structure = detector_error_model(spec, shape)
    have = {(e.u, e.v): e for e in prior}
    prior = [have.get((e.u, e.v), Edge(e.u, e.v, e.obs, 0.0, set(e.kinds))) for e in structure]
    B = n_det
    N, x, xx = moments(n_det, shots)
    learned = []
    inner = {}
    for e in prior:
        if e.v == B:
            continue
        i, j = e.u, e.v
        num = xx[i, j] - x[i] * x[j]
        den = 1 - 2 * x[i] - 2 * x[j] + 4 * xx[i, j]
        p = e.p
        if N > 0 and den > 1e-9:
            arg = 1 - 4 * num / den
            if arg >= 0:
                p = 0.5 - 0.5 * math.sqrt(arg)
        p = min(max(p, P_MIN), P_MAX)
        inner[(i, j)] = p
        learned.append(Edge(i, j, e.obs, p, set(e.kinds)))
    for e in prior:
        if e.v != B:
            continue
        i = e.u
        prod = 1.0
        for (a, b), p in inner.items():
            if a == i or b == i:
                prod *= 1 - 2 * p
        p = e.p
        if N > 0 and prod > 1e-9:
            p = 0.5 - 0.5 * (1 - 2 * x[i]) / prod
        p = min(max(p, P_MIN), P_MAX)
        learned.append(Edge(i, B, e.obs, p, set(e.kinds)))
    return n_det, prior, learned, N


def summary(spec, prior, learned, B):
    """Mean probability per edge kind, before and after learning."""
    out = {}
    for name, edges in (("prior", prior), ("learned", learned)):
        acc = {}
        for e in edges:
            k = edge_kind(spec, e, B)
            acc.setdefault(k, []).append(e.p)
        out[name] = {k: float(np.mean(v)) for k, v in acc.items()}
    return out
