import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { listClientFields, type CampoCliente } from '../../services/supabaseService';
import CamposClienteManager from './CamposClienteManager';

/**
 * Seção "Campos da Ficha" das Configurações.
 *
 * Só carrega a lista e entrega ao painel compartilhado — o mesmo que o modal
 * "Campos da ficha" de Clientes usa.
 */
export default function CamposClienteSection() {
  const [campos, setCampos] = useState<CampoCliente[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = async () => {
    try {
      setCampos(await listClientFields());
    } catch (e: any) {
      toast.error('Erro ao carregar os campos: ' + e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  if (carregando) {
    return (
      <div className="py-10 flex justify-center text-slate-400">
        <Loader2 size={26} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 leading-relaxed max-w-3xl">
        A ficha do cliente é a mesma para todo mundo, menos por estes campos: cada ramo acompanha
        o que importa para ele. Remover um campo guarda os valores já preenchidos — recriá-lo com o
        mesmo nome traz o histórico de volta.
      </p>

      {/* Mesma largura da coluna de formulário das outras seções: esticado na
          largura toda do painel, o campo de texto fica desproporcional. */}
      <div className="max-w-xl">
        <CamposClienteManager campos={campos} onMudou={carregar} />
      </div>
    </div>
  );
}
