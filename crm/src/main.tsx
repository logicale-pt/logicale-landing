import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyTheme, getTheme } from './lib/theme';
import './styles.css';

applyTheme(getTheme()); // antes do render, para não piscar

async function arrancar() {
  // dev local com dados fictícios (npm run dev:mock) — este ramo nem existe no build de produção
  if (import.meta.env.DEV && import.meta.env.VITE_MOCK === '1') (await import('./lib/mock')).installMock();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
arrancar();
