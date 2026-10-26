'use client';

import React, { useState } from 'react';
import { TimeBucketDto } from '@devpulse/shared';

interface UptimeBarProps {
  series: TimeBucketDto[];
  isLoading?: boolean;
}

export function UptimeBar({ series, isLoading }: UptimeBarProps) {
  const [activeBucket, setActiveBucket] = useState<TimeBucketDto | null>(null);

  if (isLoading) {
    return (
      <div className="w-full h-14 flex items-center justify-center rounded-lg bg-slate-900/40 animate-pulse">
        <div className="h-6 w-full max-w-md bg-slate-800 rounded" />
      </div>
    );
  }

  if (series.length === 0) {
    return null;
  }

  const getBucketColor = (b: TimeBucketDto) => {
    if (b.uptimePercent === null) {
      return 'bg-slate-800/80 hover:bg-slate-700';
    }
    if (b.uptimePercent === 100) {
      return 'bg-emerald-500 hover:bg-emerald-400';
    }
    if (b.uptimePercent >= 90) {
      return 'bg-emerald-600 hover:bg-emerald-500';
    }
    if (b.uptimePercent > 0) {
      return 'bg-amber-500 hover:bg-amber-400';
    }
    return 'bg-red-500 hover:bg-red-400';
  };

  return (
    <div className="space-y-3">
      {/* Bars Timeline */}
      <div className="relative">
        <div className="flex items-center gap-1 sm:gap-1.5 w-full h-8 sm:h-9">
          {series.map((bucket, idx) => (
            <div
              key={bucket.timestamp || idx}
              onMouseEnter={() => setActiveBucket(bucket)}
              onMouseLeave={() => setActiveBucket(null)}
              className={`flex-1 h-full rounded-xs sm:rounded-sm transition-all cursor-pointer ${getBucketColor(
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

        {/* Hover inspection card */}
        {activeBucket && (
          <div className="absolute -top-16 left-1/2 -translate-x-1/2 z-10 pointer-events-none rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-1.5 text-xs shadow-xl backdrop-blur-xs whitespace-nowrap flex items-center gap-3">
            <span className="font-semibold text-slate-200">
              {activeBucket.label}
            </span>
            <span className="text-slate-500">•</span>
            <span
              className={`font-mono font-bold ${
                activeBucket.uptimePercent === null
                  ? 'text-slate-400'
                  : activeBucket.uptimePercent === 100
                    ? 'text-emerald-400'
                    : activeBucket.uptimePercent > 0
                      ? 'text-amber-400'
                      : 'text-red-400'
              }`}
            >
              {activeBucket.uptimePercent !== null
                ? `${activeBucket.uptimePercent}%`
                : 'No data'}
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-400">
              {activeBucket.successfulChecks}/{activeBucket.totalChecks} checks
            </span>
            {activeBucket.avgLatencyMs !== null && (
              <>
                <span className="text-slate-500">•</span>
                <span className="font-mono text-blue-400">
                  {activeBucket.avgLatencyMs}ms
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Timeline Footnote & Legend */}
      <div className="flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 gap-2 pt-1 border-t border-slate-800/60">
        <div className="flex items-center gap-1 font-mono">
          <span>{series[0]?.label}</span>
          <span className="text-slate-600">┈┈┈</span>
          <span>{series[series.length - 1]?.label}</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-slate-300">100% Operational</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-slate-300">Degraded</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <span className="text-slate-300">Outage</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-slate-800 border border-slate-700" />
            <span className="text-slate-400">No Data</span>
          </div>
        </div>
      </div>
    </div>
  );
}
