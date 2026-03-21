import { useState, useEffect, useCallback } from 'react';
import { Copy, Trash2, CheckSquare, Square, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchDuplicates, deletePhotos } from '@/lib/api-client';
import type { Photo } from '@/lib/mock-data';

interface DuplicateGroup {
  hash: string;
  photos: (Photo & { fileHash?: string })[];
}

interface DuplicatesData {
  groups: DuplicateGroup[];
  totalGroups: number;
  totalDuplicates: number;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DuplicatesView({ onSelect }: { onSelect: (photo: Photo) => void }) {
  const [data, setData] = useState<DuplicatesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchDuplicates();
      setData(result);
    } catch (e) {
      console.error('Failed to load duplicates:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const autoSelectDuplicates = () => {
    if (!data) return;
    const toSelect = new Set<string>();
    for (const group of data.groups) {
      // Keep the first (newest by date), select the rest for deletion
      for (let i = 1; i < group.photos.length; i++) {
        toSelect.add(group.photos[i].id);
      }
    }
    setSelected(toSelect);
  };

  const clearSelection = () => setSelected(new Set());

  const handleDeleteSelected = async () => {
    if (selected.size === 0 || deleting) return;
    const confirmMsg = `Are you sure you want to delete ${selected.size} duplicate photo(s)? This removes them from the database only — original files on disk are NOT deleted.`;
    if (!confirm(confirmMsg)) return;

    setDeleting(true);
    try {
      await deletePhotos(Array.from(selected));
      setSelected(new Set());
      await load();
    } catch (e) {
      console.error('Failed to delete:', e);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center fade-in">
          <div className="w-8 h-8 rounded-full border-2 border-muted-foreground/20 border-t-primary animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Scanning for duplicates...</p>
        </div>
      </div>
    );
  }

  if (!data || data.groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center fade-in">
          <Copy className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-foreground font-medium">No duplicates found</p>
          <p className="text-sm text-muted-foreground mt-1">Your library looks clean!</p>
        </div>
      </div>
    );
  }

  const totalWastedSize = data.groups.reduce((acc, g) => {
    const sizes = g.photos.map(p => p.fileSize);
    return acc + sizes.slice(1).reduce((a, b) => a + b, 0);
  }, 0);

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 pb-3 border-b border-border mb-3">
        <div className="flex items-center gap-2 text-sm">
          <Copy className="h-4 w-4 text-primary" />
          <span className="font-medium text-foreground">
            {data.totalGroups} duplicate group{data.totalGroups !== 1 ? 's' : ''}
          </span>
          <span className="text-muted-foreground">
            · {data.totalDuplicates} extra file{data.totalDuplicates !== 1 ? 's' : ''} · {formatFileSize(totalWastedSize)} wasted
          </span>
        </div>
        <div className="flex-1" />
        <button
          onClick={autoSelectDuplicates}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium bg-surface text-foreground hover:bg-secondary transition-colors active:scale-95"
        >
          <CheckSquare className="h-3.5 w-3.5" />
          Auto-select duplicates
        </button>
        {selected.size > 0 && (
          <>
            <button
              onClick={clearSelection}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium bg-surface text-foreground hover:bg-secondary transition-colors active:scale-95"
            >
              <Square className="h-3.5 w-3.5" />
              Clear ({selected.size})
            </button>
            <button
              onClick={handleDeleteSelected}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors active:scale-95 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete {selected.size} selected
            </button>
          </>
        )}
      </div>

      {/* Warning */}
      <div className="shrink-0 flex items-start gap-2 rounded-lg bg-accent/10 border border-accent/20 p-3 mb-3 text-xs text-accent-foreground">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-accent" />
        <span>
          Deleting removes entries from the ImgVault database and cached files only. Original files on disk are <strong>not deleted</strong>.
          Use "Auto-select duplicates" to mark extras (keeps the newest in each group).
        </span>
      </div>

      {/* Groups */}
      <div className="flex-1 overflow-y-auto scrollbar-thin space-y-4 pb-6">
        {data.groups.map((group) => (
          <div key={group.hash} className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground mb-2 font-mono truncate">
              Hash: {group.hash} · {group.photos.length} copies
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {group.photos.map((photo, idx) => {
                const isSelected = selected.has(photo.id);
                const isOriginal = idx === 0;
                return (
                  <div
                    key={photo.id}
                    className={cn(
                      'relative rounded-md overflow-hidden border-2 transition-all cursor-pointer group',
                      isSelected
                        ? 'border-destructive ring-1 ring-destructive/30'
                        : isOriginal
                        ? 'border-primary/40'
                        : 'border-transparent hover:border-muted-foreground/30'
                    )}
                  >
                    {/* Select checkbox */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleSelect(photo.id); }}
                      className={cn(
                        'absolute top-1.5 left-1.5 z-10 w-5 h-5 rounded flex items-center justify-center transition-all',
                        isSelected
                          ? 'bg-destructive text-destructive-foreground'
                          : 'bg-black/50 text-white/70 opacity-0 group-hover:opacity-100'
                      )}
                    >
                      {isSelected ? (
                        <CheckSquare className="h-3.5 w-3.5" />
                      ) : (
                        <Square className="h-3.5 w-3.5" />
                      )}
                    </button>

                    {/* Keep badge */}
                    {isOriginal && (
                      <span className="absolute top-1.5 right-1.5 z-10 bg-primary text-primary-foreground text-[10px] font-semibold px-1.5 py-0.5 rounded">
                        KEEP
                      </span>
                    )}

                    {/* Thumbnail */}
                    <div
                      className="aspect-square"
                      onClick={() => onSelect(photo)}
                    >
                      <img
                        src={photo.thumbnailUrl || photo.fullUrl}
                        alt={photo.filename}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        draggable={false}
                      />
                    </div>

                    {/* Info */}
                    <div className="p-1.5 bg-card">
                      <p className="text-[11px] text-foreground font-medium truncate">{photo.filename}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {formatFileSize(photo.fileSize)} · {photo.folder}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
