# Store listing text (Google Play)

Limits (check the current Play Console UI):

| Field | Limit |
|---|---|
| App name | 30 characters |
| Short description | 80 characters |
| Full description | 4,000 characters |

## How to write them

1. **Read the game first** — its spec / README, the stage or level names, the
   control scheme, the mood. Every claim must be true of the build being
   published. Never claim what you have not checked: ads / no ads, offline,
   in-app purchases, level counts, "endless", leaderboards.
2. **Short description = the feeling, not the manual.** Say what you do in the
   abstract and how it feels ("Drift through a glowing world, one tap at a
   time"), not the controls ("Hold to rise, let go to
   fall") -- users pushed back on controls here. Offer 3 options of different
   tone, each with its character count.
3. **Full description = the short one, opened up a little.** A few short
   paragraphs: what you do, how it feels as you progress, a closing line in
   the game's mood. Keep it **abstract**: no counts of levels/stages, no layout
   lists, no progression rules ("progress resets every stage") -- a game still
   being tuned changes, and users cut such a paragraph as "too detailed, the
   spec may change". A line of controls is optional; drop it when the opening
   line already says how you play ("Drag to ...", "Tap to ..."). For a relaxing
   game, skip failure / game-over / retry details and feature bullet lists
   unless asked; a long FEATURES list reads like a different, busier game.
4. **Show the user's language next to the English.** When the user is not
   writing in English, give each option with a translation underneath so they
   can choose. Say the translation is for meaning; offer a natural native
   listing separately if they want one. The user may also write a draft in
   their language (or instructions) and hand it over to edit and translate --
   in the picker page that goes in the text group's comment box.
5. **Record the decision in the project's docs** (chosen text verbatim, plus the
   rejected options) — the store form is not the source of truth.

## Related form questions

- **"AI-generated assets" label**: it asks whether any listing asset was made or
  edited with generative AI. Screenshots / banners captured from the real game
  and only cropped / resized are not generated or AI-edited. Code written with
  an AI assistant does not by itself make a rendered screenshot "AI-generated".
  Tell the user what each asset actually is (captured, cropped, composed with
  a title...) and leave the final call to them.
