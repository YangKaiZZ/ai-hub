# AI Hub campaign: the film and the stickers

A 55-second motion-graphics ad for AI Hub, plus the sticker set the landing page uses. The star is the
student from the character sheets supplied on 2026-10-06. He is unnamed on purpose: the "Matcha" name,
the matcha drink and its green styling were removed, and everything wears AI Hub's violet brand.

| What | Where |
|---|---|
| Film, web encode (1080p30, H.264 + AAC, 6.9 MB) | `public/campaign/ai-hub-film.mp4`, poster `ai-hub-film-poster.jpg` |
| Film on the site | `/` (section `#film`) and `/film` (chapters + download) |
| Stickers for the site | `public/campaign/*.webp` |
| HyperFrames project | `campaign/film/` |
| Sticker cutting scripts | `campaign/tools/stickers/` |

## The film

`campaign/film` is a [HyperFrames](https://hyperframes.heygen.com) project built with the bo-spatial-film
workflow: nine scenes on a 96 BPM grid (one bar = 2.5 s). Each scene is one CSS-3D camera rig animated by GSAP,
and the seams between scenes are pixel-matched.

| Time | Scene | Shows |
|---|---|---|
| 0:00 | `s01-chaos` | Notifications pile up, one per beat. "7 deadlines. 4 courses. 1 tired brain." |
| 0:07 | `s02-idea` | The lightbulb sticker: "What if it all lived in one place?" |
| 0:12 | `s03-reveal` | The beat drops; violet irises into the AI Hub mark; the hero pops up |
| 0:17 | `s04-priorities` | Dashboard: AI analysis re-sorts the tasks, plus the daily recommendation |
| 0:25 | `s05-tutor` | AI Tutor in Learning mode: the question types out, a hint streams back |
| 0:32 | `s06-sources` | A PDF upload, then an answer that cites "Week 4 lecture notes, p. 3" |
| 0:37 | `s07-plan` | AI Plan My Week: blocks snap in on the beat, then Confirm & add to calendar |
| 0:42 | `s08-grades` | Grade + target calculator; Canvas, Moodle and Blackboard sync |
| 0:47 | `s09-finale` | Confetti, "Same you. Bigger goals.", then the lockup |

Every screen is rebuilt from the app's own components and tokens, and only shipped features appear.
`frame.md` is the design contract, `STORYBOARD.md` has the beat-by-beat plan, and `film.json` is the one
source of timing and the SFX cue sheet.

### Sound

All audio is synthesized by `campaign/film/tools/make_audio.py` (numpy + scipy, seeded, no samples, so there
are no licences to track). That covers:

- a lo-fi bed at 96 BPM: a tense filtered intro, a breath for the idea, a riser, the drop on the logo, a
  Rhodes/boom-bap groove with a pluck hook, and one Cmaj9 ringing under the lockup
- 16 SFX: notification pings, phone buzz, pops, clicks, keyboard burst, whooshes, riser, impact, chime,
  scan, stamp, confetti and success

The WAVs are git-ignored; the script regenerates identical files.

### Rebuild and render

```bash
cd campaign/film
python3 tools/make_audio.py                       # assets/audio/bgm.wav + assets/audio/sfx/*.wav
SKILL=~/.claude/skills/bo-spatial-film            # the bo-spatial-film skill folder
python3 $SKILL/scripts/assemble.py                # index.html from film.json
tools/localize-gsap.sh                            # use the vendored GSAP (no CDN at render time)
npx hyperframes@0.8.117 check                     # lint + layout + motion + contrast
python3 $SKILL/scripts/seam-check.py              # pixel-check every scene seam
npx hyperframes@0.8.117 render --fps 30 --quality delivery -o renders/ai-hub-film-1080p30.mp4
ffmpeg -i renders/ai-hub-film-1080p30.mp4 -c:v libx264 -preset slow -crf 25 -tune animation \
  -c:a aac -b:a 128k -movflags +faststart ../../public/campaign/ai-hub-film.mp4
```

Iterate on one scene with `python3 $SKILL/scripts/make-harness.py && tools/localize-gsap.sh`, then
`bash $SKILL/scripts/test-scene.sh <scene-id> "0.5,2.0,4.9"` (lint + snapshots + contact sheet).
Preview everything with `npx hyperframes@0.8.117 preview`.

On a machine with a GPU, `--fps 60 --browser-gpu` renders the 60fps master the contract also supports.

## Stickers

The cut-outs come from the supplied sheets: the 12-pose sticker sheet and the character sheet. The art in those
sheets is small (a pose is about 200 px tall), so the set is rebuilt at high resolution in two steps:

1. `tools/stickers/upscale.py`: each whole sheet is upscaled 4x with Real-ESRGAN's anime model
   (`RealESRGAN_x4plus_anime_6B`, via spandrel + torch, tiled for CPU). It keeps the line art crisp and clears
   the WebP compression blur.
2. `tools/stickers/make_stickers.py`: masks are found on the 1x sheets, where the flat backgrounds separate
   easily, then refined on the 4x art. Every sticker gets a rebuilt, even white die-cut edge. For the big hero
   pose, a real AI Hub dashboard (`laptop-screen.html`, rendered at 700x500 @2x) is perspective-warped onto
   his laptop screen at full resolution, and his phone UI is turned violet.

```bash
python3 tools/stickers/upscale.py sticker-sheet.webp sheet1_x4.png RealESRGAN_x4plus_anime_6B.pth
python3 tools/stickers/upscale.py character-sheet.webp sheet3_x4.png RealESRGAN_x4plus_anime_6B.pth
python3 -I tools/stickers/make_stickers.py sticker-sheet.webp sheet1_x4.png character-sheet.webp sheet3_x4.png \
  laptop-screen.png out/
```

The output is 29 WebP stickers, each exactly 2x its earlier size (a standing pose is about 800x1300; the hero is
1777x3396), so existing layouts kept their on-screen sizes and simply got sharper. The site serves them through
`next/image` at a fitting size. Poses that hold the matcha cup, and the green mascot, are left out.

## Credits

- Geist (SIL OFL 1.1), `campaign/film/assets/fonts/OFL.txt`
- GSAP 3.14.2 (GreenSock standard licence), vendored at `campaign/film/assets/vendor/gsap.min.js`
- Phosphor icons (MIT), the same set the app uses
