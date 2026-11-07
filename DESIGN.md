---
name: CoachOS
description: The Operating System for Basketball Coaches. A two-ink scoresheet world for planning, running and printing practice.
colors:
  sheet: "#F4F6F9"
  sheet-raised: "#FFFFFF"
  sheet-sunken: "#E9EDF3"
  scorer-ink: "#0F1B33"
  scorer-ink-muted: "#48546C"
  scorer-ink-faint: "#7B869B"
  hairline: "#D8DEE8"
  hairline-strong: "#B2BCCC"
  coach-orange: "#F26A1B"
  coach-orange-strong: "#E65C0E"
  coach-orange-text: "#C63F0A"
  coach-orange-text-strong: "#A53305"
  orange-wash: "#FDE8DC"
  rail: "#12224A"
  rail-raised: "#1A2D5C"
  rail-ink: "#EEF2FB"
  rail-muted: "#A5B2CF"
  rail-line: "#263B6C"
  focus-blue: "#1F4FBF"
  danger: "#B42318"
  warning: "#935A06"
  success: "#17724A"
  arena-sheet: "#121F3B"
  arena-raised: "#192A4C"
  arena-sunken: "#0D1830"
  arena-ink: "#EDF1F9"
  arena-ink-muted: "#A3AFC8"
  arena-line: "#263A62"
  arena-line-strong: "#3A5080"
  arena-orange: "#FF7A2E"
  arena-orange-strong: "#FF8F4D"
  arena-orange-ink: "#1C0B02"
  arena-rail: "#0C1730"
  arena-focus: "#8FB0FF"
  phase-warm-up: "#C2630A"
  phase-skill: "#1F4FBF"
  phase-small-sided: "#7A3DB8"
  phase-game: "#C0263F"
  phase-conditioning: "#12775A"
  phase-cool-down: "#0C7489"
  phase-break: "#6A7488"
  court-wood: "#E4C495"
typography:
  display:
    fontFamily: "Archivo, Arial Narrow, ui-sans-serif, sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.012em"
    fontVariation: "'wdth' 78"
  headline:
    fontFamily: "Archivo, Arial Narrow, ui-sans-serif, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.012em"
    fontVariation: "'wdth' 78"
  title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Archivo, Arial Narrow, ui-sans-serif, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 600
    letterSpacing: "0.09em"
    fontVariation: "'wdth' 80"
  numeral:
    fontFamily: "Archivo, Arial Narrow, ui-sans-serif, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0em"
    fontFeature: "'tnum' 1"
    fontVariation: "'wdth' 75"
rounded:
  xs: "3px"
  sm: "5px"
  md: "6px"
  lg: "10px"
  xl: "14px"
  full: "9999px"
spacing:
  hair: "1px"
  tight: "8px"
  card-y: "16px"
  card-x: "20px"
  card-x-wide: "24px"
  gap: "20px"
  section: "32px"
  page-x-phone: "16px"
  page-x-desk: "40px"
components:
  button-primary:
    backgroundColor: "{colors.coach-orange}"
    textColor: "{colors.scorer-ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.coach-orange-strong}"
  button-ink:
    backgroundColor: "{colors.scorer-ink}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.md}"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.sheet-raised}"
    textColor: "{colors.scorer-ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.sheet-sunken}"
  button-ghost:
    textColor: "{colors.scorer-ink}"
    rounded: "{rounded.md}"
    height: "44px"
  input:
    backgroundColor: "{colors.sheet-raised}"
    textColor: "{colors.scorer-ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "44px"
  card:
    backgroundColor: "{colors.sheet-raised}"
    rounded: "{rounded.lg}"
    padding: "20px"
  feature-panel:
    backgroundColor: "{colors.sheet-raised}"
    rounded: "{rounded.xl}"
    padding: "28px"
  rail:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.rail-muted}"
    width: "248px"
  rail-item-active:
    backgroundColor: "{colors.rail-raised}"
    textColor: "{colors.rail-ink}"
    rounded: "{rounded.md}"
    height: "40px"
  meta-tag:
    backgroundColor: "{colors.sheet-raised}"
    textColor: "{colors.scorer-ink-muted}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "28px"
  tooltip:
    backgroundColor: "{colors.scorer-ink}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
  tally:
    backgroundColor: "{colors.sheet-sunken}"
    rounded: "{rounded.sm}"
    height: "28px"
---

# Design System: CoachOS

## Overview

**Creative North Star: "The Official Scoresheet"**

CoachOS is laid out like the scoresheet a coach signs after every game: a crisp, ruled, two-ink document. Structure is printed in scorer-blue ink; the coach's own marks are in orange. Every session, drill and minute is accounted for in boxes, hairlines and tabular figures, so the product reads as a record a coach can trust and hand out on paper. The world rejects the category default of a grey SaaS shell with one accent, and the dark "arena" of black ground and orange glow.

Light mode is a cool white sheet under bright gym lights, with blue-ink type. Dark mode is the same sheet under arena lights: a deep blue-ink ground (never neutral black) with sheet-white type and the same orange. A blue-ink rail, the sheet's printed header band, holds navigation in both themes. The `.arena` scope puts the dark sheet on the landing page, sign-in and onboarding whatever the app theme is.

Density is working-tool density: 44px controls for the on-court tablet, ruled lists rather than card mosaics, numbers set condensed and tabular so they line up like a scoresheet column. Motion is short and understated, except for one signature: the running tally, where minute blocks are struck in with an orange stroke.

**Key Characteristics:**
- Two inks on sheet stock: scorer-blue for structure, orange for the coach's marks.
- One hairline weight (1px) for every rule, border and divider.
- One type family, Archivo, using its width axis: normal for interface, condensed for display, numbers and form labels.
- Depth is a hairline plus a soft, blue-tinted offset shadow; no glow.
- The running tally is the signature component; digit rolls and the orange "changed" mark are its supporting moves.
- Photography and footage are content on Persuade surfaces and sport banners, never chrome.

## Colors

A cool, two-ink palette: blue-ink neutrals carry everything structural, one orange carries every act of the coach, and seven phase colours carry the session timeline.

### Primary
- **Coach's Orange** (coach-orange / arena-orange): the brand orange, one colour across both themes for fills and strokes. Primary buttons, the brand mark, the active-nav tick, the tally strike, the "changed" row mark, text selection. Text placed on an orange fill is blue ink in light mode (scorer-ink) and near-black brown in dark mode (arena-orange-ink): the two inks together.
- **Text-Safe Orange** (coach-orange-text): the orange for orange TEXT on the light sheet only (links, the "OS" of the wordmark, accent meta tags, caret). In dark mode orange text uses arena-orange directly.
- **Orange Wash** (orange-wash): the faint orange ground behind accent meta tags and the one-shot value-changed flash.

### Neutral
- **Sheet** (sheet / arena-sheet): the page ground. Light is a cool white; dark is the blue-ink ground.
- **Raised Sheet** (sheet-raised / arena-raised): cards, panels, inputs, menus, dialogs.
- **Sunken Sheet** (sheet-sunken / arena-sunken): wells, hover fills, the empty tally strip, the diagram well.
- **Scorer Ink** (scorer-ink / arena-ink): all primary type and the ink button.
- **Muted Ink** (scorer-ink-muted / arena-ink-muted): descriptions, form labels, secondary data.
- **Faint Ink** (scorer-ink-faint): placeholders, decorative or large text only, never body copy.
- **Hairline / Strong Hairline** (hairline, hairline-strong): the one rule weight; strong for control borders and the hero sheet frame.
- **Blue-Ink Rail** (rail, rail-raised, rail-ink, rail-muted, rail-line; arena-rail in dark): the navigation band.

### Tertiary
- **Phase Colours** (phase-warm-up, phase-skill, phase-small-sided, phase-game, phase-conditioning, phase-cool-down, phase-break): the session timeline and tally fills. Dark mode lifts each to a lighter tint of the same hue (defined in `globals.css`).
- **Status** (danger, warning, success, focus-blue): each with a soft ground for badges and toasts. Focus is always blue, never orange, so the orange mark is never mistaken for focus.
- **Court Wood** (court-wood): the hardwood fill of the on-screen diagram court only; print and mono renders stay flat.

### Named Rules
**The Two Inks Rule.** Structure is blue ink; the coach's marks are orange. If an element is not something the coach did, chose or must act on, it is not orange.

**The One Orange Rule.** Fills and strokes use the brand orange in both themes. Only orange text on the light sheet switches to the text-safe orange (coach-orange-text); orange text never sits on the light sheet at the fill value.

**The Blue Night Rule.** Dark mode is blue ink (arena-sheet, arena-raised, arena-sunken, arena-rail), never neutral black or grey.

**The Written-Out Rule.** A phase colour never stands alone: every tally, legend and timeline row also names the phase in words.

## Typography

**Display Font:** Archivo at condensed width (with Arial Narrow fallback)
**Body Font:** Archivo at normal width (with ui-sans-serif, system-ui)
**Label/Mono Font:** Archivo condensed caps for labels; Geist Mono exists but is barely used

**Character:** One family, two widths. The normal width is a plain, legible working face; the condensed width is the scoresheet's printed voice for titles, numbers and box labels.

### Hierarchy
- **Display** (700, condensed 78%, 2.6rem phone to 3rem desktop for page titles, 3.5rem for the dashboard greeting, up to 7.5rem for the landing wordmark; line-height 1): page titles via the page header, landing section heads, dialog titles.
- **Headline** (700, condensed 78%, 2.25 to 2.75rem): the featured session title in the court panel and empty-state statements.
- **Title** (600, 1.125rem, tight tracking): card and section titles at normal width.
- **Body** (400, 1rem, relaxed on marketing at 1.125rem): descriptions capped near 42rem (max-w-2xl).
- **Label** (600, 0.78rem, condensed 80%, 0.09em tracking, uppercase, muted ink): the printed box label. Names a box, a field group, a stat or a small section.
- **Numeral** (700, condensed 75%, tabular figures): minute totals, counts, clocks, time ranges. 3.75rem on the court panel total, 2.25rem on stats and the totals bar.

### Named Rules
**The Tabular Rule.** Every number a coach compares (minutes, counts, clock times) is set as a numeral: condensed, tabular. Tables are tabular by default.

**The Label Is Not a Kicker Rule.** The condensed caps label names a box or a small section. It never sits above a page heading as a kicker; the page title carries its own weight.

## Layout

The signed-in shell is a 248px (15.5rem) blue-ink rail beside a fluid work area on desktop (md and up), and a 64px top bar plus a fixed bottom tab bar on phones. Content is capped at 72rem (max-w-6xl), widening to 92rem only when a page marks itself wide (the document design workspace). Main padding is 16px on phones and 40px on desktop, with extra bottom padding on phones to clear the tab bar.

Pages open with a page header: display title, short description, actions on the right, closed by a hairline with 24px below. Sections are spaced 32px apart; grids gap at 20px. Cards pad 20px (24px from sm). The dashboard pairs a 1.7fr court panel with a 1fr quick-actions column, then a 1.35fr / 1fr pair, collapsing to one column below lg. Lists are ruled (divide-y hairlines inside one bordered sheet) rather than separate floating cards wherever items are read as a register. The landing page stacks full-width bands separated by hairlines inside the same 72rem column.

Print is a first-class layout: the shell, rail and bars disappear and content runs full width.

## Elevation & Depth

Depth is a hairline plus a soft, offset shadow tinted with blue ink, like a sheet lying on a desk. Surfaces sit flat on that paper shadow at rest; interactive cards lift 2px with a stronger shadow on hover; overlays (menus, dialogs, toasts, the hero sheet) use the strongest pop shadow. Dark mode swaps the blue tint for a deep black falloff plus a 1px top highlight. There is no glow and no coloured shadow.

### Shadow Vocabulary
- **Paper** (light `0 1px 2px rgb(15 27 51 / 0.05), 0 8px 22px -14px rgb(15 27 51 / 0.2)`): every card and panel at rest.
- **Lift** (light `0 1px 2px rgb(15 27 51 / 0.06), 0 16px 32px -16px rgb(15 27 51 / 0.28)`): hover on interactive cards.
- **Pop** (light `0 2px 6px rgb(15 27 51 / 0.08), 0 24px 48px -20px rgb(15 27 51 / 0.36)`): menus, dialogs, toasts, the landing hero sheet.

### Named Rules
**The Sheet-on-Desk Rule.** Elevation is always hairline plus paper shadow. Never a shadow without a border, never a glow.

**The Opaque Sheet Rule.** Panels and cards are solid stock. Translucency with backdrop blur is reserved for sticky bars over scrolling content (top bar, tab bar, landing header) and the video pause control; it is never a panel material.

## Shapes

Corners are small and printed: 6px on controls (buttons, inputs, nav items, tooltips), 10px on panels and cards, 14px only on large feature panels (the dashboard court panel, dialogs, the landing hero sheet and register, sport overview banners). Boxed labels and badges on the sheet use 3 to 5px; status pills are fully round. Every border is 1px. Accent marks are short rounded bars: the 3px active-nav tick, the 3px "changed" row mark, the 4px section tick. Court-line drawings (the court mark, diagrams) are hairline strokes with round caps.

## Components

### Buttons
Firm, printed, and quick to answer a press.
- **Shape:** gently squared (6px), 44px tall by default (36px small, 48px large), semibold.
- **Primary:** brand orange fill with blue-ink text in light (near-black brown in dark), a 1px dark baseline and a faint inner top highlight.
- **Hover / Focus / Press:** hover deepens the orange; focus is a 2px blue outline offset 2px; press scales to 0.97 in 120ms.
- **Ink:** blue-ink fill with sheet text, for a strong non-orange action. **Secondary:** raised sheet with a strong hairline. **Ghost:** text only, sunken fill on hover. **Danger:** danger fill. **Link:** orange text, underline on hover.

### Cards / Containers
- **Corner Style:** 10px (14px for feature panels).
- **Background:** raised sheet.
- **Shadow Strategy:** paper at rest; lift plus a 2px rise on hover only when the whole card is a control.
- **Border:** 1px hairline; header and footer separated by hairlines.
- **Internal Padding:** 20px, 24px from sm; card header 16px vertical.

### Inputs / Fields
- **Style:** raised sheet, 1px strong hairline, 6px corners, 44px tall, 16px text, orange caret.
- **Focus:** border turns orange (text-safe) and a 2px blue focus outline sits flush.
- **Error / Disabled:** border turns danger with an announced message that fades up; disabled drops to 60% opacity. Labels are medium-weight ink above the control; hints are muted ink below.

### Navigation
- **Rail (desktop):** blue-ink band, wordmark at top in rail tone, a full-width orange "New session" action, then nav items 40px tall in muted rail ink. Active item: raised rail fill, rail-ink text and a 3px orange tick on its left edge. Workspace name sits at the foot over a faint court-line drawing.
- **Tab bar (phone):** raised sheet, top hairline, icon over a small label; active item turns orange text with a 2px orange bar at the top edge.
- **Landing:** links in muted ink with an orange underline that grows from the left on hover, focus and current page.

### Meta Tags and Badges
Small boxed context tags in the printed-form style: 28px tall, 5px corners, hairline border, muted ink; the accent tone uses the orange wash and text-safe orange. Drill and scope badges are tiny condensed-caps boxes (4px corners); session status badges are round pills in condensed caps.

### Section Label
The condensed caps label with a short 4px-wide orange tick before it. Used as the heading of small sections inside a page or panel.

### Overlays
Menus, dialogs, tooltips and toasts are raised sheet with a hairline and the pop shadow (tooltips are inverted: ink ground, sheet text). Menus and tooltips scale in from their trigger at 0.96; dialogs pop from centre at 0.96 over a blue-ink overlay. Toasts stack bottom-right (above the tab bar on phones) with a success or danger border and icon.

### The Running Tally (signature)
The scoresheet's running-score column translated into a session's minutes. A 28px strip on the sunken sheet, 5px corners, filled left to right with phase-coloured blocks, ruled with a hairline every 5 minutes. A planned-length marker in ink appears where the total runs past the target. A block added while the coach watches is struck in: its fill wipes in from the left (360ms) and a 2px orange stroke crosses it (520ms), once. Blocks present on load are simply drawn; the landing hero strikes every block in sequence as a showcase. A 10px slim variant omits the ruling and strikes. The tally is purely visual: its caller always supplies the accessible reading and a written phase legend.

It appears on the dashboard court panel, the session builder totals bar, the generator result and the landing hero sheet. It is not yet on session list cards (that needs per-activity data in the list query and is an open decision).

**Supporting moves:** totals change in place with a digit roll (each digit column slides, 260ms, retargeting mid-roll); a moved or added row holds a 3px orange mark on its left edge until the next interaction.

### Cinematic Imagery
Original, generated photography and footage (provenance in `public/images/cinematic/README.md`) is content: the landing court band and "How it works" steps, and the sport overview banners (a still for basketball, a looping clip for wheelchair basketball). Clips are muted, load only when visible, carry a visible pause control, and fall back to the still poster under reduced motion. Text over footage gets a blue-ink scrim gradient from the side where the words sit.

## Do's and Don'ts

### Do:
- **Do** use semantic tokens (surface, ink, line, accent, rail) in components; never raw hexes.
- **Do** fill primary actions with the brand orange (coach-orange / arena-orange) and set blue-ink text on it in light mode.
- **Do** use the text-safe orange (coach-orange-text) whenever orange is text on the light sheet.
- **Do** keep dark mode in the blue-ink family: arena-sheet, arena-raised, arena-sunken, arena-rail.
- **Do** set every comparable number as a condensed tabular numeral.
- **Do** draw every rule at 1px from the hairline token.
- **Do** write out the phase name wherever a phase colour appears.
- **Do** label the featured session honestly: "Next on court" when one is scheduled ahead, "Latest session" otherwise.
- **Do** keep UI motion between 120 and 240ms with the strong ease-out (cubic-bezier(0.23, 1, 0.32, 1)), animate only opacity and transform, and switch movement off under reduced motion and print.
- **Do** keep cinematic photography and footage on Persuade surfaces and sport overview banners, with provenance recorded.

### Don't:
- **Don't** label a session "Tonight" or "Tonight's court" unless it is scheduled tonight.
- **Don't** set orange text at the fill value (#F26A1B) on the light sheet.
- **Don't** use neutral black or grey grounds in dark mode.
- **Don't** use gradient text, glow, or glass panels; gradients appear only as legibility scrims over footage and as the tally's ruling.
- **Don't** put a condensed caps label above a page heading as a kicker.
- **Don't** use photography or footage as UI chrome (backgrounds behind controls, card textures, nav decoration).
- **Don't** use orange for focus; focus is always the blue focus ring.
- **Don't** add signature motion beyond the tally strike, digit roll and changed mark; the court-line draw and text rise are reserved for Persuade surfaces and onboarding.
