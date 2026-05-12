import React, { useState, useEffect } from 'react';
import { Search, Loader2, MessageCircle, Send, Plus, Trash2, X, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';

export default function LeoPostagens({ role }: { role: string }) {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [selectedPost, setSelectedPost] = useState<any | null>(null);
  const [triggers, setTriggers] = useState<any[]>([]);
  
  const [newTrigger, setNewTrigger] = useState({
    palavra_chave: '',
    resposta_comentario: '',
    mensagem_dm: ''
  });
  const [saving, setSaving] = useState(false);

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${session?.access_token || ''}`,
      'Content-Type': 'application/json'
    };
    return fetch(url, { ...options, headers });
  };

  useEffect(() => {
    fetchMedia();
  }, []);

  const fetchMedia = async () => {
    try {
      const res = await authFetch('/api/leo/instagram/media');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar postagens');
      setPosts(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTriggers = async (postId: string) => {
    try {
      const res = await authFetch('/api/leo/instagram/triggers');
      const data = await res.json();
      if (res.ok) {
        setTriggers(data.filter((t: any) => t.post_id === postId));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenPost = (post: any) => {
    setSelectedPost(post);
    setTriggers([]); // Clear while loading
    fetchTriggers(post.id);
  };

  const handleAddTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role !== 'admin') {
      toast.error('Apenas administradores podem adicionar gatilhos.');
      return;
    }
    
    setSaving(true);
    try {
      const res = await authFetch('/api/leo/instagram/triggers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newTrigger,
          post_id: selectedPost.id,
          post_url: selectedPost.thumbnail_url || selectedPost.media_url
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setTriggers([data, ...triggers]);
      setNewTrigger({ palavra_chave: '', resposta_comentario: '', mensagem_dm: '' });
      toast.success('Gatilho exclusivo adicionado!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao adicionar gatilho');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTrigger = async (id: string) => {
    if (role !== 'admin') return;
    try {
      const res = await authFetch(`/api/leo/instagram/triggers/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao deletar');
      setTriggers(triggers.filter(t => t.id !== id));
      toast.success('Gatilho removido.');
    } catch (err) {
      toast.error('Erro ao deletar gatilho.');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
        <Loader2 size={32} className="animate-spin mb-4 text-amber-500" />
        <p>Carregando postagens do Instagram...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-600 p-6 rounded-2xl border border-red-100">
        <h3 className="font-bold mb-2">Aviso</h3>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Suas Postagens</h2>
          <p className="text-sm text-gray-500">Crie gatilhos de palavras-chave exclusivos para postagens específicas.</p>
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
          <ImageIcon size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 font-medium">Nenhuma postagem encontrada.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {posts.map((post) => (
            <div 
              key={post.id} 
              onClick={() => handleOpenPost(post)}
              className="bg-white rounded-2xl border border-gray-100 overflow-hidden cursor-pointer hover:shadow-md hover:border-amber-200 transition-all group"
            >
              <div className="aspect-square bg-gray-100 relative">
                {(post.media_type === 'IMAGE' || post.media_type === 'CAROUSEL_ALBUM') ? (
                  <img src={post.media_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : post.thumbnail_url ? (
                  <img src={post.thumbnail_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">Vídeo</div>
                )}
                
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="bg-amber-500 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg">
                    Configurar Gatilhos
                  </span>
                </div>
              </div>
              <div className="p-4">
                <p className="text-xs text-gray-500 line-clamp-2">
                  {post.caption || 'Sem legenda'}
                </p>
                <div className="mt-3 text-[10px] font-bold text-gray-400 uppercase">
                  {new Date(post.timestamp).toLocaleDateString('pt-BR')} • {post.media_type}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL DE GATILHOS DO POST */}
      {selectedPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <MessageCircle className="text-amber-500" size={20} />
                Gatilhos Exclusivos do Post
              </h3>
              <button onClick={() => setSelectedPost(null)} className="p-2 text-gray-400 hover:bg-white rounded-xl">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
              
              <div className="flex gap-4 mb-8 bg-gray-50 p-4 rounded-2xl">
                <div className="w-24 h-24 rounded-xl overflow-hidden shrink-0 bg-gray-200">
                  <img src={selectedPost.thumbnail_url || selectedPost.media_url} alt="Post" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-600 line-clamp-4">{selectedPost.caption}</p>
                </div>
              </div>

              <div className="mb-8">
                <h4 className="text-sm font-bold text-gray-900 mb-4">Gatilhos Ativos</h4>
                {triggers.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">Nenhum gatilho específico configurado para este post.</p>
                ) : (
                  <div className="space-y-3">
                    {triggers.map(t => (
                      <div key={t.id} className="bg-white border border-gray-100 p-4 rounded-xl flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <span className="inline-block bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded-md uppercase mb-2">
                            "{t.palavra_chave}"
                          </span>
                          {t.resposta_comentario && (
                            <div className="text-xs text-gray-600 flex items-center gap-1.5 mb-1">
                              <MessageCircle size={12} className="text-gray-400" />
                              <span className="font-medium text-gray-400">Comentário:</span> {t.resposta_comentario}
                            </div>
                          )}
                          {t.mensagem_dm && (
                            <div className="text-xs text-gray-600 flex items-center gap-1.5">
                              <Send size={12} className="text-emerald-400" />
                              <span className="font-medium text-gray-400">DM:</span> {t.mensagem_dm}
                            </div>
                          )}
                        </div>
                        {role === 'admin' && (
                          <button onClick={() => handleDeleteTrigger(t.id)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {role === 'admin' && (
                <div className="bg-amber-50/50 p-6 rounded-2xl border border-amber-100/50">
                  <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Plus size={16} className="text-amber-500" /> Novo Gatilho
                  </h4>
                  <form onSubmit={handleAddTrigger} className="space-y-4">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Se comentarem (palavra-chave)</label>
                      <input 
                        type="text" required
                        value={newTrigger.palavra_chave}
                        onChange={e => setNewTrigger({...newTrigger, palavra_chave: e.target.value})}
                        className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500/20 outline-none"
                        placeholder="Ex: QUERO, PREÇO"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Responder no comentário (Opcional)</label>
                      <input 
                        type="text"
                        value={newTrigger.resposta_comentario}
                        onChange={e => setNewTrigger({...newTrigger, resposta_comentario: e.target.value})}
                        className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500/20 outline-none"
                        placeholder="Ex: Te enviei os detalhes no privado!"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Enviar via Direct (DM)</label>
                      <textarea 
                        required rows={3}
                        value={newTrigger.mensagem_dm}
                        onChange={e => setNewTrigger({...newTrigger, mensagem_dm: e.target.value})}
                        className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500/20 outline-none resize-none"
                        placeholder="Mensagem ou link que será enviado via DM..."
                      />
                    </div>
                    <button 
                      type="submit" 
                      disabled={saving}
                      className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50"
                    >
                      {saving ? 'Adicionando...' : 'Adicionar Gatilho Específico'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
