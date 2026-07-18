export type Theme = 'claro' | 'escuro';

const KEY = 'logicale-crm-theme';

export function getTheme(): Theme {
  return localStorage.getItem(KEY) === 'escuro' ? 'escuro' : 'claro'; // claro é o default
}

export function applyTheme(theme: Theme): void {
  if (theme === 'escuro') document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(KEY, theme);
  applyTheme(theme);
}
