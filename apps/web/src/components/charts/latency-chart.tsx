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
    <div className="rounded-lg border border-slate-700 bg-slate-900/95 p-3 text-xs shadow-xl backdrop-blur-xs">
      <div className="font-semibold text-slate-200 border-b border-slate-800 pb-1.5 mb-1.5">
        {data.label}
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">Avg Latency:</span>
          <span className="font-mono font-bold text-blue-400">
            {data.latency !== null ? `${data.latency}ms` : 'No data'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">Uptime:</span>
          <span className="font-mono font-medium text-emerald-400">
            {data.uptime !== null ? `${data.uptime}%` : 'N/A'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">Checks:</span>
          <span className="font-mono text-slate-300">{data.checks}</span>
        </div>
      </div>
    </div>
  );
}

export function LatencyChart({ series, isLoading }: LatencyChartProps) {
  if (isLoading) {
    return (
      <div className="w-full h-64 flex items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Activity className="h-4 w-4 animate-spin text-blue-400" />
          <span>Loading telemetry series...</span>
        </div>
      </div>
    );
  }

  const hasData = series.some((b) => b.avgLatencyMs !== null);

  if (!hasData) {
    return (
      <div className="w-full h-64 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-900/20 text-center p-6 space-y-2">
        <div className="h-10 w-10 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
          <Activity className="h-5 w-5" />
        </div>
        <div className="text-sm font-semibold text-slate-300">
          No Latency Data Yet
        </div>
        <p className="text-xs text-slate-500 max-w-sm">
          No successful health checks recorded in this time window. Once checks are executed, response time latency will plot automatically.
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
            stroke="#1e293b"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            stroke="#64748b"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: '#334155' }}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke="#64748b"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: '#334155' }}
            tickFormatter={(v) => `${v}ms`}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="latency"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 2.5, fill: '#3b82f6' }}
            activeDot={{ r: 5, fill: '#60a5fa' }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
