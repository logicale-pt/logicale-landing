export type ClienteEstado = 'ativo' | 'inativo';
export type TipoEntrega = 'cowork' | 'routine' | 'vm';
export type ScheduleTipo = 'diaria' | 'dias_uteis' | 'semanal' | 'custom';
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
