import type { ReactNode } from 'react';

/** Ícones de linha 16px, monocromáticos (herdam currentColor). */
function I({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconDashboard = () => (
  <I>
    <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5" />
    <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.5" />
    <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.5" />
    <rect x="9" y="9" width="5.5" height="5.5" rx="1.5" />
  </I>
);

export const IconLeads = () => (
  <I>
    <path d="M1.5 9.5 L4.5 9.5 L6 11.5 L10 11.5 L11.5 9.5 L14.5 9.5" />
    <path d="M1.5 9.5 V13 A1.5 1.5 0 0 0 3 14.5 H13 A1.5 1.5 0 0 0 14.5 13 V9.5" />
    <path d="M8 1.5 V7 M5.5 4.5 L8 7 L10.5 4.5" />
  </I>
);

export const IconClientes = () => (
  <I>
    <circle cx="5.5" cy="5" r="2.5" />
    <path d="M1.5 13.5 C1.5 10.8 3.3 9.5 5.5 9.5 C7.7 9.5 9.5 10.8 9.5 13.5" />
    <path d="M10.5 2.9 A2.5 2.5 0 0 1 10.5 7.1" />
    <path d="M11.5 9.7 C13.3 10.1 14.5 11.4 14.5 13.5" />
  </I>
);

export const IconKanban = () => (
  <I>
    <rect x="1.5" y="1.5" width="3.5" height="13" rx="1" />
    <rect x="6.25" y="1.5" width="3.5" height="9" rx="1" />
    <rect x="11" y="1.5" width="3.5" height="6" rx="1" />
  </I>
);

export const IconFinanceiro = () => (
  <I>
    <circle cx="8" cy="8" r="6.5" />
    <path d="M10.2 5.6 A3 3 0 1 0 10.2 10.4 M4.8 7 H9 M4.8 9 H8.5" />
  </I>
);

export const IconMonitorizacao = () => (
  <I>
    <path d="M1.5 8 H4.5 L6.5 3.5 L9.5 12.5 L11.5 8 H14.5" />
  </I>
);

export const IconDefinicoes = () => (
  <I>
    <path d="M1.5 4.5 H14.5 M1.5 11.5 H14.5" />
    <circle cx="10.5" cy="4.5" r="1.8" fill="var(--bg)" />
    <circle cx="5.5" cy="11.5" r="1.8" fill="var(--bg)" />
  </I>
);
