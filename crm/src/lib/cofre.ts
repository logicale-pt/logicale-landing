/**
 * Cofre de credenciais — cifra no browser (Web Crypto), nunca no servidor.
 *
 * Frase-passe partilhada pelos dois sócios → PBKDF2-SHA256 (salt da tabela `cofre`) → chave AES-GCM 256.
 * A chave vive só em memória (nunca em localStorage) e bloqueia sozinha após inatividade.
 * Na BD fica apenas: salt, nº de iterações e um verificador cifrado (para validar a frase-passe).
 * Perder a frase-passe ⇒ os segredos ficam irrecuperáveis (por desenho).
 */

const ITERACOES = 600_000; // OWASP (2023) para PBKDF2-HMAC-SHA256 — cofres novos e frases mudadas
const ITERACOES_MIN = 310_000; // o cofre original foi criado com 310k; abaixo disto não se aceita
const VERIFICADOR = 'logicale-cofre-v1';
const AUTO_LOCK_MS = 10 * 60_000;

let chave: CryptoKey | null = null;
let versao: number | null = null; // cofre.versao da chave em memória (null = BD sem a migração da versão)
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

/** Versão do cofre com que a chave em memória foi derivada — vai em credenciais.cofre_versao. */
export function versaoCofre(): number | null {
  return versao;
}

export function onCofreChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function bloquear(): void {
  chave = null;
  versao = null;
  clearTimeout(lockTimer);
  notificar();
}

/** Cria os parâmetros do cofre a partir de uma frase-passe nova (primeira utilização). */
export async function criarCofre(frase: string): Promise<{ salt: string; iteracoes: number; verificador: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const k = await derivar(frase, salt, ITERACOES);
  const verificador = await cifrarCom(k, VERIFICADOR);
  chave = k;
  versao = 1; // default da coluna cofre.versao
  rearmarAutoLock();
  notificar();
  return { salt: b64(salt), iteracoes: ITERACOES, verificador };
}

/** Tenta desbloquear; devolve false se a frase-passe estiver errada. */
type ParamsCofre = { salt: string; iteracoes: number; verificador: string; versao?: number };

async function chaveDe(frase: string, cofre: ParamsCofre): Promise<CryptoKey | null> {
  if (cofre.iteracoes < ITERACOES_MIN) {
    console.error('cofre com iterações abaixo do mínimo — recusado');
    return null;
  }
  const k = await derivar(frase, unb64(cofre.salt), cofre.iteracoes);
  try {
    return (await decifrarCom(k, cofre.verificador)) === VERIFICADOR ? k : null;
  } catch {
    return null; // AES-GCM falha a autenticação com a chave errada
  }
}

export async function desbloquear(frase: string, cofre: ParamsCofre): Promise<boolean> {
  const k = await chaveDe(frase, cofre);
  if (!k) return false;
  chave = k;
  versao = cofre.versao ?? null;
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

/* ---------- mudar a frase-passe ---------- */

export interface MudancaFrase {
  salt: string;
  iteracoes: number;
  verificador: string;
  segredos: { id: string; segredo: string }[];
  chave: CryptoKey;
}

export class ErroMudanca extends Error {
  constructor(public motivo: 'frase-atual' | 'ilegivel', public ids: string[] = []) {
    super(motivo);
  }
}

/**
 * Re-cifra todos os segredos com uma chave nova (salt novo, 600k iterações). Nada é gravado aqui:
 * o resultado vai para a função mudar_frase_cofre, que grava tudo numa transação; só depois
 * se chama aplicarMudanca. Falha (sem mexer em nada) se a frase atual estiver errada ou se
 * algum segredo não decifrar com ela.
 */
export async function prepararMudanca(
  fraseAtual: string,
  fraseNova: string,
  cofre: ParamsCofre,
  credenciais: { id: string; segredo: string }[],
): Promise<MudancaFrase> {
  const antiga = await chaveDe(fraseAtual, cofre);
  if (!antiga) throw new ErroMudanca('frase-atual');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nova = await derivar(fraseNova, salt, ITERACOES);
  const segredos: { id: string; segredo: string }[] = [];
  const ilegiveis: string[] = [];
  for (const c of credenciais) {
    try {
      segredos.push({ id: c.id, segredo: await cifrarCom(nova, await decifrarCom(antiga, c.segredo)) });
    } catch {
      ilegiveis.push(c.id);
    }
  }
  if (ilegiveis.length) throw new ErroMudanca('ilegivel', ilegiveis);
  return { salt: b64(salt), iteracoes: ITERACOES, verificador: await cifrarCom(nova, VERIFICADOR), segredos, chave: nova };
}

/** Depois de a BD aceitar a mudança: passa a usar a chave nova. */
export function aplicarMudanca(k: CryptoKey, novaVersao: number): void {
  chave = k;
  versao = novaVersao;
  rearmarAutoLock();
  notificar();
}
