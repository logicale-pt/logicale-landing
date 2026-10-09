/**
 * Cofre de credenciais — cifra no browser (Web Crypto), nunca no servidor.
 *
 * Frase-passe partilhada pelos dois sócios → PBKDF2-SHA256 (salt da tabela `cofre`) → chave AES-GCM 256.
 * A chave vive só em memória (nunca em localStorage) e bloqueia sozinha após inatividade.
 * Na BD fica apenas: salt, nº de iterações e um verificador cifrado (para validar a frase-passe).
 * Perder a frase-passe ⇒ os segredos ficam irrecuperáveis (por desenho).
 */

const ITERACOES = 310_000; // recomendação OWASP para PBKDF2-SHA256
const VERIFICADOR = 'logicale-cofre-v1';
const AUTO_LOCK_MS = 10 * 60_000;

let chave: CryptoKey | null = null;
let lockTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}
function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derivar(frase: string, salt: Uint8Array<ArrayBuffer>, iteracoes: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(frase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iteracoes },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function cifrarCom(k: CryptoKey, texto: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(texto)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64(out);
}

async function decifrarCom(k: CryptoKey, payload: string): Promise<string> {
  const raw = unb64(payload);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, k, raw.slice(12));
  return dec.decode(pt);
}

function notificar() {
  listeners.forEach((fn) => fn());
}

function rearmarAutoLock() {
  clearTimeout(lockTimer);
  lockTimer = setTimeout(bloquear, AUTO_LOCK_MS);
}

export function desbloqueado(): boolean {
  return chave !== null;
}

export function onCofreChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function bloquear(): void {
  chave = null;
  clearTimeout(lockTimer);
  notificar();
}

/** Cria os parâmetros do cofre a partir de uma frase-passe nova (primeira utilização). */
export async function criarCofre(frase: string): Promise<{ salt: string; iteracoes: number; verificador: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const k = await derivar(frase, salt, ITERACOES);
  const verificador = await cifrarCom(k, VERIFICADOR);
  chave = k;
  rearmarAutoLock();
  notificar();
  return { salt: b64(salt), iteracoes: ITERACOES, verificador };
}

/** Tenta desbloquear; devolve false se a frase-passe estiver errada. */
export async function desbloquear(frase: string, cofre: { salt: string; iteracoes: number; verificador: string }): Promise<boolean> {
  const k = await derivar(frase, unb64(cofre.salt), cofre.iteracoes);
  try {
    if ((await decifrarCom(k, cofre.verificador)) !== VERIFICADOR) return false;
  } catch {
    return false; // AES-GCM falha a autenticação com a chave errada
  }
  chave = k;
  rearmarAutoLock();
  notificar();
  return true;
}

export interface Segredo {
  password: string;
  notas: string;
}

export async function cifrarSegredo(s: Segredo): Promise<string> {
  if (!chave) throw new Error('cofre bloqueado');
  rearmarAutoLock();
  return cifrarCom(chave, JSON.stringify(s));
}

export async function decifrarSegredo(payload: string): Promise<Segredo> {
  if (!chave) throw new Error('cofre bloqueado');
  rearmarAutoLock();
  return JSON.parse(await decifrarCom(chave, payload)) as Segredo;
}
