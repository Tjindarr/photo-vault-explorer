import { Camera, PanelLeft } from 'lucide-react';

interface AppHeaderProps {
  onToggleSidebar: () => void;
}

export default function AppHeader({ onToggleSidebar }: AppHeaderProps) {
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
      <span className="text-xs text-muted-foreground hidden sm:block">Read-only photo viewer</span>
    </header>
  );
}
