import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { Photo } from '@/lib/mock-data';

interface TimelineSliderProps {
  photos: Photo[];
  dateRange: [Date, Date] | null;
  onDateRangeChange: (range: [Date, Date] | null) => void;
}

function monthsBetween(start: Date, end: Date): Date[] {
  const months: Date[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    months.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

function formatMonth(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short' });
}

function formatYear(d: Date) {
  return d.getFullYear().toString();
}

export default function TimelineSlider({ photos, dateRange, onDateRangeChange }: TimelineSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'left' | 'right' | null>(null);

  // Build histogram of photos per month
  const { months, countByMonth, minDate, maxDate } = useMemo(() => {
    const dates = photos
      .map((p) => p.metadata.dateTaken ? new Date(p.metadata.dateTaken) : null)
      .filter(Boolean) as Date[];

    if (dates.length === 0) return { months: [], countByMonth: new Map(), minDate: new Date(), maxDate: new Date() };

    dates.sort((a, b) => a.getTime() - b.getTime());
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];
    const months = monthsBetween(minDate, maxDate);

    const countByMonth = new Map<string, number>();
    for (const d of dates) {
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      countByMonth.set(key, (countByMonth.get(key) || 0) + 1);
    }

    return { months, countByMonth, minDate, maxDate };
  }, [photos]);

  const maxCount = useMemo(() => Math.max(...Array.from(countByMonth.values()), 1), [countByMonth]);

  // Convert date to 0-1 position
  const dateToPos = useCallback((d: Date) => {
    const range = maxDate.getTime() - minDate.getTime();
    if (range === 0) return 0.5;
    return (d.getTime() - minDate.getTime()) / range;
  }, [minDate, maxDate]);

  // Convert 0-1 position to date
  const posToDate = useCallback((pos: number) => {
    const range = maxDate.getTime() - minDate.getTime();
    return new Date(minDate.getTime() + pos * range);
  }, [minDate, maxDate]);

  const leftPos = dateRange ? dateToPos(dateRange[0]) : 0;
  const rightPos = dateRange ? dateToPos(dateRange[1]) : 1;

  const getMousePos = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }, []);

  const handleMouseDown = useCallback((side: 'left' | 'right') => (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(side);
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: MouseEvent) => {
      const pos = getMousePos(e);
      const date = posToDate(pos);

      if (dragging === 'left') {
        const right = dateRange ? dateRange[1] : maxDate;
        if (date < right) onDateRangeChange([date, right]);
      } else {
        const left = dateRange ? dateRange[0] : minDate;
        if (date > left) onDateRangeChange([left, date]);
      }
    };

    const handleUp = () => setDragging(null);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, dateRange, minDate, maxDate, getMousePos, posToDate, onDateRangeChange]);

  // Touch support
  const handleTouchStart = useCallback((side: 'left' | 'right') => (e: React.TouchEvent) => {
    e.preventDefault();
    setDragging(side);
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const handleTouchMove = (e: TouchEvent) => {
      if (!trackRef.current || !e.touches[0]) return;
      const rect = trackRef.current.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.touches[0].clientX - rect.left) / rect.width));
      const date = posToDate(pos);

      if (dragging === 'left') {
        const right = dateRange ? dateRange[1] : maxDate;
        if (date < right) onDateRangeChange([date, right]);
      } else {
        const left = dateRange ? dateRange[0] : minDate;
        if (date > left) onDateRangeChange([left, date]);
      }
    };

    const handleTouchEnd = () => setDragging(null);

    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [dragging, dateRange, minDate, maxDate, posToDate, onDateRangeChange]);

  // Year labels
  const yearLabels = useMemo(() => {
    const labels: { year: string; pos: number }[] = [];
    let lastYear = '';
    for (const m of months) {
      const y = formatYear(m);
      if (y !== lastYear) {
        labels.push({ year: y, pos: dateToPos(m) });
        lastYear = y;
      }
    }
    return labels;
  }, [months, dateToPos]);

  if (months.length === 0) return null;

  const isFiltered = dateRange !== null;

  return (
    <div className="shrink-0 border-t border-border bg-surface px-3 sm:px-5 py-2.5">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Timeline</span>
        {isFiltered && (
          <>
            <span className="text-[10px] text-primary font-medium tabular-nums">
              {dateRange[0].toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              {' — '}
              {dateRange[1].toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </span>
            <button
              onClick={() => onDateRangeChange(null)}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors ml-auto active:scale-95"
            >
              Reset
            </button>
          </>
        )}
      </div>

      <div className="relative" ref={trackRef}>
        {/* Histogram bars */}
        <div className="flex items-end h-6 gap-px">
          {months.map((m) => {
            const key = `${m.getFullYear()}-${m.getMonth()}`;
            const count = countByMonth.get(key) || 0;
            const height = count > 0 ? Math.max(4, (count / maxCount) * 24) : 2;
            const pos = dateToPos(m);
            const inRange = !isFiltered || (pos >= leftPos && pos <= rightPos);

            return (
              <div
                key={key}
                className="flex-1 rounded-t-sm transition-colors duration-150"
                style={{
                  height: `${height}px`,
                  backgroundColor: inRange
                    ? count > 0 ? 'hsl(var(--primary))' : 'hsl(var(--border))'
                    : count > 0 ? 'hsl(var(--primary) / 0.2)' : 'hsl(var(--border) / 0.5)',
                }}
              />
            );
          })}
        </div>

        {/* Track line */}
        <div className="h-1 bg-muted rounded-full relative mt-0.5">
          {/* Selected range highlight */}
          {isFiltered && (
            <div
              className="absolute top-0 bottom-0 bg-primary/30 rounded-full"
              style={{ left: `${leftPos * 100}%`, right: `${(1 - rightPos) * 100}%` }}
            />
          )}

          {/* Left handle */}
          <div
            onMouseDown={handleMouseDown('left')}
            onTouchStart={handleTouchStart('left')}
            className={cn(
              'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full cursor-ew-resize transition-shadow',
              'bg-primary border-2 border-surface shadow-md',
              'hover:shadow-lg hover:scale-110',
              dragging === 'left' && 'scale-125 shadow-lg',
            )}
            style={{ left: `${leftPos * 100}%` }}
          />

          {/* Right handle */}
          <div
            onMouseDown={handleMouseDown('right')}
            onTouchStart={handleTouchStart('right')}
            className={cn(
              'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full cursor-ew-resize transition-shadow',
              'bg-primary border-2 border-surface shadow-md',
              'hover:shadow-lg hover:scale-110',
              dragging === 'right' && 'scale-125 shadow-lg',
            )}
            style={{ left: `${rightPos * 100}%` }}
          />
        </div>

        {/* Year labels */}
        <div className="relative h-4 mt-0.5">
          {yearLabels.map(({ year, pos }) => (
            <span
              key={year}
              className="absolute text-[10px] text-muted-foreground tabular-nums -translate-x-1/2"
              style={{ left: `${pos * 100}%` }}
            >
              {year}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
