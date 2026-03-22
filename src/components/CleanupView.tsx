import { useState, useEffect, useCallback, useMemo } from 'react';
import { Smartphone, Film, HardDrive, Images, Copy, Trash2, CheckSquare, Square, Loader2, Sparkles, ChevronDown, ChevronRight, EyeOff, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchCleanup, deletePhotos } from '@/lib/api-client';
import type { Photo } from '@/lib/mock-data';
import { toast } from 'sonner';

interface CleanupData {
  screenshots: Photo[];
  shortVideos: Photo[];
  largeVideos: Photo[];
  similarGroups: Photo[][];
  duplicateGroups: Photo[][];
  summary: {
    screenshotCount: number;
    screenshotSize: number;
    shortVideoCount: number;
    shortVideoSize: number;
    largeVideoCount: number;
    largeVideoSize: number;
    similarGroupCount: number;
    similarPhotoCount: number;
    duplicateGroupCount: number;
    duplicatePhotoCount: number;
    duplicateSize: number;
  };
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

interface CategorySectionProps {
  title: string;
  icon: React.ReactNode;
  count: number;
  size: number;
  photos: Photo[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onView: (photo: Photo) => void;
  badge?: string;
}

function CategorySection({ title, icon, count, size, photos, selected, onToggleSelect, onSelectAll, onClearAll, onView, badge }: CategorySectionProps) {
  const [expanded, setExpanded] = useState(false);
  const selectedInCategory = photos.filter(p => selected.has(p.id)).length;

  if (count === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-secondary/50 transition-colors"
      >
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{title}</span>
            {badge && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">{badge}</span>}
          </div>
          <p className="text-xs text-muted-foreground">{count} file{count !== 1 ? 's' : ''} · {formatSize(size)}</p>
        </div>
        {selectedInCategory > 0 && (
          <span className="text-xs font-medium text-destructive">{selectedInCategory} selected</span>
        )}
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="border-t border-border">
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
            <button
              onClick={onSelectAll}
              className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary transition-colors"
            >
              <CheckSquare className="h-3 w-3" /> Select all
            </button>
            {selectedInCategory > 0 && (
              <button
                onClick={onClearAll}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <Square className="h-3 w-3" /> Clear
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1 p-2">
            {photos.map((photo) => {
              const isSelected = selected.has(photo.id);
              return (
                <div
                  key={photo.id}
                  className={cn(
                    'relative rounded-md overflow-hidden border-2 transition-all cursor-pointer group',
                    isSelected ? 'border-destructive ring-1 ring-destructive/30' : 'border-transparent hover:border-muted-foreground/30'
                  )}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleSelect(photo.id); }}
                    className={cn(
                      'absolute top-1 left-1 z-10 w-5 h-5 rounded flex items-center justify-center transition-all',
                      isSelected ? 'bg-destructive text-destructive-foreground' : 'bg-black/50 text-white/70 opacity-0 group-hover:opacity-100'
                    )}
                  >
                    {isSelected ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />}
                  </button>
                  <div className="aspect-square" onClick={() => onView(photo)}>
                    <img
                      src={photo.thumbnailUrl || photo.fullUrl}
                      alt={photo.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      draggable={false}
                    />
                  </div>
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-1">
                    <p className="text-[9px] text-white/90 truncate">{photo.filename}</p>
                    <p className="text-[8px] text-white/60">{formatSize(photo.fileSize)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface SimilarGroupsSectionProps {
  groups: Photo[][];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onAutoSelect: () => void;
  onClearAll: () => void;
  onView: (photo: Photo) => void;
  summary: { similarGroupCount: number; similarPhotoCount: number };
  ignoredGroups: Set<string>;
  onIgnoreGroup: (key: string) => void;
  onResetIgnored: () => void;
}

function getGroupKey(group: Photo[]): string {
  return group.map(p => p.id).sort().join(',');
}

function SimilarGroupsSection({ groups, selected, onToggleSelect, onAutoSelect, onClearAll, onView, summary, ignoredGroups, onIgnoreGroup, onResetIgnored }: SimilarGroupsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleGroups = useMemo(() => groups.filter(g => !ignoredGroups.has(getGroupKey(g))), [groups, ignoredGroups]);
  const selectedCount = visibleGroups.flat().filter(p => selected.has(p.id)).length;
  const totalSize = visibleGroups.flat().reduce((acc, p) => acc + p.fileSize, 0);

  if (groups.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-secondary/50 transition-colors"
      >
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Images className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">Similar Photos</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">AI</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {visibleGroups.length} group{visibleGroups.length !== 1 ? 's' : ''} · {visibleGroups.flat().length} photos · {formatSize(totalSize)}
            {ignoredGroups.size > 0 && ` · ${ignoredGroups.size} ignored`}
          </p>
        </div>
        {selectedCount > 0 && (
          <span className="text-xs font-medium text-destructive">{selectedCount} selected</span>
        )}
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="border-t border-border">
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
            <button
              onClick={onAutoSelect}
              className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary transition-colors"
            >
              <CheckSquare className="h-3 w-3" /> Auto-select extras
            </button>
            {selectedCount > 0 && (
              <button
                onClick={onClearAll}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <Square className="h-3 w-3" /> Clear
              </button>
            )}
            {ignoredGroups.size > 0 && (
              <button
                onClick={onResetIgnored}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors ml-auto"
              >
                <Eye className="h-3 w-3" /> Show {ignoredGroups.size} ignored
              </button>
            )}
          </div>
          <div className="space-y-3 p-2">
            {visibleGroups.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">All similar groups have been ignored</p>
            ) : (
              visibleGroups.map((group, gi) => {
                const groupKey = getGroupKey(group);
                return (
                  <div key={gi} className="rounded-md border border-border/60 p-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] text-muted-foreground">
                        {group.length} photos taken within seconds · {group[0]?.createdAt?.slice(0, 10)}
                      </p>
                      <button
                        onClick={() => onIgnoreGroup(groupKey)}
                        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-2"
                        title="Ignore this group"
                      >
                        <EyeOff className="h-3 w-3" /> Ignore
                      </button>
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1">
                      {group.map((photo, idx) => {
                        const isSelected = selected.has(photo.id);
                        const isKeep = idx === 0;
                        return (
                          <div
                            key={photo.id}
                            className={cn(
                              'relative rounded-md overflow-hidden border-2 transition-all cursor-pointer group shrink-0 w-20 sm:w-24',
                              isSelected ? 'border-destructive ring-1 ring-destructive/30' : isKeep ? 'border-primary/40' : 'border-transparent hover:border-muted-foreground/30'
                            )}
                          >
                            <button
                              onClick={(e) => { e.stopPropagation(); onToggleSelect(photo.id); }}
                              className={cn(
                                'absolute top-1 left-1 z-10 w-4 h-4 rounded flex items-center justify-center transition-all',
                                isSelected ? 'bg-destructive text-destructive-foreground' : 'bg-black/50 text-white/70 opacity-0 group-hover:opacity-100'
                              )}
                            >
                              {isSelected ? <CheckSquare className="h-2.5 w-2.5" /> : <Square className="h-2.5 w-2.5" />}
                            </button>
                            {isKeep && (
                              <span className="absolute top-1 right-1 z-10 bg-primary text-primary-foreground text-[8px] font-semibold px-1 py-0.5 rounded">KEEP</span>
                            )}
                            <div className="aspect-square" onClick={() => onView(photo)}>
                              <img src={photo.thumbnailUrl || photo.fullUrl} alt={photo.filename} className="w-full h-full object-cover" loading="lazy" draggable={false} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CleanupView({ onSelect }: { onSelect: (photo: Photo) => void }) {
  const [data, setData] = useState<CleanupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [dupExpanded, setDupExpanded] = useState(false);

  const IGNORED_KEY = 'imgvault-ignored-similar-groups';
  const [ignoredGroups, setIgnoredGroups] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(IGNORED_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  const ignoreGroup = (key: string) => {
    setIgnoredGroups(prev => {
      const next = new Set(prev);
      next.add(key);
      localStorage.setItem(IGNORED_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const resetIgnored = () => {
    setIgnoredGroups(new Set());
    localStorage.removeItem(IGNORED_KEY);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchCleanup();
      setData(result);
    } catch (e) {
      console.error('Failed to load cleanup data:', e);
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

  const selectAll = (photos: Photo[]) => {
    setSelected(prev => {
      const next = new Set(prev);
      photos.forEach(p => next.add(p.id));
      return next;
    });
  };

  const clearAll = (photos: Photo[]) => {
    setSelected(prev => {
      const next = new Set(prev);
      photos.forEach(p => next.delete(p.id));
      return next;
    });
  };

  const autoSelectSimilar = () => {
    if (!data) return;
    setSelected(prev => {
      const next = new Set(prev);
      for (const group of data.similarGroups) {
        for (let i = 1; i < group.length; i++) {
          next.add(group[i].id);
        }
      }
      return next;
    });
  };

  const clearSimilar = () => {
    if (!data) return;
    const allSimilarIds = data.similarGroups.flat().map(p => p.id);
    setSelected(prev => {
      const next = new Set(prev);
      allSimilarIds.forEach(id => next.delete(id));
      return next;
    });
  };

  const autoSelectDuplicates = () => {
    if (!data) return;
    setSelected(prev => {
      const next = new Set(prev);
      for (const group of data.duplicateGroups) {
        for (let i = 1; i < group.length; i++) {
          next.add(group[i].id);
        }
      }
      return next;
    });
  };

  const clearDuplicates = () => {
    if (!data) return;
    const allDupIds = data.duplicateGroups.flat().map(p => p.id);
    setSelected(prev => {
      const next = new Set(prev);
      allDupIds.forEach(id => next.delete(id));
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0 || deleting) return;
    if (!confirm(`Delete ${selected.size} file(s)? They will be moved to trash.`)) return;
    setDeleting(true);
    try {
      await deletePhotos(Array.from(selected));
      toast.success(`${selected.size} file(s) moved to trash`);
      setSelected(new Set());
      await load();
    } catch {
      toast.error('Failed to delete files');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center fade-in">
          <div className="w-8 h-8 rounded-full border-2 border-muted-foreground/20 border-t-primary animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Analyzing your library...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Failed to load cleanup data</p>
      </div>
    );
  }

  const { summary } = data;
  const totalSavings = summary.screenshotSize + summary.shortVideoSize + summary.largeVideoSize + summary.duplicateSize;
  const totalItems = summary.screenshotCount + summary.shortVideoCount + summary.largeVideoCount + summary.similarPhotoCount + summary.duplicatePhotoCount;

  return (
    <div className="h-full flex flex-col">
      {/* Header summary */}
      <div className="shrink-0 flex flex-wrap items-center gap-3 pb-3 border-b border-border mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Smart Cleanup</h2>
            <p className="text-xs text-muted-foreground">
              Found {totalItems} items · up to {formatSize(totalSavings)} reclaimable
            </p>
          </div>
        </div>
        <div className="flex-1" />
        {selected.size > 0 && (
          <button
            onClick={handleDeleteSelected}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors active:scale-95 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete {selected.size} selected
          </button>
        )}
      </div>

      {/* Categories */}
      <div className="flex-1 overflow-y-auto scrollbar-thin space-y-3 pb-6">
        <CategorySection
          title="Screenshots"
          icon={<Smartphone className="h-5 w-5 text-primary" />}
          count={summary.screenshotCount}
          size={summary.screenshotSize}
          photos={data.screenshots}
          selected={selected}
          onToggleSelect={toggleSelect}
          onSelectAll={() => selectAll(data.screenshots)}
          onClearAll={() => clearAll(data.screenshots)}
          onView={onSelect}
        />

        <CategorySection
          title="Short Videos"
          icon={<Film className="h-5 w-5 text-primary" />}
          count={summary.shortVideoCount}
          size={summary.shortVideoSize}
          photos={data.shortVideos}
          selected={selected}
          onToggleSelect={toggleSelect}
          onSelectAll={() => selectAll(data.shortVideos)}
          onClearAll={() => clearAll(data.shortVideos)}
          onView={onSelect}
          badge="≤3s"
        />

        <CategorySection
          title="Large Videos"
          icon={<HardDrive className="h-5 w-5 text-primary" />}
          count={summary.largeVideoCount}
          size={summary.largeVideoSize}
          photos={data.largeVideos}
          selected={selected}
          onToggleSelect={toggleSelect}
          onSelectAll={() => selectAll(data.largeVideos)}
          onClearAll={() => clearAll(data.largeVideos)}
          onView={onSelect}
          badge=">100MB"
        />

        <SimilarGroupsSection
          groups={data.similarGroups}
          selected={selected}
          onToggleSelect={toggleSelect}
          onAutoSelect={autoSelectSimilar}
          onClearAll={clearSimilar}
          onView={onSelect}
          summary={summary}
          ignoredGroups={ignoredGroups}
          onIgnoreGroup={ignoreGroup}
          onResetIgnored={resetIgnored}
        />

        {/* Exact Duplicates */}
        {data.duplicateGroups.length > 0 && (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <button
              onClick={() => setDupExpanded(!dupExpanded)}
              className="w-full flex items-center gap-3 p-3 hover:bg-secondary/50 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Copy className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Exact Duplicates</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">All folders</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {summary.duplicateGroupCount} group{summary.duplicateGroupCount !== 1 ? 's' : ''} · {summary.duplicatePhotoCount} files · {formatSize(summary.duplicateSize)} wasted
                </p>
              </div>
              {data.duplicateGroups.flat().filter(p => selected.has(p.id)).length > 0 && (
                <span className="text-xs font-medium text-destructive">
                  {data.duplicateGroups.flat().filter(p => selected.has(p.id)).length} selected
                </span>
              )}
              {dupExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>

            {dupExpanded && (
              <div className="border-t border-border">
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
                  <button
                    onClick={autoSelectDuplicates}
                    className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary transition-colors"
                  >
                    <CheckSquare className="h-3 w-3" /> Auto-select duplicates
                  </button>
                  {data.duplicateGroups.flat().filter(p => selected.has(p.id)).length > 0 && (
                    <button
                      onClick={clearDuplicates}
                      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Square className="h-3 w-3" /> Clear
                    </button>
                  )}
                </div>
                <div className="space-y-3 p-2">
                  {data.duplicateGroups.map((group, gi) => (
                    <div key={gi} className="rounded-md border border-border/60 p-2">
                      <p className="text-[10px] text-muted-foreground mb-1.5">
                        {group.length} copies · {formatSize(group[0]?.fileSize || 0)} each
                      </p>
                      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1">
                        {group.map((photo, idx) => {
                          const isSelected = selected.has(photo.id);
                          const isKeep = idx === 0;
                          return (
                            <div
                              key={photo.id}
                              className={cn(
                                'relative rounded-md overflow-hidden border-2 transition-all cursor-pointer group shrink-0 w-24 sm:w-28',
                                isSelected ? 'border-destructive ring-1 ring-destructive/30' : isKeep ? 'border-primary/40' : 'border-transparent hover:border-muted-foreground/30'
                              )}
                            >
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleSelect(photo.id); }}
                                className={cn(
                                  'absolute top-1 left-1 z-10 w-4 h-4 rounded flex items-center justify-center transition-all',
                                  isSelected ? 'bg-destructive text-destructive-foreground' : 'bg-black/50 text-white/70 opacity-0 group-hover:opacity-100'
                                )}
                              >
                                {isSelected ? <CheckSquare className="h-2.5 w-2.5" /> : <Square className="h-2.5 w-2.5" />}
                              </button>
                              {isKeep && (
                                <span className="absolute top-1 right-1 z-10 bg-primary text-primary-foreground text-[8px] font-semibold px-1 py-0.5 rounded">KEEP</span>
                              )}
                              <div className="aspect-square" onClick={() => onSelect(photo)}>
                                <img src={photo.thumbnailUrl || photo.fullUrl} alt={photo.filename} className="w-full h-full object-cover" loading="lazy" draggable={false} />
                              </div>
                              <div className="p-1 bg-card">
                                <p className="text-[9px] text-foreground truncate">{photo.filename}</p>
                                <p className="text-[8px] text-muted-foreground truncate">{photo.folder}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {summary.screenshotCount === 0 && summary.shortVideoCount === 0 && summary.largeVideoCount === 0 && summary.similarGroupCount === 0 && summary.duplicateGroupCount === 0 && (
          <div className="flex items-center justify-center h-40">
            <div className="text-center">
              <Sparkles className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-foreground font-medium">Your library looks clean!</p>
              <p className="text-xs text-muted-foreground mt-1">No cleanup suggestions found</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
