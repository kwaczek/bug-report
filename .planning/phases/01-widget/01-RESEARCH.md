# Phase 1: Widget - Research

**Researched:** 2026-03-01
**Domain:** Embeddable browser widget — Vite IIFE bundle, Shadow DOM isolation, html-to-image screenshot capture, Clipboard API paste, multipart form submission
**Confidence:** HIGH (stack and patterns verified against official docs and npm; html-to-image CORS behavior is MEDIUM — must be tested on real host pages)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WIDG-01 | Widget loads via a single `<script>` tag with `data-project-id` attribute | `document.currentScript` captures the script element synchronously; data attributes read before any async work begins |
| WIDG-02 | Widget renders a floating bug report button that does not interfere with host page | Shadow DOM open mode provides bidirectional CSS isolation; z-index managed inside shadow root; entire init wrapped in try/catch |
| WIDG-03 | Widget uses Shadow DOM for complete CSS isolation from host page | `element.attachShadow({ mode: 'open' })`; CSS injected via `<style>` tag appended to shadow root; `vite-plugin-css-injected-by-js` inlines CSS into JS bundle |
| WIDG-04 | Widget captures page screenshot via html-to-image with graceful fallback on failure | `htmlToImage.toJpeg(document.body, { quality: 0.8 })` wrapped in try/catch; blank canvas detection as fallback trigger; report proceeds without screenshot on failure |
| WIDG-05 | Widget auto-fills current page URL in the report form | `window.location.href` captured at init time before any async work; stored as constant |
| WIDG-06 | Widget supports multiple screenshots per report (upload + Ctrl+V paste) | `<input type="file" multiple accept="image/*">` for upload; `paste` event listener with `navigator.clipboard.read()` or `event.clipboardData.items` for Ctrl+V paste |
| WIDG-07 | Widget collects subject, description, URL, and browser/OS metadata | `navigator.userAgent`, `screen.width/height`, `window.devicePixelRatio`, `window.location.href` — all collected at submit time |
| WIDG-08 | Widget shows submission confirmation (success/failure) to reporter | State machine: idle → loading → success/error; DOM swap inside shadow root; no external dependencies needed |
| WIDG-09 | Widget fails gracefully — host app is never affected by widget errors | Entire init in top-level try/catch IIFE; async errors contained in .catch() handlers; no uncaught promise rejections bubble to host |
</phase_requirements>

---

## Summary

Phase 1 builds a self-contained embeddable bug report widget. The widget is a single JavaScript file loaded via `<script>` tag. It renders a floating button using Shadow DOM for CSS isolation from the host page, captures a screenshot using `html-to-image`, collects browser metadata, and POSTs a multipart form to the backend service. The widget never calls GitHub directly — it only knows the backend endpoint URL and the project ID from its `data-project-id` attribute.

The stack is straightforward: Vite 7 in library/IIFE mode produces a single self-executing JS file. `vite-plugin-css-injected-by-js` inlines all CSS into the JS bundle so no separate stylesheet is needed. Shadow DOM `attachShadow({ mode: 'open' })` provides complete bidirectional style isolation. `html-to-image` captures the page as JPEG before submission. The `paste` event with `event.clipboardData.items` handles Ctrl+V image paste without requiring additional libraries.

The biggest technical risk in this phase is html-to-image's CORS behavior on real host pages. It uses SVG `foreignObject` to embed HTML and fails silently on cross-origin images (CDN assets, external fonts). The fallback strategy — detecting a failed/blank canvas and submitting without a screenshot — must be implemented from the start. Multiple screenshots per report are handled via a file input (`multiple`) plus paste event listener; both produce Blob objects appended to FormData before submission.

**Primary recommendation:** Build with Vite 7 IIFE + `vite-plugin-css-injected-by-js` + Shadow DOM open mode + html-to-image with graceful fallback. Keep bundle under 100KB gzipped. Test CSS isolation on Bootstrap and Tailwind pages before calling Phase 1 done.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vite | 7.3.1 | Widget bundler in IIFE library mode | Produces single self-executing JS file via `build.lib` with `formats: ['iife']`; assets always inlined in lib mode |
| TypeScript | 5.x | Widget type safety | `tsc --noEmit` for checking; Vite handles transpilation |
| html-to-image | 1.11.13 | Capture page as JPEG/PNG blob | 1.6M monthly downloads, maintained fork of dom-to-image; faster than html2canvas; TypeScript support |
| vite-plugin-css-injected-by-js | latest | Inline CSS into JS bundle | Eliminates separate .css output file; required for single-file widget deployment; supports `injectCodeFunction` for shadow root injection |

### Supporting (Widget Bundle)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none beyond above) | — | — | Widget is vanilla TypeScript; no runtime framework needed for a form UI with state machine |

### Development Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Vite | 7.3.1 | Dev server + production build |
| TypeScript | 5.x | Type checking |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vite IIFE | Rollup directly | Vite wraps Rollup — skip the extra config; use Vite for consistency |
| html-to-image | html2canvas | html2canvas: 21+ seconds on complex pages, poor maintenance; html-to-image is 3x faster |
| html-to-image | dom-to-image | dom-to-image is abandoned, breaks on flexbox/grid/modern CSS |
| html-to-image | Screen Capture API | Requires explicit user permission popup — breaks seamless UX; fallback needed anyway |
| vite-plugin-css-injected-by-js | Manual CSS-in-JS string | Plugin is maintained and handles edge cases; don't hand-roll |
| Vanilla TS | Preact | Adds 3KB min+gzip; a bug report form has no complex state that warrants a framework |

**Installation:**
```bash
# Widget package (separate from backend)
npm install html-to-image
npm install -D vite typescript vite-plugin-css-injected-by-js @types/node
```

---

## Architecture Patterns

### Recommended Project Structure

```
widget/
├── src/
│   ├── index.ts          # Entry point — reads currentScript, creates shadow host, initializes
│   ├── widget.ts         # Main widget class — state machine, DOM manipulation
│   ├── screenshot.ts     # html-to-image wrapper with fallback logic
│   ├── metadata.ts       # Browser/OS/screen metadata collection
│   ├── upload.ts         # File upload + paste handler (multiple screenshots)
│   ├── submit.ts         # FormData construction + fetch POST
│   └── styles/
│       └── widget.css    # All widget styles (inlined into JS by plugin)
├── vite.config.ts        # IIFE library mode config
├── package.json
└── tsconfig.json
```

### Pattern 1: IIFE Entry Point with Shadow DOM Mount

**What:** The widget entry point saves `document.currentScript` synchronously (it becomes null after the script finishes loading), reads `data-project-id`, creates a shadow host element, and mounts everything inside the shadow root.

**When to use:** Always — this is the only correct initialization pattern for injected scripts.

**Example:**
```typescript
// src/index.ts
// Source: MDN document.currentScript + web.dev Shadow DOM v1

// CRITICAL: capture currentScript SYNCHRONOUSLY before any await
const scriptEl = document.currentScript as HTMLScriptElement | null;
const projectId = scriptEl?.dataset.projectId ?? '';
const apiUrl = scriptEl?.dataset.apiUrl ?? 'https://your-backend.railway.app';

(async () => {
  try {
    // Create shadow host — appended to body, never conflicts with host page
    const host = document.createElement('div');
    host.id = 'bug-report-widget-host';
    // Minimal host styles — keep shadow host invisible to layout
    Object.assign(host.style, {
      position: 'fixed',
      zIndex: '2147483647', // max z-index
      bottom: '24px',
      right: '24px',
      width: '0',
      height: '0',
    });
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    // CSS is injected here by vite-plugin-css-injected-by-js
    // at build time — no <link> tag needed

    initWidget(shadow, { projectId, apiUrl });
  } catch (err) {
    // Silent fail — host page must never see widget errors
    console.warn('[bug-report-widget] init failed:', err);
  }
})();
```

### Pattern 2: CSS Inlining into Shadow Root

**What:** `vite-plugin-css-injected-by-js` embeds CSS as a JS string that injects a `<style>` tag at runtime. By using the `injectCodeFunction` option, it injects into the shadow root instead of `document.head`.

**When to use:** Always — without this, Vite generates a separate `.css` file and the widget requires two HTTP requests.

**Example:**
```typescript
// vite.config.ts
// Source: https://github.com/marco-prontera/vite-plugin-css-injected-by-js

import { defineConfig } from 'vite';
import cssInjectedByJs from 'vite-plugin-css-injected-by-js';

export default defineConfig({
  plugins: [
    cssInjectedByJs({
      // Inject CSS into shadow root instead of document.head
      injectCodeFunction: (cssCode: string, options: unknown) => {
        // cssCode is the CSS string at build time
        // The shadow root is accessible via the host element
        // This runs as inline JS in the bundle — reference the shadow root variable
        // Pattern: inject via a global that the widget sets before CSS injection runs
        try {
          const style = document.createElement('style');
          style.textContent = cssCode;
          // window.__bugReportShadowRoot is set by index.ts before CSS injection
          (window as unknown as Record<string, unknown>).__bugReportShadowRoot
            ? ((window as unknown as Record<string, ShadowRoot>).__bugReportShadowRoot).appendChild(style)
            : document.head.appendChild(style); // fallback
        } catch (e) { /* silent */ }
      }
    }),
  ],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'BugReportWidget',
      formats: ['iife'],
      fileName: () => 'widget.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    cssCodeSplit: false,
    // Minify for production
    minify: 'esbuild',
  },
});
```

**Alternative simpler approach:** Import CSS as a raw string and inject manually:
```typescript
// src/widget.ts — simpler approach that avoids plugin complexity
import styles from './styles/widget.css?inline';

function mountWidget(shadowRoot: ShadowRoot) {
  const style = document.createElement('style');
  style.textContent = styles;
  shadowRoot.appendChild(style);
  // ... rest of widget DOM
}
```
Using `?inline` import in Vite imports CSS as a raw string. This is simpler and recommended.

### Pattern 3: Screenshot Capture with Graceful Fallback

**What:** Attempt html-to-image capture, detect failure or blank output, fall back to submitting without screenshot.

**When to use:** Always — CORS failures on host pages with CDN images are common and must not block form submission.

**Example:**
```typescript
// src/screenshot.ts
import { toJpeg } from 'html-to-image';

interface ScreenshotResult {
  blob: Blob | null;
  error: string | null;
}

export async function captureScreenshot(): Promise<ScreenshotResult> {
  try {
    // Capture the host page body (outside shadow DOM)
    const dataUrl = await toJpeg(document.body, {
      quality: 0.8,
      // Skip the widget host element to avoid capturing the widget UI
      filter: (node) => {
        return !(node instanceof Element && node.id === 'bug-report-widget-host');
      },
    });

    // Detect blank/failed canvas: data URL will be very small if blank
    if (dataUrl.length < 1000) {
      return { blob: null, error: 'blank_canvas' };
    }

    // Convert data URL to Blob
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return { blob, error: null };
  } catch (err) {
    // CORS failure, SVG foreignObject failure, etc. — all silent
    return { blob: null, error: String(err) };
  }
}
```

### Pattern 4: Ctrl+V Paste + File Upload for Multiple Screenshots

**What:** Listen for `paste` events on the shadow root; also provide `<input type="file" multiple>`. Both paths produce Blob objects stored in an array.

**When to use:** WIDG-06 — multiple screenshots per report.

**Example:**
```typescript
// src/upload.ts
// Source: https://web.dev/patterns/clipboard/paste-images (verified MDN)

const attachedImages: Blob[] = [];

// File input handler
fileInput.addEventListener('change', (e) => {
  const files = (e.target as HTMLInputElement).files;
  if (files) {
    Array.from(files).forEach(file => attachedImages.push(file));
    updatePreview();
  }
});

// Paste handler — attach to shadow root or form element
shadowRoot.addEventListener('paste', async (e: ClipboardEvent) => {
  e.preventDefault();
  const items = e.clipboardData?.items ?? [];
  for (const item of Array.from(items)) {
    if (item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      if (blob) {
        attachedImages.push(blob);
        updatePreview();
      }
    }
  }
});
```

**Note:** `navigator.clipboard.read()` requires `clipboard-read` permission and user gesture — prefer `event.clipboardData.items` from the paste event, which works without explicit permission prompt (user initiated the paste action).

### Pattern 5: Metadata Collection

**What:** Collect browser, OS, and screen information at submit time using standard browser APIs.

**Example:**
```typescript
// src/metadata.ts
export function collectMetadata() {
  return {
    url: window.location.href,
    userAgent: navigator.userAgent,
    screenWidth: screen.width,
    screenHeight: screen.height,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    language: navigator.language,
    timestamp: new Date().toISOString(),
  };
}
```

**Note on `userAgentData`:** The modern `navigator.userAgentData` API is only supported in Chrome/Edge as of 2026. Use `navigator.userAgent` string for cross-browser compatibility — the backend can parse it if structured data is needed.

### Pattern 6: FormData Submission

**What:** Combine all data into a single multipart POST. Do not set Content-Type manually — browser sets the boundary automatically.

**Example:**
```typescript
// src/submit.ts
export async function submitReport({
  projectId,
  apiUrl,
  subject,
  description,
  metadata,
  autoScreenshot,
  attachedImages,
}: SubmitArgs): Promise<{ ok: boolean; message: string }> {
  try {
    const form = new FormData();
    form.append('projectId', projectId);
    form.append('subject', subject);
    form.append('description', description);
    form.append('metadata', JSON.stringify(metadata));

    if (autoScreenshot) {
      form.append('screenshots', autoScreenshot, 'screenshot-auto.jpg');
    }

    attachedImages.forEach((blob, i) => {
      form.append('screenshots', blob, `screenshot-${i}.png`);
    });

    // DO NOT set Content-Type — browser sets multipart boundary automatically
    const res = await fetch(`${apiUrl}/report`, {
      method: 'POST',
      body: form,
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, message: text || `Error ${res.status}` };
    }

    return { ok: true, message: 'Report submitted successfully' };
  } catch (err) {
    // Network failure — never propagate to host page
    return { ok: false, message: 'Network error — please try again' };
  }
}
```

### Anti-Patterns to Avoid

- **Calling GitHub API from the widget:** All GitHub calls go through the backend. The widget only knows `data-api-url` and `data-project-id`. DevTools network tab must show zero calls to `api.github.com`.
- **Shadow DOM closed mode:** Breaks browser DevTools and some screenshot capture approaches. Use `mode: 'open'`.
- **Not saving `document.currentScript`:** It becomes `null` after the script finishes executing. Save it in the first synchronous line before any `async`/`await`.
- **Setting Content-Type on FormData fetch:** Removes the multipart boundary — server cannot parse the body.
- **Blocking page render:** Script tag must have `async` or `defer`; widget init must be async-first.
- **Widget-specific global CSS:** Never inject into `document.head`. Always into the shadow root.
- **Hardcoding the backend URL:** Read from `data-api-url` attribute; makes the widget environment-portable.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSS isolation from host page | CSS prefixes, `!important` overrides, reset stylesheet | Shadow DOM `attachShadow({ mode: 'open' })` | Host pages can override any prefix; Shadow DOM boundary is enforced by the browser |
| CSS inlining into JS bundle | Base64 CSS string, build script concatenation | `?inline` CSS import (Vite built-in) or `vite-plugin-css-injected-by-js` | Plugin handles edge cases, minification, and source maps correctly |
| Page screenshot | Canvas-based pixel copy, puppeteer from browser | `html-to-image` | Cross-browser SVG foreignObject approach; handles fonts, transforms, z-index stacking; complex to replicate |
| Clipboard paste detection | polling, XHR polling | Native `paste` event on shadow root + `event.clipboardData.items` | Browser API is the only correct approach; no polling needed |
| Metadata detection | regex parsing, user-agent DB lookup | `navigator.userAgent` + `screen.*` + `window.*` directly | Raw values are more useful to developers than parsed results; backend can parse if needed |
| Multipart form construction | manual boundary strings, base64 encoding | Browser native `FormData` | `FormData` handles boundary, encoding, and content negotiation natively |

**Key insight:** The browser provides all the primitives needed. Custom solutions for any of these involve handling encoding edge cases, browser quirks, and MIME type negotiation — all of which `FormData`, Shadow DOM, and the Clipboard API already handle correctly.

---

## Common Pitfalls

### Pitfall 1: Widget CSS Leaks in Both Directions

**What goes wrong:** Host page CSS (Bootstrap resets, Tailwind, `* { box-sizing: border-box }`) bleeds into the widget form, making it look broken. Widget CSS bleeds into host page, breaking customer's app layout.

**Why it happens:** Injecting widget into the DOM as a plain div puts it in the host page's style scope. Developers test on clean pages and miss production sites with opinionated global CSS.

**How to avoid:** Use Shadow DOM from day one via `attachShadow({ mode: 'open' })`. Never inject CSS into `document.head`. All widget styles go into the shadow root's `<style>` tag. Test the widget on a page with Bootstrap and Tailwind loaded.

**Warning signs:** Widget looks different on Bootstrap/Tailwind pages vs. plain HTML test page. Form inputs change font on certain sites.

---

### Pitfall 2: `document.currentScript` Returns null

**What goes wrong:** `data-project-id` cannot be read because `document.currentScript` is null when the code runs.

**Why it happens:** `document.currentScript` is only set during initial script execution. If script reads it inside a setTimeout, addEventListener, or after any async operation, it's already null.

**How to avoid:** Save `const scriptEl = document.currentScript` as the absolute first line of the IIFE, synchronously, before any other code runs.

**Warning signs:** `projectId` is always empty string; `document.currentScript` is null in the console.

---

### Pitfall 3: html-to-image CORS Failure Produces Blank Canvas

**What goes wrong:** Screenshot is captured but contains white/blank areas where external images (CDN, fonts) were. Worse, the capture throws an error, blocking report submission.

**Why it happens:** html-to-image uses SVG `foreignObject` to serialize the DOM. Cross-origin images without CORS headers cannot be serialized and either render blank or throw a security error.

**How to avoid:** Wrap `toJpeg()` in try/catch. Detect blank canvas output (data URL length < 1000 bytes). If capture fails or produces blank output, set screenshot to null and proceed with report submission. Never block submission on screenshot failure.

**Warning signs:** Screenshot attached to report is all white. Report submission hangs on certain pages.

---

### Pitfall 4: Widget Crashing Host App

**What goes wrong:** An error in widget initialization or async handler propagates as an uncaught exception, which appears in the host page's error tracker (Sentry, Datadog) and may trigger the host page's error boundary.

**Why it happens:** Unguarded async code, unhandled promise rejections.

**How to avoid:** Wrap the entire IIFE in try/catch. Use `.catch()` on all async operations. Never let errors escape the widget's execution context. Log with `console.warn` prefixed with `[bug-report-widget]` so the widget is identifiable.

**Warning signs:** Sentry errors on the host page referencing widget file name. Host page behavior changes after widget loads.

---

### Pitfall 5: Ctrl+V Paste Requires Wrong Permission

**What goes wrong:** Using `navigator.clipboard.read()` triggers a browser permission popup asking the user to grant clipboard access — breaks seamless UX.

**Why it happens:** `navigator.clipboard.read()` requires explicit `clipboard-read` permission. The paste event's `clipboardData` does not require any permission.

**How to avoid:** Always use `event.clipboardData.items` from the `paste` event listener instead of `navigator.clipboard.read()`. The paste event is triggered by user action (Ctrl+V), so `clipboardData` is available without permission prompt.

**Warning signs:** Browser shows permission popup when user pastes. Safari blocks paste silently.

---

### Pitfall 6: Bundle Size Exceeds 100KB Gzipped

**What goes wrong:** Widget slows host page Time to Interactive by loading a large JS file, making site owners remove it.

**Why it happens:** Adding a framework (React, Vue), importing large polyfills, or not tree-shaking.

**How to avoid:** Keep widget as vanilla TypeScript. `html-to-image` is the largest dependency (~40KB). No UI framework. Use `build.minify: 'esbuild'`. Verify bundle size with `vite build` output and `gzip -9 dist/widget.js | wc -c`.

**Warning signs:** Vite build output shows > 150KB uncompressed. Lighthouse shows widget JS as render-blocking.

---

### Pitfall 7: CSS Not Injected into Shadow Root

**What goes wrong:** Styles are injected into `document.head`, affecting the host page or being blocked by CSP `style-src` directives. Shadow DOM widget appears unstyled.

**Why it happens:** Default Vite behavior and `vite-plugin-css-injected-by-js` default behavior inject into `document.head`.

**How to avoid:** Use the `?inline` Vite import for CSS (`import styles from './widget.css?inline'`) and manually create a `<style>` element in the shadow root. This is simpler and more reliable than the plugin's `injectCodeFunction`.

**Warning signs:** Widget appears with default browser styles only. CSP violation in console for `style-src`.

---

## Code Examples

Verified patterns from official sources:

### Complete Vite Config for IIFE Widget

```typescript
// vite.config.ts
// Source: https://vite.dev/config/build-options
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'BugReportWidget',
      formats: ['iife'],
      fileName: () => 'widget.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        // Ensure no code-splitting (single file output)
      },
    },
    cssCodeSplit: false,
    // Assets always inlined in lib mode (Vite docs confirmed)
    minify: 'esbuild',
    target: 'es2020',
    outDir: 'dist',
  },
});
```

### CSS Inline Import Pattern (Preferred)

```typescript
// src/widget.ts
// Source: Vite ?inline import (verified in Vite docs build guide)
import styles from './styles/widget.css?inline';

export function createWidget(shadowRoot: ShadowRoot, config: WidgetConfig): void {
  // Inject CSS into shadow root — never into document.head
  const style = document.createElement('style');
  style.textContent = styles;
  shadowRoot.appendChild(style);

  // Build rest of widget DOM inside shadowRoot
  const container = document.createElement('div');
  container.className = 'bug-report-container';
  shadowRoot.appendChild(container);
  // ...
}
```

### Reading data-* from Script Tag

```typescript
// src/index.ts
// Source: MDN document.currentScript
// MUST be first line — null after script finishes loading
const scriptEl = document.currentScript as HTMLScriptElement;
const projectId = scriptEl?.getAttribute('data-project-id') ?? '';
const apiUrl = scriptEl?.getAttribute('data-api-url') ?? '';
```

### Metadata Collection

```typescript
// src/metadata.ts
// Source: MDN Navigator, Screen APIs
export interface BugMetadata {
  url: string;
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
  windowWidth: number;
  windowHeight: number;
  devicePixelRatio: number;
  language: string;
  timestamp: string;
}

export function collectMetadata(): BugMetadata {
  return {
    url: window.location.href,
    userAgent: navigator.userAgent,
    screenWidth: screen.width,
    screenHeight: screen.height,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio ?? 1,
    language: navigator.language,
    timestamp: new Date().toISOString(),
  };
}
```

### html-to-image Capture with Filter

```typescript
// src/screenshot.ts
// Source: https://github.com/bubkoo/html-to-image (npm README)
import { toJpeg } from 'html-to-image';

export async function capturePageScreenshot(
  widgetHostId: string
): Promise<Blob | null> {
  try {
    const dataUrl = await toJpeg(document.body, {
      quality: 0.8,
      // Exclude the widget itself from the screenshot
      filter: (node) =>
        !(node instanceof Element && node.id === widgetHostId),
    });

    if (!dataUrl || dataUrl.length < 1000) return null;

    const res = await fetch(dataUrl);
    return await res.blob();
  } catch {
    return null; // CORS, SVG, security errors — all graceful
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| html2canvas | html-to-image | 2022+ | 3x faster on typical pages; maintained; html2canvas is effectively unmaintained |
| dom-to-image | html-to-image | 2021 | dom-to-image abandoned; html-to-image is maintained fork |
| Webpack widget bundling | Vite IIFE library mode | 2023+ | 10x faster builds; simpler config; smaller output |
| CSS prefixes for isolation | Shadow DOM | 2020+ (v1 widely supported) | Guaranteed isolation vs. best-effort prefix collision avoidance |
| Long polling clipboard | `paste` event + `clipboardData` | 2015+ (well established) | No permission needed; instant; event-driven |
| `document.querySelector('[data-project-id]')` | `document.currentScript` | ES5+ (established) | Reliable; script self-aware; works with async defer |

**Deprecated/outdated:**
- `dom-to-image`: abandoned — NEVER use; `html-to-image` is the maintained replacement
- Shadow DOM `mode: 'closed'`: blocks DevTools — avoid for public widgets
- `navigator.clipboard.read()` for paste: requires explicit permission — use `paste` event instead

---

## Open Questions

1. **html-to-image behavior on specific host pages (Rohlik, Houbar)**
   - What we know: html-to-image uses SVG foreignObject; cross-origin images without CORS headers produce blank areas or throw
   - What's unclear: Whether Rohlik/Houbar CDN assets have CORS headers; actual failure rate in practice
   - Recommendation: Test on these specific pages in Phase 1 before declaring success; the fallback (submit without screenshot) is already designed in

2. **Backend endpoint URL configuration**
   - What we know: Widget reads `data-api-url` from script tag; needs to point at the Phase 2 backend
   - What's unclear: Railway service URL not known until Phase 2 deploys
   - Recommendation: In Phase 1, widget POSTs to a stub/localhost; configure `data-api-url` as a required attribute; widget shows error if missing

3. **Content Security Policy on host pages**
   - What we know: Some host pages have strict CSP blocking eval, inline scripts, or certain connect-src targets
   - What's unclear: Whether the widget's backend URL will need to be added to `connect-src` on host pages
   - Recommendation: Document that embedding developers need to add the backend URL to their CSP `connect-src`; out of scope for Phase 1 implementation

4. **vite-plugin-css-injected-by-js vs `?inline` import**
   - What we know: Both work; `?inline` is simpler; plugin offers more control for multi-entry builds
   - What's unclear: Whether `?inline` reliably inlines all @imported sub-CSS files in Vite 7
   - Recommendation: Use `?inline` import for simplicity; fall back to plugin if CSS splitting issues arise

---

## Sources

### Primary (HIGH confidence)
- Vite 7.3.1 Build Options — https://vite.dev/config/build-options — verified IIFE format, cssCodeSplit behavior, assetsInlineLimit in lib mode
- MDN Document.currentScript — https://developer.mozilla.org/en-US/docs/Web/API/Document/currentScript — timing and null behavior
- MDN Using Shadow DOM — https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM — attachShadow, mode: open
- MDN Clipboard API — https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API — paste event vs navigator.clipboard.read permissions
- web.dev paste images pattern — https://web.dev/patterns/clipboard/paste-images — event.clipboardData.items pattern
- html-to-image GitHub README — https://github.com/bubkoo/html-to-image — toJpeg/toBlob API, quality option, filter option, CORS known issues
- MDN FormData — https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest_API/Using_FormData_Objects — Do not set Content-Type manually

### Secondary (MEDIUM confidence)
- MakerKit embeddable widget guide — https://makerkit.dev/blog/tutorials/embeddable-widgets-react — Shadow DOM + IIFE patterns verified against MDN
- vite-plugin-css-injected-by-js — https://github.com/marco-prontera/vite-plugin-css-injected-by-js — injectCodeFunction option; shadow DOM not built-in (verified by reading README)
- Monday Engineering: capturing DOM as image — https://engineering.monday.com/capturing-dom-as-image-is-harder-than-you-think — CORS failures and blank canvas detection approach
- web.dev Shadow DOM v1 — https://web.dev/shadowdom-v1/ — open vs closed mode recommendation

### Tertiary (LOW confidence)
- html-to-image vs html2canvas speed (3x faster claim) — npm-compare.com — single source, no methodology; treat as directionally correct, not a specific benchmark

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Vite 7 IIFE + html-to-image + Shadow DOM are well-documented; versions verified on npm and official docs
- Architecture patterns: HIGH — Shadow DOM, currentScript, FormData, paste event patterns are MDN-verified
- Pitfalls: MEDIUM-HIGH — CSS leak and CORS pitfalls verified by multiple sources; host-page CSP interaction is LOW confidence (depends on specific host pages)

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable APIs; re-check html-to-image if version changes)
