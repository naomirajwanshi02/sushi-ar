#!/bin/sh
# Rules and board-layout tests: plain node, no packages needed.
# tools/layout-check.html checks the real 3D models against the same layout in a browser.
set -e
cd "$(dirname "$0")/.."
node tests/rules.test.mjs
node tests/layout.test.mjs
