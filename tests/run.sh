#!/bin/sh
# Headless test run. Needs: npm install three@0.160.0 mind-ar@1.2.5
set -e
cd "$(dirname "$0")"
node ../tools/mktest.mjs ../index.html stub.mjs game_test.mjs
node chef.test.mjs
node aspect.test.mjs
node fit.test.mjs
node stack.test.mjs
