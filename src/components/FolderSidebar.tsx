import { useState, useEffect } from 'react';
import { ChevronRight, Folder as FolderIcon, Image, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Folder } from '@/lib/mock-data';

interface FolderSidebarProps {
  folders: Folder[];
  selectedFolder: string | null;
  onSelectFolder: (path: string | null) => void;
  open: boolean;
  onClose: () => void;
}

function FolderNode({ folder, depth, selectedFolder, onSelectFolder }: {
  folder: Folder;
  depth: number;
  selectedFolder: string | null;
  onSelectFolder: (path: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const hasChildren = folder.children.length > 0;
  const isSelected = selectedFolder === folder.path;

  return (
    <div>
      <div
        className={cn(
          'flex items-center w-full gap-1 px-3 py-1.5 text-sm rounded-md transition-colors duration-150',
          'hover:bg-secondary/80',
          isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground/70',
        )}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="p-1 -ml-1 rounded hover:bg-secondary active:scale-95 shrink-0"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <ChevronRight className={cn('h-3.5 w-3.5 transition-transform duration-200', expanded && 'rotate-90')} />
          </button>
        ) : (
          <span className="w-5" />
        )}
        <button
          onClick={() => onSelectFolder(isSelected ? null : folder.path)}
          className="flex items-center gap-2 flex-1 min-w-0 py-0.5 active:scale-[0.98]"
        >
          <FolderIcon className="h-4 w-4 shrink-0 text-accent" />
          <span className="truncate">{folder.name}</span>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">{folder.photoCount}</span>
        </button>
      </div>
      {expanded && hasChildren && (
        <div>
          {folder.children.map((child) => (
            <FolderNode
              key={child.path}
              folder={child}
              depth={depth + 1}
              selectedFolder={selectedFolder}
              onSelectFolder={onSelectFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarContent({ folders, selectedFolder, onSelectFolder }: Omit<FolderSidebarProps, 'open' | 'onClose'>) {
  const totalPhotos = folders.reduce((sum, f) => sum + f.photoCount, 0);

  return (
    <>
      <div className="p-4 pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Library</h2>
        <button
          onClick={() => onSelectFolder(null)}
          className={cn(
            'flex items-center w-full gap-2 px-3 py-1.5 text-sm rounded-md transition-colors duration-150',
            'hover:bg-secondary/80 active:scale-[0.98]',
            selectedFolder === null ? 'bg-primary/10 text-primary font-medium' : 'text-foreground/70',
          )}
        >
          <Image className="h-4 w-4 shrink-0" />
          <span>All Photos</span>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">{totalPhotos}</span>
        </button>
      </div>
      <div className="px-4 pt-2 pb-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Folders</h2>
      </div>
      <div className="px-2 pb-4">
        {folders.map((folder) => (
          <FolderNode
            key={folder.path}
            folder={folder}
            depth={0}
            selectedFolder={selectedFolder}
            onSelectFolder={onSelectFolder}
          />
        ))}
      </div>
    </>
  );
}

export default function FolderSidebar({ folders, selectedFolder, onSelectFolder, open, onClose }: FolderSidebarProps) {
  // Close on escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  return (
    <>
      {/* Desktop sidebar — always visible on lg+ */}
      <aside className="hidden lg:block w-56 shrink-0 border-r border-border bg-surface h-full overflow-y-auto scrollbar-thin">
        <SidebarContent folders={folders} selectedFolder={selectedFolder} onSelectFolder={onSelectFolder} />
      </aside>

      {/* Mobile overlay sidebar */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-overlay/50 backdrop-blur-sm lg:hidden fade-in"
            onClick={onClose}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-surface border-r border-border overflow-y-auto scrollbar-thin lg:hidden shadow-xl animate-slide-in-left">
            <div className="flex items-center justify-between p-3 border-b border-border">
              <span className="text-sm font-semibold text-foreground">Folders</span>
              <button
                onClick={onClose}
                className="p-1 rounded-md hover:bg-secondary transition-colors active:scale-95"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <SidebarContent
              folders={folders}
              selectedFolder={selectedFolder}
              onSelectFolder={(path) => {
                onSelectFolder(path);
                onClose();
              }}
            />
          </aside>
        </>
      )}
    </>
  );
}
