---
workflow: general-video
storyboard: yes
message: "Your entire student life. One intelligent hub."
destination: embed (landing page) + social
aspect: 1920x1080
language: en
length: 55s
audience: university and college students juggling several courses
angle: sticker-pack motion graphic + product demo
---

## Intent

A 55-second, unnarrated motion-graphics ad for AI Hub. A student (the user's own character art, shown as die-cut
stickers) goes from deadline overload to calm, with each AI Hub feature proven on screen in the app's own UI.
Kinetic type carries the story; with the sound off it still reads. Music and SFX are synthesized in
`tools/make_audio.py` (original, no licences).

## Assets

- `assets/fonts/geist-{500,700,800}.woff2` - Geist, the app's real typeface (SIL OFL, `assets/fonts/OFL.txt`).
- `assets/brand/mark.svg` - the real mark: Phosphor GraduationCap (bold) on the brand gradient, as in `src/components/brand/logo.tsx`.
- `src/app/globals.css`, `src/components/**` - tokens and UI the kit is ported from.
- `assets/stickers/*.webp` - cut-outs of the user's character sheets (2026-10-06), die-cut edges rebuilt.

## Customizations

- 2026-10-06, user: "create the website an motion graphics ad demonstrating it use and features ... also add sounds effect. You be the CREATIVE director ... you do everything."
- 2026-10-06, user: "REMOVE MATCHA" - no "Matcha" name, no matcha drink, no green matcha styling; the character stays unnamed and every frame uses AI Hub's violet brand.
- 2026-10-06, user: "use hyperframe" - built and rendered with HyperFrames.

## Notes

- Only features AI Hub ships: priority engine + AI task analysis, AI Tutor (Learning / Guided / Review), document Q&A with
  cited sources, AI Plan My Week (confirm before saving), grades with target calculator, Canvas / Moodle / Blackboard sync.
- Mock data is fictional (courses: Database Systems, Calculus II, Physics, Data Structures, World History).
- Stickers holding the matcha cup and the green mascot were left out on purpose.
