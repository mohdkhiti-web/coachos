# Cinematic assets: provenance

Original AI-generated assets made for CoachOS with Higgsfield on 2026-11-07. They are not stock footage or scraped
material and show no real person. Stills were compressed with sharp (WebP q74, JPEG posters q72). The clips were
re-encoded in Chromium to VP9 WebM; the hero clip also keeps its H.264 MP4 original as a fallback.

| File | Used on | Model | Higgsfield job |
| --- | --- | --- | --- |
| `arena.webp`, `hero-court-poster.jpg` | Basketball sport overview banner; poster of the landing court band | gpt_image_2_6 | a64ef3e8-94c0-4533-9979-1f33af263367 |
| `wheelchair.webp`, `wheelchair-poster.jpg` | Landing "How it works" (step 1); poster of the wheelchair overview clip | gpt_image_2_6 | 6b3161a8-833d-42c6-a2e7-f7ed3af02407 |
| `clipboard.webp` | Landing "How it works" (step 2) | gpt_image_2_6 | 8da51afc-bd84-410a-910a-b493fe582cb4 |
| `sneakers.webp` | Landing "How it works" (step 3) | gpt_image_2_6 | e9f30c27-9de0-483c-a96c-aa4cb644d8b1 |
| `/videos/hero-court.webm`, `/videos/hero-court.mp4` | Landing court band (5 s loop) | kling3_0 std, silent, image-to-video from `arena` | 97b523a1-5a2e-47ee-93ff-d5a61aa9a71c |
| `/videos/wheelchair.webm` | Wheelchair Basketball sport overview banner (5 s loop) | kling3_0 std, silent, image-to-video from `wheelchair` | c86c475b-225e-42ae-b75a-f134118f3e68 |

## Prompts

- **arena**: Cinematic photograph of an empty indoor basketball arena at night. A single orange basketball rests on
  polished maple hardwood near the free-throw line, lit by one narrow overhead spotlight; the rest of the arena falls
  into deep navy-blue shadow. Accurate court markings, a regulation backboard and rim out of focus. Low floor-level
  angle, shallow depth of field, subtle haze, navy shadows and warm orange highlights. No people, no text, no logos.
- **wheelchair**: Cinematic sports photograph of a wheelchair basketball athlete in a modern sport wheelchair
  (cambered wheels, anti-tip caster) pushing forward fast on an indoor court while dribbling. Navy jersey without
  numbers or text, low side-on angle, motion blur on the wheels, dramatic arena light. Correct wheelchair anatomy and
  hands on the push rims; respectful and empowering. No text, no logos.
- **clipboard**: Close-up of a coach's hands on the sideline holding a clipboard with a printed practice plan and a
  hand-drawn half-court play (circles, X marks, arrows), a whistle on a lanyard, hardwood and blurred players behind.
  No readable words, no logos, face not visible.
- **sneakers**: Floor-level close-up of plain unbranded sneakers making a sharp cut on maple hardwood across a white
  court line, a basketball bouncing ahead, dust in a raking spotlight. No logos, no text.
- **hero-court clip**: Very slow cinematic push-in toward the ball; haze drifts through the spotlight beam, the ball
  stays still, steady camera, no people, no cuts.
- **wheelchair clip**: The athlete pushes the rims and glides forward while bouncing the ball beside the chair; the
  camera tracks alongside. Natural motion, realistic wheel spin and ball physics, no cuts.

Replace any of these with licensed or self-shot material by keeping the same file names. For stills, the imagery slots
are configured in `src/components/basketball/imagery.ts`.
