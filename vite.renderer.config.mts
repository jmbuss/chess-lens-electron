import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// https://vitejs.dev/config
export default defineConfig((env) => {
  const forgeEnv = env as ConfigEnv;
  const { root, mode, forgeConfigSelf } = forgeEnv;
  return {
    plugins: [vue({
      script: {
        propsDestructure: true,
      }
    }), tailwindcss()],
    server: {
      watch: {
        // Ignore engine binaries - chmod on startup triggers file watchers and causes app reload
        ignored: ['**/resources/engines/**'],
      },
    },
    resolve: {
      preserveSymlinks: true,
      alias: {
        vue: 'vue/dist/vue.esm-bundler.js',
        'src': path.resolve(root, 'src'),
        '@': path.resolve(root, 'src'),
      },
    },
  }
});
