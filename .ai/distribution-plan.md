# Distribution Plan — macOS & Windows

## Overview

Prepare Chess Lens for distribution as a signed, auto-updating desktop app on macOS and Windows via GitHub Releases.

---

## Phase 1: Production Hardening

### 1.1 Update `package.json` metadata

- Change `productName` from `"chess-lens"` to `"Chess Lens"`
- Replace default `description` with a real one
- Bump `version` to your desired starting version (e.g. `0.1.0`)

### 1.2 Conditional DevTools in `src/main.ts`

Line 32 opens DevTools unconditionally. Wrap it:

```ts
if (!app.isPackaged) {
  mainWindow.webContents.openDevTools()
}
```

### 1.3 App icons

Create icons in both formats and place them in `resources/`:

- `resources/icon.icns` — macOS (1024x1024 base)
- `resources/icon.ico` — Windows (256x256 with embedded sizes)

Use [electron-icon-builder](https://github.com/nicedoc/electron-icon-builder) to generate from a single 1024x1024 PNG.

---

## Phase 2: Forge Config (`forge.config.ts`)

### 2.1 Bundle engine binaries

The `resources/engines/` directory (~233MB) is not included in production builds. Add `extraResource`:

```ts
packagerConfig: {
  asar: true,
  extraResource: ['./resources/engines'],
  icon: './resources/icon', // omit extension, Forge picks .icns/.ico per platform
},
```

### 2.2 macOS maker — DMG

Install: `npm install -D @electron-forge/maker-dmg`

```ts
import { MakerDMG } from '@electron-forge/maker-dmg'

new MakerDMG({ format: 'ULFO' }),
```

### 2.3 Windows maker — Squirrel

Flesh out the existing empty config:

```ts
new MakerSquirrel({
  name: 'ChessLens',
  setupIcon: './resources/icon.ico',
}),
```

### 2.4 Publisher — GitHub Releases

Install: `npm install -D @electron-forge/publisher-github`

```ts
import { PublisherGithub } from '@electron-forge/publisher-github'

publishers: [
  new PublisherGithub({
    repository: {
      owner: '<your-github-username>',
      name: 'chess-lens',
    },
    prerelease: false,
  }),
],
```

---

## Phase 3: Windows Engine Binaries

Currently only `resources/engines/darwin/` exists. Need to add:

- `resources/engines/win32/stockfish/` — [stockfishchess.org/download](https://stockfishchess.org/download/)
- `resources/engines/win32/stockfish-classic/` — older Stockfish build with classical eval
- `resources/engines/win32/lc0/` — [github.com/LeelaChessZero/lc0/releases](https://github.com/LeelaChessZero/lc0/releases)

The Maia network files in `resources/engines/networks/` are platform-agnostic — no changes needed.

`EngineManager.ts` already handles `win32` via `getPlatformDir()`, so no code changes required.

---

## Phase 4: Auto-Updates

### 4.1 Install electron-updater

```bash
npm install electron-updater
```

### 4.2 Create updater module

Create `src/services/updater.ts`:

```ts
import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'

export function initAutoUpdater(mainWindow: BrowserWindow) {
  autoUpdater.checkForUpdatesAndNotify()

  autoUpdater.on('update-available', (info) => {
    // Optionally notify the renderer via IPC
  })

  autoUpdater.on('update-downloaded', (info) => {
    // Prompt user to restart, or auto-install on next quit
    autoUpdater.quitAndInstall()
  })

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err)
  })
}
```

### 4.3 Wire it up in `src/main.ts`

Call `initAutoUpdater(mainWindow)` after window creation, guarded by `app.isPackaged` (updates don't work in dev).

---

## Phase 5: Code Signing

### macOS (required to avoid Gatekeeper blocking)

1. Enroll in [Apple Developer Program](https://developer.apple.com/programs/) ($99/year)
2. Create a **Developer ID Application** certificate
3. Add to `packagerConfig`:

```ts
osxSign: {},
osxNotarize: {
  appleId: process.env.APPLE_ID,
  appleIdPassword: process.env.APPLE_PASSWORD,
  teamId: process.env.APPLE_TEAM_ID,
},
```

### Windows (required to avoid SmartScreen warnings)

1. Get a code signing certificate (DigiCert, SSL.com, or SignPath)
2. Add to `MakerSquirrel`:

```ts
new MakerSquirrel({
  certificateFile: './cert.pfx',
  certificatePassword: process.env.WINDOWS_CERT_PASSWORD,
}),
```

**Note:** You can ship without signing initially — users will see OS warnings but can still install. Add signing before any public/paid release.

---

## Phase 6: GitHub Repo & CI/CD

### 6.1 Create the repo

```bash
gh repo create chess-lens --private --source=. --push
```

### 6.2 Handle large engine binaries

At ~233MB, engine binaries will bloat the repo. Two options:

- **Git LFS** — track `resources/engines/` with LFS. Simplest approach.
- **Download in CI** — don't commit binaries; download them in the build workflow. More complex but keeps the repo small.

Recommended: start with Git LFS.

```bash
git lfs install
git lfs track "resources/engines/**/*"
git add .gitattributes
```

### 6.3 GitHub Actions workflow

Create `.github/workflows/build.yml`:

```yaml
name: Build & Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    strategy:
      matrix:
        os: [macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4
        with:
          lfs: true

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Publish
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # macOS signing (only used on macOS runner)
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          # Windows signing (only used on Windows runner)
          WINDOWS_CERT_PASSWORD: ${{ secrets.WINDOWS_CERT_PASSWORD }}
        run: npm run publish
```

### 6.4 Native module handling (`better-sqlite3`)

`better-sqlite3` is a native addon that must be compiled for the target Electron version on the target OS. Electron Forge handles this automatically during `make`/`package` via its rebuild step. Since CI runs on platform-specific runners (macOS builds on macOS, Windows builds on Windows), this should work out of the box.

If issues arise, add an explicit rebuild step in CI:

```bash
npx electron-rebuild -f -w better-sqlite3
```

---

## Release Workflow (once everything is set up)

1. Make your changes and commit
2. Bump version: update `version` in `package.json`
3. Commit the version bump
4. Tag and push: `git tag v0.1.0 && git push && git push --tags`
5. GitHub Actions builds on macOS + Windows and publishes installers to a GitHub Release
6. Users with the app installed receive the update automatically via `electron-updater`

---

## Checklist

- [ ] Update `productName`, `description`, `version` in `package.json`
- [ ] Wrap DevTools in `!app.isPackaged` check
- [ ] Create app icons (`.icns` and `.ico`)
- [ ] Add `extraResource` for engine binaries in forge config
- [ ] Add DMG maker for macOS
- [ ] Configure Squirrel maker for Windows
- [ ] Add GitHub publisher to forge config
- [ ] Download Windows engine binaries (Stockfish, Stockfish-classic, lc0)
- [ ] Install and configure `electron-updater`
- [ ] Create auto-update module and wire into main process
- [ ] Apple Developer account + code signing + notarization
- [ ] Windows code signing certificate
- [ ] Create GitHub repo
- [ ] Set up Git LFS for engine binaries
- [ ] Create GitHub Actions build workflow
- [ ] Test local build: `npm run make` on macOS
- [ ] Test full pipeline: tag a release, verify CI builds and publishes
