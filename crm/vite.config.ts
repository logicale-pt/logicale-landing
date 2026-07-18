import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build servido em www.logicale.pt/backoffice via GitHub Pages:
// base fixa e output committed na pasta /backoffice da raiz do repo.
export default defineConfig({
  plugins: [react()],
  base: '/backoffice/',
  build: { outDir: '../backoffice', emptyOutDir: true },
});
