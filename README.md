# 🍣 Sushi Chef — scan-to-play WebAR sushi game

Tap the NFC tag or open the link → the camera opens → point it at the printed **sushi card** →
a hinoki sushi board appears on the card and the orders start coming. Build real sushi the way
a sushi chef does, step by step, against the clock. Made for ages 8+.

**Play:** https://naomirajwanshi02.github.io/sushi-ar/
**Without the card:** https://naomirajwanshi02.github.io/sushi-ar/?demo=1
**The card to scan:** [`sushi_main.jpeg`](sushi_main.jpeg)

## How to play

1. Open the link. It goes straight to the camera viewfinder. Point it at the card.
2. When the card is found, a red stamp says *Found it!* and a short welcome explains the game.
   Tap **Let's cook!**
3. An **order** comes in, such as *California Roll*. Ingredients wait on little glazed dishes round
   the board. Tap them in the **chef's order**; the piece builds up in the middle of the board.
4. When every ingredient is in, the plate is **served**: a pair of nigiri, or the roll cut into six.
   You learn a fact about that piece, and the next order arrives.

**The card is only needed to start.** While the card is in view the board sits on it. Point the
phone away and the board glides to a resting place in front of the camera, so the game carries on.
Bring the card back and the board settles onto it again.

## The rules, and why the points add up

Every number is a multiple of 10. The game itself doesn't explain the scoring: players just see the
score roll up. This table is the logic behind it, in [`js/rules.js`](js/rules.js).

| You… | Points |
|---|---|
| tap the right ingredient | **+10** |
| serve a plate | **+100** |
| serve it fast | **up to +150**, for the share of the clock left (in steps of 10) |
| serve it with no wrong taps (a *perfect plate*) | **+50** |
| serve perfect plates in a row | the plate's points × **2, 3, 4, up to 5** |
| tap a wrong ingredient | **−1.5 s** off the clock, and the multiplier drops to ×1. It never costs a life. |
| run out of time | the customer leaves: **−1 of 3 lives**. Lose all 3 and the bar closes. |

**What counts as wrong** is explained on the spot, the way a sushi master would: *Nori first!* (right
ingredient, wrong moment), *No avocado in Tuna Nigiri*, or *Gari goes beside sushi, not in it*.
Pickled ginger (gari) is on the board every time and never belongs in a piece: knowing that is part
of the game.

**Order inside a stage is free.** A chef must lay nori before rice, but the three fillings of a
California roll can go in any order. The ticket boxes those together.

**One ramp.** The first three orders are three-step pieces (nigiri, gunkan, thin rolls). Four-step
pieces unlock at order 4 and the big rolls at order 7. Decoys grow from 2 to 6 by the 12th plate, and
the clock gives a little less time per step after every plate (4.5 s at first, never under 1.4 s).
After 6 s without progress, the ingredients you need start to hop.

## The 11 pieces

| Piece | Kind | Built in this order |
|---|---|---|
| Salmon Nigiri | nigiri | rice → wasabi → salmon |
| Tuna Nigiri | nigiri | rice → wasabi → tuna |
| Ebi Nigiri | nigiri | rice → wasabi → shrimp |
| Tamago Nigiri | nigiri | rice → tamago → nori belt |
| Ikura Gunkan | gunkan | rice → nori wall → salmon roe |
| Kappa Maki | hosomaki | nori → rice → cucumber |
| Salmon Maki | hosomaki | nori → rice → salmon |
| Tekka Maki | hosomaki | nori → rice → wasabi → tuna |
| Futomaki | futomaki | nori → rice → tamago, cucumber, crab (any order) |
| California Roll | uramaki | nori → rice → crab, avocado, cucumber (any order) → sesame |
| Salmon Avocado Roll | uramaki | nori → rice → salmon, avocado (any order) → sesame |

13 ingredients: sushi rice, nori, wasabi, salmon, tuna, shrimp, tamago, salmon roe, crab stick,
avocado, cucumber, sesame and pickled ginger. All data is in [`js/data.js`](js/data.js).

## The 3D sushi

Nothing is downloaded: every model is built in code at real size (1 unit = 1 cm) in
[`js/models.js`](js/models.js), and painted with textures drawn on canvases in
[`js/textures.js`](js/textures.js).

- **Rice** is a hand-pressed mound with a grain texture and relief, covered in a few hundred
  separate instanced grains.
- **Fish** is a rounded slab draped over the rice. Salmon carries its white lines of fat, tuna a wet
  sheen; both use a clear-coat so they look moist.
- **Rolls** are laid out flat on a bamboo mat while you build them, then served cut into six pieces
  standing in two rows. Each cut face is drawn from the recipe: nori, rice and the fillings in place.
- **Light** follows Noh_Masks: filmic tone mapping, a studio environment for reflections, a warm key
  light with soft real shadows, and in AR the exposure and tint follow the room seen by the camera.
- The **ticket icons** are photographs of the same 3D models, so the ticket always matches the board.

`tools/model-sheet.html` shows every ingredient, every stage of every piece and every served plate.

## Design: the Anatomy kit in sepia

The interface uses the [Anatomy](https://github.com/wheresryan22/anatomy) skill (MIT) in the same
sepia theme as **Noh_Masks** and **Ramen_Builder**: Anatomy plates, warm paper and walnut ink tokens
([`css/anatomy-sepia.css`](css/anatomy-sepia.css)), Zen Maru Gothic, red pill buttons, the corner
viewfinder with its red sweep, a red stamp when the card is found, and a rolling score that locks
when points land. The screens carry no extra labels, no Japanese script and no sound. The kit's stylesheet is in [`vendor/anatomy/`](vendor/anatomy).

**Works on any screen and in any browser.** When the card leaves the view, the floating board measures
the space the HUD leaves free and fits itself and its labels into it: below the HUD on a portrait
phone, beside it when the HUD becomes a left-hand column in landscape, and centred on tablets and
desktops. The welcome card's start button stays in view on short screens, and safe areas (notches,
home bars) are respected. Browsers built into other apps (Instagram, WhatsApp, Facebook, TikTok…)
often block the camera: the game recognises them and says how to open the page in Safari or Chrome,
with a button that copies the link.

## Files

| File | What it is |
|---|---|
| `index.html` | The screens: viewfinder, welcome, HUD, pause, game over. |
| `js/app.js` | The flow and the HUD: scan → welcome → orders, score, combo, lives. |
| `js/rules.js` | The rules as plain logic: orders, stages, scoring, clock, lives. Tested in node. |
| `js/data.js` | Ingredients, recipes, facts and the difficulty ramp. |
| `js/stage.js` | The 3D board: card tracking with the float-away fallback, dishes, building, serving, taps. |
| `js/models.js` / `js/textures.js` | The sushi, the board, the dishes and their textures. |
| `js/look.js` / `js/icons.js` | Lighting, and photographing models for the ticket. |
| `css/` + `vendor/anatomy/` | The sepia theme and the layout. |
| `sushi_main.jpeg` / `targets.mind` | The card and its compiled MindAR data (1,877 detection points). |
| `target.png` / `target_card.mind` | A square backup card: `?target=./target_card.mind`. |
| `tests/rules.test.mjs` | 43 checks of the rules. Run `sh tests/run.sh` (node only). |
| `tools/` | The model sheet, and scripts to compile a new card. |

## Printing the card

Print `sushi_main.jpeg` about **18 cm wide** (it's 3:2, so about 18 × 12 cm) on **matte** paper, in
even light. Hold the phone 20–40 cm away. A laptop or tablet screen also works.

Version pins: `mind-ar@1.2.5` needs `three@0.160.0`, because three r162 removed `sRGBEncoding`.
These are the same pins as Noh_Masks and Ramen_Builder.
