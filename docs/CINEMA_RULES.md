# Cinematic rules library

The app acts as director by applying established film grammar to the floor plan. Each rule is listed with its source and with how the app uses it:
- **Propose**: the shot designer uses the rule to choose cameras.
- **Check**: the validator warns when a shot breaks the rule.
- **Impact**: the floor plan warns when a change starts to break the rule.

The rules are geometric approximations of craft guidance. They are not a substitute for watching the cut, and the user can always override them, giving a reason.

## Sources

- **Arijon** — Daniel Arijon, *Grammar of the Film Language* (1976). The triangle system and camera set-ups for dialogue.
- **Katz** — Steven D. Katz, *Film Directing Shot by Shot* (1991). Coverage and staging.
- **Mascelli** — Joseph V. Mascelli, *The Five C's of Cinematography* (1965). Camera angles, continuity, cutting, close-ups and composition.
- **Murch** — Walter Murch, *In the Blink of an Eye* (1995/2001). The "rule of six": emotion, story, rhythm, eye-trace, the 2D plane and 3D space.
- **Brown** — Blain Brown, *Cinematography: Theory and Practice*. Shot sizes, lens choice and screen direction.
- **Lessons learned** — rules learned from our own Paid On Time Kling tests, 7–8 Nov 2026.

## Rules

| ID | Rule | What it means | Source | Used for |
|---|---|---|---|---|
| R-180 | **180° rule / line of action** | Keep every camera on one side of the line between the two people in a conversation, so each stays on the same side of the screen. | Arijon, Mascelli, Brown | Propose, Check, Impact |
| R-SCREEN | **Consistent screen position** | A character who starts frame-left stays frame-left in every shot of the scene unless a move is shown. | Mascelli (continuity), Katz | Propose, Check, Impact |
| R-TRIANGLE | **Triangle system** | Dialogue coverage comes from camera positions on one side of the line: a master (wide), two over-the-shoulders and two singles. | Arijon | Propose |
| R-MASTER | **Establish first** | Open a scene, or a change of geography, with a wide shot showing who is where. | Katz, Mascelli | Propose |
| R-OTS | **Over-the-shoulder for dialogue** | Shoot the speaker over the listener's shoulder. This keeps both in the frame and the relationship clear. | Arijon, Katz | Propose |
| R-REVERSE | **Shot / reverse shot** | The reply is shot from the mirrored position, behind the other person. | Arijon, Katz | Propose |
| R-CU-EMOTION | **Close-ups for emotional peaks** | The stronger the emotion, the tighter the shot. Save close-ups for the key beats. | Mascelli (close-ups), Murch (emotion first) | Propose |
| R-REACTION | **Show the reaction** | Cut to the listeners when their reaction tells the story, such as shock or embarrassment. | Katz, Murch | Propose, multi-shot grouping |
| R-30 | **30° rule** | Two consecutive shots of the same person should differ by at least about 30° in camera angle, or clearly in shot size. Otherwise the cut looks like a jump. | Brown, Katz | Check |
| R-OCCLUSION | **Clear sightline to the subject** | The main subject's face must not be hidden by someone nearer the camera. An over-the-shoulder shoulder at the edge of frame is fine. | Katz (staging), lessons learned | Propose, Check, Impact |
| R-THIRDS | **Rule of thirds** | In a two-person shot, place the subject's eyes off-centre, roughly on a third line, not dead centre. | Mascelli (composition), Brown | Propose (scoring) |
| R-BACKGROUND | **Consistent background** | A character's background should stay the same across their shots in a scene, so the room doesn't jump between cuts. | Mascelli (continuity), lessons learned (C1→C2a audit) | Propose (scoring), Check |
| R-SHOULDER | **Shoulder in the foreground** | An over-the-shoulder needs the foreground shoulder close to the camera and clearly nearer than the subject. | Arijon | Propose, Check |
| R-HEADROOM | **Room to look** | Leave space in the frame on the side a person is looking towards ("lead room"). | Mascelli, Brown | Planned (needs facing direction) |
| R-ANGLE-POWER | **Camera height shows power** | A low angle makes a character dominant, a high angle makes them vulnerable, and eye level is neutral. | Mascelli (camera angles), Brown | Planned (camera height in the viewfinder) |
| R-ONE-SPEAKER | **One speaker per clip** | Only one character speaks in a generated clip; the others react silently. | Lessons learned | Check, multi-shot grouping |
| R-MULTISHOT | **Multi-shot only when safe** | Combine consecutive shots into one Kling multi-shot clip only when they are at the same location, have at most one speaker plus silent cutaways (or are silent coverage), and stay within 15 s and 6 cuts. | Lessons learned, Kling 3.0 limits | Multi-shot grouping |

## How the shot designer applies them

1. **Classify each storyboard panel** from its data:
   - *establishing*: first panel, or an arrival;
   - *dialogue*: someone speaks to someone;
   - *emotional peak*: a speaker with a strong emotion and a short line;
   - *reaction*: silent, with listeners as the subject;
   - *exit*: someone leaves.
2. **Generate candidate cameras** from the triangle system (R-TRIANGLE) on both sides of the line of action.
3. **Score each candidate:**
   - **Hard rules**, which a candidate must pass: everyone meant to be visible is in frame, the subject is not hidden (R-OCCLUSION), the camera is inside the room and not inside a person or the table, and the camera is on the scene's side of the line (R-180).
   - **Soft rules**, which earn points: subject on a third line (R-THIRDS), the same background as the character's other shots (R-BACKGROUND), a clear shoulder for over-the-shoulders (R-SHOULDER), and screen positions matching earlier shots (R-SCREEN).
4. **Choose the side of the line** that scores best across the whole scene, then **offer the best 2–3 options per panel**, each with a plain-English reason.
5. **Group panels into multi-shot clips** where R-MULTISHOT allows.
6. **When the user changes the plan**, re-score every affected shot and report what got worse (Impact).

## Genre

Genre changes **taste**: which shots are preferred, camera movement, light and lens, and pacing. It never changes the continuity rules (R-180, R-SCREEN, R-OCCLUSION, R-BACKGROUND). Profiles are in `src/lib/domain/genre.ts` and are chosen per project.

| Genre | Preferred shots | Camera movement in prompts | Look in prompts | Animatic pause after a line |
|---|---|---|---|---|
| General | Coverage rules only | Static | Natural, even lighting | 0.5 s |
| Comedy | Two-shots and wides; **short lines and put-downs play in a two-shot**; hold reactions | Static | Bright, even lighting, natural lens | 0.8 s |
| Drama | Over-the-shoulders building to close-ups; close-up at the peak | Slow, subtle push-in | Soft motivated light, shallow depth of field | 0.7 s |
| Horror | Tight frames hiding the surroundings; wide only to establish | Slow creeping move | Low-key light, deep shadows | 1.0 s |
| Sci-fi | Wides for scale | Smooth glide | Cool coloured light, wide lens | 0.6 s |
| Action | Wides for geography plus tight impact shots | Dynamic handheld | High contrast | 0.3 s |
| Documentary | Observational; no staged over-the-shoulders | Steady observational | Natural light | 0.5 s |

Sources: Mascelli (camera angles, close-ups), Katz (staging and coverage), Brown (lens, light and movement), and common genre practice. The comedy two-shot convention is "play the joke in one frame so the timing isn't cut up".
