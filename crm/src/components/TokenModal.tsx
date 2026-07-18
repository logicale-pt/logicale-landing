import Modal from './Modal';
import { curlSnippet } from '../lib/utils';

export interface NovoToken {
  automacao: string;
  token: string;
}

/** Mostra tokens de ping UMA ÚNICA VEZ (só o hash fica guardado). */
export default function TokenModal({ tokens, onClose }: { tokens: NovoToken[]; onClose: () => void }) {
  return (
    <Modal title="Tokens de ping — guarda-os agora">
      <p className="small" style={{ color: 'var(--warn)' }}>
        ⚠️ Estes tokens só são mostrados <b>uma vez</b> (guardamos apenas o hash). Copia o comando para o
        prompt do Cowork/Routine ou para o wrapper da VM antes de fechar.
      </p>
      {tokens.map((t) => (
        <div key={t.token} style={{ marginBottom: 16 }}>
          <label>{t.automacao}</label>
          <pre className="token-box mono">{curlSnippet(t.token)}</pre>
          <button className="small" onClick={() => navigator.clipboard.writeText(curlSnippet(t.token))}>
            Copiar curl
          </button>{' '}
          <button className="small" onClick={() => navigator.clipboard.writeText(t.token)}>
            Copiar só o token
          </button>
        </div>
      ))}
      <button className="primary" onClick={onClose}>
        Já guardei os tokens
      </button>
    </Modal>
  );
}
