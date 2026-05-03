# Pigment

**[https://pigment.whistlehog.xyz](https://pigment.whistlehog.xyz)**

Extract acrylic paint recipes from any image. Upload a photo and Pigment will quantize its colors, match each region to a mix of real acrylic paints, and give you a full shopping list.

## Features

- Drag-and-drop or URL image loading
- Adjustable color quantization (4–256 colors)
- Per-region paint mix labels overlaid on the image
- Paint-by-numbers outline mode
- Grouped palette by Dark Tints / Light Tints / Pigments
- Consolidate similar mixes with a slider
- Checkable paint shopping list
- Export to PDF

## Paint palette

Recipes are derived from these ten colors:

| Paint | Abbrev |
|---|---|
| Titanium White | WH |
| Paynes Gray | PG |
| Burnt Umber | BNTU |
| Raw Umber | RAWU |
| Yellow Ochre | YOC |
| Cadmium Yellow Light | CADY |
| Cadmium Red | CADR |
| Alizarin Crimson Permanent | AZC |
| Ultramarine Blue | UMB |
| Phthalo Blue (Green Shade) | PHB |

---

## Running locally

**Requirements:** Node.js 18+

```bash
# Install dependencies
cd server && npm install
cd ../client && npm install

# Start both (from repo root)
# Terminal 1 — API server (port 3035)
cd server && npm start

# Terminal 2 — Vite dev server (port 5174)
cd client && npm run dev
```

Open [http://localhost:5174](http://localhost:5174).

---

## Running with Docker

```bash
docker build -t pigment .
docker run -p 3035:3035 pigment
```

Open [http://localhost:3035](http://localhost:3035).

To use a different port:

```bash
docker run -p 8080:8080 -e PORT=8080 pigment
```

---

## Usage

1. **Load an image** — drag and drop, choose a file, or paste a URL and click Load.
2. **Adjust colors** — drag the Colors slider or type a number (4–256). Lower values give broader paint regions; higher values preserve more detail.
3. **Hover over the image** — see the paint recipe for any region and highlight matching swatches in the palette.
4. **Toggle Labels** — show or hide the mix labels overlaid on the image.
5. **Paint by Numbers** — switch to an outline view for a paint-by-numbers style rendering.
6. **Consolidate mixes** — drag the slider to merge perceptually similar recipes into fewer groups.
7. **Shopping list** — check off paints as you gather them.
8. **Export PDF** — opens a print-ready page with all recipes expanded and the shopping list included.
