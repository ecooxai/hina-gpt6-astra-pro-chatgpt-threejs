# Hina · GPT-6 Astra Pro · ChatGPT · Three.js

An original procedural 3D character study of Hina holding a pale blue umbrella. The character, clothing, hair, hands, shoes, umbrella frame, and iris texture are constructed in JavaScript. The supplied Hina illustration is the sole visual reference; the unseen sides and back are original interpretations.

**[Open the interactive viewer](https://ecooxai.github.io/hina-gpt6-astra-pro-chatgpt-threejs/)**

## Run locally

Install Node.js and npm, then run these commands from the project directory:

```bash
npm ci
npm run dev
```

Open **http://localhost:4177/** in a browser with WebGL 2 support. `npm run serve` is an alias for the same local server. This project requires no application bundling step; the server reads files directly, so refresh the page after editing source code.

To select another port:

```bash
PORT=4180 npm run dev
```

The browser import map loads Three.js from the release's local `vendor/` directory. Serve the complete project or published static bundle, including `vendor/` and the review JSON files in `exports/`. Opening `index.html` through a `file:` URL does not provide the intended module and fetch environment. The supplied reference illustration is not bundled or required to render the model.

## Explore the model

| Control | Behavior |
| --- | --- |
| Drag / one-finger drag | Orbit around the model. |
| Mouse wheel / pinch | Zoom. |
| Right-button drag / two-finger drag | Pan using the orbit controller. |
| Front, Left, Back, Right | Select a precise camera preset and clear residual drag motion. |
| Four sides | Compare four simultaneous orthographic views. |
| Turntable | Animate the inspection camera around the static model. |
| Umbrella | Show or hide the umbrella for surface inspection. |
| Full figure / Portrait | Change the framing. |
| Reset | Return to the front, full-figure view and stop the turntable. |
| Save view | Save the current canvas as a PNG with a white creator credit on a dark band. |
| Download 3D model | Export the posed character and umbrella as a self-contained GLB. |

The responsive layout provides the same core controls at desktop and phone-sized widths. The lower-right review card separately displays the accepted visual pass, author visual score, cumulative fit evaluations, and numerical landmark fit.

## Model and exports

**[Download the primary GLB](exports/Hina_GPT6_Astra_Pro_ChatGPT_ThreeJS.glb)**

The primary export is a **static posed model** with embedded materials and its procedural iris texture. It has no skeleton, skinning, facial rig, or animation clips. The viewer's turntable rotates the camera; it does not animate the character. The umbrella toggle is an inspection control; the primary export retains the full model.

The final primary export passed a GLB reload check with matching triangle count and bounds:

| Primary GLB property | Verified result |
| --- | --- |
| File size | Approximately 8.926 MB, decimal |
| Triangles | 343,720 |
| Meshes | 49 |
| Materials | 44 |
| Embedded textures | 1, the shared procedural iris texture |

The **[showcase GLB](exports/Hina_GPT6_Astra_Pro_ChatGPT_ThreeJS_showcase.glb)** adds a dark creator plinth and large white attribution. Its additional geometry and plaque texture make its totals different from the primary GLB. Use the [model manifest](exports/model-manifest.json) for exact byte sizes, counts, and hashes. Showcase PNGs also carry the creator credit.

## Review results and what the scores mean

The accepted result is **visual pass 10, rated 95/100 by the author** after rendered front, portrait, four-side, desktop, and touch-input review. This is a creative self-assessment, not a measured likeness percentage or an AAA production certification. Ten overall visual passes were recorded; pass 8 was rejected and did not replace the previously accepted result. Component assessments remain **head and hair 94/100, body and outfit 95/100, umbrella 95/100**. See the [visual review record](exports/visual-review.json).

Separately, the fitting workflow evaluated **60,000 numerical parameter candidates**: 40,000 local diagnostic candidates and 20,000 final candidates on RubyWebterm. Each fitting run evaluates 10,000 distinct parameter tuples. These are camera/head-pose alignment calculations, not 60,000 rendered visual reviews. The final numerical landmark score is approximately **89.5666/100**. The [fit summary](exports/iteration-summary.json) and retained CSV/history records describe the method and accounting.

The public numerical record contains the two final 10,000-candidate CSV runs; the earlier 40,000 diagnostic evaluations are represented by their aggregate count. The fit uses manually interpreted source landmarks and measures their projected alignment. It does not measure hair identity, expression, fabric, color, surface continuity, or the plausibility of unseen views. The accepted head attitude was preserved during the final camera diagnostics rather than being replaced by a pose that merely improved sparse landmark alignment.

The final development browser/export review passed **24 checks**, including camera presets, four-side mode, turntable motion, umbrella visibility, development reference and download controls, touch orbit, preset reset after touch movement, missing-resource/browser errors, and GLB embedding/reload. The public viewer omits the reference control and supplied image. Published validation records are sanitized for the public release; internal QA captures are not bundled.

Remaining interpretation is visible in the finer illustrated fringe segmentation, facial linework, and some fabric folds. Only one source view was supplied, so side and back details are plausible authored construction.

## Render and verify

For automated review, install a Playwright Chromium browser if no suitable browser is already available:

```bash
npx playwright install chromium
```

Capture the scene:

```bash
npm run capture
```

This writes front, left, back, right, portrait, four-side, desktop, phone-sized, garment, and shoe views under `qa/`. The character-only four-side image helps inspect surfaces otherwise obscured by the umbrella. A smaller capture set is available with `npm run capture -- --quick`; a single view can be selected with `npm run capture -- --shot=portrait`.

Generate and validate both deliverable GLBs and their model manifest:

```bash
npm run export
```

The export command writes the primary and creator-plinth showcase GLBs under `exports/`, reloads them for structural and material-compatibility checks, and writes `exports/model-manifest.json`. It uses an isolated server on port 4186 unless `HINA_URL` points to an existing server.

Run the functional and export checks:

```bash
npm run verify
```

Capture and verification start their own server on port 4177 unless `HINA_URL` is set. If a development server is already running, reuse it:

```bash
HINA_URL=http://127.0.0.1:4177 npm run capture -- --shot=portrait
HINA_URL=http://127.0.0.1:4177 npm run verify
```

The shared helper in `scripts/browser.mjs` tries native, surfaceless EGL first, checks that WebGL 2 actually renders a pixel, and falls back to SwiftShader if needed. To select a browser executable or explicitly use the software path:

```bash
CHROMIUM_PATH=/absolute/path/to/chromium npm run capture -- --shot=portrait
HINA_RENDERER=software npm run capture -- --shot=portrait
```

These environment variables can be combined with `HINA_URL`. Browser environment cleanup applies only to the launched child process; it does not modify system or user browser settings.

The public source package includes the viewer, procedural generators, export, capture, and verification code. It does not include the supplied reference or its manual fitting annotations. Full refitting requires those separately supplied inputs and the corresponding fitting tools; the published final 20,000-candidate CSV records remain available for numerical review.

## Performance evidence

The final native benchmark used a headless Chromium session with **Intel UHD Graphics 620**, at **DPR 1**, with the actual application turntable running. It recorded **60 active frames after 10 warmup frames** at each of **1152 × 925** and **390 × 633** pixels. Median active frame intervals were approximately **16.7 ms** at both sizes. The public release includes a sanitized performance summary.

These measurements describe application frame cadence on that test machine. The smaller viewport is not a physical-phone benchmark, and the result is not a display refresh guarantee. Separate framebuffer completion samples confirm actual rendering work; CPU draw submission time is not presented as GPU completion time.

To repeat the hardware benchmark:

```bash
npm run benchmark
```

It uses an isolated temporary server on port 4179 and requires a confirmed hardware renderer. Keep that port free and avoid concurrent browser benchmarks. A SwiftShader run has a different rendering backend and should be reported separately; this script refuses to label a software fallback as a native result.

The viewer batches compatible static meshes, preserves authored normals, redraws when controls or state change, caps device pixel ratio at 2, and reuses its shadow map while the static geometry stays fixed. Four-side mode draws the scene four times and has a different rendering cost.

## Project map

| File or directory | Purpose |
| --- | --- |
| `src/head.js` | Continuous face, conforming eyes, procedural iris, hair cap, swept locks, and ponytails. |
| `src/body.js` | Posed anatomy, hoodie, jewelry, denim shorts, hands, socks, and sneakers. |
| `src/umbrella.js` | Canopy panels, seams, ribs, stretchers, runner, shaft, and curved handle. |
| `src/main.js` | Scene, lights, camera, controls, responsive framing, export, and review display. |
| `src/optimize.js` | Conservative static batching that retains material and normal behavior. |
| `src/export-compat.js` | Export-only conversion of native material/geometry behavior to glTF-compatible equivalents. |
| `index.html`, `style.css` | Viewer structure, controls, and responsive presentation. |
| `scripts/` | Local server, browser helper, capture, export validation, functional checks, and native benchmark. |
| `vendor/` | Local copies of required Three.js runtime modules and add-ons. |
| `exports/` | Public deliverables and selected sanitized review records. |
| `reference/` | Optional, separately supplied development input; excluded from the public release. |
| `qa/` | Locally generated capture and diagnostic output; excluded from the public release. |
| `AGENTS.md` | Concrete handoff notes and invariants for future work. |

## Construction and attribution

Created by **GPT-6 Astra Pro · ChatGPT · Three.js**, using the requested RubyWebterm environment and built-in collaborating agents. Only **image 3, Hina**, was used. The cat and Yukka references were not used. No image generation, downloaded model, stock mesh, imported material, or reference-image projection was used to construct the character. The iris and viewer contact shadow are generated procedurally.

The supplied illustration is not republished with the site or source ZIP. For authorized development review, it may be supplied separately as `reference/hina_latest.png`; development versions can expose an inspection dialog when configured with that input. The public viewer contains neither that image nor a reference button.

Three.js and Playwright are software dependencies, not visual model assets. Preserve their distributed notices when repackaging the runtime. The supplied illustration remains a reference and is not claimed as an original work by the model author.
