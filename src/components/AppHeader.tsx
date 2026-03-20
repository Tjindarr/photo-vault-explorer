import { Camera, PanelLeft, LayoutGrid, Map, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewMode = 'grid' | 'map' | 'stats';

interface AppHeaderProps {
  onToggleSidebar: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

const views: { mode: ViewMode; icon: typeof LayoutGrid; label: string }[] = [
  { mode: 'grid', icon: LayoutGrid, label: 'Grid view' },
  { mode: 'map', icon: Map, label: 'Map view' },
  { mode: 'stats', icon: BarChart3, label: 'Stats' },
];

export default function AppHeader({ onToggleSidebar, viewMode, onViewModeChange }: AppHeaderProps) {
  return (
    <header className="h-12 shrink-0 border-b border-border bg-surface flex items-center px-3 sm:px-4 gap-2 sm:gap-3">
      <button
        onClick={onToggleSidebar}
        className="p-1.5 rounded-md hover:bg-secondary transition-colors active:scale-95 lg:hidden"
        aria-label="Toggle folders"
      >
        <PanelLeft className="h-4.5 w-4.5 text-muted-foreground" />
      </button>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
          <Camera className="h-4 w-4 text-primary-foreground" />
        </div>
        <h1 className="text-sm font-semibold text-foreground tracking-tight">SnapVault</h1>
      </div>

      <div className="flex-1" />

      <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
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

      <span className="text-xs text-muted-foreground hidden sm:block">Read-only viewer</span>
    </header>
  );
}
