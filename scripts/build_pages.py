#!/usr/bin/env python3
"""Reproduce Cloudflare Pages Direct Upload ZIP from source, with standard library only.

Run from repo root: python scripts/build_pages.py
Outputs: dist/course-table-pages.zip
No backend, SQLite, cookies or personal data are copied.
"""
from pathlib import Path
import shutil
import zipfile

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
DIST = ROOT / "dist"
SITE = DIST / "pages"
ZIP = DIST / "course-table-pages.zip"

if SITE.exists():
    shutil.rmtree(SITE)
SITE.mkdir(parents=True)

# Root URLs used by manifest and service worker.
for name in ("index.html", "manifest.webmanifest", "service-worker.js"):
    source = FRONTEND / name
    if not source.is_file():
        raise FileNotFoundError(source)
    shutil.copy2(source, SITE / name)

# In development FastAPI mounts frontend/ at /static.
# Cloudflare Pages serves the copied static/ folder directly.
STATIC = SITE / "static"
STATIC.mkdir()
for item in FRONTEND.iterdir():
    if item.name in {"index.html", "manifest.webmanifest", "service-worker.js"}:
        continue
    if item.is_file() and item.suffix.lower() in {".js", ".css", ".png", ".svg", ".ico"}:
        shutil.copy2(item, STATIC / item.name)
    elif item.is_dir() and item.name == "icons":
        shutil.copytree(item, STATIC / "icons")

with zipfile.ZipFile(ZIP, "w", compression=zipfile.ZIP_DEFLATED) as z:
    for path in sorted(SITE.rglob("*")):
        if path.is_file():
            z.write(path, path.relative_to(SITE).as_posix())

print(f"Cloudflare Pages ZIP: {ZIP} ({ZIP.stat().st_size:,} bytes)")
print("Reminder: deploy to your existing Pages Direct Upload project; never upload data files.")
