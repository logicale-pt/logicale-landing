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
