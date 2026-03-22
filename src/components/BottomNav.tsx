import { LayoutGrid, Map, Copy, Trash2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ViewMode } from '@/components/AppHeader';

interface BottomNavProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

const tabs: { mode: ViewMode; icon: typeof LayoutGrid; label: string }[] = [
  { mode: 'grid', icon: LayoutGrid, label: 'Library' },
  { mode: 'map', icon: Map, label: 'Map' },
  { mode: 'cleanup', icon: Sparkles, label: 'Cleanup' },
  { mode: 'duplicates', icon: Copy, label: 'Dupes' },
  { mode: 'trash', icon: Trash2, label: 'Trash' },
];

export default function BottomNav({ viewMode, onViewModeChange }: BottomNavProps) {
  return (
    <nav className="lg:hidden shrink-0 border-t border-border bg-surface/95 backdrop-blur-md pb-2">
      <div className="flex items-stretch">
        {tabs.map(({ mode, icon: Icon, label }) => {
          const active = viewMode === mode;
          return (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 transition-colors active:scale-95',
                active ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
