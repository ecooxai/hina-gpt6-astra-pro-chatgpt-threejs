# Hina project handoff

## Accepted state

The original scene-building goal was completed on 2026-10-17. **Overall rendered visual pass 10 was accepted at 95/100 as an author self-assessment.** Ten overall visual passes were recorded, including one rejected candidate at pass 8. Component scores are intentionally retained as head/hair 94, body/outfit 95, and umbrella 95. Do not replace these with an invented measured likeness percentage or imply AAA certification.

Final development review covered the front, portrait, all four sides, responsive layouts, touch-input orbit, and model export. All 24 final development browser/export checks passed, including the development-only reference dialog. The public viewer omits that dialog and image. The primary static GLB was verified at approximately 8.926 MB, 343,720 triangles, 49 meshes, 44 materials, and one embedded iris texture; its reload preserved triangle count and bounds. Showcase totals differ and belong in the export manifest.

The fitting history contains 60,000 actual numerical candidates: 40,000 local diagnostics and 20,000 final RubyWebterm candidates. Final numerical fit is approximately 89.5666/100. This is distinct from the visual score and the number of rendered reviews. Public records contain the final 20,000-candidate CSV runs and an aggregate count for the earlier diagnostics. Retain that distinction when adding a future run.

The intended public viewer is `https://ecooxai.github.io/hina-gpt6-astra-pro-chatgpt-threejs/`. Check the actual repository/deployment state before claiming that a new revision is live.

## User constraints to preserve

- Only image 3, Hina, was used. Do not introduce the cat or Yukka references.
- Build geometry and visual details procedurally. Do not import an existing character, mesh, stock texture, or outside visual asset, and do not project the reference onto the model.
- Do not use image generation or additional modeling skill files for continuation of this task. Inspect the supplied reference visually rather than replacing review with automated source-image analysis.
- Keep the light-blue default background, natural views from every side, and the model/creator name above the model in the viewer. Showcase copies need large white creator attribution on a dark background below the work.
- Keep iteration numbers and honest scores visible in the preview. Numerical candidates, rendered passes, and subjective scores are separate quantities.
- Use the requested RubyWebterm environment when available. Preserve the existing project rather than reusing assets from unrelated local directories or websites. The user allowed a local fallback for an unavailable environment.
- Keep code and output directories tidy, use Git, monitor CPU/RAM for expensive work, and resolve renderer stalls before running long render loops. Do not print image or model base64 payloads.
- The visual target has been reached. Continue with a concrete requested improvement or delivery need rather than manufacturing extra iterations or raising a score without inspection.

New user instructions may change the task; these notes preserve the original accepted constraints, not an invented approval barrier.

## Repository and public-release boundary

Run commands from the repository root. The development branch is `gpt6-astra-pro-chatgpt-hina`. RubyWebterm was the primary development environment; use a separate bounded browser/server process for a diagnostic, and do not stop unrelated servers or browsers. Do not change global browser or GPU configuration.

The supplied source illustration may be provided separately as `reference/hina_latest.png` for authorized local development. It is not included in the public repository, source ZIP, or live viewer. The public viewer has no reference button. Only this one source was used; side/back details are plausible original construction.

Publish an allowlisted release containing original source, viewer files, model/showcase exports, required runtime modules and their notices, and selected sanitized review records. Exclude supplied reference images, internal QA directories, absolute development paths, and private working-history payloads. Do not copy the entire working tree into a public release.

## Code map and former ownership

| Area | Files | Responsibility during the build |
| --- | --- | --- |
| Head and hair | `src/head.js` | `hina_head_hair`: face geometry, eye construction/texture, expression, hair surfaces. |
| Body and outfit | `src/body.js` | `hina_body_outfit`: anatomy, garment surfaces, hands, jewelry, shoes. |
| Umbrella | `src/umbrella.js` | `hina_umbrella`: canopy/frame and hand attachment; also developed the original fitting diagnostics. |
| Viewer and integration | `src/main.js`, `index.html`, `style.css` | Root: controls, framing, lighting, export, responsive layout, review UI. |
| Batching and review infrastructure | `src/optimize.js`, `scripts/browser.mjs`, capture/verify scripts | Root and collaborating diagnostics; preserve the documented rendering behavior. |
| Export compatibility | `src/export-compat.js` | Body/outfit agent and root: export-only geometry/material compatibility, including BackSide outline hulls. |

The three model modules export `createHead`, `createBody`, and `createUmbrella`, returning Three.js groups. The main scene composes those groups. Keep component changes isolated and coordinate any shared joint, material, or pose adjustment. Avoid simultaneous edits to the same file. The original fitting script and manually annotated input are excluded from the public source package; a future full refit needs those separately supplied development inputs/tools.

## Geometry and pose invariants

- World units are meters: +Y is up, +Z is forward, +X is viewer-right in the unrotated frontal model. Soles are near Y=0; the hair crown is approximately Y=1.65. The umbrella extends above the character.
- `head.js` bakes its authored coordinates into world coordinates and returns an identity group. Its internal mapping is `x = rawX * .965`, `y = 1.385 + (rawY - 1.339) * (.265 / .326)`, `z = rawZ * .965`. Do not apply that scale again in `main.js`.
- The accepted head pose is yaw **+.45 rad**, roll **−.12 rad**, about **[0, 1.39, 0]**. Apply `Rz(roll) * Ry(yaw)` once and set group translation to `pivot - rotatedPivot`. This must remain correct after static batching.
- The final eye aperture uses raw top/bottom offsets +.0278/−.0207; iris radii are .0148/.0271; pupil radii are .0068/.0143. The compact oval pupils were visually accepted. Do not revert to the earlier long black pupil shape.
- Fitted iris, nose, chin, and scalp apex centers were preserved through the last eye revision. If feature positions or the baked transform change in an authorized development refit, update its explicitly authored landmark constants; do not silently compare a changed mesh against stale constants.
- Face, eyes, upper fringe, and temple strand are continuous or conforming surfaces. Earlier independent hair blades, floating roots, angular chin undersides, and a dark nose knob were rejected. Review both the front and a side profile after changing them.
- Body neck taper and head throat overlap are intentional. The body is unchanged through Y=1.385 at radii .029/.027, then narrows at Y=1.40 to .0225/.0215. The two choker bands remain at Y=1.368 and 1.376.
- The final center V depth in `body.js` is **.027**, reduced from .052. It raised only the center neckline by 25 mm; shoulders, head, neck top, and jewelry stayed fixed. Collar folds and bindings derive from `clothPoint` and should remain aligned with it.
- Preserve hand/umbrella attachment and the accepted sole/sock remapping. Their surface joins and projection were reviewed together. Changing only a shoe, sock rim, shaft, or hand transform can reopen a gap.
- The model is statically posed. There is no skeleton, skinning, morph-target face, or character animation. A future rig requires its own design and validation.

## Materials, normals, and batching

`src/main.js` uses sRGB output, ACES tone mapping at exposure 1.00, and the accepted soft lighting. The face uses a warm Standard material, while the eye artwork uses a procedural texture with its own Basic material. Preserve these distinctions when exporting; indiscriminately replacing Basic materials with lit materials changes the iris appearance.

The face nose and upper fringe have intentional smooth normals. **Do not recompute every normal after batching.** `batchStaticGroup` transforms existing normals into the enclosing group's coordinates, retains the group's live transform, and conservatively merges compatible static meshes. It preserves render/shadow state, draw ranges, mirrored winding, and mesh metadata. Transparent, deformable, or custom-shader objects are excluded. `?unbatched=1` is available for geometry-name diagnostics.

Shadow exceptions are part of the accepted look:

- Facial linework and eyes do not cast or receive scene shadows.
- The continuous face does not receive the coarse scene shadow map.
- Hair materials carry `userData.smoothHairSurface=true`: hair casts shadows but does not receive them. Re-enabling hair reception previously produced a false broad crown band.
- The umbrella underside carries `userData.transmittedCloth`; retain its soft transmitted-light treatment and shadow policy.

The shadow map is static during camera orbit: `shadowMap.autoUpdate=false`. Set `shadowMap.needsUpdate=true` when geometry, light, or umbrella visibility changes. Camera motion alone does not require another shadow pass.

The viewer renders on control/state changes and skips unnecessary idle draws. Camera presets drain pending damping before assigning the new pose; preserve that behavior, which was verified after touch orbit. Four-side mode intentionally disables orbit controls and renders four camera views.

## Run and review

Use the actual scripts in `package.json`:

```bash
npm ci
npm run dev
```

Open `http://localhost:4177/`. `npm run serve` is an alias for the same server. The project is a static site with locally served Three.js modules under `vendor/`; there is no application bundling step. Keep the lockfile and required vendor modules in source releases.

The main review commands are:

```bash
npm run capture
npm run verify
npm run export
npm run benchmark
```

Capture/verification start a server on 4177 unless `HINA_URL` points at an existing server. Reuse it with `HINA_URL=http://127.0.0.1:4177`. Export uses an isolated server on 4186, also overridable with `HINA_URL`; the native benchmark uses 4179. Do not collide with an occupied port or stop an unrelated server.

`scripts/browser.mjs` is the shared review browser launcher. `CHROMIUM_PATH` selects an executable; otherwise the public helper uses Playwright's installed Chromium. The development helper can also detect the known RubyWebterm executable. `HINA_RENDERER=software` explicitly selects SwiftShader. Default behavior probes native surfaceless EGL, verifies a real WebGL 2 clear/readback, and falls back if necessary.

Inherited NVIDIA/Vulkan overrides caused the initial null WebGL contexts even with SwiftShader selected. The helper now removes `VK_DRIVER_FILES`, `VK_ICD_FILENAMES`, `VK_ADD_DRIVER_FILES`, `VK_LOADER_DRIVERS_SELECT`, `VK_LOADER_DRIVERS_DISABLE`, `__GLX_VENDOR_LIBRARY_NAME`, and `CHROME_CANARY_GPU` **only from the browser child's environment**. It sets `EGL_PLATFORM=surfaceless` for the native probe. Do not fix a regression by changing global driver settings.

The browser API is exposed as `window.HinaStudio`: `setView`, `setFraming`, `setQuad`, `setParams`, `exportGLB`, `metrics`, `renderNow`, and `drawScene`. Wait for `window.__HINA_READY__`. `renderNow()` requests a draw; `drawScene()` performs it immediately. Useful inspection queries are `?capture=1&portrait=1&umbrella=0`, `?view=right`, `?quad=1`, and `?unbatched=1`.

For a targeted change, inspect the affected view/detail plus the relevant hidden side. Run the functional/export gate when controls, batching, transforms, or export behavior change. A reference-dialog check applies only to a development build with the separately supplied image and control; public-release validation should not request that image. Do not add repetitive tests for prose-only or unrelated low-impact edits.

## Evidence and performance interpretation

- `exports/visual-review.json`: actual overall visual passes, acceptance status, component scores, and remaining differences.
- `exports/iteration-summary.json` and published final CSV runs: distinct numeric candidates, provenance, and score definition; the previous 40,000 diagnostic candidates are represented by their aggregate count.
- The public model manifest provides exact export filenames, sizes, hashes, counts, and reload checks. Selected sanitized validation/performance reports and creator-branded showcase images are published separately.
- Locally rerunning verification writes `qa/validation/report.json`; capture writes front, portrait, four-side, responsive, and detail images under `qa/`.
- `npm run benchmark` writes detailed local results under `qa/performance/`, including timing samples, hardware, CPU/RAM measurements, source hashes, and limits. Internal QA files are not automatically public release assets.

The native benchmark measured 60 active application frames after 10 warmup frames at 1152×925 and 390×633, DPR 1, on headless Chromium using Intel UHD Graphics 620. Both median frame intervals were about 16.7 ms. This is not a physical-phone measurement, a display refresh guarantee, or the idle FPS counter. Separate readPixels samples confirm framebuffer work. Do not compare a SwiftShader run against the native result without stating the different renderer.

Fit score 89.5666 and visual score 95 must remain separate in documentation and UI. Full refitting is not promised by the public source package: it requires the separately supplied source annotations and corresponding fitting tools. An authorized new run should use a new output directory and retain yaw .45/roll −.12 unless a rendered comparison justifies changing the accepted head attitude.

The original fit optimizes sparse, manually interpreted landmarks. It does not score the full silhouette, color, clothing, facial identity, or side/back construction. Do not move annotated targets, discard residuals, or relabel numeric iterations as visual reviews to raise a score.

## Export and delivery

`exportGLB()` clones the character and umbrella, preserves Standard/Basic material behavior, and embeds the iris texture. The scene's viewer lights, floor, and contact-shadow plane are not model geometry. `exportGLB({showcase:true})` adds the creator plinth and a procedurally drawn attribution plaque. Showcase counts therefore differ from the primary GLB.

The jaw silhouette uses a slightly expanded `BackSide` hull in the native scene. glTF has no BackSide-only material state: preserve this effect in the exported clone by reversing that mesh's triangle winding, negating its normals, and exporting it as `FrontSide`. Clone affected buffers and materials rather than mutating the live scene. A triangle/bounds reload check alone will not detect this shading error; inspect the reloaded face after changing export material handling.

The primary export filename is `Hina_GPT6_Astra_Pro_ChatGPT_ThreeJS.glb`; the showcase adds `_showcase` before `.glb`. Maintain creator/model/tool naming for new deliverables, and retain the white-on-dark showcase credit. `npm run export` writes `exports/model-manifest.json`; use it for exact sizes, hashes, counts, and reload evidence. Do not claim that a deployment, Git push, or artifact upload succeeded without its actual completion result.

Known remaining differences are intentional limitations of this single-reference interpretation: finer illustrated fringe and facial linework, some fabric-fold placement, and unseen-side construction. Preserve the accepted result as a baseline before experimenting with those areas.
