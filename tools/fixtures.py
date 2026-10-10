"""Local fixtures for the dev harness: a real run on Qiskit Aer with an
IonQ-Forte-like noise model, shaped exactly like what Qollab returns."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from qiskit_aer import AerSimulator
from qiskit_aer.noise import NoiseModel, depolarizing_error, ReadoutError
from lab import experiment, web

p2, pm = 0.0106, 0.0061
nm = NoiseModel()
nm.add_all_qubit_quantum_error(depolarizing_error(p2 * 16 / 15, 2), ["cx"])
nm.add_all_qubit_readout_error(ReadoutError([[1 - pm, pm], [pm, 1 - pm]]))
sim = AerSimulator(method="matrix_product_state", noise_model=nm, seed_simulator=9)

orig = experiment.profile
def fake_profile(b):
    p = orig(b)
    p.update(name="ionq_simulator", family="ionq", model="forte-enterprise-1", label="IonQ Forte Enterprise 1 noise model",
             layout="unrolled", one_job=True, max_qubits=29, prior={"p2": p2, "pm": pm}, noise_model="forte-enterprise-1")
    return p
experiment.profile = fake_profile
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(os.path.dirname(here), "dev")
boot = json.loads(web.boot(sim))
json.dump(boot, open(os.path.join(out, "boot.json"), "w"))
for q in (0.06,):
    res = json.loads(web.run(sim, q=q, shots=1600))
    print({k: res.get(k) for k in ("ok", "ds", "circuits", "shots_per_circuit", "timing")})
    for sw in res["sweeps"]:
        print([(r["d"], round(r["P_mwpm"], 4), round(r["P_major"], 4)) for r in sw["rows"]], [(p["from"], p["lam"]) for p in sw["pairs"]], sw["fit"])
    json.dump(res, open(os.path.join(out, f"run-{int(q*100)}.json"), "w"))

if os.environ.get("COHERENT") == "1":
    res = json.loads(web.run(sim, q=0.06, shots=1600, twirl=False))
    json.dump(res, open(os.path.join(out, "run-6-coherent.json"), "w"))
    print("coherent", [(r["d"], round(r["P_mwpm"], 4)) for r in res["sweeps"][0]["rows"]])
