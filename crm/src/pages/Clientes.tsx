import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fmtEUR } from '../lib/utils';
import type { Cliente, Mensalidade } from '../lib/types';

export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [mensalidades, setMensalidades] = useState<Map<string, number>>(new Map());
  const [pesquisa, setPesquisa] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'ativo' | 'inativo'>('ativo');
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const [{ data: cls }, { data: mens }] = await Promise.all([
        supabase.from('clientes').select('*').order('nome'),
        supabase.from('mensalidades').select('*'),
      ]);
      setClientes((cls as Cliente[]) ?? []);
      setMensalidades(
        new Map(((mens as Mensalidade[]) ?? []).map((m) => [m.cliente_id, Number(m.mensalidade)])),
      );
    })();
  }, []);

  const q = pesquisa.toLowerCase();
  const visiveis = clientes.filter(
    (c) =>
      (filtro === 'todos' || c.estado === filtro) &&
      (!q ||
        c.nome.toLowerCase().includes(q) ||
        (c.empresa ?? '').toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q)),
  );

  return (
    <>
      <h1>Clientes</h1>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Pesquisar nome, empresa, email…"
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
        />
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
          <option value="todos">Todos</option>
        </select>
        <div className="spacer" />
        <button className="primary" onClick={() => navigate('/clientes/novo')}>
          + Novo cliente
        </button>
      </div>
      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th>Nome</th><th>Empresa</th><th>Email</th><th>Telefone</th><th>Mensalidade</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {visiveis.map((c) => (
              <tr key={c.id} className="clickable" onClick={() => navigate(`/clientes/${c.id}`)}>
                <td>{c.nome}</td>
                <td>{c.empresa ?? '—'}</td>
                <td>
                  {c.email ? (
                    <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()}>{c.email}</a>
                  ) : '—'}
                </td>
                <td>
                  {c.telefone ? (
                    <a href={`tel:${c.telefone.replace(/\s/g, '')}`} onClick={(e) => e.stopPropagation()}>
                      {c.telefone}
                    </a>
                  ) : '—'}
                </td>
                <td>{fmtEUR(mensalidades.get(c.id) ?? 0)}</td>
                <td><span className={`tag ${c.estado}`}>{c.estado}</span></td>
              </tr>
            ))}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty">
                    <p>{clientes.length === 0 ? 'Ainda não há clientes.' : 'Nenhum cliente corresponde à pesquisa.'}</p>
                    {clientes.length === 0 && (
                      <button className="primary" onClick={() => navigate('/clientes/novo')}>
                        Criar o primeiro cliente
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
