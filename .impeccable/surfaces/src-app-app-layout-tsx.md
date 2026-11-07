---
version: 1
slug: "src-app-app-layout-tsx"
primary_target: "src/app/(app)/layout.tsx"
related_targets: ["src/app/(marketing)/page.tsx"]
---

# CoachOS app world: Scoresheet

Scope: the whole signed-in app (shell, dashboard, drills, sessions, generator, AI Coach, roster, templates, settings), plus the auth and onboarding screens. Mode: Operate. The landing page shares the world and gets a Persuade-mode surface on top of it.

Audience: basketball and wheelchair basketball coaches and PE teachers. They plan at a laptop at night, run practice from a phone in a bright gym, and print session sheets.

Unattended run: the user said "make professional decisions independently", so the assigned direction was built without a decision page.

## Direction contract

THESIS: CoachOS is laid out like the official scoresheet a coach signs after every game. It is a crisp, ruled, two-ink document world where structure is printed in scorer's blue and the coach's own marks are in orange. It refuses the category default of a grey SaaS shell with one accent and a dark "arena" with orange glow.

OWN-WORLD: Two inks on sheet stock. In light mode the ground is a cool white sheet (#F7F8FA family), the structure and type are deep scorer-blue ink (#14213D family), the coach's mark is orange (pinned brand accent), and rules are 1px blue-grey hairlines. In dark mode it reads as "the sheet under arena lights": a deep blue-ink ground (not black), sheet-white type, and the same orange. The type is Archivo, one family that uses its width axis: normal width for UI and condensed caps with tabular figures for numbers and form labels. Corners are 6px on controls and 10px on panels. Depth is a hairline plus a soft offset shadow. There are no gradient text, glass or glow.

STORY: The coach sees every session, drill and minute accounted for like a well-kept scoresheet, trusts it, and builds tonight's practice.

FIRST VIEWPORT (dashboard): a blue-ink side rail (desktop) or top bar plus bottom tab bar (phone) with the CoachOS mark and nav. The work area opens with "Tonight's court": the next or last session, its running tally strip and a primary "Build a session" action. Then the library at a glance (real counts per category), recent sessions as a ruled table-list, and quick actions.

SIGNATURE MOVE: the running tally. The scoresheet's running-score columns are translated into a session's minutes. A strip of minute cells fills in phase colours as activities are added; each new block is "struck" in with a short orange stroke. It is used in the session builder total, session cards, the generator result and the dashboard. Raised from the split-flap challenger: numbers change in place with a short digit roll (tabular, 200ms). Raised from the boarding-pass challenger: a moved or added activity slides to its new row and holds an orange mark until the next interaction. Raised from the design-annual challenger: one hairline grid, with every rule 1px from the same token.

FORM: The official game scoresheet (two-ink, ruled, boxed labels, tabular figures). It was #6 on my grounded list of seven: hardwood floor, coach's whiteboard, the ball, rafter banners, jersey numerals, scoresheet/box score, arena scoreboard. seed: seed:ffe328c1ccbe4ada

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Motion grammar

UI transitions are 140 to 220ms with strong ease-out (cubic-bezier(0.23,1,0.32,1)). Buttons press with scale(0.97). Popovers scale from their trigger starting at 0.96. Routes cross-fade with a 6px rise. Lists stagger 40ms only on first load, never on keyboard actions. The tally strike and digit roll are the only signature motion. Under reduced motion, opacity stays and movement goes.

## Unresolved

There are no photographs. Real coach imagery is still the user's to supply (slots in imagery.ts).
