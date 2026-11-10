#!/bin/sh
# Rules tests: plain node, no packages needed.
set -e
cd "$(dirname "$0")/.."
node tests/rules.test.mjs
