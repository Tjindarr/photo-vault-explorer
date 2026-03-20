import { useState } from 'react';
import { ChevronRight, Folder as FolderIcon, Image } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Folder } from '@/lib/mock-data';

interface FolderSidebarProps {
  folders: Folder[];
  selectedFolder: string | null;
  onSelectFolder: (path: string | null) => void;
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
      <button
        onClick={() => {
          onSelectFolder(isSelected ? null : folder.path);
          if (hasChildren) setExpanded(!expanded);
        }}
        className={cn(
          'flex items-center w-full gap-2 px-3 py-1.5 text-sm rounded-md transition-colors duration-150',
          'hover:bg-secondary/80 active:scale-[0.98]',
          isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground/70',
        )}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
      >
        {hasChildren ? (
          <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-200', expanded && 'rotate-90')} />
        ) : (
          <span className="w-3.5" />
        )}
        <FolderIcon className="h-4 w-4 shrink-0 text-accent" />
        <span className="truncate">{folder.name}</span>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{folder.photoCount}</span>
      </button>
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

export default function FolderSidebar({ folders, selectedFolder, onSelectFolder }: FolderSidebarProps) {
  const totalPhotos = folders.reduce((sum, f) => sum + f.photoCount, 0);

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-surface h-full overflow-y-auto scrollbar-thin">
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
    </aside>
  );
}
