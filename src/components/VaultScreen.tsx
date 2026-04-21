import { useState } from 'react';
import { useStore } from '../store';
import { Flame, Plus, FolderOpen, Trash2, Clock, ChevronRight, Shield, HardDrive, X } from 'lucide-react';

const VAULT_COLORS = ['#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export function VaultScreen() {
  const { vaults, createVault, openVault, deleteVault } = useStore();
  const [showCreate, setShowCreate] = useState(false);
  const [vaultName, setVaultName] = useState('');
  const [vaultColor, setVaultColor] = useState('#f59e0b');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = () => {
    if (!vaultName.trim()) return;
    createVault(vaultName.trim(), vaultColor);
    setVaultName('');
    setVaultColor('#f59e0b');
    setShowCreate(false);
  };

  const sortedVaults = [...vaults].sort((a, b) => b.lastOpened - a.lastOpened);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-12 animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#1a1200] mb-5">
            <Flame size={32} className="text-[#f59e0b]" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Flint</h1>
          <p className="text-[#666] text-sm">Your local vault. Your data. Your control.</p>
        </div>

        {/* Security badges */}
        <div className="flex items-center justify-center gap-6 mb-10 text-xs text-[#555]">
          <div className="flex items-center gap-1.5">
            <Shield size={12} className="text-[#22c55e]" />
            <span>End-to-end local</span>
          </div>
          <div className="flex items-center gap-1.5">
            <HardDrive size={12} className="text-[#3b82f6]" />
            <span>Stored on device</span>
          </div>
        </div>

        {/* Create new vault */}
        {!showCreate ? (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full flex items-center gap-3 p-4 rounded-xl border border-[#1e1e1e] bg-[#0a0a0a] hover:border-[#f59e0b]/30 hover:bg-[#111] transition-all text-left mb-6 group"
          >
            <div className="w-10 h-10 rounded-lg bg-[#1a1200] flex items-center justify-center">
              <Plus size={18} className="text-[#f59e0b]" />
            </div>
            <div>
              <div className="text-sm font-medium text-[#ccc] group-hover:text-white transition-colors">Create new vault</div>
              <div className="text-xs text-[#555]">Start a new knowledge base</div>
            </div>
            <ChevronRight size={16} className="ml-auto text-[#333] group-hover:text-[#666] transition-colors" />
          </button>
        ) : (
          <div className="p-5 rounded-xl border border-[#f59e0b]/20 bg-[#0a0a0a] mb-6 animate-slide-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">New Vault</h3>
              <button onClick={() => setShowCreate(false)} className="text-[#555] hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>
            <input
              type="text"
              value={vaultName}
              onChange={(e) => setVaultName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="Vault name..."
              className="w-full bg-[#111] border border-[#1e1e1e] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#444] outline-none focus:border-[#f59e0b]/50 transition-colors mb-4"
              autoFocus
            />
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-[#555]">Color:</span>
              {VAULT_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setVaultColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${vaultColor === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'}`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <button
              onClick={handleCreate}
              disabled={!vaultName.trim()}
              className="w-full py-2.5 rounded-lg bg-[#f59e0b] hover:bg-[#d97706] disabled:bg-[#333] disabled:cursor-not-allowed text-black font-medium text-sm transition-colors"
            >
              Create Vault
            </button>
          </div>
        )}

        {/* Vault list */}
        {sortedVaults.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-[#555] uppercase tracking-wider mb-3 px-1">
              Your Vaults ({sortedVaults.length})
            </h3>
            {sortedVaults.map((vault) => (
              <div
                key={vault.id}
                className="group flex items-center gap-3 p-3.5 rounded-xl border border-[#1e1e1e] bg-[#0a0a0a] hover:border-[#2a2a2a] hover:bg-[#111] transition-all cursor-pointer"
                onClick={() => openVault(vault.id)}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${vault.color}15` }}
                >
                  <FolderOpen size={16} style={{ color: vault.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#ddd] truncate">{vault.name}</div>
                  <div className="flex items-center gap-3 text-xs text-[#555] mt-0.5">
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {new Date(vault.lastOpened).toLocaleDateString()}
                    </span>
                    <span>{vault.path}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {deletingId === vault.id ? (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteVault(vault.id); setDeletingId(null); }}
                        className="p-1.5 rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors text-xs"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                        className="p-1.5 rounded-md text-[#555] hover:text-white transition-colors text-xs"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeletingId(vault.id); }}
                      className="p-1.5 rounded-md text-[#444] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Delete vault"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <ChevronRight size={14} className="text-[#333] group-hover:text-[#555] transition-colors" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {vaults.length === 0 && !showCreate && (
          <div className="text-center py-12">
            <FolderOpen size={40} className="mx-auto text-[#222] mb-4" />
            <p className="text-[#444] text-sm">No vaults yet. Create one to get started.</p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 text-xs text-[#333]">
          <p>Flint v1.0.0 — Local-first, secure, forever free.</p>
          <p className="mt-1">All data stored locally on your device. No cloud. No tracking.</p>
        </div>
      </div>
    </div>
  );
}
