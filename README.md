![Below threshold: measure Λ, the number behind Google's Willow result, on IonQ and IBM noise models, in your browser](https://raw.githubusercontent.com/RohanGlitched/below-threshold/main/docs/cover.png)

# Below threshold

**[Run it on Qollab](https://qollab.xyz/u/master/below-threshold)** · **[Demo video, 2:26, captioned](https://youtu.be/aKLjxx0HDAQ)** · **[Source on GitHub](https://github.com/RohanGlitched/below-threshold)** · **[How it works](#what-happens-in-one-run)** · **[Results](#results)** · MIT

**Measure Λ, the number behind Google's Willow result, on whichever machine you pick in Qollab's runner.** Quantum error correction only pays off *below threshold*, where a bigger code makes a better qubit. Λ is the factor by which each step up in code size divides the logical error. This lab runs a repetition-code memory experiment on an IonQ trapped-ion noise model, one of IBM's eight superconducting noise models, an ideal simulator, or real IonQ hardware, decodes every shot in your browser, and gives you Λ with a 95% interval.

**On real IonQ hardware:** one 25-qubit job on IonQ Forte Enterprise 1, with the noise dial at 6%, gave **Λ = 2.55** (95% interval 2.20 – 2.94). The logical error per round fell from 4.1% at distance 3 to 0.25% at distance 9. The same machine's noise model gives 2.50, and the error model predicts 2.45 from IonQ's published gate and readout errors.

This effort is supported by Qollab & IonQ.

## Try it in 30 seconds

1. Sign in to Qollab (JS projects need it), open the project and press **Run**.
2. In **Select QPU**, pick **Built-in simulator**. The page loads above the console with a run recorded on that machine.
3. Press **Run the experiment**. Under a minute later your own Λ appears (distances 3 to 7 there; 3 to 9 on the IonQ models), with its interval and every shot behind it.

IonQ's noise models (Forte Enterprise 1, Forte 1, Aria 1, Aria 2) are free, run on IonQ's cloud and take two to three minutes; they accept one job per Run, so press **Stop**, then **Run**, to send another. The IBM noise models simulate every shot in your browser and take a few minutes.

## For a judge with three minutes

- **Figure 1.** The error per round falls as the code grows, from distance 3 to 9, all read out of one circuit. The big number is Λ; the ruler puts it next to Google's 2021 and 2024 results.
- **Press Run the experiment.** Your own Λ replaces the recorded one, with a 95% interval from 2,000 bootstrap resamples. On the built-in simulator the circuits, the shots and the decoding all happened in your browser; on IonQ the shots come back from IonQ's cloud and the decoding is still yours.
- **Figure 2.** One real shot, drawn as an ion-camera frame and as the decoding graph with the matching decoder's answer on it.
- **Figure 3.** Pair the detection events yourself and see whether you beat the decoder.
- **Figure 7.** Turn twirling off and Λ drops from 2.50 to 1.91: coherent errors add up, and random signs stop them.

## What you will learn

- why a bigger code only helps below threshold, and what Λ measures;
- what a syndrome and a detection event are, and why a memory needs several rounds of checks;
- how minimum-weight matching uses the whole syndrome history and where it beats majority vote;
- how a decoder learns the machine's noise from correlations in its own syndromes;
- why coherent errors are worse than random ones, and what Pauli twirling does about it.

## Results

Each row is one job, decoded in the browser. **Λ measured** is fitted across every distance that fit; **Λ predicted from specs** is what the same error model gives from the machine's published two-qubit gate and readout error rates, with no fitting to these shots.

| Machine (noise model unless marked, dial at 6%) | Kind | Qubits | Shots | Λ measured | 95% interval | Λ predicted from specs |
|---|---|---|---|---|---|---|
| IonQ Forte Enterprise 1, **real hardware** | trapped ions | 25 | 1,600 | **2.55** | 2.20 – 2.94 | 2.45 |
| IonQ Forte 1 | trapped ions | 25 | 1,600 | **2.78** | 2.37 – 3.24 | 2.31 |
| IonQ Aria 2 | trapped ions | 19 | 1,600 | **2.71** | 2.26 – 3.28 | 2.50 |
| IonQ Aria 1 | trapped ions | 19 | 1,600 | **2.51** | 2.08 – 3.07 | 2.56 |
| IonQ Forte Enterprise 1 | trapped ions | 25 | 3,200 (2 runs) | **2.50** | 2.27 – 2.76 | 2.45 |
| IonQ Forte Enterprise 1, **twirling off** | trapped ions | 25 | 1,600 | **1.91** | 1.73 – 2.12 |  |
| IBM Kingston | superconducting | 17 | 1,600 | **2.90** | 2.45 – 3.46 | 2.51 |
| IBM Fez | superconducting | 17 | 1,600 | **2.66** | 2.28 – 3.17 | 2.51 |
| IBM Boston | superconducting | 17 | 1,600 | **2.47** | 2.13 – 2.92 | 2.64 |
| IBM Miami | superconducting | 17 | 1,600 | **2.45** | 2.16 – 2.79 | 2.32 |
| IBM Aachen | superconducting | 17 | 1,600 | **2.28** | 1.98 – 2.63 | 2.64 |
| IBM Pittsburgh | superconducting | 17 | 1,600 | **2.23** | 1.97 – 2.55 | 2.64 |
| IBM Berlin | superconducting | 17 | 1,600 | **2.06** | 1.87 – 2.27 | 2.32 |
| IBM Marrakesh | superconducting | 17 | 1,600 | **2.02** | 1.85 – 2.21 | 2.51 |
| Built-in simulator | no noise | 19 | 1,600 | **2.97** | 2.36 – 3.75 | 2.94 |
| AWS Braket local simulator | no noise | 19 | 1,600 | **2.37** | 1.96 – 2.95 | 2.94 |
| *The dial alone, no machine noise (model)* | | | | *2.94* | | |
| *Google Willow, surface code, native noise (2024)* | superconducting | 101 | | *2.14* | ± 0.02 | |
| *Google Sycamore, repetition code, native noise (2021)* | superconducting | 21 | | *2.99* | ± 0.09 | |

The IBM Miami and Berlin rows were re-run after the decoder learned their un-reset readout edge; their raw counts from Qollab were gone, so they were re-recorded on the same IBM noise models in Qiskit Aer locally (`tools/record_local.py`) and are marked as such on the page. Every other row was recorded on Qollab's runner. The prediction column uses each machine's own layout: fresh ancillas on IonQ, measure-and-reset on IBM, and the XOR record on Miami and Berlin.

The dial sets the level: with no machine noise at all it gives Λ = 2.94, and a machine's own gates and readout can only pull Λ down from there. Differences between machines are mostly within the intervals; the two noise-free simulators, which run identical physics, differ by 0.6, more than most pairs of real machines. What a machine really changes is the error it adds on top of the dial, which Figure 4 measures from its syndromes. Turning twirling off on IonQ Forte Enterprise 1 drops Λ from 2.50 to 1.91: coherent errors add up and the decoder, which expects random flips, loses ground.

The demo video shows the first 1,600-shot run on the Forte Enterprise 1 noise model, Λ = 2.36 at the time (2.34 with the current fit weights). The table pools it with a second run, which alone gave 2.67, for 2.50 (2.27 – 2.76); the hardware job gave 2.55 (2.20 – 2.94); a third run from the published page on October 11 gave 2.52 (2.20 – 2.90). All the intervals overlap. Willow's 2.14 is listed for scale: it is a surface code under native noise, a harder code and a harder setting, so it is a reference point, not a contest.

## Why this exists

Proving that error correction works below threshold took Google from 2021 (repetition codes) to 2024 (Willow's surface code). The tools that teach it today are theory courses, click-a-lattice toys with no circuits, or expert software (Stim, PyMatching) built for researchers rather than for a first encounter.

Below threshold lets anyone, with nothing to install:

1. run a real repetition-code memory experiment on a real device's noise model, trapped ions or superconducting, or on IonQ hardware;
2. watch their own shots become detection events, and the matching decoder explain them;
3. try to decode a shot themselves and compare with the decoder;
4. measure Λ with honest error bars and place it next to Google's numbers;
5. learn the machine's own noise from its syndromes, the way Google calibrates its decoders;
6. see why coherent errors are worse than random ones, and how twirling fixes them.

## What happens in one run

**One circuit holds every code size.** IonQ's runners on Qollab accept a single circuit per job. So the lab builds the largest repetition code that fits (distance 9, 25 qubits, on the IonQ models) and reads the smaller codes out of it. Any `d` neighbouring data qubits and the checks between them form a complete distance-`d` memory under the same noise, the extra gates on its edge qubits included in its error model. The distance-9 code holds seven distance-3s, five distance-5s and three distance-7s. Rates use every window, while error bars count only non-overlapping windows. Google did something in this spirit when it compared distance-3 sub-grids of its distance-5 surface code (Nature 614, 676, 2023), though it ran them as separate experiments; here all sizes come from the same shots.

**Syndromes without mid-circuit measurement.** Qollab's IonQ path measures once, at the end. Every round therefore gets fresh ancillas, read at the end: an ancilla that is never touched again gives the same statistics whether it is read now or later (deferred measurement). That costs `d + r(d-1)` qubits, so 25 for d = 9 with r = 2 rounds. On IBM's noise models the ancillas are measured and reset every round, as on real superconducting chips, and the code is laid along a line of neighbouring qubits, so it needs no SWAPs. IBM's Miami and Berlin models list no reset instruction, so there the ancillas keep their last reading, each round's syndrome is the XOR of two consecutive readings, and a misread flips two syndromes at once; the error model carries that two-round edge.

**The noise dial, twirled.** Every machine here is far below this code's threshold, so failures at d ≥ 5 would be too rare to count. The dial adds `RX(θ)` with $\sin^2(\theta/2) = q$ on every data qubit before each round and on every ancilla before readout. A coherent rotation is not a random flip, because amplitudes add up before they are squared; the cost is small at d = 3 and grows with the code, about 3× at d = 9 on the Forte Enterprise model. So every rotation gets a random sign ($Z\,RX(\theta)\,Z = RX(-\theta)$), which is Pauli twirling, also called randomized compiling. Averaged over many sign patterns it is exactly the random-flip channel the decoder assumes; one pattern, as on IonQ where a job holds one circuit, already stops the rotations adding up along a qubit's timeline. Runs from October 11 on draw fresh signs from a seed stored with the run; the earlier recorded runs, including the hardware job, used one fixed pattern.

**Decoding.** The lab lists every single fault of the circuit and the detection events it causes. This detector error model is what Stim computes, written out by hand here so it runs in Pyodide. Edges are weighted $\ln\frac{1-p}{p}$. Minimum-weight perfect matching uses an exact subset dynamic program (networkx blossom above 16 events). Majority vote is the classical baseline. Each distinct bitstring is decoded once.

**Λ.** Failures per shot become an error per round,

$$\varepsilon = \tfrac12\left[1 - (1-2P_L)^{1/r}\right],$$

as in Google's 2021 paper. Λ between neighbouring distances is $\varepsilon_d/\varepsilon_{d+2}$, and the headline Λ is fitted across all distances from $\varepsilon_d = C/\Lambda^{(d+1)/2}$. Intervals come from 2,000 parametric bootstrap resamples, and Wilson intervals are shown per distance.

**Calibration from syndromes.** Two detectors that share an error mechanism fire together more often than chance:

$$p_{ij} = \tfrac12 - \tfrac12\sqrt{1 - \frac{4\left(\langle x_ix_j\rangle - \langle x_i\rangle\langle x_j\rangle\right)}{1 - 2\langle x_i\rangle - 2\langle x_j\rangle + 4\langle x_ix_j\rangle}}$$

The lab learns every edge of the graph from your shots and shows how much noise the machine adds on top of the dial. It then decodes again with the learned weights.

## The page

| Figure | What it shows | What to look for |
|---|---|---|
| 1. Bigger code, smaller error | ε per round against distance, matching versus majority vote, the model's prediction, and Λ on a ruler next to Willow and Google 2021 | the line falls; Λ above 1 means below threshold |
| 2. One shot, from ions to answer | real shots drawn as an ion-camera frame (bright = 1, dark = 0, false colour for the 369.5 nm light), then the decoding graph with the matching drawn on it | a shot where majority vote is wrong and matching is right |
| 3. Be the decoder | pair up detection events yourself and play against the matching decoder | short chains are likely; a chain across the code flips the bit |
| 4. The machine, measured from its own syndromes | learned error rates for each kind of mechanism, next to the dial alone and the published specs | how much the machine adds on top of the dial |
| 5. Where the threshold is | the crossing of the d = 3, 5, 7 curves when rounds grow with distance | near 13% for this circuit; real machines sit far to the left |
| 6. The same experiment on every machine | Λ with intervals for every machine recorded on Qollab (Miami and Berlin re-run locally in Aer), and the model's prediction as a tick | the intervals overlap; the dial sets the level |
| 7. Coherent errors add up | the same machine with and without twirling, against the model | the gap grows with distance |

## Glossary

| Term | Meaning here |
|---|---|
| Distance d | the number of data qubits; the code survives up to (d − 1)/2 flips |
| Round | one pass of checks: each ancilla records whether two neighbouring data qubits agree |
| Syndrome | the set of check outcomes in one round |
| Detection event | a check whose outcome changed since the round before |
| Detector error model | the list of every single fault and the detection events it fires |
| Matching (MWPM) | pairing detection events along the most likely chains of faults |
| Logical error per round, ε | the per-round failure rate implied by the failure rate per shot |
| Λ | ε at distance d divided by ε at distance d + 2; above 1 means below threshold |
| Threshold | the physical error rate above which a bigger code stops helping |
| Pauli twirling | random signs on the dial rotations, so coherent errors average to random flips |
| Deferred measurement | reading an untouched ancilla later gives the same statistics as reading it now |

## Fork it

- **A different code.** `lab/code.py` builds the circuit and `lab/dem.py` enumerates its faults. Any code whose single faults flip at most two detectors (the phase-flip code, a surface code's X or Z half) decodes with the same matcher.
- **A different decoder.** `lab/decode.py` takes a list of weighted edges. Swap in union-find, or a decoder that uses the calibrated weights (`lab/calibrate.py`) by default.
- **Real hardware.** Pick an IonQ quantum computer in Qollab's dialog; the page runs unchanged (the hardware row above was made this way) and asks IonQ for raw counts with debiasing off where Qollab's backend accepts the option; each run records whether it did. A 400-shot option keeps a hardware job cheap.
- **Teaching.** Every figure reads from one JSON run, so a class can share runs (the console saves each one) and compare machines.

## For teachers: three exercises

1. **Predict, then turn twirling off.** Ask the class whether coherent rotations should be better or worse for the decoder than random flips, then run with the switch off. (Λ falls, from 2.50 to 1.91 on the Forte Enterprise model: amplitudes add before they are squared.)
2. **Find the threshold with the dial.** Run at 4%, 6%, 8% and 10% on the built-in simulator and plot Λ against the dial. (Λ falls towards 1 as the dial rises; Figure 5 shows the crossing the model predicts.)
3. **Compare two machines from their syndromes.** Run the same dial on an IBM Heron model and on IonQ Forte 1 and compare Figure 4. (The dial dominates both; the difference is the machine's added error per step.)

## Troubleshooting

- **Run sent me to the sign-in page.** JS projects on Qollab need an account; sign in and press Run again.
- **The button is grey after one run on IonQ.** IonQ's runners take one job per Run. Press Stop, then Run, to send another.
- **Λ shows a dash.** Too few failures at the larger sizes. Turn the dial up or add shots.
- **The IBM models are slow.** Every shot is simulated in your browser; 800 shots is a good start.
- **Distance 9 is struck out.** The lab keeps the built-in simulator to 21 qubits (browser memory), so it runs distances 3 to 7.
- **IonQ runs are stuck in the queue.** A queued hardware job blocks the account's IonQ queue, noise models included, until it finishes.
- **No 3D ion trap.** WebGL is off or three.js did not load; the camera frame and the graph still show every shot.

## Honest limits

- **Bit flips only.** A repetition code ignores phase errors, so its Λ is not a surface-code Λ. It shows the mechanism, not a full logical qubit.
- **The dial does the heavy lifting.** With native noise alone, the error model puts a distance-5 failure between about 1 in 3,000 shots (Forte 1) and 1 in 20,000 (IBM Heron). The dial is the experiment's control, and the table says what it gives on its own.
- **Two rounds.** Google fitted up to 50. With r = 2, ε still carries some of the start and end of the memory.
- **Noise models are models.** IonQ says its noise-model simulators should not be used to predict hardware results. One run is on real hardware (IonQ Forte Enterprise 1). It had 1,600 shots, and IonQ applies its default debiasing to jobs of 500 shots or more, so its counts may include that mitigation; runs sent from the page ask for raw counts where Qollab's backend accepts the option, and record whether it did.
- **One logical value on IonQ.** A one-circuit job prepares logical 0 only, so an asymmetric readout error would not be sampled there. Local runs alternate 0 and 1.
- **Correlated sizes.** The distances are read from the same shots; the intervals treat them as independent, which makes them conservative for ratios.

## Files

```
index.html, main.css, main.js   the page (Qollab JS project)
ui/                              figures: charts, ion camera and graph, 3D trap, game, atlas
lab/code.py                      circuits: unrolled and reuse layouts, the twirled dial, windows
lab/dem.py                       detector error model by fault enumeration
lab/decode.py                    exact MWPM and majority vote
lab/stats.py                     Wilson intervals, ε per round, Λ fit and bootstrap
lab/calibrate.py                 edge probabilities learned from detector correlations
lab/experiment.py                one job on the chosen machine, windowed decoding, analysis
lab/web.py                       what the page calls; recorded runs and predictions
lab/game.py                      puzzles for "Be the decoder"
data/theory.json                 predictions from the same error model, 20,000 shots per point
data/atlas.json                  runs recorded on Qollab's machines (Miami, Berlin: re-run locally in Aer)
tools/record_local.py            re-record an IBM noise-model row locally after a decoder change
tests/                           21 checks, most on Qiskit Aer (not needed on Qollab)
```

Tests (local Python with `qiskit`, `qiskit-aer`, `networkx`, `pytest`): `python -m pytest tests -q`. They check that windows decode like standalone codes, that the twirled dial matches the model on Aer, that coherent rotations are worse, that single faults are always corrected, that un-reset ancillas decode with the two-round readout edge, and that the exact matcher agrees with blossom.

## Built for the Qollab x IonQ hackathon

Everything here was written during the build window (October 10–11, 2026, IST), with no earlier code: the lab, the decoders, the page, the recorded runs and the tests. Theme: **Quantum Unlocked**, teaching a hard topic interactively. The same team's second entry is [No Signal](https://qollab.xyz/u/master/no-signal), three nonlocal games played on the same machines.

## References

1. Google Quantum AI, "Exponential suppression of bit or phase errors with cyclic error correction", *Nature* 595, 383 (2021).
2. Google Quantum AI, "Suppressing quantum errors by scaling a surface code logical qubit", *Nature* 614, 676 (2023).
3. Google Quantum AI, "Quantum error correction below the surface code threshold", *Nature* 638, 920 (2025).
4. Egan et al., "Fault-tolerant control of an error-corrected qubit", *Nature* 598, 281 (2021).
5. Higgott & Gidney, "Sparse Blossom", arXiv:2303.15933. Gidney, "Stim", *Quantum* 5, 497 (2021).
6. Bravyi et al., "Correcting coherent errors with surface codes", *npj Quantum Information* 4, 55 (2018). Wallman & Emerson, "Noise tailoring for scalable quantum computation via randomized compiling", *PRA* 94, 052325 (2016).
7. Wang, Harrington & Preskill, "Confinement-Higgs transition in a disordered gauge theory and the accuracy threshold for quantum memory", *Annals of Physics* 303, 31 (2003).

MIT licence.
