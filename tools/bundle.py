"""Zip the files Qollab needs into ../bt-upload.zip (no tests, tools or dev)."""
import os, zipfile
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
keep_dirs = ("lab", "ui", "data")
keep_files = ("index.html", "main.js", "main.css", "requirements.txt", "LICENSE")
out = os.path.join(os.path.dirname(root), "bt-upload.zip")
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in keep_files:
        z.write(os.path.join(root, f), f)
    for d in keep_dirs:
        for base, _, files in os.walk(os.path.join(root, d)):
            if "__pycache__" in base:
                continue
            for f in files:
                p = os.path.join(base, f)
                z.write(p, os.path.relpath(p, root).replace(os.sep, "/"))
    names = z.namelist()
print(out, len(names), "files", os.path.getsize(out), "bytes")
print(names)
