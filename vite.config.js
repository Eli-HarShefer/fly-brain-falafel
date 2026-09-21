import { resolve } from 'node:path';

export default {
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
