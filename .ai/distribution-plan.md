# Distribution Plan — macOS & Windows

## Overview

Prepare Chess Lens for distribution as a signed, auto-updating desktop app on macOS and Windows via GitHub Releases.

**Decisions made:**
- macOS and Windows builds ship together
- Version starts at `0.1.0`
- Code signing deferred — ship unsigned initially (users see OS warnings but can install)
- Auto-updates deferred — `electron-updater` requires notarization on macOS; add alongside signing
- GitHub username: `jmbuss`
- Electron Forge is the packaging tool (official Electron team standard)
- lc0 ships as CPU-only (DNNL) on Windows — sufficient for Maia networks
- Stockfish-Classic sourced from [Stockfish-Classic/Stockfish-Classic](https://github.com/Stockfish-Classic/Stockfish-Classic) on both platforms

---

## Phase 1: Production Hardening — DONE

### 1.1 `package.json` metadata — done
- `productName` → `"Chess Lens"`
- `description` → `"A desktop chess analysis tool"`
- `version` → `0.1.0`

### 1.2 Conditional DevTools — done
DevTools only open in dev mode via `!app.isPackaged` guard in `src/main.ts`.

### 1.3 App icons — done
- `resources/icon.icns` — macOS
- `resources/icon.ico` — Windows
Generated from `AppIcon/ChessLens_Icon.png` using `electron-icon-builder`.

---

## Phase 2: Forge Config (`forge.config.ts`) — DONE

### 2.1 Bundle engine binaries — done
`extraResource: ['./resources/engines']` copies engines into the packaged app.

### 2.2 Native module handling (`better-sqlite3`) — done
- `better-sqlite3` is marked as external in Vite config
- `packageAfterCopy` hook copies `better-sqlite3`, `bindings`, and `file-uri-to-path` into the build's `node_modules`
- `asar: { unpack: '**/*.node' }` extracts the native binary outside the asar
- `AutoUnpackNativesPlugin` handles additional native module unpacking

### 2.3 macOS maker — DMG — done
`MakerDMG({ format: 'ULFO' })` — tested and working locally.

### 2.4 Windows maker — Squirrel — done
`MakerSquirrel({ name: 'ChessLens', setupIcon: './resources/icon.ico' })` — can only be tested on Windows or via CI.

### 2.5 Publisher — GitHub Releases — done
`PublisherGithub` configured for `jmbuss/chess-lens`.

---

## Phase 3: Engine Binaries — DONE

### macOS (`resources/engines/darwin/`)
- `stockfish/stockfish-macos-m1-apple-silicon` — latest Stockfish (NNUE)
- `stockfish-classic/stockfish-arm64` — Stockfish-Classic (HCE)
- `lc0/lc0` — lc0 CPU build

### Windows (`resources/engines/win32/`)
- `stockfish/stockfish-windows-x86-64-avx2.exe` — latest Stockfish (NNUE)
- `stockfish-classic/stockfish-classic.exe` — Stockfish-Classic (HCE)
- `lc0/lc0.exe` — lc0 CPU build (DNNL) with `dnnl.dll`, `mimalloc-override.dll`, `mimalloc-redirect.dll`

### Shared (`resources/engines/networks/`)
- Maia networks (`maia-1100.pb.gz` through `maia-1900.pb.gz`) — platform-agnostic

### Code fixes for Windows compatibility
- `EngineManager.findExecutableRecursive()` updated to match `.exe` files
- `EngineManager.resolveLc0Binary()` updated to append `.exe` on win32

---

## Phase 4: Auto-Updates (deferred — requires code signing)

`electron-updater` on macOS requires the app to be **signed and notarized** to function. Implement this phase at the same time as Phase 5 (code signing).

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
    autoUpdater.quitAndInstall()
  })

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err)
  })
}
```

### 4.3 Wire it up in `src/main.ts`

```ts
if (app.isPackaged) {
  initAutoUpdater(mainWindow)
}
```

---

## Phase 5: Code Signing (deferred)

Users will see Gatekeeper (macOS) / SmartScreen (Windows) warnings on unsigned builds but can still install. Add signing before any public/paid release.

### macOS
1. Enroll in [Apple Developer Program](https://developer.apple.com/programs/) ($99/year) — **purchase processing**
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

### Windows
1. Get a code signing certificate (DigiCert, SSL.com, or SignPath)
2. Add to `MakerSquirrel`:

```ts
new MakerSquirrel({
  certificateFile: './cert.pfx',
  certificatePassword: process.env.WINDOWS_CERT_PASSWORD,
}),
```

---

## Phase 6: GitHub Repo & CI/CD

### 6.1 Create the repo (manual)

```bash
gh repo create chess-lens --private --source=. --push
```

### 6.2 Handle large engine binaries (manual — do before first push)

Engine binaries will bloat the repo. Use Git LFS:

```bash
git lfs install
git lfs track "resources/engines/**/*"
git add .gitattributes
```

### 6.3 GitHub Actions workflow — DONE

`.github/workflows/build.yml` builds on both `macos-latest` and `windows-latest`:

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
        run: npm run publish
```

### 6.4 Native module handling (`better-sqlite3`)

Electron Forge handles native addon rebuilding automatically. If CI issues arise:

```bash
npx electron-rebuild -f -w better-sqlite3
```

---

## Release Workflow (once everything is set up)

1. Make your changes and commit
2. Bump version: update `version` in `package.json`
3. Commit the version bump
4. Tag and push: `git tag v0.1.0 && git push && git push --tags`
5. GitHub Actions builds on macOS + Windows and publishes DMG + Squirrel installer to a GitHub Release
6. Users with the app installed receive the update automatically via `electron-updater` (once signing is enabled)

---

## Checklist

### Phase 1 — Production Hardening
- [x] Update `productName` to `"Chess Lens"` in `package.json`
- [x] Add real `description` in `package.json`
- [x] Bump `version` to `0.1.0` in `package.json`
- [x] Wrap DevTools in `!app.isPackaged` check in `src/main.ts`
- [x] Create app icons `resources/icon.icns` and `resources/icon.ico`

### Phase 2 — Forge Config
- [x] Install `@electron-forge/maker-dmg`
- [x] Install `@electron-forge/publisher-github`
- [x] Add `extraResource` for engine binaries
- [x] Add `packageAfterCopy` hook for `better-sqlite3` native module
- [x] Add `asar.unpack` for `.node` files
- [x] Configure DMG maker (macOS)
- [x] Configure Squirrel maker (Windows)
- [x] Add GitHub publisher

### Phase 3 — Engine Binaries
- [x] macOS Stockfish (NNUE) — cleaned up, tar removed
- [x] macOS Stockfish-Classic (HCE)
- [x] macOS lc0 (CPU)
- [x] Windows Stockfish (NNUE) — `stockfish-windows-x86-64-avx2.exe`
- [x] Windows Stockfish-Classic (HCE) — `stockfish-classic.exe`
- [x] Windows lc0 (CPU/DNNL) — `lc0.exe` + DLLs
- [x] Fix `EngineManager` to handle `.exe` on Windows

### Phase 4 — Auto-Updates *(deferred — implement with Phase 5 signing)*
- [ ] Install `electron-updater`
- [ ] Create `src/services/updater.ts`
- [ ] Wire `initAutoUpdater` into `src/main.ts` with `app.isPackaged` guard

### Phase 5 — Code Signing *(deferred)*
- [ ] Apple Developer account + Developer ID Application cert (purchase processing)
- [ ] Add `osxSign` + `osxNotarize` to forge config
- [ ] Windows code signing certificate

### Phase 6 — GitHub & CI/CD
- [x] Create `.github/workflows/build.yml` (macOS + Windows matrix)
- [ ] Set up Git LFS for engine binaries *(manual — before first push)*
- [ ] Create GitHub repo *(manual)*
- [ ] Test local build: `npm run make` on macOS
- [ ] Test Windows build (locally or via CI)
- [ ] Test full pipeline: tag a release, verify CI builds and publishes
