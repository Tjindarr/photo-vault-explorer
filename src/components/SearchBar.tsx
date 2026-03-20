import { Search, X, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  resultCount: number;
}

const quickFilters = ['2024', '2023', 'Landscape', 'Portrait', 'Video', 'Tokyo', 'Barcelona'];

export default function SearchBar({ value, onChange, resultCount }: SearchBarProps) {
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
          placeholder="Search by name, location, date, camera..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="p-0.5 rounded hover:bg-secondary transition-colors active:scale-95"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">{resultCount} items</span>
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin pb-1">
        {quickFilters.map((filter) => (
          <button
            key={filter}
            onClick={() => onChange(value === filter ? '' : filter)}
            className={cn(
              'px-2.5 py-1 text-xs rounded-full border whitespace-nowrap transition-all duration-150 active:scale-95',
              value === filter
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-surface border-border text-muted-foreground hover:text-foreground hover:border-foreground/20',
            )}
          >
            {filter}
          </button>
        ))}
      </div>
    </div>
  );
}
