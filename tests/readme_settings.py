"""The README's Settings line names every setting in the plugin manifest, by its title.

Why: 0.1.4's Settings line listed four of the six settings; the prompt clock and
the placeholder filling were missing, so a reader of that line missed two switches.
"""
import json, re, sys

titles = {k: v['title'] for k, v in json.load(open('.claude-plugin/plugin.json'))['userConfig'].items()}
m = re.search(r'^Settings \(asked when you enable the plugin\):(.*?)(?:\n\n)', open('README.md').read(), re.M | re.S)
if not m:
    sys.exit("readme settings: no 'Settings (asked when you enable the plugin):' paragraph")
line = ' '.join(m.group(1).split()).lower()
missing = [k for k, t in titles.items() if t.lower() not in line]
if missing:
    sys.exit(f"readme settings: not named on the Settings line: {', '.join(missing)}")
print(f"readme settings: all {len(titles)} named")
