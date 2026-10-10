"""Write data/game.json: puzzles for 'Be the decoder'."""
import json, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, root)
from lab.game import puzzles
g = puzzles(n=8, d=5, r=2, q=0.07, seed=2026)
json.dump(g, open(os.path.join(root, "data", "game.json"), "w"), separators=(",", ":"))
print(len(g["puzzles"]), "puzzles", [(len(p["fired"]), p["obs"], p["mwpm"]["flip"], p["majority_ok"]) for p in g["puzzles"]])
