import { Camera, PanelLeft, LayoutGrid, Map, BarChart3, Sun, Moon, Loader2, RefreshCw, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState, useCallback } from 'react';
import { fetchIndexStatus, triggerReindex } from '@/lib/api-client';

export type ViewMode = 'grid' | 'map' | 'stats' | 'duplicates';

interface AppHeaderProps {
  onToggleSidebar: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

const views: { mode: ViewMode; icon: typeof LayoutGrid; label: string }[] = [
  { mode: 'grid', icon: LayoutGrid, label: 'Grid view' },
  { mode: 'map', icon: Map, label: 'Map view' },
  { mode: 'duplicates', icon: Copy, label: 'Duplicates' },
  { mode: 'stats', icon: BarChart3, label: 'Stats' },
];

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('imgvault-theme', next ? 'dark' : 'light');
  };

  useEffect(() => {
    const saved = localStorage.getItem('imgvault-theme');
    if (saved === 'light') {
      setDark(false);
      document.documentElement.classList.remove('dark');
    } else {
      setDark(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  return { dark, toggle };
}

function useIndexStatus() {
  const [status, setStatus] = useState<{ running: boolean; progress: number; total: number; last_run: string | null }>({
    running: false, progress: 0, total: 0, last_run: null,
  });

  const poll = useCallback(async () => {
    try {
      const s = await fetchIndexStatus();
      setStatus(s);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [poll]);

  return { status, refresh: poll };
}

export default function AppHeader({ onToggleSidebar, viewMode, onViewModeChange }: AppHeaderProps) {
  const { dark, toggle } = useTheme();
  const { status: indexStatus, refresh } = useIndexStatus();
  const [reindexing, setReindexing] = useState(false);

  const handleReindex = async () => {
    if (indexStatus.running || reindexing) return;
    try {
      setReindexing(true);
      await triggerReindex();
      await refresh();
    } catch (error) {
      console.error('Failed to trigger reindex:', error);
    } finally {
      setReindexing(false);
    }
  };

  return (
    <header className="shrink-0 border-b border-border bg-surface">
      <div className="h-12 flex items-center px-3 sm:px-4 gap-2 sm:gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded-md hover:bg-secondary transition-colors active:scale-95 lg:hidden"
          aria-label="Toggle folders"
        >
          <PanelLeft className="h-4.5 w-4.5 text-muted-foreground" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Camera className="h-4 w-4 text-primary-foreground" />
          </div>
          <h1 className="text-sm font-semibold text-foreground tracking-tight">ImgVault</h1>
        </div>

        {indexStatus.running && (
          <div className="flex items-center gap-2 ml-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            <span className="hidden sm:inline tabular-nums">
              Indexing… {indexStatus.progress.toLocaleString()} photos
            </span>
            <span className="sm:hidden tabular-nums">
              {indexStatus.progress.toLocaleString()}
            </span>
          </div>
        )}

        <div className="flex-1" />

        <button
          onClick={handleReindex}
          disabled={indexStatus.running || reindexing}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors active:scale-95',
            indexStatus.running || reindexing
              ? 'cursor-not-allowed bg-muted text-muted-foreground'
              : 'bg-surface text-foreground hover:bg-secondary'
          )}
          aria-label="Reindex all files"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', (indexStatus.running || reindexing) && 'animate-spin')} />
          <span className="hidden sm:inline">Reindex all</span>
        </button>

        <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
          {views.map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              className={cn(
                'p-1.5 rounded-md transition-all duration-150 active:scale-95',
                viewMode === mode
                  ? 'bg-surface shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              aria-label={label}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>

        <button
          onClick={toggle}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors active:scale-95"
          aria-label="Toggle theme"
        >
          {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>
      </div>

      {indexStatus.running && (
        <div className="h-0.5 bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-700 ease-out"
            style={{ width: indexStatus.progress > 0 ? '100%' : '30%', opacity: indexStatus.progress > 0 ? 1 : 0.5, animation: indexStatus.progress === 0 ? 'pulse 2s ease-in-out infinite' : 'none' }}
          />
        </div>
      )}
    </header>
  );
}