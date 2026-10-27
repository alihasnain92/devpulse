'use client';

import React, { useState } from 'react';
import { TimeBucketDto } from '@devpulse/shared';

interface UptimeBarProps {
  series: TimeBucketDto[];
  isLoading?: boolean;
}

export function UptimeBar({ series, isLoading }: UptimeBarProps) {
  const [activeBucket, setActiveBucket] = useState<TimeBucketDto | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="w-full h-12 flex items-center justify-center rounded-[4px] bg-[var(--surface-subtle)] animate-pulse">
        <div className="h-4 w-full max-w-md bg-[var(--surface-active)] rounded-[2px]" />
      </div>
    );
  }

  if (series.length === 0) {
    return null;
  }

  const getBucketColor = (b: TimeBucketDto) => {
    if (b.uptimePercent === null) {
      return 'bg-[var(--surface-active)] hover:bg-[var(--border-strong)]';
    }
    if (b.uptimePercent === 100) {
      return 'bg-[var(--status-healthy)] hover:opacity-85';
    }
    if (b.uptimePercent >= 90) {
      return 'bg-[var(--status-healthy)]/70 hover:opacity-85';
    }
    if (b.uptimePercent > 0) {
      return 'bg-[var(--status-degraded)] hover:opacity-85';
    }
    return 'bg-[var(--status-down)] hover:opacity-85';
  };

  return (
    <div className="space-y-2.5">
      {/* Bars Timeline */}
      <div className="relative">
        <div className="flex items-center gap-0.5 sm:gap-1 w-full h-7 sm:h-8">
          {series.map((bucket, idx) => (
            <div
              key={bucket.timestamp || idx}
              onMouseEnter={() => {
                setActiveBucket(bucket);
                setActiveIndex(idx);
              }}
              onMouseLeave={() => {
                setActiveBucket(null);
                setActiveIndex(null);
              }}
              className={`flex-1 min-w-0 h-full rounded-[1px] sm:rounded-[2px] transition-opacity cursor-pointer ${getBucketColor(
                bucket,
              )}`}
              title={`${bucket.label}: ${
                bucket.uptimePercent !== null
                  ? `${bucket.uptimePercent}% uptime`
                  : 'No checks'
              }`}
            />
          ))}
        </div>

        {/* Hover inspection card anchored relative to hovered bucket with viewport edge clamping */}
        {activeBucket && (
          (() => {
            const percentPos =
              series.length > 1 && activeIndex !== null
                ? (activeIndex / (series.length - 1)) * 100
                : 50;
            const translateTransform =
              percentPos < 15
                ? 'translateX(0%)'
                : percentPos > 85
                  ? 'translateX(-100%)'
                  : 'translateX(-50%)';

            return (
              <div
                className="absolute -top-14 z-10 pointer-events-none rounded-[4px] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs shadow-md whitespace-nowrap flex items-center gap-2.5 transition-all duration-75"
                style={{
                  left: `${percentPos}%`,
                  transform: translateTransform,
                }}
              >
                <span className="font-semibold text-[var(--text-primary)] font-mono">
                  {activeBucket.label}
                </span>
                <span className="text-[var(--text-dim)]">•</span>
                <span
                  className={`font-mono font-bold tabular-nums ${
                    activeBucket.uptimePercent === null
                      ? 'text-[var(--text-muted)]'
                      : activeBucket.uptimePercent === 100
                        ? 'text-[var(--status-healthy)]'
                        : activeBucket.uptimePercent > 0
                          ? 'text-[var(--status-degraded)]'
                          : 'text-[var(--status-down)]'
                  }`}
                >
                  {activeBucket.uptimePercent !== null
                    ? `${activeBucket.uptimePercent}%`
                    : 'No data'}
                </span>
                <span className="text-[var(--text-dim)]">•</span>
                <span className="text-[var(--text-secondary)] font-mono tabular-nums">
                  {activeBucket.successfulChecks}/{activeBucket.totalChecks} checks
                </span>
                {activeBucket.avgLatencyMs !== null && (
                  <>
                    <span className="text-[var(--text-dim)]">•</span>
                    <span className="font-mono text-[var(--primary)] tabular-nums">
                      {activeBucket.avgLatencyMs}ms
                    </span>
                  </>
                )}
              </div>
            );
          })()
        )}
      </div>

      {/* Timeline Footnote & Legend */}
      <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-[var(--text-muted)] gap-2 pt-1 border-t border-[var(--border-subtle)]">
        <div className="flex items-center gap-1 font-mono text-xs">
          <span>{series[0]?.label}</span>
          <span className="text-[var(--text-dim)]">┈┈┈</span>
          <span>{series[series.length - 1]?.label}</span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--status-healthy)]" />
            <span className="text-[var(--text-secondary)]">100% Operational</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--status-degraded)]" />
            <span className="text-[var(--text-secondary)]">Degraded</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--status-down)]" />
            <span className="text-[var(--text-secondary)]">Outage</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--surface-active)] border border-[var(--border)]" />
            <span className="text-[var(--text-muted)]">No Data</span>
          </div>
        </div>
      </div>
    </div>
  );
}
