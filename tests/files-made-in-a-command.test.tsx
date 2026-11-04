import { L, passes, refuses } from './shell-world'

// A sed -i on a file the same command made earlier edits what that write put there.
refuses('comparison: echo and sed -i on a file that exists', `echo "- TBD" >> n.md; sed -i 's/^- TBD/${L}/' n.md`, { 'n.md': 'x\n' }, '18:30')
refuses('echo makes the file, sed -i then edits it', `echo "- TBD" > n.md; sed -i 's/^- TBD/${L}/' n.md`, {}, '18:30')
refuses('joined by &&', `echo "Date: TBD" > log.md && sed -i 's/TBD/2026-10-31 18:30/' log.md`, {}, '18:30')
refuses('a heredoc makes the file, sed -i then edits it', `cat > n.md <<EOF\n- TBD\nEOF\nsed -i 's/^- TBD/${L}/' n.md`, {}, '18:30')
refuses('a heredoc with a field, sed -i fills it', `cat > log.md <<'EOF'\nDate: TBD\nEOF\nsed -i 's/TBD/2026-10-31 18:30/' log.md`, {}, '18:30')
passes('a sed -i that leaves a sentence is judged on the sentence', `echo "planned for TBD" > n.md; sed -i 's/TBD/2026-11-20/' n.md`)
passes('sed -i before the write that makes the file changes nothing', `sed -i 's/^- TBD/${L}/' n.md; echo "- TBD" > n.md`)
passes('comparison: sed -i on a file nothing makes', `sed -i 's/^- TBD/${L}/' n.md`)
passes('two sed -i on a file nothing makes', `sed -i 's/^- TBD/${L}/' n.md; sed -i 's/^- X/${L}/' n.md`)
refuses('a name for a past day is still refused', `echo "- TBD" > 2025-06-12.md; sed -i 's/TBD/x/' 2025-06-12.md`, {}, '2025-06-12')
