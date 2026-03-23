import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, ArrowLeft, ImageIcon, Pencil, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fetchAlbums, createAlbum, deleteAlbum, updateAlbum, fetchAlbumPhotos,
  addPhotosToAlbum, removePhotosFromAlbum,
  type Album,
} from '@/lib/api-client';
import { type Photo } from '@/lib/mock-data';
import { toast } from 'sonner';
import PhotoGrid from './PhotoGrid';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface AlbumsViewProps {
  onSelectPhoto?: (photo: Photo) => void;
  addingPhotoIds?: string[];
  onAddComplete?: () => void;
}

export default function AlbumsView({ onSelectPhoto, addingPhotoIds, onAddComplete }: AlbumsViewProps) {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [albumPhotos, setAlbumPhotos] = useState<Photo[]>([]);
  const [albumTotal, setAlbumTotal] = useState(0);
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editAlbum, setEditAlbum] = useState<Album | null>(null);

  // Cover selection mode
  const [selectingCover, setSelectingCover] = useState(false);

  const loadAlbums = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAlbums();
      setAlbums(res.items);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAlbums(); }, [loadAlbums]);

  const openAlbum = useCallback(async (album: Album) => {
    setSelectedAlbum(album);
    setLoadingPhotos(true);
    try {
      const res = await fetchAlbumPhotos(album.id);
      setAlbumPhotos(res.items);
      setAlbumTotal(res.total);
    } catch { toast.error('Failed to load album photos'); }
    finally { setLoadingPhotos(false); }
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createAlbum(newName.trim(), newDesc.trim());
      setNewName('');
      setNewDesc('');
      setCreateOpen(false);
      toast.success('Album created');
      loadAlbums();
    } catch { toast.error('Failed to create album'); }
  };

  const handleDelete = async (album: Album) => {
    if (!confirm(`Delete album "${album.name}"? Photos won't be affected.`)) return;
    try {
      await deleteAlbum(album.id);
      toast.success('Album deleted');
      if (selectedAlbum?.id === album.id) setSelectedAlbum(null);
      loadAlbums();
    } catch { toast.error('Failed to delete album'); }
  };

  const handleEdit = (album: Album) => {
    setEditAlbum(album);
    setEditName(album.name);
    setEditDesc(album.description || '');
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editAlbum || !editName.trim()) return;
    try {
      await updateAlbum(editAlbum.id, editName.trim(), editDesc.trim());
      toast.success('Album updated');
      setEditOpen(false);
      setEditAlbum(null);
      loadAlbums();
      // Update selectedAlbum if we're viewing it
      if (selectedAlbum?.id === editAlbum.id) {
        setSelectedAlbum({ ...selectedAlbum, name: editName.trim(), description: editDesc.trim() });
      }
    } catch { toast.error('Failed to update album'); }
  };

  const handleSetCover = async (photo: Photo) => {
    if (!selectedAlbum) return;
    try {
      await updateAlbum(selectedAlbum.id, selectedAlbum.name, selectedAlbum.description || '', photo.id);
      toast.success('Cover photo set');
      setSelectingCover(false);
      loadAlbums();
    } catch { toast.error('Failed to set cover'); }
  };

  const handleAddToAlbum = async (album: Album) => {
    if (!addingPhotoIds?.length) return;
    try {
      await addPhotosToAlbum(album.id, addingPhotoIds);
      toast.success(`Added ${addingPhotoIds.length} photo(s) to "${album.name}"`);
      onAddComplete?.();
      loadAlbums();
    } catch { toast.error('Failed to add to album'); }
  };

  const handleRemoveFromAlbum = async (photoId: string) => {
    if (!selectedAlbum) return;
    try {
      await removePhotosFromAlbum(selectedAlbum.id, [photoId]);
      setAlbumPhotos(prev => prev.filter(p => p.id !== photoId));
      setAlbumTotal(prev => prev - 1);
      toast.success('Removed from album');
      loadAlbums();
    } catch { toast.error('Failed to remove'); }
  };

  // Album detail view
  if (selectedAlbum) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-3 sm:px-5 py-3 border-b border-border">
          <button onClick={() => { setSelectedAlbum(null); setSelectingCover(false); }} className="p-1.5 rounded-md hover:bg-secondary transition-colors">
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-foreground truncate">{selectedAlbum.name}</h2>
            {selectedAlbum.description && (
              <p className="text-[10px] text-muted-foreground truncate">{selectedAlbum.description}</p>
            )}
            <p className="text-xs text-muted-foreground">{albumTotal} photos</p>
          </div>
          <div className="flex items-center gap-1">
            {selectingCover ? (
              <Button size="sm" variant="outline" onClick={() => setSelectingCover(false)}>
                Cancel
              </Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={() => setSelectingCover(true)} title="Set cover photo">
                  <ImageIcon className="h-3.5 w-3.5 mr-1" /> Cover
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleEdit(selectedAlbum)} title="Edit album">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>

        {selectingCover && (
          <div className="px-3 sm:px-5 py-2 bg-primary/5 border-b border-primary/20">
            <p className="text-xs text-primary font-medium">Click a photo to set it as the album cover</p>
          </div>
        )}

        <div className="flex-1 min-h-0 px-3 sm:px-5">
          {loadingPhotos ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 rounded-full border-2 border-muted-foreground/20 border-t-primary animate-spin" />
            </div>
          ) : albumPhotos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <ImageIcon className="h-10 w-10 opacity-40" />
              <p className="text-sm">No photos in this album yet</p>
            </div>
          ) : (
            <PhotoGrid
              photos={albumPhotos}
              onSelect={selectingCover ? handleSetCover : onSelectPhoto}
              hasMore={false}
              loadingMore={false}
              onLoadMore={() => {}}
              deleteMode={false}
              selectedIds={new Set()}
              onToggleSelect={() => {}}
            />
          )}
        </div>

        {/* Edit dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Edit Album</DialogTitle>
              <DialogDescription>Update the album name and description.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="Album name"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                autoFocus
              />
              <Textarea
                placeholder="Description (optional)"
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveEdit} disabled={!editName.trim()}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Album list
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 sm:px-5 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Albums</h2>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New Album
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 sm:p-5">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-muted-foreground/20 border-t-primary animate-spin" />
          </div>
        ) : albums.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <ImageIcon className="h-10 w-10 opacity-40" />
            <p className="text-sm">No albums yet</p>
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Create one
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {albums.map(album => (
              <div
                key={album.id}
                className={cn(
                  'group relative rounded-xl overflow-hidden border border-border bg-surface',
                  'hover:border-primary/50 transition-all text-left',
                  addingPhotoIds?.length && 'ring-2 ring-primary/20 hover:ring-primary/50'
                )}
              >
                <button
                  onClick={() => addingPhotoIds?.length ? handleAddToAlbum(album) : openAlbum(album)}
                  className="w-full text-left"
                >
                  <div className="aspect-square bg-muted flex items-center justify-center">
                    {album.coverUrl ? (
                      <img src={album.coverUrl} alt={album.name} className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-medium text-foreground truncate">{album.name}</p>
                    {album.description && (
                      <p className="text-[10px] text-muted-foreground truncate">{album.description}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground">{album.photoCount} photos</p>
                  </div>
                </button>
                {!addingPhotoIds?.length && (
                  <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEdit(album); }}
                      className="p-1 rounded-md bg-background/80 text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(album); }}
                      className="p-1 rounded-md bg-background/80 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Album</DialogTitle>
            <DialogDescription>Create a new album to organize your photos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Album name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <Textarea
              placeholder="Description (optional)"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog (from album list) */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Album</DialogTitle>
            <DialogDescription>Update the album name and description.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Album name"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
              autoFocus
            />
            <Textarea
              placeholder="Description (optional)"
              value={editDesc}
              onChange={e => setEditDesc(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={!editName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}