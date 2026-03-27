import type { ConfigEnv, UserConfig } from 'vite';
import { defineConfig } from 'vite';

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
        formats: ['cjs'], // CommonJS for preload script
      },
      rollupOptions: {
        external: ['electron'],
      },
      outDir: '.vite/build',
    },
    resolve: {
      preserveSymlinks: true,
    },
    clearScreen: false,
  } as UserConfig;
});