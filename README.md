# trn.frm

A browser-based image processing tool. Drop in an image, stack effects, animate parameters across keyframes, and export as GIF.

## effects

| | |
|---|---|
| **DITH** | dithering — floyd-steinberg, atkinson, bayer, threshold |
| **ASCI** | ascii art |
| **EDGE** | edge detection |
| **STIP** | stippling |
| **HALF** | halftone |
| **DIST** | distortion |
| **DSPL** | displacement |
| **RECO** | recolor |
| **SCAT** | scatter |
| **CELL** | cellular automata |
| **GRAD** | gradients |
| **CRT** | CRT scanlines |
| **TEXT** | text overlay |
| **GLTH** | glitch |
| **BLUR** | blur |
| **PIXL** | pixelate |
| **NOIS** | noise |
| **SHRP** | sharpen |
| **CHOP** | chop |
| **BLOK** | blocks |

## animation

- Click **◎** next to any slider to animate that parameter
- Keyframes appear in the timeline as draggable diamonds
- Scrub the playhead or hit play to preview
- Set frames and fps in the bottom-left panel
- Export as GIF with the **export gif** button

No build step. No dependencies. Vanilla JS ES modules.
