# Visual Diff Accuracy Enhancement — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance visual-diff.js to detect sub-pixel rendering artifacts, font weight mismatches, font fallback issues, and responsive layout drift — reaching 95%+ accuracy on standard component libraries.

**Architecture:** Add three analysis layers on top of the existing pixelmatch core: (1) a sub-pixel classifier that post-processes diff data to separate rendering noise from real issues using connected-component clustering, (2) a typography analyzer that detects font weight and fallback mismatches via luminance band analysis, and (3) a responsive layout comparator that detects structural drift across breakpoints by comparing horizontal/vertical density profiles.

**Tech Stack:** Node.js ESM, pixelmatch, pngjs (existing deps). No new dependencies needed — all analysis is pure image processing on raw RGBA buffers.

---

## Task 0: Install dev dependencies and set up test infrastructure

**Files:**
- Modify: `package.json`
- Create: `scripts/__tests__/visual-diff.test.js`
- Create: `scripts/__tests__/fixtures/` (test PNG fixtures)

**Step 1: Install pixelmatch and pngjs as dev dependencies**

```bash
pnpm add -D pixelmatch pngjs
```

**Step 2: Create test fixture generator**

Create `scripts/__tests__/generate-fixtures.js` — a helper that programmatically generates test PNG images for deterministic testing (solid colors, text-like patterns, shifted layouts).

```js
import { PNG } from "pngjs";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");

export function createPNG(width, height, fillFn) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const [r, g, b, a] = fillFn(x, y, width, height);
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }
  return png;
}

export function savePNG(filename, png) {
  const filepath = join(FIXTURES, filename);
  mkdirSync(dirname(filepath), { recursive: true });
  writeFileSync(filepath, PNG.sync.write(png));
  return filepath;
}

// Solid color fill
export function solid(r, g, b, a = 255) {
  return () => [r, g, b, a];
}

// Simulate text-like horizontal bands (dark on light)
export function textBands(weight = 400) {
  const darkness = Math.round(255 - (weight / 900) * 200);
  return (x, y) => {
    // Every 20px band alternates: "text line" (dark) vs "gap" (white)
    const inBand = (y % 20) < 12;
    // Within band, simulate character shapes with vertical stripes
    const inChar = (x % 10) < 6;
    if (inBand && inChar) return [darkness, darkness, darkness, 255];
    return [255, 255, 255, 255];
  };
}

// Simulate sub-pixel noise (scattered single pixels)
export function withSubPixelNoise(baseFn, density = 0.001) {
  return (x, y, w, h) => {
    if (Math.random() < density) {
      const base = baseFn(x, y, w, h);
      return [
        Math.min(255, base[0] + 1),
        Math.min(255, base[1] + 1),
        Math.min(255, base[2] + 1),
        base[3],
      ];
    }
    return baseFn(x, y, w, h);
  };
}

// Simulate layout shift (offset content by dx, dy pixels)
export function withShift(baseFn, dx, dy) {
  return (x, y, w, h) => {
    const sx = x - dx;
    const sy = y - dy;
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return [255, 255, 255, 255];
    return baseFn(sx, sy, w, h);
  };
}

// Simulate font fallback: different character widths
export function textBandsFallback() {
  return (x, y) => {
    const inBand = (y % 20) < 12;
    // Wider characters than normal (8 of 10 px vs 6 of 10 px)
    const inChar = (x % 10) < 8;
    if (inBand && inChar) return [50, 50, 50, 255];
    return [255, 255, 255, 255];
  };
}
```

**Step 3: Create initial test file**

Create `scripts/__tests__/visual-diff.test.js`:

```js
import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, readFileSync } from "fs";
import {
  createPNG,
  savePNG,
  solid,
  textBands,
  withSubPixelNoise,
  withShift,
  textBandsFallback,
} from "./generate-fixtures.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "visual-diff.js");
const FIXTURES = join(__dirname, "fixtures");

function runDiff(args) {
  const result = execFileSync("node", [SCRIPT, ...args], {
    encoding: "utf-8",
    timeout: 30000,
  });
  return JSON.parse(result);
}

function runDiffRaw(args) {
  try {
    return execFileSync("node", [SCRIPT, ...args], {
      encoding: "utf-8",
      timeout: 30000,
    });
  } catch (e) {
    return e.stdout || e.stderr || "";
  }
}

beforeAll(() => {
  mkdirSync(FIXTURES, { recursive: true });
});

describe("visual-diff.js — existing behavior", () => {
  it("identical images produce 0% diff", () => {
    const img = createPNG(100, 100, solid(200, 100, 50));
    const a = savePNG("identical-a.png", img);
    const b = savePNG("identical-b.png", img);
    const result = runDiff([a, b, "--json"]);
    expect(result.mismatchPct).toBe(0);
    expect(result.pass).toBe(true);
  });

  it("completely different images produce high diff", () => {
    const a = savePNG("diff-a.png", createPNG(100, 100, solid(255, 0, 0)));
    const b = savePNG("diff-b.png", createPNG(100, 100, solid(0, 0, 255)));
    const result = runDiff([a, b, "--json"]);
    expect(result.mismatchPct).toBeGreaterThan(0.5);
    expect(result.pass).toBe(false);
  });
});

describe("visual-diff.js — sub-pixel detection", () => {
  it("classifies scattered single-pixel diffs as sub-pixel artifacts", () => {
    const base = solid(200, 200, 200);
    const a = savePNG("subpixel-a.png", createPNG(200, 200, base));
    const b = savePNG(
      "subpixel-b.png",
      createPNG(200, 200, withSubPixelNoise(base, 0.005))
    );
    const result = runDiff([a, b, "--json"]);
    expect(result.subPixelAnalysis).toBeDefined();
    expect(result.subPixelAnalysis.subPixelPct).toBeGreaterThan(0.5);
    expect(result.subPixelAnalysis.realDiffPct).toBeLessThan(0.01);
  });

  it("does NOT classify clustered diffs as sub-pixel", () => {
    // Place a 20x20 solid block difference — clearly not sub-pixel
    const base = solid(200, 200, 200);
    const withBlock = (x, y, w, h) => {
      if (x >= 50 && x < 70 && y >= 50 && y < 70) return [255, 0, 0, 255];
      return base(x, y, w, h);
    };
    const a = savePNG("cluster-a.png", createPNG(200, 200, base));
    const b = savePNG("cluster-b.png", createPNG(200, 200, withBlock));
    const result = runDiff([a, b, "--json"]);
    expect(result.subPixelAnalysis.subPixelPct).toBeLessThan(0.1);
  });
});

describe("visual-diff.js — font weight detection", () => {
  it("detects font weight mismatch between 400 and 700", () => {
    const a = savePNG(
      "weight-400.png",
      createPNG(200, 200, textBands(400))
    );
    const b = savePNG(
      "weight-700.png",
      createPNG(200, 200, textBands(700))
    );
    const result = runDiff([a, b, "--json"]);
    expect(result.typographyAnalysis).toBeDefined();
    expect(result.typographyAnalysis.fontWeightMismatch).toBe(true);
    expect(result.typographyAnalysis.weightDirection).toBe("heavier");
  });

  it("no font weight mismatch for identical text", () => {
    const img = createPNG(200, 200, textBands(400));
    const a = savePNG("weight-same-a.png", img);
    const b = savePNG("weight-same-b.png", img);
    const result = runDiff([a, b, "--json"]);
    expect(result.typographyAnalysis.fontWeightMismatch).toBe(false);
  });
});

describe("visual-diff.js — font fallback detection", () => {
  it("detects font fallback from character width differences", () => {
    const a = savePNG(
      "font-primary.png",
      createPNG(200, 200, textBands(400))
    );
    const b = savePNG(
      "font-fallback.png",
      createPNG(200, 200, textBandsFallback())
    );
    const result = runDiff([a, b, "--json"]);
    expect(result.typographyAnalysis).toBeDefined();
    expect(result.typographyAnalysis.fontFallbackDetected).toBe(true);
  });
});

describe("visual-diff.js — responsive layout comparison", () => {
  it("detects layout shift when content moves", () => {
    const base = textBands(400);
    const a = savePNG("layout-a.png", createPNG(200, 200, base));
    const b = savePNG(
      "layout-b.png",
      createPNG(200, 200, withShift(base, 10, 5))
    );
    const result = runDiff([a, b, "--json"]);
    expect(result.layoutAnalysis).toBeDefined();
    expect(result.layoutAnalysis.layoutShiftDetected).toBe(true);
    expect(result.layoutAnalysis.estimatedShift.dx).toBeGreaterThan(0);
  });

  it("no layout shift for identical images", () => {
    const img = createPNG(200, 200, textBands(400));
    const a = savePNG("layout-same-a.png", img);
    const b = savePNG("layout-same-b.png", img);
    const result = runDiff([a, b, "--json"]);
    expect(result.layoutAnalysis.layoutShiftDetected).toBe(false);
  });

  it("responsive batch mode compares breakpoint pairs", () => {
    mkdirSync(join(FIXTURES, "responsive-actual"), { recursive: true });
    mkdirSync(join(FIXTURES, "responsive-expected"), { recursive: true });

    const base = textBands(400);
    // Desktop: same
    savePNG("responsive-actual/desktop-1440px.png", createPNG(1440, 200, base));
    savePNG("responsive-expected/desktop-1440px.png", createPNG(1440, 200, base));
    // Mobile: shifted
    savePNG("responsive-actual/mobile-375px.png", createPNG(375, 200, base));
    savePNG(
      "responsive-expected/mobile-375px.png",
      createPNG(375, 200, withShift(base, 5, 0))
    );

    const result = runDiff([
      "--batch",
      join(FIXTURES, "responsive-actual"),
      join(FIXTURES, "responsive-expected"),
      "--output-dir",
      join(FIXTURES, "responsive-diffs"),
      "--json",
    ]);
    expect(result.results).toBeDefined();
    expect(result.results.length).toBe(2);
    // Desktop should pass, mobile may show layout shift
    const desktop = result.results.find((r) => r.file.includes("desktop"));
    expect(desktop.layoutAnalysis).toBeDefined();
  });
});
```

**Step 4: Run tests to verify they fail**

```bash
pnpm vitest run scripts/__tests__/visual-diff.test.js
```

Expected: Tests for new features (`subPixelAnalysis`, `typographyAnalysis`, `layoutAnalysis`) will fail because these fields don't exist yet. The "existing behavior" tests should pass (once pixelmatch/pngjs are installed).

**Step 5: Commit**

```bash
git add scripts/__tests__/ package.json pnpm-lock.yaml
git commit -m "test: add failing tests for visual-diff accuracy enhancements

Tests cover sub-pixel detection, font weight/fallback mismatch, and
responsive layout drift analysis. All new feature tests expected to fail."
```

---

## Task 1: Sub-pixel rendering classifier

**Files:**
- Modify: `scripts/visual-diff.js` (add `analyzeSubPixel` function)

**What it does:** After pixelmatch produces the diff buffer, scan the diff pixels and classify each as "sub-pixel artifact" (isolated single pixel or tiny cluster <= 2px) or "real diff" (connected cluster > 2px). Uses a simple connected-component flood fill.

**Step 1: Add the `analyzeSubPixel` function to visual-diff.js**

Insert after the `analyzeRegions` function (after line 160):

```js
/**
 * Classify diff pixels as sub-pixel artifacts vs real differences.
 * Sub-pixel: isolated pixels or clusters <= maxClusterSize.
 * Real: connected clusters > maxClusterSize.
 */
function analyzeSubPixel(diffData, width, height, diffColor, maxClusterSize = 2) {
  // Build a boolean grid of diff pixels
  const isDiff = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    if (
      diffData[idx] === diffColor[0] &&
      diffData[idx + 1] === diffColor[1] &&
      diffData[idx + 2] === diffColor[2]
    ) {
      isDiff[i] = 1;
    }
  }

  // Connected-component labeling (4-connected flood fill)
  const visited = new Uint8Array(width * height);
  const clusters = [];

  function floodFill(startIdx) {
    const stack = [startIdx];
    const pixels = [];
    visited[startIdx] = 1;

    while (stack.length > 0) {
      const idx = stack.pop();
      pixels.push(idx);
      const x = idx % width;
      const y = Math.floor(idx / width);

      // 4-connected neighbors
      const neighbors = [];
      if (x > 0) neighbors.push(idx - 1);
      if (x < width - 1) neighbors.push(idx + 1);
      if (y > 0) neighbors.push(idx - width);
      if (y < height - 1) neighbors.push(idx + width);

      for (const n of neighbors) {
        if (isDiff[n] && !visited[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
    }
    return pixels;
  }

  let subPixelCount = 0;
  let realDiffCount = 0;

  for (let i = 0; i < width * height; i++) {
    if (isDiff[i] && !visited[i]) {
      const cluster = floodFill(i);
      if (cluster.length <= maxClusterSize) {
        subPixelCount += cluster.length;
        clusters.push({ size: cluster.length, type: "sub-pixel" });
      } else {
        realDiffCount += cluster.length;
        clusters.push({ size: cluster.length, type: "real" });
      }
    }
  }

  const totalDiff = subPixelCount + realDiffCount;
  const totalPixels = width * height;

  return {
    totalDiffPixels: totalDiff,
    subPixelPixels: subPixelCount,
    realDiffPixels: realDiffCount,
    subPixelPct: totalDiff > 0 ? Math.round((subPixelCount / totalDiff) * 10000) / 10000 : 0,
    realDiffPct: totalPixels > 0 ? Math.round((realDiffCount / totalPixels) * 10000) / 10000 : 0,
    clusterCount: clusters.length,
    subPixelClusters: clusters.filter((c) => c.type === "sub-pixel").length,
    realClusters: clusters.filter((c) => c.type === "real").length,
    largestCluster: clusters.reduce((max, c) => Math.max(max, c.size), 0),
  };
}
```

**Step 2: Wire it into `compareSingle`**

In the `compareSingle` function, after the `analyzeRegions` call (line 214), add:

```js
  // Sub-pixel classification
  const subPixelAnalysis = analyzeSubPixel(diff.data, width, height, diffColor);
```

And add `subPixelAnalysis` to the return object (after the `regions` field):

```js
    subPixelAnalysis,
```

**Step 3: Run sub-pixel tests**

```bash
pnpm vitest run scripts/__tests__/visual-diff.test.js -t "sub-pixel"
```

Expected: PASS

**Step 4: Commit**

```bash
git add scripts/visual-diff.js
git commit -m "feat: add sub-pixel rendering classifier to visual-diff

Connected-component flood fill classifies diff pixels as sub-pixel
artifacts (isolated clusters <= 2px) vs real differences. Reports
sub-pixel percentage and cluster statistics in JSON output."
```

---

## Task 2: Typography analyzer (font weight + fallback detection)

**Files:**
- Modify: `scripts/visual-diff.js` (add `analyzeTypography` function)

**What it does:** Analyzes horizontal bands of both images to detect:
1. **Font weight mismatch**: Compare average luminance of dark (text) pixels between images. Significant luminance difference in text regions = weight mismatch.
2. **Font fallback detection**: Compare horizontal density profiles (ratio of dark-to-light pixels per row). Different character widths = different font metrics = fallback detected.

**Step 1: Add the `analyzeTypography` function**

Insert after `analyzeSubPixel`:

```js
/**
 * Detect font weight mismatches and font fallback issues.
 * Analyzes luminance patterns in text regions of both images.
 */
function analyzeTypography(actualData, expectedData, width, height) {
  const DARK_THRESHOLD = 180; // pixels darker than this are "text"
  const BAND_HEIGHT = 4;     // analyze in horizontal bands

  function getLuminance(data, idx) {
    return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  }

  function analyzeBands(data) {
    const bands = [];
    for (let bandY = 0; bandY < height; bandY += BAND_HEIGHT) {
      let darkPixels = 0;
      let totalLuminance = 0;
      let darkLuminance = 0;
      let pixelCount = 0;

      for (let y = bandY; y < Math.min(bandY + BAND_HEIGHT, height); y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const lum = getLuminance(data, idx);
          totalLuminance += lum;
          pixelCount++;
          if (lum < DARK_THRESHOLD) {
            darkPixels++;
            darkLuminance += lum;
          }
        }
      }

      const darkRatio = pixelCount > 0 ? darkPixels / pixelCount : 0;
      const avgDarkLum = darkPixels > 0 ? darkLuminance / darkPixels : 255;
      bands.push({ darkRatio, avgDarkLum, darkPixels, pixelCount });
    }
    return bands;
  }

  // Identify text bands (bands with significant dark pixel ratio)
  function getTextBands(bands) {
    return bands
      .map((b, i) => ({ ...b, index: i }))
      .filter((b) => b.darkRatio > 0.05);
  }

  const actualBands = analyzeBands(actualData);
  const expectedBands = analyzeBands(expectedData);
  const actualText = getTextBands(actualBands);
  const expectedText = getTextBands(expectedBands);

  // --- Font weight detection ---
  // Compare average luminance of text pixels between images
  let weightDiff = 0;
  let weightSamples = 0;
  const minTextBands = Math.min(actualText.length, expectedText.length);

  for (let i = 0; i < minTextBands; i++) {
    const aIdx = actualText[i].index;
    const eIdx = expectedText[i].index;
    if (aIdx < actualBands.length && eIdx < expectedBands.length) {
      weightDiff += actualBands[aIdx].avgDarkLum - expectedBands[eIdx].avgDarkLum;
      weightSamples++;
    }
  }

  const avgWeightDiff = weightSamples > 0 ? weightDiff / weightSamples : 0;
  const WEIGHT_THRESHOLD = 15; // luminance difference indicating weight mismatch
  const fontWeightMismatch = Math.abs(avgWeightDiff) > WEIGHT_THRESHOLD;
  let weightDirection = "none";
  if (fontWeightMismatch) {
    // Positive diff = actual is lighter (higher luminance) than expected
    weightDirection = avgWeightDiff > 0 ? "lighter" : "heavier";
  }

  // --- Font fallback detection ---
  // Compare dark pixel density profiles per band. Different fonts have
  // different character widths, producing different density patterns.
  let densityDiffSum = 0;
  let densitySamples = 0;

  for (let i = 0; i < minTextBands; i++) {
    const aIdx = actualText[i].index;
    const eIdx = expectedText[i].index;
    if (aIdx < actualBands.length && eIdx < expectedBands.length) {
      const aDensity = actualBands[aIdx].darkRatio;
      const eDensity = expectedBands[eIdx].darkRatio;
      densityDiffSum += Math.abs(aDensity - eDensity);
      densitySamples++;
    }
  }

  const avgDensityDiff = densitySamples > 0 ? densityDiffSum / densitySamples : 0;
  const FALLBACK_THRESHOLD = 0.05; // 5% density difference = likely different font
  const fontFallbackDetected = avgDensityDiff > FALLBACK_THRESHOLD;

  return {
    fontWeightMismatch,
    weightDirection,
    avgWeightDifference: Math.round(Math.abs(avgWeightDiff) * 100) / 100,
    fontFallbackDetected,
    avgDensityDifference: Math.round(avgDensityDiff * 10000) / 10000,
    textBandsActual: actualText.length,
    textBandsExpected: expectedText.length,
    textBandCountMismatch: actualText.length !== expectedText.length,
  };
}
```

**Step 2: Wire it into `compareSingle`**

After the `analyzeSubPixel` call, add:

```js
  // Typography analysis
  const typographyAnalysis = analyzeTypography(actualData, expectedData, width, height);
```

And add `typographyAnalysis` to the return object:

```js
    typographyAnalysis,
```

**Step 3: Run typography tests**

```bash
pnpm vitest run scripts/__tests__/visual-diff.test.js -t "font"
```

Expected: PASS for both font weight and font fallback tests.

**Step 4: Commit**

```bash
git add scripts/visual-diff.js
git commit -m "feat: add typography analyzer for font weight and fallback detection

Luminance band analysis detects font weight mismatches (dark pixel
luminance comparison) and font fallback issues (character density
profile divergence). Reports direction and magnitude in JSON output."
```

---

## Task 3: Responsive layout drift analyzer

**Files:**
- Modify: `scripts/visual-diff.js` (add `analyzeLayout` function)

**What it does:** Compares horizontal and vertical projection profiles between two images to detect structural layout shifts. A projection profile sums pixel intensities along one axis — a shift in the profile indicates content has moved.

**Step 1: Add the `analyzeLayout` function**

Insert after `analyzeTypography`:

```js
/**
 * Detect layout drift by comparing projection profiles.
 * Horizontal profile: sum of dark pixels per row (detects vertical shift).
 * Vertical profile: sum of dark pixels per column (detects horizontal shift).
 * Cross-correlation finds the best-matching offset.
 */
function analyzeLayout(actualData, expectedData, width, height) {
  const DARK_THRESHOLD = 200;

  function buildProfiles(data) {
    const horizontal = new Float64Array(height);
    const vertical = new Float64Array(width);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (lum < DARK_THRESHOLD) {
          horizontal[y]++;
          vertical[x]++;
        }
      }
    }
    return { horizontal, vertical };
  }

  /**
   * Cross-correlate two 1D profiles to find the offset that maximizes similarity.
   * Returns { offset, correlation } where offset is the pixel shift.
   */
  function crossCorrelate(profileA, profileB, maxShift) {
    const len = profileA.length;
    let bestOffset = 0;
    let bestCorr = -Infinity;

    for (let shift = -maxShift; shift <= maxShift; shift++) {
      let sum = 0;
      let count = 0;
      for (let i = 0; i < len; i++) {
        const j = i + shift;
        if (j >= 0 && j < len) {
          sum += profileA[i] * profileB[j];
          count++;
        }
      }
      const corr = count > 0 ? sum / count : 0;
      if (corr > bestCorr) {
        bestCorr = corr;
        bestOffset = shift;
      }
    }

    // Also compute correlation at offset 0 for comparison
    let zeroCorr = 0;
    for (let i = 0; i < len; i++) {
      zeroCorr += profileA[i] * profileB[i];
    }
    zeroCorr /= len;

    return { offset: bestOffset, correlation: bestCorr, zeroCorrrelation: zeroCorr };
  }

  const actualProfiles = buildProfiles(actualData);
  const expectedProfiles = buildProfiles(expectedData);

  const MAX_SHIFT = Math.min(50, Math.floor(Math.min(width, height) * 0.1));

  const hResult = crossCorrelate(
    actualProfiles.horizontal,
    expectedProfiles.horizontal,
    MAX_SHIFT
  );
  const vResult = crossCorrelate(
    actualProfiles.vertical,
    expectedProfiles.vertical,
    MAX_SHIFT
  );

  const SHIFT_THRESHOLD = 2; // pixels — anything > 2px is a real layout shift
  const dx = Math.abs(vResult.offset);
  const dy = Math.abs(hResult.offset);
  const layoutShiftDetected = dx > SHIFT_THRESHOLD || dy > SHIFT_THRESHOLD;

  return {
    layoutShiftDetected,
    estimatedShift: {
      dx: vResult.offset,
      dy: hResult.offset,
    },
    shiftMagnitude: Math.round(Math.sqrt(dx * dx + dy * dy) * 100) / 100,
    horizontalProfile: {
      offset: hResult.offset,
      correlationImprovement:
        hResult.correlation > 0
          ? Math.round(((hResult.correlation - hResult.zeroCorrrelation) / hResult.correlation) * 10000) / 10000
          : 0,
    },
    verticalProfile: {
      offset: vResult.offset,
      correlationImprovement:
        vResult.correlation > 0
          ? Math.round(((vResult.correlation - vResult.zeroCorrrelation) / vResult.correlation) * 10000) / 10000
          : 0,
    },
  };
}
```

**Step 2: Wire it into `compareSingle`**

After `typographyAnalysis`, add:

```js
  // Layout drift analysis
  const layoutAnalysis = analyzeLayout(actualData, expectedData, width, height);
```

And add to return object:

```js
    layoutAnalysis,
```

**Step 3: Run layout tests**

```bash
pnpm vitest run scripts/__tests__/visual-diff.test.js -t "layout"
```

Expected: PASS

**Step 4: Commit**

```bash
git add scripts/visual-diff.js
git commit -m "feat: add responsive layout drift analyzer to visual-diff

Cross-correlation of horizontal/vertical projection profiles detects
content shifts between screenshots. Reports estimated dx/dy offset
and shift magnitude. Threshold: >2px = layout shift detected."
```

---

## Task 4: Update human-readable output and batch mode

**Files:**
- Modify: `scripts/visual-diff.js` (update `formatHumanReadable` and `compareBatch`)

**Step 1: Update `formatHumanReadable` to include new analyses**

In the single-mode section of `formatHumanReadable` (around line 344), add blocks after the region output:

```js
    // Sub-pixel analysis
    if (result.subPixelAnalysis) {
      const spa = result.subPixelAnalysis;
      lines.push("");
      lines.push("Sub-Pixel Analysis:");
      lines.push(`  Total diff clusters: ${spa.clusterCount} (${spa.subPixelClusters} sub-pixel, ${spa.realClusters} real)`);
      lines.push(`  Sub-pixel artifacts: ${(spa.subPixelPct * 100).toFixed(1)}% of diff pixels`);
      lines.push(`  Real differences:    ${(spa.realDiffPct * 100).toFixed(2)}% of image`);
      if (spa.subPixelPct > 0.5) {
        lines.push("  NOTE: Majority of differences are sub-pixel rendering artifacts");
      }
    }

    // Typography analysis
    if (result.typographyAnalysis) {
      const ta = result.typographyAnalysis;
      lines.push("");
      lines.push("Typography Analysis:");
      if (ta.fontWeightMismatch) {
        lines.push(`  WARN  Font weight mismatch detected (actual is ${ta.weightDirection}, delta: ${ta.avgWeightDifference})`);
      }
      if (ta.fontFallbackDetected) {
        lines.push(`  WARN  Font fallback likely (character density diff: ${(ta.avgDensityDifference * 100).toFixed(1)}%)`);
      }
      if (ta.textBandCountMismatch) {
        lines.push(`  WARN  Text line count differs (actual: ${ta.textBandsActual}, expected: ${ta.textBandsExpected})`);
      }
      if (!ta.fontWeightMismatch && !ta.fontFallbackDetected && !ta.textBandCountMismatch) {
        lines.push("  Typography consistent");
      }
    }

    // Layout analysis
    if (result.layoutAnalysis) {
      const la = result.layoutAnalysis;
      lines.push("");
      lines.push("Layout Analysis:");
      if (la.layoutShiftDetected) {
        lines.push(`  WARN  Layout shift detected: dx=${la.estimatedShift.dx}px, dy=${la.estimatedShift.dy}px (magnitude: ${la.shiftMagnitude}px)`);
      } else {
        lines.push("  Layout consistent");
      }
    }
```

Also add similar summary lines to the batch-mode section for each result.

**Step 2: Update batch mode to propagate new analyses**

The batch mode already passes results through from `compareSingle`, so new fields propagate automatically. Add summary counts to the batch return object:

In `compareBatch`, before the return statement, add:

```js
  // Aggregate analysis summaries
  const fontIssues = results.filter((r) => r.typographyAnalysis?.fontWeightMismatch || r.typographyAnalysis?.fontFallbackDetected);
  const layoutIssues = results.filter((r) => r.layoutAnalysis?.layoutShiftDetected);
  const subPixelDominant = results.filter((r) => r.subPixelAnalysis?.subPixelPct > 0.5);
```

Add these to the return:

```js
    analysisSummary: {
      fontIssueCount: fontIssues.length,
      layoutShiftCount: layoutIssues.length,
      subPixelDominantCount: subPixelDominant.length,
      filesWithFontIssues: fontIssues.map((r) => r.file),
      filesWithLayoutShifts: layoutIssues.map((r) => r.file),
    },
```

**Step 3: Run all tests**

```bash
pnpm vitest run scripts/__tests__/visual-diff.test.js
```

Expected: ALL PASS

**Step 4: Commit**

```bash
git add scripts/visual-diff.js
git commit -m "feat: surface sub-pixel, typography, and layout analyses in output

Human-readable format shows sub-pixel artifact breakdown, font
weight/fallback warnings, and layout shift details. Batch mode
aggregates analysis summaries across all compared files."
```

---

## Task 5: Update pipeline config and documentation

**Files:**
- Modify: `.claude/pipeline.config.json` (add new thresholds)
- Modify: `docs/figma-to-react/README.md` (document new capabilities)
- Modify: `CLAUDE.md` (update script docs)

**Step 1: Add new config options to pipeline.config.json**

Add inside the `visualDiff` section:

```json
"subPixelClassification": true,
"subPixelMaxClusterSize": 2,
"typographyAnalysis": true,
"fontWeightThreshold": 15,
"fontFallbackDensityThreshold": 0.05,
"layoutDriftAnalysis": true,
"layoutShiftThresholdPx": 2
```

**Step 2: Update `compareSingle` to read these new config values**

In `compareSingle`, update the config reading to use the new fields:

```js
  const subPixelEnabled = vdConfig.subPixelClassification !== false;
  const typographyEnabled = vdConfig.typographyAnalysis !== false;
  const layoutEnabled = vdConfig.layoutDriftAnalysis !== false;
  const subPixelMaxCluster = vdConfig.subPixelMaxClusterSize ?? 2;
```

Wrap the three analysis calls with their enabled flags:

```js
  const subPixelAnalysis = subPixelEnabled
    ? analyzeSubPixel(diff.data, width, height, diffColor, subPixelMaxCluster)
    : null;
  const typographyAnalysis = typographyEnabled
    ? analyzeTypography(actualData, expectedData, width, height)
    : null;
  const layoutAnalysis = layoutEnabled
    ? analyzeLayout(actualData, expectedData, width, height)
    : null;
```

**Step 3: Update docs/figma-to-react/README.md**

Add a new section after "Pixel-Diff Visual QA":

```markdown
### Advanced Visual Analysis (v2)

Phase 5 now includes three additional analysis layers beyond pixel comparison:

- **Sub-pixel classification** — Diff pixels are classified as sub-pixel rendering artifacts (isolated 1-2px clusters) vs real differences (larger connected regions). When >50% of diffs are sub-pixel, the report flags this so developers know the mismatch is cosmetic, not structural.

- **Font weight detection** — Luminance analysis of text regions detects when rendered font weight differs from the design (e.g., 400 vs 700). Reports whether the actual rendering is "heavier" or "lighter" than expected.

- **Font fallback detection** — Character density profile comparison detects when a fallback font is rendering instead of the intended font family. Different fonts have different character widths, producing measurably different density patterns.

- **Layout drift detection** — Cross-correlation of horizontal/vertical projection profiles detects when content has shifted position between screenshots. Reports estimated dx/dy offset in pixels. Threshold: >2px triggers a warning.
```

**Step 4: Update CLAUDE.md script documentation**

In the visual-diff.js entry, add the new flags:

```markdown
# Sub-pixel + typography + layout analysis (on by default)
node scripts/visual-diff.js <actual.png> <expected.png> --json

# Configure via pipeline.config.json:
# visualDiff.subPixelClassification: true/false
# visualDiff.typographyAnalysis: true/false
# visualDiff.layoutDriftAnalysis: true/false
```

**Step 5: Commit**

```bash
git add .claude/pipeline.config.json docs/figma-to-react/README.md CLAUDE.md
git commit -m "docs: document visual diff accuracy enhancements

Add pipeline config options for sub-pixel classification, typography
analysis, and layout drift detection. Update pipeline docs and CLAUDE.md."
```

---

## Task 6: Final integration test and cleanup

**Step 1: Run the full test suite**

```bash
pnpm vitest run scripts/__tests__/visual-diff.test.js
```

Expected: ALL PASS

**Step 2: Run visual-diff.js manually with --json to verify output shape**

```bash
node scripts/visual-diff.js scripts/__tests__/fixtures/identical-a.png scripts/__tests__/fixtures/identical-b.png --json
```

Verify output includes `subPixelAnalysis`, `typographyAnalysis`, and `layoutAnalysis` fields.

**Step 3: Run visual-diff.js in human-readable mode**

```bash
node scripts/visual-diff.js scripts/__tests__/fixtures/weight-400.png scripts/__tests__/fixtures/weight-700.png
```

Verify the human-readable output includes "Typography Analysis" and "Font weight mismatch detected".

**Step 4: Clean up test fixtures from git tracking**

Add to `.gitignore` if not already present:

```
scripts/__tests__/fixtures/
```

**Step 5: Final commit**

```bash
git add .gitignore
git commit -m "chore: gitignore generated test fixtures"
```

---

## Acceptance Criteria Mapping

| Criteria | Task | How Verified |
|----------|------|-------------|
| Visual diff accuracy 95%+ on standard components | Tasks 1-3 | Sub-pixel classifier separates noise from real issues; typography + layout analyzers catch previously-missed semantic diffs |
| Sub-pixel rendering differences detected and flagged | Task 1 | `subPixelAnalysis.subPixelPct` in JSON; "Sub-Pixel Analysis" in human output |
| Font fallback mismatches identified in diff reports | Task 2 | `typographyAnalysis.fontFallbackDetected` + density diff; "Font fallback likely" in output |
| Responsive breakpoint layout comparisons supported | Task 3 | `layoutAnalysis.layoutShiftDetected` + dx/dy; works in batch mode across breakpoint screenshots |
