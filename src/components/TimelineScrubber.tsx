import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { Photo } from '@/lib/mock-data';

interface TimelineScrubberProps {
  photos: Photo[];
  onScrollToDate: (label: string) => void;
}

interface YearGroup {
  year: string;
  months: { month: string; label: string; count: number }[];
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function TimelineScrubber({ photos, onScrollToDate }: TimelineScrubberProps) {
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const scrubberRef = useRef<HTMLDivElement>(null);

  const yearGroups = useMemo(() => {
    const map = new Map<string, Map<number, number>>();
    let minYear = Infinity, maxYear = -Infinity;
    for (const p of photos) {
      const d = p.metadata.dateTaken ? new Date(p.metadata.dateTaken) : null;
      if (!d) continue;
      const year = d.getFullYear();
      if (year < minYear) minYear = year;
      if (year > maxYear) maxYear = year;
      const ys = year.toString();
      if (!map.has(ys)) map.set(ys, new Map());
      const monthMap = map.get(ys)!;
      const m = d.getMonth();
      monthMap.set(m, (monthMap.get(m) || 0) + 1);
    }

    if (minYear === Infinity) return [];

    const groups: YearGroup[] = [];
    for (let y = maxYear; y >= minYear; y--) {
      const ys = y.toString();
      const monthMap = map.get(ys);
      const months = monthMap
        ? Array.from(monthMap.entries())
            .sort((a, b) => b[0] - a[0])
            .map(([m, count]) => {
              const date = new Date(y, m, 1);
              const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
              return { month: MONTH_NAMES[m], label, count };
            })
        : [];
      groups.push({ year: ys, months });
    }
    return groups;
  }, [photos]);

  // All labels in order for drag scrubbing
  const allLabels = useMemo(() => {
    const labels: string[] = [];
    for (const g of yearGroups) {
      for (const m of g.months) labels.push(m.label);
    }
    return labels;
  }, [yearGroups]);

  const getLabelAtY = useCallback((clientY: number) => {
    if (!scrubberRef.current || allLabels.length === 0) return null;
    const rect = scrubberRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const idx = Math.round(ratio * (allLabels.length - 1));
    return allLabels[idx];
  }, [allLabels]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const label = getLabelAtY(e.clientY);
    if (label) {
      setHoveredLabel(label);
      onScrollToDate(label);
    }
  }, [getLabelAtY, onScrollToDate]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const label = getLabelAtY(e.clientY);
    if (label && label !== hoveredLabel) {
      setHoveredLabel(label);
      onScrollToDate(label);
    }
  }, [isDragging, getLabelAtY, hoveredLabel, onScrollToDate]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    setTimeout(() => setHoveredLabel(null), 1000);
  }, []);

  if (yearGroups.length === 0) return null;

  // Compact mode: only show years if many entries
  const totalMonths = allLabels.length;
  const compact = totalMonths > 24;

  return (
    <div
      ref={scrubberRef}
      className={cn(
        "absolute right-0 top-0 bottom-0 z-20 flex flex-col items-center justify-between",
        "select-none touch-none py-3",
        "w-12 sm:w-14",
        "bg-card/80 backdrop-blur-sm border-l border-border/50",
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Floating tooltip */}
      {isDragging && hoveredLabel && (
        <div className="fixed right-16 sm:right-20 top-1/2 -translate-y-1/2 z-50 pointer-events-none">
          <div className="bg-primary text-primary-foreground text-sm font-medium px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
            {hoveredLabel}
          </div>
        </div>
      )}

      {/* Year/month ticks */}
      {yearGroups.map((g) => (
        <div key={g.year} className="flex flex-col items-center gap-0.5">
          <span className={cn(
            "text-[11px] font-bold text-foreground tabular-nums cursor-pointer hover:text-primary transition-colors",
            hoveredLabel && g.months.some(m => m.label === hoveredLabel) && "text-primary",
          )}>
            {g.year}
          </span>
          {!compact && g.months.map((m) => (
            <button
              key={m.label}
              className={cn(
                "text-[9px] text-muted-foreground hover:text-primary transition-colors leading-tight cursor-pointer",
                hoveredLabel === m.label && "text-primary font-semibold",
              )}
              onClick={() => onScrollToDate(m.label)}
            >
              {m.month}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
