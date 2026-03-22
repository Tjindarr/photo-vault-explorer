import { Camera, PanelLeft, LayoutGrid, Map, BarChart3, Sun, Moon, Loader2, RefreshCw, Copy, Trash2, ImageIcon, Film, Pencil, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchIndexStatus, triggerReindex } from '@/lib/api-client';

export type ViewMode = 'grid' | 'map' | 'stats' | 'duplicates' | 'trash' | 'cleanup';

interface AppHeaderProps {
  onToggleSidebar: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  typeFilter?: string | null;
  onTypeFilterChange?: (type: string | null) => void;
  deleteMode?: boolean;
  onDeleteModeChange?: (on: boolean) => void;
  selectedCount?: number;
  onDeleteSelected?: () => void;
  onReindexComplete?: () => void;
}

const views: { mode: ViewMode; icon: typeof LayoutGrid; label: string }[] = [
  { mode: 'grid', icon: LayoutGrid, label: 'Grid view' },
  { mode: 'map', icon: Map, label: 'Map view' },
  { mode: 'cleanup', icon: Sparkles, label: 'Cleanup' },
  { mode: 'duplicates', icon: Copy, label: 'Duplicates' },
  { mode: 'trash', icon: Trash2, label: 'Trash' },
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

export default function AppHeader({ onToggleSidebar, viewMode, onViewModeChange, typeFilter, onTypeFilterChange, deleteMode, onDeleteModeChange, selectedCount = 0, onDeleteSelected, onReindexComplete }: AppHeaderProps) {
  const { dark, toggle } = useTheme();
  const { status: indexStatus, refresh } = useIndexStatus();
  const [reindexing, setReindexing] = useState(false);
  const wasRunningRef = useRef(false);

  useEffect(() => {
    if (wasRunningRef.current && !indexStatus.running) {
      setReindexing(false);
      onReindexComplete?.();
    }
    wasRunningRef.current = indexStatus.running;
  }, [indexStatus.running, onReindexComplete]);

  const handleReindex = async () => {
    if (indexStatus.running || reindexing) return;
    try {
      setReindexing(true);
      await triggerReindex();
      await refresh();
    } catch (error) {
      console.error('Failed to trigger reindex:', error);
      setReindexing(false);
    }
  };

  return (
    <header className="shrink-0 border-b border-border bg-surface">
      <div className="h-12 flex items-center px-3 sm:px-4 gap-2 sm:gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-md hover:bg-secondary transition-colors active:scale-95 lg:hidden"
          aria-label="Toggle folders"
        >
          <PanelLeft className="h-5 w-5 text-muted-foreground" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary items-center justify-center hidden sm:flex">
            <Camera className="h-4 w-4 text-primary-foreground" />
          </div>
          <h1 className="text-sm font-semibold text-foreground tracking-tight hidden sm:block">ImgVault</h1>
        </div>

        {indexStatus.running && (
          <div className="flex items-center gap-2 ml-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            <span className="tabular-nums">
              <span className="hidden sm:inline">Indexing… </span>{indexStatus.progress.toLocaleString()}
            </span>
          </div>
        )}

        {(viewMode === 'grid' || viewMode === 'map') && onTypeFilterChange && (
          <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5 ml-1">
            <button
              onClick={() => onTypeFilterChange(null)}
              className={cn(
                'px-2 py-1 rounded-md text-xs font-medium transition-colors active:scale-95',
                !typeFilter ? 'bg-surface shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >All</button>
            <button
              onClick={() => onTypeFilterChange(typeFilter === 'image' ? null : 'image')}
              className={cn(
                'p-1.5 rounded-md transition-colors active:scale-95',
                typeFilter === 'image' ? 'bg-surface shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
              aria-label="Photos only"
            ><ImageIcon className="h-3.5 w-3.5" /></button>
            <button
              onClick={() => onTypeFilterChange(typeFilter === 'video' ? null : 'video')}
              className={cn(
                'p-1.5 rounded-md transition-colors active:scale-95',
                typeFilter === 'video' ? 'bg-surface shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
              aria-label="Videos only"
            ><Film className="h-3.5 w-3.5" /></button>
          </div>
        )}

        {viewMode === 'grid' && onDeleteModeChange && (
          <button
            onClick={() => onDeleteModeChange(!deleteMode)}
            className={cn(
              'p-2 rounded-md transition-colors active:scale-95',
              deleteMode ? 'bg-destructive text-destructive-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
            )}
            aria-label="Toggle delete mode"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}

        {deleteMode && selectedCount > 0 && onDeleteSelected && (
          <button
            onClick={onDeleteSelected}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-destructive text-destructive-foreground text-xs font-medium active:scale-95"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {selectedCount}
          </button>
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
          <span className="hidden sm:inline">Reindex</span>
        </button>

        <button
          onClick={() => onViewModeChange('stats')}
          className={cn(
            'p-2 rounded-md transition-colors active:scale-95',
            viewMode === 'stats'
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
          )}
          aria-label="Stats"
        >
          <BarChart3 className="h-4 w-4" />
        </button>

        <div className="hidden lg:flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
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
          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors active:scale-95"
          aria-label="Toggle theme"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
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
