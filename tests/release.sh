#!/bin/sh
# Release check (date-check): the manifest and module validate, the tests pass, the plugin
# directory checklist (tests/checklist.py) has no FAIL, the README's
# Settings line names every setting (tests/readme_settings.py), and the version string is the same in the plugin manifest, the marketplace manifest,
# the changelog's newest release, and package.json (the README carries no version).
# Exit non-zero on any of them. Run from the repo root: sh tests/release.sh
# Type-check: tests/typecheck.sh, tsc --noEmit against the engine's declarations.
set -e
cd "$(dirname "$0")/.."
claude plugin validate .
claude plugin test .
# The shell forms against real Bash. No Bun fails here; NO_BASH_CHECK=1 says so out loud.
if [ -n "$NO_BASH_CHECK" ]; then echo 'bash check: NOT RUN (NO_BASH_CHECK)'; else bun tests/review-second-bash.ts; bun tests/review-final-sed-bash.ts; bun tests/review-variable-bash.ts; fi
sh tests/typecheck.sh
python3 -I tests/checklist.py
python3 -I tests/readme_settings.py
python3 -I - <<'PY'
import json, re, sys
plugin = json.load(open('.claude-plugin/plugin.json'))['version']
market = json.load(open('.claude-plugin/marketplace.json'))['plugins'][0]['version']
changelog = re.search(r'^## (\d+\.\d+\.\d+) ', open('CHANGELOG.md').read(), re.M).group(1)
package = json.load(open('package.json'))['version']
versions = {'plugin.json': plugin, 'marketplace.json': market, 'CHANGELOG.md': changelog, 'package.json': package}
if len(set(versions.values())) != 1:
    sys.exit(f"version strings differ: {versions}")
print(f"version check: all four say {plugin}")
PY
echo "release check: validate, test, type check, checklist and version check passed"
