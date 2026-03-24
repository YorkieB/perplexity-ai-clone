# In-app browser and Chromium extensions (Electron)

The desktop shell (`npm run desktop` / `npm run desktop:dev`) embeds a real Chromium **`<webview>`** with a dedicated session partition (`persist:ai-search-browser` — see `electron/preload.cjs`). This is **not** the same as an `<iframe>` in the web build: extensions from the Microsoft Edge Add-ons store do **not** run inside a normal web iframe.

## Loading an unpacked extension at startup

1. Download or build an **unpacked** MV3 extension (folder containing `manifest.json`).
2. Set in your project `.env` (or environment when launching Electron):

```bash
ELECTRON_BROWSER_EXTENSION_PATH=C:\path\to\unpacked-extension
```

3. Restart the desktop app. The main process calls `session.loadExtension(path)` for the in-app browser partition.

Respect the extension’s license and the Chrome / Microsoft store policies. Do not redistribute proprietary `.crx` files without permission.

## Loading an extension from the UI

In the Web browser modal, use **Load unpacked extension** (toolbar). Pick a folder containing `manifest.json`. The app calls the same `loadExtension` API.

## Edge Add-ons vs Chrome Web Store

- Extensions are usually **Chromium MV3**; many authors publish to **both** Edge and Chrome.
- Electron’s `loadExtension` expects an **unpacked** directory, not a direct Edge Add-ons URL.
- For Edge-specific packages, use **Sideloading** in Edge for development, then point `ELECTRON_BROWSER_EXTENSION_PATH` at the unpacked folder, or use the in-app picker.

## Security

The embedded webview is a full browser surface. Only load extensions you trust. For enterprise deployments, prefer policy-driven installs and review extension permissions (`manifest.json`).
