import { Camera, PanelLeft, LayoutGrid, Map, Loader2, Trash2, ImageIcon, Film, Pencil, FolderHeart, Clock, FolderPlus, Settings } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchIndexStatus, fetchAlbums, addPhotosToAlbum, createAlbum, type Album } from '@/lib/api-client';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export type ViewMode = 'grid' | 'map' | 'stats' | 'trash' | 'cleanup' | 'albums' | 'recent' | 'settings';

interface AppHeaderProps {
  onToggleSidebar: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  typeFilter?: string | null;
  onTypeFilterChange?: (type: string | null) => void;
  deleteMode?: boolean;
  onDeleteModeChange?: (on: boolean) => void;
  selectedCount?: number;
  selectedIds?: Set<string>;
  onDeleteSelected?: () => void;
  onReindexComplete?: () => void;
  onAddToAlbumComplete?: () => void;
}

const views: { mode: ViewMode; icon: typeof LayoutGrid; label: string }[] = [
  { mode: 'grid', icon: LayoutGrid, label: 'Grid view' },
  { mode: 'map', icon: Map, label: 'Map view' },
  { mode: 'albums', icon: FolderHeart, label: 'Albums' },
  { mode: 'recent', icon: Clock, label: 'Recent' },
  { mode: 'settings', icon: Settings, label: 'Settings' },
];


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
function AddToAlbumButton({ selectedIds, onComplete }: { selectedIds?: Set<string>; onComplete?: () => void }) {
  const [open, setOpen] = useState(false);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      fetchAlbums().then(res => setAlbums(res.items)).finally(() => setLoading(false));
    }
  }, [open]);

  const handleAdd = async (albumId: string, albumName: string) => {
    if (!selectedIds?.size) return;
    try {
      await addPhotosToAlbum(albumId, Array.from(selectedIds));
      toast.success(`Added ${selectedIds.size} photo(s) to "${albumName}"`);
      setOpen(false);
      onComplete?.();
    } catch { toast.error('Failed to add to album'); }
  };

  const handleCreateAndAdd = async () => {
    if (!newName.trim() || !selectedIds?.size) return;
    setCreating(true);
    try {
      const res = await createAlbum(newName.trim());
      await addPhotosToAlbum(res.id, Array.from(selectedIds));
      toast.success(`Created "${newName.trim()}" and added ${selectedIds.size} photo(s)`);
      setNewName('');
      setOpen(false);
      onComplete?.();
    } catch { toast.error('Failed to create album'); }
    finally { setCreating(false); }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium active:scale-95">
          <FolderPlus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Album</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <p className="text-xs font-medium text-foreground px-2 py-1">Add to album</p>
        {loading ? (
          <div className="flex justify-center py-3">
            <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/20 border-t-primary animate-spin" />
          </div>
        ) : (
          <div className="max-h-40 overflow-y-auto scrollbar-thin">
            {albums.map(album => (
              <button
                key={album.id}
                onClick={() => handleAdd(album.id, album.name)}
                className="w-full text-left px-2 py-1.5 rounded-md text-xs hover:bg-secondary transition-colors flex items-center justify-between"
              >
                <span className="truncate text-foreground">{album.name}</span>
                <span className="text-[10px] text-muted-foreground ml-2">{album.photoCount}</span>
              </button>
            ))}
            {albums.length === 0 && (
              <p className="text-[10px] text-muted-foreground px-2 py-1">No albums yet</p>
            )}
          </div>
        )}
        <div className="border-t border-border mt-1 pt-1.5 flex gap-1">
          <Input
            placeholder="New album…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateAndAdd()}
            className="h-7 text-xs"
          />
          <Button size="sm" className="h-7 px-2 text-xs" onClick={handleCreateAndAdd} disabled={!newName.trim() || creating}>
            +
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function AppHeader({ onToggleSidebar, viewMode, onViewModeChange, typeFilter, onTypeFilterChange, deleteMode, onDeleteModeChange, selectedCount = 0, selectedIds, onDeleteSelected, onReindexComplete, onAddToAlbumComplete }: AppHeaderProps) {
  const { status: indexStatus } = useIndexStatus();
  const isMobile = useIsMobile();
  const wasRunningRef = useRef(false);

  useEffect(() => {
    if (wasRunningRef.current && !indexStatus.running) {
      onReindexComplete?.();
    }
    wasRunningRef.current = indexStatus.running;
  }, [indexStatus.running, onReindexComplete]);

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
          <>
            <button
              onClick={onDeleteSelected}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-destructive text-destructive-foreground text-xs font-medium active:scale-95"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {selectedCount}
            </button>
            <AddToAlbumButton selectedIds={selectedIds} onComplete={onAddToAlbumComplete} />
          </>
        )}

        <div className="flex-1" />

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

        {/* Settings shortcut on mobile */}
        {isMobile && (
          <button
            onClick={() => onViewModeChange('settings')}
            className={cn(
              'p-2 rounded-md transition-colors active:scale-95',
              viewMode === 'settings' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
            )}
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        )}
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
