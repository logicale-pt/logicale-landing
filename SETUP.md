# LogiCale CRM — Setup

Backoffice em `www.logicale.pt/backoffice` (SPA estática em `/backoffice`, código em `crm/`).
Backend: Supabase `kzioedpnfslvnniznasr` (o mesmo da landing — fluxo de leads intocado).

## 1. O que já está feito

- **Schema SQL** em [supabase/migrations/20260718000000_crm_schema.sql](supabase/migrations/20260718000000_crm_schema.sql): tabelas `clientes`, `automacoes`, `runs`, `incidentes`, `pagamentos`, `tarefas`, view `mensalidades` (derivada), RLS em tudo (`authenticated` pode tudo, `anon` nada; `leads` mantém o INSERT anon da landing).
- **Edge Functions**: [supabase/functions/ping/index.ts](supabase/functions/ping/index.ts) (recebe pings, auth por token próprio) e [supabase/functions/check-missed/index.ts](supabase/functions/check-missed/index.ts) (dead man's switch, Europe/Lisbon).
- **pg_cron** em [supabase/migrations/20260718000100_pg_cron.sql](supabase/migrations/20260718000100_pg_cron.sql) (chama check-missed a cada 15 min).
- **SPA** buildada e committed em `/backoffice`: login, Dashboard, Leads (+converter em cliente), Clientes (+automações CRUD, mensalidade derivada), Kanban, Financeiro (snapshot de valores), Monitorização (runs, incidentes novo→assumido→resolvido, badge global).
- Emails de alerta implementados via Resend — **desativados até existir `RESEND_API_KEY`** (a function só faz log).

## 2. Passos manuais que faltam (por ordem)

### 2.1 SQL (Dashboard → SQL Editor)
1. Cola e corre `supabase/migrations/20260718000000_crm_schema.sql`.

### 2.2 Edge Functions (Dashboard → Edge Functions → Deploy new function)
Para **cada uma** (`ping` e `check-missed`):
1. Nome exatamente `ping` / `check-missed`; cola o conteúdo do respetivo `index.ts`.
2. **Desliga "Enforce JWT verification"** (ambas têm auth própria: token de automação / `x-cron-secret`).

### 2.3 Secrets (Dashboard → Edge Functions → Secrets)
| Secret | Valor |
|---|---|
| `CRON_SECRET` | gera com `openssl rand -hex 32` (guarda-o para o passo 2.4) |
| `RESEND_API_KEY` | a tua key `re_...` (quando tiveres — sem ela não há emails, o resto funciona) |
| `ALERT_EMAILS` | `lourencomestre3@gmail.com,anthonioef@gmail.com` (opcional, é o default) |
| `ALERT_FROM` | opcional; default `LogiCale CRM <onboarding@resend.dev>` |

> ⚠️ Resend: com `onboarding@resend.dev` só entrega ao email dono da conta Resend. Para entregar aos dois, verifica o domínio `logicale.pt` no Resend e usa `ALERT_FROM` tipo `alertas@logicale.pt`.

### 2.4 pg_cron
No SQL Editor: abre `supabase/migrations/20260718000100_pg_cron.sql`, substitui `__CRON_SECRET__` pelo valor do secret e corre.

### 2.5 Auth (o teu setup)
1. Dashboard → **Authentication → Sign In / Providers → Email**: desliga **"Allow new users to sign up"**.
2. **Authentication → Users → Add user → Create new user**: cria `lourencomestre3@gmail.com` e `anthonioef@gmail.com` com password (marca "Auto Confirm User").
3. Como não há registo aberto, `authenticated` ⇒ um de vocês dois — é isso que as policies RLS assumem. A anon key na SPA é pública por design; sem sessão não lê nada.

## 3. Como cada automação faz o ping

Ao criar uma automação, o CRM mostra **uma única vez** o token + o comando curl pronto (guardamos só o hash; se perderes o token, botão "novo token" na ficha do cliente).

**Cowork / Routine** — acrescenta ao fim do prompt da scheduled task:

> No fim da tarefa, faz este POST com o resultado. Se tudo correu bem usa `"estado":"ok"`; se algo falhou usa `"estado":"erro"` e mete o erro em `mensagem`:
> ```
> curl -X POST https://kzioedpnfslvnniznasr.supabase.co/functions/v1/ping \
>   -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
>   -d '{"estado":"ok","duracao_seg":42,"mensagem":"resumo curto do que foi feito"}'
> ```

**VM (wrapper bash)** — pinga sempre, com sucesso ou erro:

```bash
#!/usr/bin/env bash
TOKEN="<TOKEN>"
PING="https://kzioedpnfslvnniznasr.supabase.co/functions/v1/ping"
START=$(date +%s)
if OUT=$(python3 /caminho/do/script.py 2>&1); then
  ESTADO=ok; MSG="ok"
else
  ESTADO=erro; MSG="${OUT: -500}"
fi
DUR=$(( $(date +%s) - START ))
curl -s -X POST "$PING" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"estado\":\"$ESTADO\",\"duracao_seg\":$DUR,\"mensagem\":$(printf '%s' "$MSG" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')}"
```

## 4. Testar de ponta a ponta

1. **Login**: `https://www.logicale.pt/backoffice/` → entra com uma das contas. Sem login não deve aparecer nada; com login, Dashboard.
2. **Cliente de teste**: Clientes → + Novo cliente → "Teste" com 2 automações (ex: 100€ diária às 09:00 e 50€ semanal) → confirma mensalidade = **150€** em tempo real; guarda os 2 tokens do modal.
3. **Ping OK**: corre o curl de um token com `"estado":"ok"` → 200; a run aparece em Monitorização (verde) e no Dashboard (últimas 24h).
4. **Ping ERRO**: mesmo curl com `"estado":"erro","mensagem":"teste"` → cria incidente `novo` (badge vermelho em todas as tabs) + email (se Resend configurado). Testa **assumir → resolver com nota**.
5. **Token inválido**: curl com `Bearer nada` → **401**.
6. **MISSED simulado**: edita uma automação para hora esperada ~2h no passado (tolerância 5 min) e sem runs hoje; espera o próximo ciclo do cron (≤15 min) → run `missed` + incidente. (Ou força já: `curl -X POST .../functions/v1/check-missed -H "x-cron-secret: <CRON_SECRET>"`.)
7. **Financeiro**: regista o mês do cliente Teste (valor editável, default 150€) → marcar pago → muda o preço de uma automação → o mês registado **não muda** (snapshot), a mensalidade derivada sim.
8. Apaga/desativa o cliente de teste no fim (automações: desativar; o histórico fica).

## 5. Espaços — notas, custos e credenciais (out 2026)

Aba **Espaços** no backoffice: um espaço interno (LOGICALE) + um por cliente, cada um com
**Notas & ideias** (páginas estilo Notion, autosave), **Custos** (mensal / anual / único) e **Credenciais**.
O Dashboard passou a mostrar custos/mês, margem (MRR − custos) e um donut por cliente ou por ferramenta.

### 5.1 SQL (uma vez)
SQL Editor → cola e corre `supabase/migrations/20261009000000_espacos.sql`
(tabelas `notas`, `custos`, `credenciais`, `cofre`, com a mesma RLS do resto do CRM).
Até isso estar feito, a aba mostra um aviso e o Dashboard mostra "—" nos custos; nada parte.

### 5.2 Cofre de credenciais
- As passwords são **cifradas no browser** (AES-256-GCM, chave derivada por PBKDF2-SHA256 com 310 000 iterações)
  antes de irem para a BD. A base de dados só vê texto cifrado; nem quem tiver acesso ao dashboard da Supabase as consegue ler.
- Na primeira vez, um de vocês cria a **frase-passe do cofre** (partilhada entre os dois). Ela nunca é guardada:
  **se a perderem, as passwords guardadas ficam irrecuperáveis.** Guardem-na num sítio seguro fora do CRM.
- O cofre bloqueia sozinho após 10 min sem uso e ao recarregar a página.

### 5.3 Desenvolver sem tocar em produção
`cd crm && npm run dev:mock` → abre o backoffice com dados fictícios em memória e sessão falsa
(sem login, sem pedidos à Supabase). O mock não entra no build (`npm run build`).

## 6. Automações periódicas (out 2026)

Schedule **Periódica**: um ping a cada N minutos (5–720), opcionalmente só numa janela horária (ex: 09:00–18:00) e só em dias úteis.

1. **SQL Editor** → corre `supabase/migrations/20261009010000_automacoes_periodicas.sql` (só acrescenta colunas; tem de correr **antes** do deploy do backoffice, senão gravar automações falha).
2. **Edge Functions → check-missed** → substitui o código pelo novo `supabase/functions/check-missed/index.ts` e faz deploy (manter "Enforce JWT verification" desligado).

Deteção de missed: se passar a próxima execução esperada + tolerância sem ping → run `missed` + incidente + email. **Um só alerta por falha** — enquanto a última run for `missed` não volta a alertar; o primeiro ping novo rearma. Automações criadas hoje têm um ciclo de margem. O cron do check-missed corre de 15 em 15 min, por isso a deteção pode demorar até +15 min.

## 7. Histórico de runs — resumo diário e limpeza (out 2026)

As automações periódicas geram muitas runs (uma de 15 em 15 min ≈ 100/dia). Para o backoffice não ter de puxar
milhares de linhas (e não bater no limite de 1000 linhas da Supabase) e para a tabela `runs` não crescer sem fim:

- **`runs_diarias`** — contadores por automação e dia (Lisboa): ok / erro / missed, duração total e custo total.
  Um trigger atualiza-a a cada run nova; o SQL faz também o backfill das runs que já existem. Fica para sempre.
- **View `automacoes_saude`** — última execução + ok/erro/missed dos últimos 30 dias de cada automação.
  A Monitorização calcula daí o "Uptime 30 d" = ok / (ok + erro + missed).
- **Limpeza diária** (`limpar_runs_antigas()`, pg_cron `crm-limpar-runs`, todos os dias às **03:30 UTC** — 04:30 em Lisboa no verão):
  apaga runs **ok com mais de 30 dias**. Ficam sempre: runs `erro` e `missed`, runs com incidente e a última run de cada automação.
  Os totais diários continuam em `runs_diarias` (a ficha da automação mostra os totais "desde o início").
- O Dashboard passou a contar as "Runs últimas 24 h" no servidor (antes parava nas 50).

### 7.1 SQL (uma vez)
SQL Editor → cola e corre `supabase/migrations/20261010000000_runs_rollup.sql` (idempotente; não precisa de secrets).
Verificar: `select jobname, schedule, active from cron.job;` deve listar `crm-limpar-runs`.

Até isso estar feito, o backoffice usa o cálculo antigo no browser (últimas runs de 30 dias) — nada parte;
só o uptime fica impreciso com mais de 1000 runs em 30 dias. Edge Functions não mudam: o `check-missed`
só lê a última run e as runs das últimas 36 h, não é afetado pela limpeza.
