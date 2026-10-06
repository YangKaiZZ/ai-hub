#!/usr/bin/env bash
# The render sandbox has no route to cdn.jsdelivr.net, so the generated index.html files load the vendored GSAP
# (assets/vendor/gsap.min.js, same version as film.json) instead. Run after make-harness.py / assemble.py.
set -eu
cd "$(dirname "$0")/.."
V=$(node -p "require('./film.json').gsap")
for f in index.html .hyperframes/test/*/index.html; do
  [ -f "$f" ] || continue
  sed -i "s#https://cdn.jsdelivr.net/npm/gsap@$V/dist/gsap.min.js#assets/vendor/gsap.min.js#" "$f"
done
echo "gsap localized"
