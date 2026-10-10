"""The bit-flip repetition code as a memory experiment.

One experiment is `d` data qubits holding a logical bit for `r` rounds of
syndrome extraction. Check `i` compares data qubits `i` and `i + 1` through an
ancilla. Two layouts produce exactly the same classical record:

* "unrolled": a fresh ancilla for every check in every round, and every qubit
  is measured once, at the very end. IonQ's path through Qollab cannot measure
  in the middle of a circuit, and by the deferred-measurement principle an
  ancilla that is never touched again can be read at the end with the same
  statistics. Qubits: d + r(d - 1).
* "reuse": d - 1 ancillas measured and reset every round, the way Google and
  IBM run it. Qubits: 2d - 1. Used on the IBM noise models, where 25 qubits of
  noisy statevector would be too slow in a browser.

Classical bit k always means the same thing in both layouts: bits 0..d-1 are
the final data readout, and bit d + t(d - 1) + i is check i of round t.

The noise dial puts RX(theta) on every data qubit before each round and before
the final readout, and on every ancilla just before it is read, with
sin^2(theta / 2) = q. Data flips are memory errors; ancilla flips are faulty
syndrome measurements, the reason a code needs several rounds. Syndrome extraction turns that
coherent rotation into a bit flip with probability q, so one dial setting is
one circuit and a whole sweep still fits in a single job.

A coherent rotation is not quite a random flip: amplitudes from different
steps add up before they are squared, which hurts the matching decoder (about
30% more failures at d = 3, q = 6%). Pauli twirling fixes it: a Z before RX is
RX(-theta), so each instance draws a random sign for every rotation, and the
average over instances is exactly the random-flip channel the decoder assumes.
Four instances per distance already agree with the model within shot noise.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass

from qiskit import QuantumCircuit, ClassicalRegister, QuantumRegister


@dataclass(frozen=True)
class Spec:
    d: int                  # code distance (number of data qubits)
    r: int                  # rounds of syndrome extraction
    q: float = 0.0          # injected bit-flip probability per data qubit per step
    logical: int = 0        # prepared logical value, 0 or 1
    layout: str = "unrolled"
    twirl: int = 0          # 0: every dial rotation +theta; k > 0: random signs, instance k

    @property
    def checks(self) -> int:
        return self.d - 1

    @property
    def qubits(self) -> int:
        if self.layout == "reuse":
            return 2 * self.d - 1
        return self.d + self.r * (self.d - 1)

    @property
    def clbits(self) -> int:
        return self.d + self.r * (self.d - 1)

    @property
    def cnots(self) -> int:
        return 2 * self.r * (self.d - 1)

    @property
    def name(self) -> str:
        return f"rep_d{self.d}_r{self.r}_q{round(self.q * 1000)}_L{self.logical}_t{self.twirl}_{self.layout}"


def qubits_needed(d: int, r: int, layout: str = "unrolled") -> int:
    return Spec(d, r, layout=layout).qubits


def dial_angle(q: float) -> float:
    """RX angle that flips a |0> or |1> with probability q."""
    q = min(max(q, 0.0), 1.0)
    return 2.0 * math.asin(math.sqrt(q))


def anc_bit(spec: Spec, t: int, i: int) -> int:
    return spec.d + t * spec.checks + i


def cnot_schedule(spec: Spec):
    """The CNOTs in time order as (round, check, data qubit, which) tuples.

    `which` is 0 for the left data qubit of the check and 1 for the right one.
    Every round does all the left CNOTs, then all the right ones."""
    out = []
    for t in range(spec.r):
        for k in (0, 1):
            for i in range(spec.checks):
                out.append((t, i, i + k, k))
    return out


def build_circuit(spec: Spec) -> QuantumCircuit:
    d, r = spec.d, spec.r
    qr = QuantumRegister(spec.qubits, "q")
    cr = ClassicalRegister(spec.clbits, "c")
    qc = QuantumCircuit(qr, cr, name=spec.name)
    theta = dial_angle(spec.q) if spec.q > 0 else 0.0
    rng = random.Random(f"{spec.d}/{spec.r}/{spec.q}/{spec.logical}/{spec.twirl}")

    def rot(qubit):
        sign = rng.choice((1, -1)) if spec.twirl else 1
        qc.rx(sign * theta, qubit)

    if spec.logical:
        for j in range(d):
            qc.x(j)

    def ancilla(t, i):
        if spec.layout == "reuse":
            return d + i
        return d + t * (d - 1) + i

    for t in range(r):
        if theta:
            for j in range(d):
                rot(j)
        qc.barrier()
        for k in (0, 1):
            for i in range(d - 1):
                qc.cx(i + k, ancilla(t, i))
        if spec.layout == "reuse":
            for i in range(d - 1):
                if theta:
                    rot(ancilla(t, i))
                qc.measure(ancilla(t, i), anc_bit(spec, t, i))
            if t < r - 1:
                for i in range(d - 1):
                    qc.reset(ancilla(t, i))
        qc.barrier()

    if theta:
        for j in range(d):
            rot(j)

    # Every rotation comes before the first measurement, so simulators that
    # can sample a final state once (instead of re-running every shot) do.
    if spec.layout == "unrolled":
        if theta:
            for t in range(r):
                for i in range(d - 1):
                    rot(ancilla(t, i))
        qc.measure(range(d), range(d))
        for t in range(r):
            for i in range(d - 1):
                qc.measure(ancilla(t, i), anc_bit(spec, t, i))
    else:
        for j in range(d):
            qc.measure(j, j)
    return qc


def bits_from_key(key: str, n: int) -> list[int]:
    """Qiskit counts keys put classical bit 0 on the right. Hex keys too."""
    key = key.replace(" ", "")
    if key.startswith("0x"):
        v = int(key, 16)
        return [(v >> k) & 1 for k in range(n)]
    key = key.zfill(n)
    return [int(ch) for ch in reversed(key[-n:])]


def syndromes(spec: Spec, bits: list[int]):
    """Per-round check outcomes, then the final checks read from the data."""
    d = spec.d
    rounds = [[bits[anc_bit(spec, t, i)] for i in range(d - 1)] for t in range(spec.r)]
    data = bits[:d]
    final = [data[i] ^ data[i + 1] for i in range(d - 1)]
    return rounds, final, data


def detectors(spec: Spec, bits: list[int]) -> list[int]:
    """Detection events: a check whose outcome changed since the round before.

    (r + 1)(d - 1) detectors, all zero when nothing went wrong, whichever
    logical value was prepared."""
    rounds, final, _ = syndromes(spec, bits)
    layers = rounds + [final]
    out = []
    prev = [0] * (spec.d - 1)
    for layer in layers:
        out.extend(a ^ b for a, b in zip(layer, prev))
        prev = layer
    return out


def detector_index(spec: Spec, t: int, i: int) -> int:
    return t * spec.checks + i


def observable(spec: Spec, bits: list[int]) -> int:
    """1 when data qubit 0 no longer holds the prepared value."""
    return bits[0] ^ spec.logical


def window_map(full: Spec, j: int, dw: int) -> list[int]:
    """Classical bits of the distance-`dw` code that sits inside `full`,
    starting at data qubit `j`, in that smaller code's own bit order.

    A distance-9 memory contains every smaller one: data qubits j..j+dw-1 and
    the checks between them form a complete distance-dw experiment, with the
    same noise. Google compared distance-3 corners of its distance-5 surface
    code the same way (Nature 614, 676, 2023)."""
    out = list(range(j, j + dw))
    for t in range(full.r):
        for i in range(j, j + dw - 1):
            out.append(anc_bit(full, t, i))
    return out


def window_bits(full: Spec, j: int, dw: int, bits: list[int]) -> list[int]:
    return [bits[k] for k in window_map(full, j, dw)]
