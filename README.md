# uFeatures

By StudioCompile — Roblox: studiocompile · Discord: @roblox_studio

uBlock Origin lets you inject JS into almost any website, which has a lot of potential. There are already projects out there for it, but you can usually add only one at a time and most aren't great. uFeatures is a way to add multiple features and easily extend them.

Homepage: https://studiocompile.github.io/uFeatures/

## Installation

Important security note: uFeatures injects JavaScript into pages. Only use it with sources you trust. Remote scripts can run arbitrary code in pages you visit.

### uBlock Origin (advanced mode)
1. Open uBlock Origin's dashboard (click the uBlock icon → the gear icon).
2. Go to the "Settings" tab and enable "I am an advanced user" if it's not already enabled.
3. Scroll down to the "Advanced settings" section and find the `userResourcesLocation` option.
4. Change `userResourcesLocation` from `unset` to:

```
https://studiocompile.github.io/uFeatures/uBlock.js
```

5. Save the settings (usually by closing the dashboard or pressing the save/apply button).
6. Open the "My filters" tab in uBlock Origin and add the following line to enable the injected script on all sites:

```
*##+js(uFeatures)
```

7. Apply the changes. The features provided by uFeatures should now load on pages where uBlock is active.

### AdGuard (custom filter)
1. Open AdGuard and go to the Filters section.
2. Scroll down to the Custom filters area and choose to add a new custom filter by URL.
3. Add this URL as a custom filter source:

```
https://studiocompile.github.io/uFeatures/AdGaurd.txt
```

4. Enable the custom filter. AdGuard will fetch the rules and apply them, enabling the uFeatures functionality where supported.

## Features
- Script Manager — Save JavaScript snippets that run automatically on specific sites every page load. Edit, toggle, or delete from My Scripts.
- Securly Blocker — Removes Securly overlay elements on load and watches via MutationObserver so they cannot come back.
- Inspect Element — Injects a remote DevTools panel into any page. Press Ctrl+Shift+I to toggle.
- Bookmarklet Runner — Copy any `javascript:` URL then press Ctrl+V outside a text field to run it on the current page.
- Iframe Navigator — Hover the bottom-right corner of any iframe to navigate it to a new URL.

## Credits
Created by StudioCompile (Roblox: `studiocompile`; Discord: `@roblox_studio`). This project was "vibe coded".

If you want changes to the README or additional installation options (e.g., alternative hosts or manual installation), tell me what to add and I'll update the file.
