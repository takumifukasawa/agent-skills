# Google Play store image sizes

Requirements (as of writing — always double-check the current Play Console UI):

| Asset | Size / constraint | Format |
|---|---|---|
| **Feature graphic** | exactly **1024 x 500** | PNG/JPEG, ≤ 15 MB |
| **Phone screenshots** (2–8) | aspect **16:9 or 9:16**, each side **320–3,840 px** | PNG/JPEG, ≤ 8 MB each |
| **7-inch tablet** (up to 8) | aspect 16:9 or 9:16, each side **320–3,840 px** | PNG/JPEG, ≤ 8 MB each |
| **10-inch tablet** (up to 8) | aspect 16:9 or 9:16, each side **1,080–7,680 px** | PNG/JPEG, ≤ 8 MB each |

## Practical presets (portrait 9:16 game)

- **Phone**: `1080 x 1920` (9:16). Satisfies phone + 7" tablet.
- **Tablet (7" AND 10", one shared set)**: `1440 x 2560` (9:16). Both sides are in
  `[1080, 3840]`, so it satisfies the 7" range (320–3840) *and* the 10" range
  (1080–7680). One tablet set covers both tabs.
- A single `1080 x 1920` set technically also satisfies 10" (1080 is the min),
  but `1440 x 2560` gives more margin above the 10" minimum — prefer it for tablets.

## Landscape 16:9 game

Use `1920 x 1080` (phone/7") and `2560 x 1440` (tablets); same reasoning.

## Notes

- Keep well under the byte limits — flat neon PNGs are tiny (tens of KB).
- The feature graphic is a *promo banner*, not a screenshot: hide the HUD, show a
  clean/dynamic game moment + the title.
