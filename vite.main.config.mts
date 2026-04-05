import type { ConfigEnv, UserConfig } from 'vite';
import { defineConfig } from 'vite';
import path from 'path';

// https://vitejs.dev/config
export default defineConfig((env) => {
  const forgeEnv = env as ConfigEnv;
  const { root, mode, forgeConfigSelf } = forgeEnv;

  return {
    root,
    mode,
    build: {
      lib: {
        entry: forgeConfigSelf.entry!,
        fileName: () => '[name].js',
        formats: ['cjs'], // CommonJS for Electron main process
      },
      rollupOptions: {
        external: ['electron', 'better-sqlite3', '@photostructure/sqlite-vec'],
      },
      outDir: '.vite/build',
    },
    resolve: {
      preserveSymlinks: true,
      alias: {
        'src': path.resolve(root, 'src'),
      },
    },
    clearScreen: false,
  } as UserConfig;
});
