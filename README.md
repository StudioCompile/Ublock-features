<h1>
  <img src="https://raw.githubusercontent.com/StudioCompile/uFeatures/refs/heads/main/Logo.png" alt="uFeatures Logo" width="24" style="vertical-align: middle; margin-right:8px;" />
  uFeatures
</h1>

uFeatures is a small toolkit that injects useful client-side features into pages via content-filtering extensions (uBlock Origin or AdGuard). It provides a script manager, an injected DevTools panel, a bookmarklet runner, and other utilities to make web development and browsing more powerful.

## Installation

### uBlock Origin
1. Open uBlock Origin's dashboard (click the uBlock icon → the gear icon).
2. Go to the "Settings" tab and enable "I am an advanced user" if it's not already enabled.
3. Scroll to the "Advanced settings" section and set `userResourcesLocation` to:

```
https://studiocompile.github.io/uFeatures/uBlock.js
```

4. In the "My filters" tab add:

```
*##+js(uFeatures)
```

### AdGuard (custom filter)
1. Open AdGuard → Filters → Custom filters → add by URL.
2. Add this URL:

```
https://studiocompile.github.io/uFeatures/AdGaurd.txt
```

## Features
- Script Manager — Save JavaScript snippets that run automatically on specific sites every page load.
- Remove Securly Loading — removes the annoying Securly loading overlay.
- Inspect Element — Injects a remote DevTools panel into any page (Ctrl+Shift+I to toggle).
- Bookmarklet Runner — Paste a `javascript:` URL (Ctrl+V outside a text field) to run it on the current page.
- Iframe Navigator — Hover the bottom-right corner of any iframe to navigate it to a new URL.

## Credits
Created By StudioCompile using Claude Sonnet
