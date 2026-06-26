/* ============================================================
   LOGICALE — configuração do Diagnóstico gratuito (captura de leads)
   ------------------------------------------------------------
   Copia este ficheiro para `assets/config.js` e preenche os valores.
   Num site estático (GitHub Pages) NÃO há variáveis de ambiente de
   servidor — esta config é o equivalente. A SUPABASE_ANON_KEY é
   pública por design (protegida por Row Level Security na Supabase),
   por isso pode ficar no repositório sem risco.

   Ordem de envio da lead (o primeiro configurado ganha):
     1. Supabase  → se SUPABASE_URL + SUPABASE_ANON_KEY estiverem preenchidos
     2. Formspree → fallback, se FORMSPREE_ENDPOINT estiver preenchido
     3. nenhum    → a lead é registada na consola (ver TODO no quiz)
   ============================================================ */
window.LOGICALE_CONFIG = {
  SUPABASE_URL: "",        // ex.: https://xxxxxxxx.supabase.co
  SUPABASE_ANON_KEY: "",   // anon/public key (segura para o browser, com RLS ativo)
  FORMSPREE_ENDPOINT: ""   // fallback, ex.: https://formspree.io/f/xxxxxxx
};
