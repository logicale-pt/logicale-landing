export type ClienteEstado = 'ativo' | 'inativo';
export type TipoEntrega = 'cowork' | 'routine' | 'vm';
export type ScheduleTipo = 'diaria' | 'dias_uteis' | 'semanal' | 'periodica' | 'custom';
export type RunEstado = 'ok' | 'erro' | 'missed';
export type IncidenteEstado = 'novo' | 'assumido' | 'resolvido';
export type PagamentoEstado = 'pendente' | 'pago' | 'em_atraso';
export type KanbanColuna = 'backlog' | 'em_curso' | 'espera_cliente' | 'feito';
export type LeadEstado = 'novo' | 'contactado' | 'reuniao' | 'convertido' | 'perdido';

export interface Cliente {
  id: string;
  nome: string;
  empresa: string | null;
  email: string | null;
  telefone: string | null;
  notas: string | null;
  estado: ClienteEstado;
  created_at: string;
}

export interface Automacao {
  id: string;
  cliente_id: string;
  nome: string;
  descricao: string | null;
  tipo_entrega: TipoEntrega;
  preco_mensal: number;
  schedule_tipo: ScheduleTipo;
  hora_esperada: string | null; // "HH:MM:SS"
  dia_semana: number | null; // 0=domingo … 6=sábado
  intervalo_min: number | null; // periodica: minutos entre execuções
  janela_inicio: string | null; // periodica: "HH:MM:SS", null = 00:00
  janela_fim: string | null; // periodica: "HH:MM:SS", null = 24:00
  so_dias_uteis: boolean; // periodica
  tolerancia_min: number;
  ativa: boolean;
  data_inicio: string;
  data_fim: string | null;
  created_at: string;
}

export interface Run {
  id: string;
  automacao_id: string;
  estado: RunEstado;
  started_at: string;
  duracao_seg: number | null;
  custo: number | null;
  mensagem: string | null;
  created_at: string;
}

/** Resumo diário (dia em Lisboa), mantido por trigger; sobrevive à limpeza das runs ok antigas. */
export interface RunDiaria {
  automacao_id: string;
  dia: string; // date
  ok: number;
  erro: number;
  missed: number;
  duracao_total: number;
  custo_total: number;
}

/** View automacoes_saude: última run + contagens dos últimos 30 dias, por automação. */
export interface AutomacaoSaude {
  automacao_id: string;
  ultima_estado: RunEstado | null;
  ultima_started_at: string | null;
  ok_30d: number;
  erro_30d: number;
  missed_30d: number;
}

export interface Incidente {
  id: string;
  run_id: string;
  cliente_id: string;
  estado: IncidenteEstado;
  assignee: string | null;
  nota_resolucao: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface Pagamento {
  id: string;
  cliente_id: string;
  mes: string; // date, 1º dia do mês
  valor: number;
  estado: PagamentoEstado;
  data_pagamento: string | null;
  created_at: string;
}

export interface Tarefa {
  id: string;
  titulo: string;
  descricao: string | null;
  coluna: KanbanColuna;
  cliente_id: string | null;
  assignee: string | null;
  ordem: number;
  created_at: string;
}

export interface Lead {
  id: string;
  created_at: string;
  source: string;
  setor: string | null;
  dimensao: string | null;
  tarefas: unknown;
  tempo_perdido: string | null;
  quem_faz: string | null;
  abertura: string | null;
  intencao: string | null;
  respostas: unknown;
  nome: string | null;
  empresa: string | null;
  email: string | null;
  estado: LeadEstado;
}

export interface Mensalidade {
  cliente_id: string;
  cliente_nome: string;
  cliente_estado: ClienteEstado;
  mensalidade: number;
}

// ---------- espaços (notas, custos, credenciais) ----------
// cliente_id = null ⇒ espaço interno da LOGICALE

export type NotaTipo = 'nota' | 'ideia' | 'reuniao';
export type CustoCategoria = 'ferramenta' | 'ia' | 'infraestrutura' | 'servico' | 'outro';
export type CustoPeriodicidade = 'mensal' | 'anual' | 'unico';

export interface Nota {
  id: string;
  cliente_id: string | null;
  titulo: string;
  conteudo: string;
  tipo: NotaTipo;
  fixada: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Custo {
  id: string;
  cliente_id: string | null;
  descricao: string;
  ferramenta: string | null;
  categoria: CustoCategoria;
  valor: number;
  periodicidade: CustoPeriodicidade;
  data_inicio: string;
  data_fim: string | null;
  notas: string | null;
  created_at: string;
}

export interface Credencial {
  id: string;
  cliente_id: string | null;
  servico: string;
  url: string | null;
  utilizador: string | null;
  segredo: string | null; // ciphertext (ver lib/cofre.ts)
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Cofre {
  id: number;
  salt: string;
  iteracoes: number;
  verificador: string;
}
