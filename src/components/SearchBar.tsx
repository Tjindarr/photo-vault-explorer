import { Search, X, ImageIcon, Film } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  resultCount: number;
  typeFilter?: string | null;
  onTypeFilterChange?: (type: string | null) => void;
}

export default function SearchBar({ value, onChange, resultCount, typeFilter, onTypeFilterChange }: SearchBarProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="space-y-2">
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200',
          'bg-surface',
          focused ? 'border-primary/40 shadow-[0_0_0_3px_hsl(var(--primary)/0.08)]' : 'border-border',
        )}
      >
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search by name, location, date..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 min-w-0"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="p-1 rounded hover:bg-secondary transition-colors active:scale-95"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
        <span className="text-xs text-muted-foreground tabular-nums shrink-0 hidden sm:inline">{resultCount.toLocaleString()} items</span>
      </div>

      {/* Type filter chips */}
      {onTypeFilterChange && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onTypeFilterChange(null)}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-95',
              !typeFilter
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            All
          </button>
          <button
            onClick={() => onTypeFilterChange(typeFilter === 'image' ? null : 'image')}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-95',
              typeFilter === 'image'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            <ImageIcon className="h-3 w-3" />
            Photos
          </button>
          <button
            onClick={() => onTypeFilterChange(typeFilter === 'video' ? null : 'video')}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-95',
              typeFilter === 'video'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            <Film className="h-3 w-3" />
            Videos
          </button>
          <span className="text-xs text-muted-foreground tabular-nums sm:hidden ml-auto">{resultCount.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
