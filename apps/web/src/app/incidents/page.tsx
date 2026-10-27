'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { IncidentDto } from '@devpulse/shared';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Navbar } from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { OperationalPageHeader } from '@/components/ui/operational-page-header';
import { MetricCard } from '@/components/ui/metric-card';
import { StatusIndicator } from '@/components/ui/status-indicator';
import {
  AlertTriangle,
  Clock,
  Radio,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.max(1, Math.round(seconds))}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

function timeAgo(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return dateStr;
  }
}

export default function IncidentsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [incidents, setIncidents] = useState<IncidentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'resolved'>('all');
  const [, setTick] = useState(0);

  // Periodic tick for real-time live duration counter on ongoing incidents
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const loadIncidents = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setIsRefreshing(true);
      setError(null);

      const data = await apiClient.getIncidents({ limit: 100 });
      setIncidents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch incident log');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (!authLoading && user) {
      loadIncidents();
    }
  }, [authLoading, user, router]);

  const ongoingIncidents = useMemo(
    () => incidents.filter((i) => !i.isResolved),
    [incidents],
  );

  const resolvedIncidents = useMemo(
    () => incidents.filter((i) => i.isResolved),
    [incidents],
  );

  const filteredIncidents = useMemo(() => {
    if (statusFilter === 'active') return ongoingIncidents;
    if (statusFilter === 'resolved') return resolvedIncidents;
    return incidents;
  }, [statusFilter, incidents, ongoingIncidents, resolvedIncidents]);

  if (authLoading || (loading && incidents.length === 0)) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-pulse">
          <div className="h-10 w-64 bg-[var(--surface)] rounded-[4px]" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="h-24 bg-[var(--surface)] rounded-[6px]" />
            <div className="h-24 bg-[var(--surface)] rounded-[6px]" />
            <div className="h-24 bg-[var(--surface)] rounded-[6px]" />
          </div>
          <div className="h-96 bg-[var(--surface)] rounded-[6px]" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Header */}
        <OperationalPageHeader
          eyebrow="Reliability Log"
          title="Incidents"
          description="Automated failure detection, live downtime duration tracking, and verified recovery records."
          badge={
            <StatusIndicator
              status={ongoingIncidents.length > 0 ? 'down' : 'healthy'}
              variant="badge"
              label={
                ongoingIncidents.length > 0
                  ? `${ongoingIncidents.length} active outage${ongoingIncidents.length > 1 ? 's' : ''}`
                  : 'All services operational'
              }
            />
          }
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadIncidents(true)}
                disabled={isRefreshing}
                className="gap-1.5 font-mono text-xs"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </Button>
              <Link href="/monitors">
                <Button variant="secondary" size="sm" className="gap-1.5 font-mono text-xs">
                  <Radio className="h-3.5 w-3.5" />
                  <span>Monitors</span>
                </Button>
              </Link>
            </div>
          }
        />

        {/* Error Banner */}
        {error && (
          <div className="rounded-[4px] border border-[var(--status-down)]/40 bg-[var(--status-down-bg)]/20 p-3.5 flex items-center justify-between gap-3 text-xs text-[var(--status-down)]">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => loadIncidents()} className="h-6 text-[11px]">
              Retry
            </Button>
          </div>
        )}

        {/* Metric Overview Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard
            label="ACTIVE OUTAGES"
            value={ongoingIncidents.length}
            subvalue={
              ongoingIncidents.length > 0
                ? 'Monitored targets requiring operational response'
                : 'Zero active outages detected'
            }
            variant={ongoingIncidents.length > 0 ? 'urgent' : 'healthy'}
            badge={
              ongoingIncidents.length > 0 ? (
                <Badge variant="destructive" className="text-[10px] font-mono px-1 py-0">
                  ACTION NEEDED
                </Badge>
              ) : (
                <Badge variant="healthy" className="text-[10px] font-mono px-1 py-0">
                  CALM
                </Badge>
              )
            }
            icon={AlertTriangle}
          />

          <MetricCard
            label="RESOLVED INCIDENTS"
            value={resolvedIncidents.length}
            subvalue="Automatically recovered downtime events"
            variant="default"
            icon={ShieldCheck}
          />

          <MetricCard
            label="TOTAL DETECTED"
            value={incidents.length}
            subvalue="Triggered on 3 consecutive check failures"
            variant="default"
            icon={Clock}
          />
        </div>

        {/* Filter Navigation Tabs */}
        <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-[4px] text-xs font-mono font-medium transition-colors ${
                statusFilter === 'all'
                  ? 'bg-[var(--surface-active)] text-[var(--text-primary)] border border-[var(--border)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              All Incidents ({incidents.length})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-[4px] text-xs font-mono font-medium transition-colors flex items-center gap-1.5 ${
                statusFilter === 'active'
                  ? 'bg-[var(--surface-active)] text-[var(--text-primary)] border border-[var(--border)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span>Active</span>
              {ongoingIncidents.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-[2px] bg-[var(--status-down)] text-white text-[10px] font-bold tabular-nums">
                  {ongoingIncidents.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setStatusFilter('resolved')}
              className={`px-3 py-1.5 rounded-[4px] text-xs font-mono font-medium transition-colors ${
                statusFilter === 'resolved'
                  ? 'bg-[var(--surface-active)] text-[var(--text-primary)] border border-[var(--border)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              Resolved ({resolvedIncidents.length})
            </button>
          </div>

          <div className="text-xs font-mono text-[var(--text-muted)] hidden sm:block tabular-nums">
            Showing {filteredIncidents.length} of {incidents.length}
          </div>
        </div>

        {/* Active Incidents Prominent Section (when active incidents exist and not filtering strictly by resolved) */}
        {statusFilter !== 'resolved' && ongoingIncidents.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--status-down)] animate-ping" />
              <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-[var(--status-down)]">
                Active Outages ({ongoingIncidents.length})
              </h2>
            </div>

            <div className="space-y-3">
              {ongoingIncidents.map((incident) => {
                const startedTime = new Date(incident.startedAt).getTime();
                const liveElapsed = Math.max(0, Math.floor((Date.now() - startedTime) / 1000));

                return (
                  <div
                    key={incident.id}
                    className="rounded-[6px] border border-[var(--status-down)]/40 bg-[var(--status-down-bg)]/15 p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors"
                  >
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="down" className="text-[10px] font-mono px-1.5 py-0.5">
                          ACTIVE OUTAGE
                        </Badge>
                        {incident.isSeeded && (
                          <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-[10px] font-mono px-1.5 py-0.5">
                            SIMULATED
                          </Badge>
                        )}
                        <Link
                          href={`/monitors/${incident.monitorId}`}
                          className="font-bold text-sm text-[var(--text-primary)] hover:text-[var(--primary)] flex items-center gap-1.5 truncate"
                        >
                          <span>{incident.monitorName || 'Target Service'}</span>
                          <ExternalLink className="h-3 w-3 text-[var(--text-muted)] shrink-0" />
                        </Link>
                      </div>

                      <div className="text-xs font-mono text-[var(--text-secondary)] break-words bg-[var(--surface)]/60 rounded-[3px] p-2 border border-[var(--border-subtle)] max-w-3xl">
                        <span className="text-[var(--text-muted)] font-medium">Failure reason: </span>
                        <span>{incident.cause}</span>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] font-mono text-[var(--text-muted)]">
                        <span>Started {timeAgo(incident.startedAt)} ({formatDate(incident.startedAt)})</span>
                      </div>
                    </div>

                    <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[var(--border-subtle)]">
                      <div className="text-left md:text-right">
                        <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                          Ongoing Downtime
                        </div>
                        <div className="font-mono text-lg font-bold text-[var(--status-down)] tabular-nums">
                          {formatDuration(liveElapsed)}
                        </div>
                      </div>

                      <Link href={`/monitors/${incident.monitorId}`}>
                        <Button size="sm" variant="destructive" className="h-8 text-xs font-mono gap-1.5">
                          <span>Inspect Target</span>
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Resolved / All Incidents Table */}
        <div className="space-y-3">
          {statusFilter === 'all' && (
            <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Incident History ({filteredIncidents.length})
            </h2>
          )}

          {filteredIncidents.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center space-y-2 max-w-sm mx-auto">
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  {statusFilter === 'active'
                    ? 'No active outages'
                    : statusFilter === 'resolved'
                      ? 'No resolved incidents recorded'
                      : 'No incidents recorded'}
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  {statusFilter === 'active'
                    ? 'All monitored services are responding within expected parameters.'
                    : 'DevPulse automatically detects incidents when an endpoint fails 3 consecutive health checks.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
              {/* Desktop Table View (>= 768px) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[var(--text-muted)] font-mono text-[11px] bg-[var(--surface-subtle)]">
                      <th className="py-2.5 px-3 font-medium">STATUS</th>
                      <th className="py-2.5 px-3 font-medium">MONITOR</th>
                      <th className="py-2.5 px-3 font-medium">FAILURE REASON</th>
                      <th className="py-2.5 px-3 font-medium whitespace-nowrap">STARTED</th>
                      <th className="py-2.5 px-3 font-medium whitespace-nowrap">RESOLVED</th>
                      <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">DURATION</th>
                      <th className="py-2.5 px-3 font-medium text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] font-mono">
                    {filteredIncidents.map((incident) => {
                      const isOngoing = !incident.isResolved;
                      const startedTime = new Date(incident.startedAt).getTime();
                      const elapsed = isOngoing
                        ? Math.max(0, Math.floor((Date.now() - startedTime) / 1000))
                        : incident.durationSeconds;

                      return (
                        <tr
                          key={incident.id}
                          className={`hover:bg-[var(--surface-hover)] transition-colors ${
                            isOngoing ? 'bg-[var(--status-down-bg)]/10' : ''
                          }`}
                        >
                          {/* Status */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <Badge
                              variant={isOngoing ? 'down' : 'healthy'}
                              className="text-[9px] font-mono px-1 py-0"
                            >
                              {isOngoing ? 'ONGOING' : 'RESOLVED'}
                            </Badge>
                          </td>

                          {/* Monitor Name */}
                          <td className="py-2.5 px-3 whitespace-nowrap max-w-[200px] truncate">
                            <Link
                              href={`/monitors/${incident.monitorId}`}
                              className="font-semibold text-[var(--text-primary)] hover:text-[var(--primary)] transition-colors truncate"
                            >
                              {incident.monitorName || 'Target Service'}
                            </Link>
                          </td>

                          {/* Failure Reason */}
                          <td className="py-2.5 px-3 max-w-sm truncate text-[var(--text-muted)]" title={incident.cause}>
                            <span className="text-[var(--text-dim)]">Failure reason: </span>
                            <span>{incident.cause}</span>
                          </td>

                          {/* Started */}
                          <td className="py-2.5 px-3 whitespace-nowrap text-[var(--text-secondary)]">
                            {timeAgo(incident.startedAt)}
                          </td>

                          {/* Resolved */}
                          <td className="py-2.5 px-3 whitespace-nowrap text-[var(--text-muted)]">
                            {incident.resolvedAt ? timeAgo(incident.resolvedAt) : '—'}
                          </td>

                          {/* Duration */}
                          <td className="py-2.5 px-3 whitespace-nowrap text-right tabular-nums font-semibold">
                            <span
                              className={
                                isOngoing ? 'text-[var(--status-down)]' : 'text-[var(--text-secondary)]'
                              }
                            >
                              {formatDuration(elapsed)}
                            </span>
                          </td>

                          {/* Action */}
                          <td className="py-2.5 px-3 whitespace-nowrap text-right">
                            <Link href={`/monitors/${incident.monitorId}`}>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[11px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                              >
                                View
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Structured Card List (< 768px) */}
              <div className="md:hidden divide-y divide-[var(--border)] font-mono">
                {filteredIncidents.map((incident) => {
                  const isOngoing = !incident.isResolved;
                  const startedTime = new Date(incident.startedAt).getTime();
                  const elapsed = isOngoing
                    ? Math.max(0, Math.floor((Date.now() - startedTime) / 1000))
                    : incident.durationSeconds;

                  return (
                    <div
                      key={incident.id}
                      className={`p-3.5 space-y-2 ${
                        isOngoing ? 'bg-[var(--status-down-bg)]/10' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Badge
                            variant={isOngoing ? 'down' : 'healthy'}
                            className="text-[9px] font-mono px-1 py-0 shrink-0"
                          >
                            {isOngoing ? 'ONGOING' : 'RESOLVED'}
                          </Badge>
                          <Link
                            href={`/monitors/${incident.monitorId}`}
                            className="font-semibold text-xs text-[var(--text-primary)] hover:text-[var(--primary)] truncate"
                          >
                            {incident.monitorName || 'Target Service'}
                          </Link>
                        </div>
                        <div
                          className={`text-xs font-bold tabular-nums shrink-0 ${
                            isOngoing ? 'text-[var(--status-down)]' : 'text-[var(--text-secondary)]'
                          }`}
                        >
                          {formatDuration(elapsed)}
                        </div>
                      </div>

                      <div className="text-[11px] text-[var(--text-muted)] truncate">
                        <span className="text-[var(--text-dim)]">Failure reason: </span>
                        <span>{incident.cause}</span>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-[var(--text-dim)] pt-1">
                        <span>Started {timeAgo(incident.startedAt)}</span>
                        <Link href={`/monitors/${incident.monitorId}`} className="text-[var(--primary)] hover:underline">
                          View details &rarr;
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
