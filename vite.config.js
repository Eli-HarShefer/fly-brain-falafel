import { resolve } from 'node:path';

export default {
  // Root by default, so `npm run dev`, `npm run preview` and the capture rig
  // all work unchanged. GitHub Pages serves a project site from /<repo>/, so
  // the workflow sets SITE_BASE to that prefix.
  base: process.env.SITE_BASE || '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        // the portrait filming stage
        shoot: resolve(import.meta.dirname, 'shoot.html'),
      },
    },
  },
};
