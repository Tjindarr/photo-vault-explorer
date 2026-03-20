import { Camera } from 'lucide-react';

export default function AppHeader() {
  return (
    <header className="h-12 shrink-0 border-b border-border bg-surface flex items-center px-4 gap-3">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
          <Camera className="h-4 w-4 text-primary-foreground" />
        </div>
        <h1 className="text-sm font-semibold text-foreground tracking-tight">SnapVault</h1>
      </div>
      <div className="flex-1" />
      <span className="text-xs text-muted-foreground">Read-only photo viewer</span>
    </header>
  );
}
