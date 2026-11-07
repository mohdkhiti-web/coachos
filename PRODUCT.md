# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Club and academy basketball coaches** planning and running team training over a season.
- **PE teachers** planning basketball lessons for classes.
- **Wheelchair basketball coaches**, served by a full second sport with its own drill library and chair-aware diagrams.

Confirmed use scene (2026-11-07): equal weight on planning at a laptop in the evening, running practice from a phone or tablet in a brightly lit gym, and handing printed or exported session sheets to players and staff. Light and dark both need first-class treatment.

## Product Purpose

CoachOS is the operating system for basketball coaches: find drills, build a practice session on a timeline, draw court diagrams, generate a session from rules or with the AI Coach, and turn the result into a professional printable document, PDF or PNG, or a secure share link. Success means a coach goes from "what are we doing tonight?" to a finished, printable practice plan quickly, with drills they trust.

## Positioning

A planner built around the court itself: every drill carries a real, editable court diagram, sessions are assembled from a structured, faceted drill library (category, skill, level, age, players, duration, equipment), and the AI Coach only proposes changes the coach approves. It is sport-aware, with basketball and wheelchair basketball both live.

## Operating Context

Coaches search and filter the library, open drills and their diagrams, build sessions with phases (warm-up, skill, small-sided, game, conditioning, cool-down, break), reorder activities, design the session document (presets, templates, logo), export or share it, and manage a team and player roster. Practice happens on hardwood courts. Printed sheets are a real part of the ritual.

## Capabilities and Constraints

Live: accounts (email and password, optional Google and Apple sign-in), six-question onboarding, a dashboard ("Command Center"), the drill library (194 basketball and 60 wheelchair drills), a drill editor with a drag-and-drop diagram workspace, the session builder, document design with live preview, templates, PDF and PNG export, secure sharing, a deterministic session generator, the AI Coach (needs an API key), a team and player roster with an optional wheelchair classification, settings and a sport switcher.

**Does not exist, so never fake it:** attendance, a calendar, billing or subscriptions, analytics or player statistics, assessments, lesson plans. Player classification is display-only; nothing infers ability from it.

Stack: Next.js 16, React 19, Tailwind 4, next-intl, Postgres with row-level security, deployed on Vercel. No animation library is installed; motion is CSS-first.

## Brand Commitments

- Name: **CoachOS**.
- Signature colour: **orange** stays the accent.
- Tagline: **"The Operating System for Basketball Coaches"** stays on the landing page.
- Everything else (palette beyond the accent, typography, surfaces, components, motion) is open for replacement. The user asked for it to be made "amazing".

## Evidence on Hand

Real content: the drill library and taxonomies in `content/<sport>/`, court packs in `src/sports/basketball/`, and the diagram engine in `src/engines/diagram/`. There are no customer testimonials, logos, user counts or pricing, so never invent them. There are no licensed photographs either; imagery slots live in `src/components/basketball/imagery.ts`.

## Product Principles

1. The court is the interface: diagrams are first-class content, not decoration.
2. Real or absent: no button, number or feature appears unless it works.
3. The coach decides: AI and generators propose, and the coach approves.
4. Ready for print: everything a coach builds can leave the screen as a clean document.
5. Every sport gets equal care: wheelchair basketball gets the same quality as basketball.

## Accessibility & Inclusion

WCAG 2.1 AA, keyboard-operable editors, reduced-motion support, and colour never as the only signal (session phases are always also written out). The product serves wheelchair basketball, so inclusive language and representation matter.
