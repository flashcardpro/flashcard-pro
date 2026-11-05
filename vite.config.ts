import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Relative base so the same build works on GitHub Pages (/flashcard-pro/) or any other host.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('node_modules/konva') || id.includes('node_modules/react-konva')) return 'canvas';
          if (id.includes('node_modules/@tiptap') || id.includes('node_modules/prosemirror')) return 'editor';
          if (id.includes('node_modules/katex')) return 'math';
          return undefined;
        },
      },
    },
  },
});
