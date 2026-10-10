#!/usr/bin/env bash
# Syntax-check every page script as an ES module.
tmp=$(mktemp -d); ok=0
for f in main.js ui/*.js; do
  cp "$f" "$tmp/x.mjs"
  if ! node --check "$tmp/x.mjs" 2>"$tmp/err"; then echo "FAIL $f"; grep -v Warning "$tmp/err" | head -5; ok=1; fi
done
rm -rf "$tmp"; [ $ok = 0 ] && echo "all scripts parse"; exit $ok
