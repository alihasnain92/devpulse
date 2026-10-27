'use client';

import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { TimeBucketDto } from '@devpulse/shared';
import { Activity } from 'lucide-react';

interface LatencyChartProps {
  series: TimeBucketDto[];
  isLoading?: boolean;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number | null;
    payload: {
      label: string;
      timestamp: string;
      latency: number | null;
      uptime: number | null;
      checks: number;
    };
  }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0].payload;
  return (
    <div className="rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-xs shadow-lg space-y-1.5 font-sans">
      <div className="font-semibold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-1 mb-1 font-mono text-[11px]">
        {data.label}
      </div>
      <div className="space-y-1 font-mono text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--text-muted)] font-sans text-[11px]">Avg Latency:</span>
          <span className="font-bold text-[var(--primary)] tabular-nums">
            {data.latency !== null ? `${data.latency}ms` : 'No data'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--text-muted)] font-sans text-[11px]">Uptime:</span>
          <span className="font-medium text-[var(--status-healthy)] tabular-nums">
            {data.uptime !== null ? `${data.uptime}%` : 'N/A'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--text-muted)] font-sans text-[11px]">Checks:</span>
          <span className="text-[var(--text-primary)] tabular-nums">{data.checks}</span>
        </div>
      </div>
    </div>
  );
}

export function LatencyChart({ series, isLoading }: LatencyChartProps) {
  if (isLoading) {
    return (
      <div className="w-full h-64 flex items-center justify-center rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-subtle)]">
        <div className="flex items-center gap-2 text-xs font-mono text-[var(--text-muted)]">
          <Activity className="h-4 w-4 animate-spin text-[var(--primary)]" />
          <span>Loading telemetry series...</span>
        </div>
      </div>
    );
  }

  const hasData = series.some((b) => b.avgLatencyMs !== null);

  if (!hasData) {
    return (
      <div className="w-full h-64 flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-subtle)] text-center p-6 space-y-2">
        <div className="text-xs font-semibold font-mono text-[var(--text-secondary)] uppercase tracking-wider">
          No Latency Telemetry Recorded
        </div>
        <p className="text-xs text-[var(--text-muted)] max-w-sm leading-relaxed">
          No successful health checks recorded in this time window. Once checks are executed, average response latency will plot automatically.
        </p>
      </div>
    );
  }

  const chartData = series.map((b) => ({
    label: b.label,
    timestamp: b.timestamp,
    latency: b.avgLatencyMs,
    uptime: b.uptimePercent,
    checks: b.totalChecks,
  }));

  return (
    <div className="w-full h-64 sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border-subtle)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            stroke="var(--text-muted)"
            fontSize={10}
            fontFamily="monospace"
            tickLine={false}
            axisLine={{ stroke: 'var(--border-subtle)' }}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke="var(--text-muted)"
            fontSize={10}
            fontFamily="monospace"
            tickLine={false}
            axisLine={{ stroke: 'var(--border-subtle)' }}
            tickFormatter={(v) => `${v}ms`}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="latency"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={{ r: 2, fill: 'var(--primary)', stroke: 'var(--surface)', strokeWidth: 1 }}
            activeDot={{ r: 4, fill: 'var(--primary-hover)', stroke: 'var(--surface)', strokeWidth: 2 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
