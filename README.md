# PuzzleCam — Gesture Capture (improved fork)

> **This is a fork.** The original project and idea were created by
> [mishu006](https://github.com/mishu006/Puzzle) and are released under the MIT license.
> The original concept, gesture design and visual identity belong to the original author.
> This fork keeps that credit and adds the engineering improvements listed below.

A hand-gesture photobooth that runs **entirely in the browser**: frame a photo with both hands, turn it into a sliding-piece puzzle with a black & white photobooth look, solve it with pinch gestures, and collect the results in a downloadable photo strip. No backend, no build step.

## What this fork changes

| Area | Original | This fork |
|---|---|---|
| **Structure** | One ~1200-line `app.js` | Split into ES modules: `config`, `gestures`, `filters`, `effects`, `i18n`, `gallery`, `app` |
| **Pinch detection** | Fixed distance threshold (changes with how far your hand is from the camera) | Thumb–index distance **relative to hand size**, aspect-ratio corrected, with **hysteresis** (separate on/off thresholds) to stop flickering |
| **Pointer jitter** | Raw landmark positions | **One Euro filter** smoothing for dragged pieces and the capture frame |
| **Two-hand identity** | Hand order from the detector (can swap between frames and drop a piece) | `HandTracker` keeps a stable slot per hand by matching wrist positions frame to frame |
| **Performance** | Gaussian noise (`Math.log`/`cos`) computed for every pixel on every frame; detector ran on every screen refresh | Pre-computed noise table; detector only runs when the camera delivers a **new video frame** |
| **Animations** | Fixed 1/60 s step | Real elapsed time, so the shatter effect runs at the same speed on any display |
| **Fist gesture** | Counted in frames (speed depends on FPS) | Counted in milliseconds |
| **Difficulty** | Fixed 3×3 | Selectable **3×3 / 4×4 / 5×5** |
| **Language** | Spanish only | **English + Spanish**, auto-detected, with a toggle |
| **Robustness** | — | Webcam metadata handler registered before the stream is attached; detection errors are caught and reported; camera is released on page close; GPU→CPU fallback refactored |
| **UX** | — | Gesture legend on screen, keyboard shortcuts (`R` reset puzzle, `D` download strip), responsive layout, visible focus styles, `aria-live` status, reduced-motion support |
| **Quality** | No tests | 20 unit tests for gestures, filters, effects and i18n (`npm test`) |

## How it works

1. Show both hands to the camera and **pinch with both** to define the capture frame.
2. Keep the pinch during the countdown: the photo is taken automatically.
3. The photo is cut into a grid (3×3 by default) with a black & white photobooth filter.
4. Rearrange the pieces with **pinch + move**.
5. When solved, **hold a fist** to save it to the strip (with a shatter animation).
6. Download the strip once you have 3 puzzles saved.

### Gestures

| Gesture | Action |
|---|---|
| Both hands pinching | Freeze the area and start the countdown |
| One hand pinching over a piece | Drag the piece |
| Fist (hold ~0.35 s) | Save a solved puzzle / reset the board |

### Keyboard

| Key | Action |
|---|---|
| `R` | Reset the current puzzle |
| `D` | Download the strip |

## Run it locally

The app uses ES modules and the camera, so it must be served over HTTP (it will not work by opening the file directly).

```bash
git clone https://github.com/mogtderi/Puzzle.git   # your fork
cd Puzzle
npx serve .            # or: python -m http.server 5500
```

Open the printed address (e.g. `http://localhost:3000`) and allow camera access.
An internet connection is needed on first load: the MediaPipe runtime comes from `cdn.jsdelivr.net` and the hand model (~10 MB) from `storage.googleapis.com`.

## Project structure

```
├── index.html
├── css/styles.css
├── js/
│   ├── app.js        # main loop, puzzle logic, rendering
│   ├── config.js     # every tunable constant (thresholds, timings, grid sizes)
│   ├── gestures.js   # pinch (hysteresis), fist, hand tracking — pure, tested
│   ├── filters.js    # One Euro filter — pure, tested
│   ├── effects.js    # photobooth filter with noise table — pure, tested
│   ├── i18n.js       # EN/ES strings
│   └── gallery.js    # photo strip + PNG download
├── tests/            # node:test unit tests
└── package.json
```

## Tests

```bash
npm test
```
Requires Node.js 20+. The tests cover the pure logic (gestures, filters, image effect, translations). The camera and MediaPipe parts need a real browser and webcam and are not covered by automated tests.

## Tech stack

- [MediaPipe Tasks Vision](https://developers.google.com/mediapipe) `v0.10.14` — hand landmarks
- Canvas 2D API — rendering, puzzle pieces, photobooth effect
- Vanilla JavaScript (ES modules), CSS custom properties — no frameworks, no build

## Troubleshooting

- **Camera does not start:** close other apps using the camera (Teams, Zoom, Discord) and allow permission in the browser.
- **Model does not load:** check your connection, or whether `cdn.jsdelivr.net` / `storage.googleapis.com` are blocked on your network.
- **Black screen:** serve the app over HTTP instead of opening `index.html` directly.
- **Pinch not detected:** improve lighting and keep both hands fully visible. Tune `PINCH_ON_RATIO` / `PINCH_OFF_RATIO` in `js/config.js`.

## Credits and license

- Original project: **mishu006** — https://github.com/mishu006/Puzzle (MIT)
- Improvements in this fork: **Moghtaderi**

Released under the MIT license, same as the original. Keep the original `LICENSE` file and copyright notice when redistributing.
