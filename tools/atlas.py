"""Merge data/runs/*.json (runs recorded on Qollab) into data/atlas.json."""
import glob, json, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
runs = []
for p in sorted(glob.glob(os.path.join(root, "data", "runs", "*.json"))):
    runs.append(json.load(open(p, encoding="utf-8")))
json.dump({"runs": runs}, open(os.path.join(root, "data", "atlas.json"), "w", encoding="utf-8"), separators=(",", ":"))
print(len(runs), "runs ->", os.path.getsize(os.path.join(root, "data", "atlas.json")), "bytes")
