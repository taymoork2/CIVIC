# Installed Electron narrow-window signoff

Updated the actual local CIVIC launcher using the installed Electron 44.9.0 runtime at `/Users/taymoor/Projects/orca/node_modules/.pnpm/electron@44.9.0/node_modules/electron/dist/Electron.app`. Refreshed its renderer, then restarted only the CIVIC Electron process with `packages/local/desktop.mjs` so both the renderer and native window handling use the current source. The loopback servers and Orca application remained running.

Resized the native CIVIC window to approximately 501 CSS pixels wide using macOS window controls and its resize handle. The project trigger stays compact. Projects & versions fits the window, its list scrolls, and clicking Running app discloses Live app and Test copy with explicit Open buttons while the current checkout stays selected.

A real source-index refresh displayed the compact Source updated notification in the same installed narrow window. It stayed inside the window and expired automatically. The check temporarily changed only the generated connection manifest's display name; the manifest was then restored byte for byte, SHA-256 `cb9904708ed18759a073af1867481528c6057968c2b992339f48d73c1c66d2aa`. Source checkouts, scenario identities, reviews and saved evidence were preserved.

Updated the Electron smoke check to the combined Projects & versions dialog and disclosure behavior. Registered the existing draft/worktree tests in the local package's check/test commands. Package verification also exposed an interrupted snapshot runtime request during fixture-server shutdown. A regression test first reproduced the rejected route callback; failed start requests now abort in the page instead of escaping as unhandled route rejections. The 22 canvas host/runtime tests then passed.

- [Installed narrow picker](assets/2026-10-18-installed-electron-picker-narrow.png)
- [Installed narrow notification](assets/2026-10-18-installed-electron-notification-narrow.png)

The repository's empty-app install check then exposed a separate packaged-source startup failure: Vite did not discover Base UI's CommonJS `use-sync-external-store/shim` and `shim/with-selector` entries when CIVIC lived inside `node_modules`. Both entries are now explicitly optimized while host optimization settings and CIVIC's shared source modules are preserved. A connector regression check covers that configuration. The install check reports renderer startup errors immediately; a fresh Git installation subsequently rendered CIVIC and played Notebook successfully.

This remains the existing source-backed local Electron launcher. No Electron runtime upgrade, signed installer, production app mutation, or physical-device test was performed. The full source-bound repository signoff is run separately before publication; native Appium and external Orca-source build tests retain their explicit environment-dependent skips.
