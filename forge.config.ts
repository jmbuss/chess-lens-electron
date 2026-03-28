import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerDMG } from '@electron-forge/maker-dmg'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives'
import { VitePlugin } from '@electron-forge/plugin-vite'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { FuseV1Options, FuseVersion } from '@electron/fuses'
import { PublisherGithub } from '@electron-forge/publisher-github'
import path from 'path'
import fs from 'fs'

const nativeModules = ['better-sqlite3', 'bindings', 'file-uri-to-path']

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: '**/*.node',
    },
    extraResource: ['./resources/engines'],
    icon: './resources/icon',
  },
  rebuildConfig: {},
  makers: [
    new MakerDMG({ format: 'ULFO' }),
    new MakerSquirrel({ name: 'ChessLens', setupIcon: './resources/icon.ico' }),
  ],
  publishers: [
    new PublisherGithub({
      repository: {
        owner: 'jmbuss',
        name: 'chess-lens',
      },
      prerelease: false,
    }),
  ],
  hooks: {
    packageAfterCopy: async (_config, buildPath) => {
      const projectModules = path.resolve(__dirname, 'node_modules')
      const buildModules = path.join(buildPath, 'node_modules')

      for (const mod of nativeModules) {
        const src = path.join(projectModules, mod)
        const dest = path.join(buildModules, mod)
        if (fs.existsSync(src)) {
          fs.cpSync(src, dest, { recursive: true })
        }
      }
    },
  },
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
}

export default config
