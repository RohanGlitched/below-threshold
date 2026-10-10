"""Two decoders for the repetition code.

Majority vote reads only the final data qubits and ignores every syndrome: the
classical repetition code. Minimum-weight perfect matching (MWPM) uses the whole
syndrome history: it pairs up detection events (or sends one to the boundary)
along the most likely chains of faults in the detector error model, and
predicts whether those chains flipped the logical bit.

Pure Python plus NumPy, so it runs in the browser. Exact matching by dynamic
programming over subsets for up to EXACT_MAX events; networkx's blossom
matching above that (rare at the noise levels this lab uses).
"""

from __future__ import annotations

import math

import numpy as np

from .code import Spec
from .dem import Noise, detector_error_model

EXACT_MAX = 16


def majority(spec: Spec, data_bits: list[int]) -> int:
    """Predicted logical flip from the final data readout alone."""
    ones = sum(data_bits)
    value = 1 if ones * 2 > spec.d else 0
    return value ^ spec.logical


class Matching:
    def __init__(self, spec: Spec, noise: Noise | None = None, parent: Spec | None = None, offset: int = 0,
                 edges=None):
        self.spec = spec
        if edges is None:
            n_det, edges = detector_error_model(spec, noise, parent, offset)
        else:
            n_det = (spec.r + 1) * (spec.d - 1)
        self.n_det = n_det
        self.B = n_det
        n = n_det + 1
        self.edges = edges
        W = np.full((n, n), np.inf)
        P = np.zeros((n, n), dtype=np.int8)
        for e in edges:
            p = min(max(e.p, 1e-12), 0.5 - 1e-12)
            w = math.log((1 - p) / p)
            if w < W[e.u, e.v]:
                W[e.u, e.v] = W[e.v, e.u] = w
                P[e.u, e.v] = P[e.v, e.u] = e.obs
        np.fill_diagonal(W, 0.0)
        # Floyd-Warshall that also tracks the logical parity and next hop of
        # every shortest path. Graphs here have at most ~30 nodes.
        dist = W.copy()
        par = P.copy()
        nxt = np.where(np.isfinite(W), np.arange(n)[None, :], -1)
        for k in range(n):
            via = dist[:, k:k + 1] + dist[k:k + 1, :]
            better = via < dist - 1e-12
            if better.any():
                dist = np.where(better, via, dist)
                par = np.where(better, par[:, k:k + 1] ^ par[k:k + 1, :], par)
                nxt = np.where(better, nxt[:, k:k + 1], nxt)
        self.dist = dist
        self.par = par
        self.nxt = nxt
        self.cache: dict = {}

    def path(self, a: int, b: int) -> list[int]:
        out = [a]
        guard = 0
        while a != b and guard < 200:
            a = int(self.nxt[a, b])
            if a < 0:
                break
            out.append(a)
            guard += 1
        return out

    def match(self, fired: tuple):
        """Return (predicted logical flip, list of matched pairs)."""
        hit = self.cache.get(fired)
        if hit is not None:
            return hit
        m = len(fired)
        if m == 0:
            res = (0, [])
        elif m <= EXACT_MAX:
            res = self._exact(fired)
        else:
            res = self._blossom(fired)
        self.cache[fired] = res
        return res

    def decode(self, fired: tuple) -> int:
        return self.match(fired)[0]

    def _exact(self, f):
        """Minimum-weight matching over subsets, memoised on bitmasks.

        A pair (i, j) is only worth trying when joining them is cheaper than
        sending both to the boundary, which prunes most branches."""
        B, dist, par = self.B, self.dist, self.par
        m = len(f)
        db = [float(dist[a, B]) for a in f]
        pb = [int(par[a, B]) for a in f]
        opts = []
        for i in range(m):
            row = []
            for j in range(i + 1, m):
                w = float(dist[f[i], f[j]])
                if w < db[i] + db[j]:
                    row.append((j, w, int(par[f[i], f[j]])))
            opts.append(row)
        memo = {0: (0.0, 0, -1)}

        def solve(mask):
            got = memo.get(mask)
            if got is not None:
                return got
            i = (mask & -mask).bit_length() - 1
            rest = mask & ~(1 << i)
            c, p, _ = solve(rest)
            best = (c + db[i], p ^ pb[i], -1)
            for j, w, pj in opts[i]:
                if rest >> j & 1:
                    c2, p2, _ = solve(rest & ~(1 << j))
                    if c2 + w < best[0]:
                        best = (c2 + w, p2 ^ pj, j)
            memo[mask] = best
            return best

        full = (1 << m) - 1
        _c, parity, _ = solve(full)
        pairs, mask = [], full
        while mask:
            i = (mask & -mask).bit_length() - 1
            _c, _p, j = memo[mask]
            if j < 0:
                pairs.append((f[i], B))
                mask &= ~(1 << i)
            else:
                pairs.append((f[i], f[j]))
                mask &= ~(1 << i) & ~(1 << j)
        return (parity, pairs)

    def _blossom(self, f):
        B, dist, par = self.B, self.dist, self.par
        try:
            import networkx as nx
        except ImportError:  # greedy fallback, never hit in practice
            left = list(f)
            p, prs = 0, []
            while left:
                u = left.pop(0)
                cands = [(dist[u, v], v) for v in left] + [(dist[u, B], B)]
                _w, v = min(cands)
                p ^= int(par[u, v])
                prs.append((u, v))
                if v != B:
                    left.remove(v)
            return (p, prs)
        G = nx.Graph()
        for a in f:
            G.add_edge(("d", a), ("b", a), w=float(dist[a, B]))
            for b in f:
                if a < b:
                    G.add_edge(("d", a), ("d", b), w=float(dist[a, b]))
                    G.add_edge(("b", a), ("b", b), w=0.0)
        big = 1.0 + max(e["w"] for *_x, e in G.edges(data=True))
        for *_x, e in G.edges(data=True):
            e["neg"] = big - e["w"]
        M = nx.max_weight_matching(G, maxcardinality=True, weight="neg")
        p, prs = 0, []
        for u, v in M:
            if u[0] == "b" and v[0] == "b":
                continue
            if u[0] == "d" and v[0] == "d":
                a, b = u[1], v[1]
            else:
                a, b = (u[1] if u[0] == "d" else v[1]), B
            p ^= int(par[a, b])
            prs.append((a, b))
        return (p, prs)
