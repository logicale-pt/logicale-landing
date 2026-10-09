import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Content-Security-Policy por <meta> (o GitHub Pages não deixa definir headers).
// Só no build: o dev server do Vite injeta scripts inline (HMR/react-refresh) que a CSP bloquearia.
// connect-src: só a API da Supabase; style-src 'unsafe-inline' por causa dos style={{…}} do React.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src https://kzioedpnfslvnniznasr.supabase.co",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

function csp(): Plugin {
  return {
    name: 'logicale-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  };
}

// Build servido em www.logicale.pt/backoffice via GitHub Pages:
// base fixa e output committed na pasta /backoffice da raiz do repo.
export default defineConfig({
  plugins: [react(), csp()],
  base: '/backoffice/',
  build: {
    outDir: '../backoffice',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // dependências em chunks próprios: mudam pouco, ficam em cache entre deploys do CRM
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
