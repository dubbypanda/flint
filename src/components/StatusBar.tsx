import { useStore } from '../store';
import { HardDrive } from 'lucide-react';
import { FlintLogo } from './FlintLogo';
import { useTranslation } from 'react-i18next';

export function StatusBar() {
  const { state } = useStore();
  const { t } = useTranslation();
  const note = state.notes.find(n => n.id === state.activeNoteId);
  const words = note ? note.content.trim().split(/\s+/).filter(Boolean).length : 0;
  const chars = note ? note.content.length : 0;
  const activeVault = state.vaults.find(v => v.id === state.activeVaultId);

  return (
    <div className="flex items-center justify-between shrink-0"
      style={{ height: 26, padding: '0 12px', background: 'var(--bg-surface)', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-secondary)' }}>
      <div className="flex items-center gap-4">
        <span>{t('statusBar.words', { count: words })}</span>
        <span>{t('statusBar.chars', { count: chars })}</span>
        {state.hasFolderHandle && activeVault?.isFolderVault && (
          <span className="flex items-center gap-1" style={{ color: 'var(--accent)' }}>
            <HardDrive size={10} aria-hidden="true" /> {activeVault.folderPath}
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span style={{ color: 'var(--text-secondary)' }}>{t('statusBar.autoSaveOn')}</span>
        <div className="flex items-center gap-1">
          <FlintLogo size={10} />
          <span style={{ color: 'var(--text-secondary)' }}>{t('statusBar.version')}</span>
        </div>
      </div>
    </div>
  );
}
