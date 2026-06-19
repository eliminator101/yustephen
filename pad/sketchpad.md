# Sketchpad Web App — Technical Specification

## 1. Overview & Goals

Build a simple, responsive doodling web app inside the `skills/` folder. The app lets users draw freehand strokes on a large white canvas, zoom and pan the view, use a semi-transparent highlighter, erase with three different modes, and undo/redo actions. The experience should be clean, fast, and usable on both desktop and mobile devices.

Design philosophy:
- Minimal, distraction-free UI.
- White background, no patterns or textures.
- Canvas fills most of the screen.
- Touch-friendly controls.
- No external build tools; keep the project self-contained and easy to open in a browser.

## 2. Architecture

- **Runtime**: Single-file vanilla HTML/CSS/JS.
- **Rendering**: HTML5 `<canvas>` 2D context.
- **State**: In-memory JavaScript objects; no external state library.
- **Input**: Pointer Events API to handle mouse, touch, and stylus with one unified code path.
- **No build step**: All CSS and JS are inline in the HTML file so it can be opened directly.

## 3. File Layout

Create the app as a single file:

```
skills/
├── req.txt          # source requirements (existing)
├── sketchpad.md     # this specification
└── index.html       # the sketchpad app (single-file, self-contained)
```

`skills/index.html` contains inline `<style>` and `<script>` blocks. Keeping it self-contained matches the existing project style and avoids any build tooling.

## 4. Coordinate System & Zoom/Pan

### Camera state
```javascript
const view = {
  scale: 1.0,    // zoom level
  offsetX: 0,    // pan offset in world units
  offsetY: 0
};
```

### Rules
- All stroke points are stored in **world-space coordinates**.
- The canvas is rendered by transforming the context so strokes can be drawn in world space.
- Zoom is clamped to `[0.1, 5.0]` (10% to 500%).
- Zooming always happens toward the pointer/cursor/pinch center so the point under the user stays stable.

### Coordinate helpers
```javascript
function screenToWorld(sx, sy) {
  return {
    x: sx / view.scale - view.offsetX,
    y: sy / view.scale - view.offsetY
  };
}

function worldToScreen(wx, wy) {
  return {
    x: (wx + view.offsetX) * view.scale,
    y: (wy + view.offsetY) * view.scale
  };
}
```

### Canvas transform
Before drawing strokes:
```javascript
ctx.setTransform(
  view.scale, 0,
  0, view.scale,
  view.offsetX * view.scale,
  view.offsetY * view.scale
);
```
Reset to identity before drawing UI overlays.

## 5. Data Model

### Stroke object
```javascript
{
  id: "uuid",                       // unique identifier
  tool: "pen" | "highlighter" | "eraser",
  color: "#000000",                 // hex or rgba string
  width: 3,                         // world-space stroke width
  opacity: 1.0,                     // 0.0–1.0
  isHighlighter: false,             // true for highlighter strokes
  points: [
    { x: 0, y: 0, t: 1718791200000 }
  ],
  bounds: { minX, minY, maxX, maxY } // AABB for hit-testing and culling
}
```

### Global state
```javascript
const app = {
  strokes: [],          // all finalized strokes
  currentStroke: null,  // stroke currently being drawn
  tool: "pen",          // active tool
  mode: "draw",         // "draw" or "pan"
  color: "#000000",
  width: 3,
  isHighlighter: false,
  undoStack: [],
  redoStack: []
};
```

## 6. Tools & Modes

### Active tool
- **Pen**: normal opaque stroke.
- **Highlighter**: semi-transparent stroke, `isHighlighter = true`.
- **Eraser**: has three sub-modes (see Section 8).

### Interaction mode
- **Drawing mode**: pointer drag creates strokes.
- **Panning mode**: pointer drag moves the camera; wheel/pinch also zooms.

A toolbar button toggles between the two modes. The active mode is shown with a highlighted icon and a cursor change (e.g., crosshair in draw mode, grab in pan mode).

### Optional shortcuts
- Spacebar + drag temporarily pans even while in draw mode.
- Middle-mouse drag also temporarily pans.

## 7. Highlighter

### Opacity
Default highlighter opacity is **0.35 (35%)**.

Rationale: real-world highlighters are typically 30–40% opaque. At 35%, overlapping strokes darken slightly but remain readable, and content underneath stays visible. This matches common defaults in PDF readers and note-taking apps.

### Rendering
- Set `ctx.globalAlpha = stroke.opacity` (0.35 by default).
- Use `globalCompositeOperation = "source-over"`.
- Default color is `#FFEB3B` (material yellow), but the user can pick any color.
- Store `isHighlighter: true` on the stroke so the highlighter-only eraser can filter it.

## 8. Erasers

| Eraser Type | Behavior | Implementation |
|-------------|----------|----------------|
| **Stroke Eraser** | Tap a stroke to remove the entire connected stroke. | Hit-test against stroke bounding boxes and line segments. On hit, remove the full stroke from `app.strokes`. |
| **Precision Eraser** | Drag to erase pixel by pixel. | Draw small circles using `ctx.globalCompositeOperation = "destination-out"` on the canvas, or split hit strokes at intersection points. Record the erased region as an operation for undo. |
| **Highlighter Eraser** | Tap to remove only highlighter strokes. | Same hit-test as stroke eraser, but only consider strokes where `isHighlighter === true`. |

For simplicity and clean undo support, the recommended precision-eraser approach is:
- Detect which strokes intersect the eraser path.
- Remove or split those strokes, creating new stroke objects for the remaining pieces.
- Push an `EraseRegionCommand` onto the undo stack that records the affected strokes and their original state.

## 9. Undo / Redo

### Strategy: command pattern
Use commands instead of full snapshots to keep memory usage low and history fast.

### Command types
```javascript
{ type: "add", stroke }              // adds a stroke
{ type: "remove", stroke }           // removes a stroke
{ type: "eraseRegion", before, after } // replaces a set of strokes with modified/split versions
```

Each command implements:
- `execute()` — apply the change.
- `unexecute()` — reverse the change.

### History stacks
```javascript
const undoStack = [];
const redoStack = [];
```
- Any new user action clears `redoStack`.
- Undo pops from `undoStack` and pushes to `redoStack`.
- Redo pops from `redoStack` and pushes to `undoStack`.

### Triggers
- Keyboard: `Ctrl+Z` to undo, `Ctrl+Y` or `Ctrl+Shift+Z` to redo.
- Toolbar buttons for undo and redo.
- Buttons are disabled when their stack is empty.

## 10. Rendering Pipeline

### Canvas sizing
```javascript
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  ctx.scale(dpr, dpr);
}
```

### Frame loop
1. Clear canvas with `#ffffff`.
2. Apply the world-space transform.
3. For each stroke in `app.strokes`:
   - Skip if its bounds are outside the visible viewport (culling).
   - Set `globalAlpha`, `lineWidth`, `strokeStyle`, and `lineCap`/`lineJoin`.
   - Draw the polyline.
4. Draw the `currentStroke` if one exists.
5. Reset transform and draw UI overlays.

### High-DPI
Keep CSS size at `100vw` × `100vh` and the backing store at `clientSize * devicePixelRatio` for crisp lines.

## 11. Input Handling

### Pointer Events
Use `pointerdown`, `pointermove`, and `pointerup` on the canvas.

### Mode behavior
**Drawing mode:**
- `pointerdown`: start a new stroke from `screenToWorld(e.clientX, e.clientY)`.
- `pointermove`: append points to `currentStroke` and redraw.
- `pointerup`: finalize `currentStroke`, push to `app.strokes`, push `AddStrokeCommand` to undo stack, clear `currentStroke`.

**Panning mode:**
- `pointerdown`: record start pointer position.
- `pointermove`: update `view.offsetX`/`view.offsetY` by the pointer delta in world units.
- `pointerup`: stop panning.

### Zoom
- **Desktop**: `wheel` event adjusts `view.scale` toward the cursor position.
- **Mobile**: two-finger pinch gesture adjusts `view.scale` toward the pinch midpoint.

### Mobile specifics
- Viewport meta tag:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  ```
- Call `e.preventDefault()` during drawing `touchmove` to prevent page scrolling.
- Touch targets for toolbar buttons must be at least **48 × 48 px**.

## 12. UI / UX

### Toolbar (floating overlay)
Positioned at the top or bottom, never squishing the canvas.

**Desktop:** horizontal toolbar at the top with icons and labels.
**Mobile:** bottom sheet or collapsible strip with large touch targets.

### Controls
- **Tool selector**: Pen, Highlighter, Eraser (with eraser sub-mode dropdown/segmented control).
- **Color picker**: `<input type="color">` plus a small palette of preset swatches.
- **Width slider**: range `1` to `20` (world-space pixels), default `3`.
- **Mode toggle**: Draw / Pan button.
- **Undo / Redo** buttons.
- **Zoom controls**: zoom in, zoom out, reset zoom buttons (optional but helpful on mobile).

### Active feedback
- Selected tool and mode are visually highlighted.
- Cursor changes based on mode and tool.
- Disabled undo/redo buttons indicate empty history.

## 13. Performance & Mobile

- Use `requestAnimationFrame` for rendering during drawing.
- Cull strokes whose bounding boxes are outside the viewport.
- If stroke count grows large, consider an off-screen cache or a render-to-image strategy for completed strokes.
- Debounce resize handling.
- Use passive event listeners where possible, except when `preventDefault()` is needed.

## 14. Open Questions / Future Enhancements

The following items are not required for the first version but are worth recording:

- **Persistence**: save drawings to `localStorage` or `IndexedDB`?
- **Export**: allow saving as PNG?
- **Stylus pressure**: use `PointerEvent.pressure` to vary stroke width?
- **Adjustable precision eraser size**: should the user control the eraser radius?
- **Fixed canvas size vs. infinite canvas**: currently infinite via pan/zoom; should there be a fixed page boundary for export?
- **Color palette**: should highlighter have a restricted palette or allow any color?

## 15. Requirement Checklist

| Requirement | Spec Coverage |
|-------------|---------------|
| Pick stroke color | Section 12 — color picker + presets |
| Pick stroke width | Section 12 — width slider 1–20px |
| Zoom in/out with limits | Section 4 — clamped to [0.1, 5.0] |
| Drawing mode + panning mode | Section 6 — mode toggle |
| Highlighter with opacity | Section 7 — 35% opacity default |
| Stroke eraser | Section 8 — removes whole stroke |
| Precision eraser | Section 8 — pixel-by-pixel erasing |
| Highlighter eraser | Section 8 — filters by `isHighlighter` |
| Undo/Redo with buttons and keyboard | Section 9 — command pattern |
| White background | Section 10 — clear `#ffffff` each frame |
| Large canvas | Section 3, 10 — 100vw × 100vh |
| Mobile-friendly scaling and buttons | Sections 11, 12 — 48px touch targets, responsive toolbar |
