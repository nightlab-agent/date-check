import { passes, refuses } from './shell-world'

// A quoted file name means what it says: its [ or $ opens no glob, so the file is looked up and the
// sed -i is judged on what it leaves there. Each file holds a sentence, and a date in a sentence is no stamp.
const has = (name: string) => ({ [name]: 'planned for TBD.\n' })
const fill = `sed -i 's/TBD/2026-11-20/'`
passes('comparison: a quoted plain name', `${fill} 'plan v2.md'`, has('plan v2.md'))
passes('a quoted name with a bracket', `${fill} 'plan [v2].md'`, has('plan [v2].md'))
passes('a quoted name with a bracket and no space', `${fill} 'notes[1].md'`, has('notes[1].md'))
passes('a quoted name with a dollar', `${fill} 'plan $5.md'`, has('plan $5.md'))
passes('a double-quoted name with a bracket', `${fill} "notes[1].md"`, has('notes[1].md'))
passes('a name half in quotes', `${fill} 'notes['1].md`, has('notes[1].md'))
passes('a name with $ in a $ quote', `${fill} $'plan $5.md'`, has('plan $5.md'))
refuses('an open bracket is still a glob', `${fill} notes[1].md`, has('notes[1].md'), '2026-11-20')
refuses('a $ in double quotes is still a variable', `${fill} "$HOME/plan.md"`, {}, '2026-11-20')
refuses('a * after a quoted piece is still a glob', `${fill} 'plan '*.md`, has('plan v2.md'), '2026-11-20')

// The file named for a past day: a name that opens no glob is a new file, one that does is not known to be.
refuses('comparison: a new file named for a past day', `echo x >> 2025-06-12.md`, {}, '2025-06-12')
refuses('a quoted name with a bracket is a new file too', `echo x >> '2025-06-12[a].md'`, {}, '2025-06-12')
passes('an open glob is not known to be new', `echo x >> 2025-06-12[a].md`)
