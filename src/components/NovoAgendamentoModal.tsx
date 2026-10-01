import React, { useEffect, useState } from 'react';
import { X, Loader2, CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import {
  createAppointment,
  listProfessionals,
  type Professional,
} from '../services/supabaseService';

/**
 * Agendamento manual.
 *
 * Nem tudo passa pela IA: o paciente liga, chega no balcão, ou o atendente
 * remarca na conversa. Sem esta tela, esses compromissos simplesmente não
 * existiam no sistema — e não recebiam lembrete.
 *
 * O registro é igual ao que a IA cria, com status 'confirmed'. É isso que faz
 * o lembrete de consulta sair para ele também, sem nenhum código a mais.
 */

const campo =
  'w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';
const rotulo = 'block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2';

/** Hoje em 'YYYY-MM-DD', no fuso do navegador. */
function hoje(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function NovoAgendamentoModal({
  onFechar,
  onCriado,
}: {
  onFechar: () => void;
  onCriado: () => void;
}) {
  const [profissionais, setProfissionais] = useState<Professional[]>([]);

  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [date, setDate] = useState(hoje());
  const [time, setTime] = useState('09:00');
  const [professionalId, setProfessionalId] = useState('');
  const [modalidade, setModalidade] = useState<'presencial' | 'online' | ''>('');
  const [summary, setSummary] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    // Sem profissionais cadastrados o agendamento continua possível — o campo
    // apenas não aparece.
    listProfessionals()
      .then(setProfissionais)
      .catch(err => console.error('[NovoAgendamento] Falha ao carregar profissionais:', err));
  }, []);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!clientName.trim()) { toast.error('Informe o nome do paciente.'); return; }

    const digitos = clientPhone.replace(/\D/g, '');
    // O lembrete é enviado por este número; aceitar um telefone incompleto
    // criaria um agendamento que nunca avisa ninguém.
    if (digitos.length < 10) { toast.error('Informe o telefone com DDD.'); return; }

    if (!date) { toast.error('Escolha a data.'); return; }
    if (!time) { toast.error('Escolha o horário.'); return; }

    const escolhido = profissionais.find(p => p.id === professionalId);

    setSalvando(true);
    try {
      await createAppointment({
        clientName,
        clientPhone,
        date,
        time,
        professionalId: escolhido?.id || null,
        professionalName: escolhido?.name || null,
        modalidade: modalidade || null,
        summary: summary || null,
      });
      toast.success('Agendamento criado.');
      onCriado();
      onFechar();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar o agendamento');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onFechar} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-start justify-between shrink-0">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Novo agendamento</h3>
            <p className="text-[12px] text-gray-500">
              Para quem marcou por telefone, no balcão ou na conversa.
            </p>
          </div>
          <button onClick={onFechar} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={enviar} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className={rotulo}>Nome do paciente</label>
            <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Ana Souza" className={campo} />
          </div>

          <div>
            <label className={rotulo}>WhatsApp</label>
            <input
              value={clientPhone}
              onChange={e => setClientPhone(e.target.value)}
              placeholder="32988009060"
              inputMode="numeric"
              className={campo}
            />
            <p className="text-[11px] text-gray-400 mt-1.5">
              Com DDD. É por este número que o lembrete de consulta vai sair.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={rotulo}>Data</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={campo} />
            </div>
            <div>
              <label className={rotulo}>Horário</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className={campo} />
            </div>
          </div>

          {profissionais.length > 0 && (
            <div>
              <label className={rotulo}>
                Profissional <span className="normal-case font-medium text-gray-300">(opcional)</span>
              </label>
              <select
                value={professionalId}
                onChange={e => setProfessionalId(e.target.value)}
                className={`${campo} bg-white`}
              >
                <option value="">Não definir</option>
                {profissionais.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1.5">
                É o nome que entra no {'{profissional}'} do lembrete.
              </p>
            </div>
          )}

          <div>
            <label className={rotulo}>
              Modalidade <span className="normal-case font-medium text-gray-300">(opcional)</span>
            </label>
            <select
              value={modalidade}
              onChange={e => setModalidade(e.target.value as any)}
              className={`${campo} bg-white`}
            >
              <option value="">Não definir</option>
              <option value="presencial">Presencial</option>
              <option value="online">Online</option>
            </select>
          </div>

          <div>
            <label className={rotulo}>
              Observação <span className="normal-case font-medium text-gray-300">(opcional)</span>
            </label>
            <input
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder="Retorno, primeira avaliação…"
              className={campo}
            />
          </div>

          <button
            type="submit"
            disabled={salvando}
            className="w-full py-2.5 bg-primary-600 text-white rounded-xl text-[13px] font-semibold hover:bg-primary-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {salvando ? <Loader2 size={15} className="animate-spin" /> : <CalendarPlus size={15} />}
            Criar agendamento
          </button>
        </form>
      </div>
    </div>
  );
}
