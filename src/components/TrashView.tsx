import { useState, useEffect, useCallback } from 'react';
import { Trash2, RotateCcw, CheckSquare, Square, Loader2, AlertTriangle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { fetchTrash, restoreFromTrash, emptyTrash } from '@/lib/api-client';
import { toast } from 'sonner';

interface TrashItem {
  id: string;
  filename: string;
  originalPath: string;
  folder: string;
  type: string;
  width: number;
  height: number;
  thumbnailUrl: string | null;
  fileSize: number;
  deletedAt: string;
  metadata: {
    dateTaken: string | null;
    location: string | null;
    camera: string | null;
  };
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function daysUntilPurge(deletedAt: string) {
  const deleted = new Date(deletedAt + 'Z');
  const purgeDate = new Date(deleted.getTime() + 30 * 24 * 60 * 60 * 1000);
  const now = new Date();
  const days = Math.max(0, Math.ceil((purgeDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  return days;
}

export default function TrashView() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchTrash();
      setItems(result.items);
    } catch (e) {
      console.error('Failed to load trash:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(items.map(i => i.id)));
  };

  const clearSelection = () => setSelected(new Set());

  const handleRestore = async () => {
    if (selected.size === 0 || processing) return;
    setProcessing(true);
    try {
      await restoreFromTrash(Array.from(selected));
      toast.success(`Restored ${selected.size} file(s)`);
      setSelected(new Set());
      await load();
    } catch (e) {
      toast.error('Failed to restore files');
    } finally {
      setProcessing(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (selected.size === 0 || processing) return;
    if (!confirm(`Permanently delete ${selected.size} file(s)? This cannot be undone!`)) return;
    setProcessing(true);
    try {
      await emptyTrash(Array.from(selected));
      toast.success(`Permanently deleted ${selected.size} file(s)`);
      setSelected(new Set());
      await load();
    } catch (e) {
      toast.error('Failed to delete files');
    } finally {
      setProcessing(false);
    }
  };

  const handleEmptyAll = async () => {
    if (items.length === 0 || processing) return;
    if (!confirm(`Permanently delete ALL ${items.length} file(s) in trash? This cannot be undone!`)) return;
    setProcessing(true);
    try {
      await emptyTrash();
      toast.success('Trash emptied');
      setSelected(new Set());
      await load();
    } catch (e) {
      toast.error('Failed to empty trash');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center fade-in">
          <div className="w-8 h-8 rounded-full border-2 border-muted-foreground/20 border-t-primary animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading trash...</p>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center fade-in">
          <Trash2 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-foreground font-medium">Trash is empty</p>
          <p className="text-sm text-muted-foreground mt-1">Deleted files will appear here for 30 days.</p>
        </div>
      </div>
    );
  }

  const totalSize = items.reduce((acc, i) => acc + i.fileSize, 0);

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 pb-3 border-b border-border mb-3">
        <div className="flex items-center gap-2 text-sm">
          <Trash2 className="h-4 w-4 text-destructive" />
          <span className="font-medium text-foreground">
            {items.length} item{items.length !== 1 ? 's' : ''} in trash
          </span>
          <span className="text-muted-foreground">
            · {formatFileSize(totalSize)}
          </span>
        </div>
        <div className="flex-1" />
        <button
          onClick={selectAll}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium bg-surface text-foreground hover:bg-secondary transition-colors active:scale-95"
        >
          <CheckSquare className="h-3.5 w-3.5" />
          Select all
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
            <Button
              variant="outline"
              size="sm"
              onClick={handleRestore}
              disabled={processing}
              className="gap-1.5"
            >
              {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Restore {selected.size}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handlePermanentDelete}
              disabled={processing}
              className="gap-1.5"
            >
              {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete permanently
            </Button>
          </>
        )}
        <Button
          variant="destructive"
          size="sm"
          onClick={handleEmptyAll}
          disabled={processing}
          className="gap-1.5"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Empty trash
        </Button>
      </div>

      {/* Info */}
      <div className="shrink-0 flex items-start gap-2 rounded-lg bg-muted/50 border border-border p-3 mb-3 text-xs text-foreground">
        <Clock className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
        <span>
          Files in trash are automatically <strong>permanently deleted after 30 days</strong>.
          You can restore them or manually empty the trash at any time.
        </span>
      </div>

      {/* Items grid */}
      <div className="flex-1 overflow-y-auto scrollbar-thin pb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {items.map((item) => {
            const isSelected = selected.has(item.id);
            const daysLeft = daysUntilPurge(item.deletedAt);
            return (
              <div
                key={item.id}
                onClick={() => toggleSelect(item.id)}
                className={cn(
                  'relative rounded-md overflow-hidden border-2 transition-all cursor-pointer group',
                  isSelected
                    ? 'border-primary ring-1 ring-primary/30'
                    : 'border-transparent hover:border-muted-foreground/30'
                )}
              >
                {/* Select checkbox */}
                <div
                  className={cn(
                    'absolute top-1.5 left-1.5 z-10 w-5 h-5 rounded flex items-center justify-center transition-all',
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-black/50 text-white/70 opacity-0 group-hover:opacity-100'
                  )}
                >
                  {isSelected ? (
                    <CheckSquare className="h-3.5 w-3.5" />
                  ) : (
                    <Square className="h-3.5 w-3.5" />
                  )}
                </div>

                {/* Days left badge */}
                <span className={cn(
                  "absolute top-1.5 right-1.5 z-10 text-[10px] font-semibold px-1.5 py-0.5 rounded",
                  daysLeft <= 3
                    ? "bg-destructive text-destructive-foreground"
                    : daysLeft <= 7
                    ? "bg-orange-500 text-white"
                    : "bg-black/50 text-white"
                )}>
                  {daysLeft}d left
                </span>

                {/* Thumbnail */}
                <div className="aspect-square bg-muted">
                  {item.thumbnailUrl ? (
                    <img
                      src={item.thumbnailUrl}
                      alt={item.filename}
                      className="w-full h-full object-cover opacity-60"
                      loading="lazy"
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Trash2 className="h-6 w-6 text-muted-foreground/40" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-1.5 bg-card">
                  <p className="text-[11px] text-foreground font-medium truncate">{item.filename}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {formatFileSize(item.fileSize)} · {item.folder}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
