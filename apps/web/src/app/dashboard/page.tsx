'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckResultDto,
  DashboardSummaryDto,
  IncidentDto,
  MonitorDto,
} from '@devpulse/shared';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Navbar } from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StatusIndicator, type OperationalStatus } from '@/components/ui/status-indicator';
import { OperationalPageHeader } from '@/components/ui/operational-page-header';
import { MetricCard } from '@/components/ui/metric-card';
import {
  Activity,
  Plus,
  Radio,
  ArrowRight,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
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

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [monitors, setMonitors] = useState<MonitorDto[]>([]);
  const [latestChecks, setLatestChecks] = useState<
    Record<string, CheckResultDto | null>
  >({});
  const [incidents, setIncidents] = useState<IncidentDto[]>([]);
  const [summary, setSummary] = useState<DashboardSummaryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [monitorsData, incidentsData, summaryData] = await Promise.all([
        apiClient.getMonitors(),
        apiClient.getIncidents({ limit: 10 }).catch(() => [] as IncidentDto[]),
        apiClient.getDashboardSummary().catch(() => null),
      ]);

      setMonitors(monitorsData);
      setIncidents(incidentsData);
      setSummary(summaryData);

      // Fetch latest check for each monitor in parallel
      const checkResults = await Promise.all(
        monitorsData.map(async (m) => {
          const chk = await apiClient.getLatestCheck(m.id).catch(() => null);
          return [m.id, chk] as const;
        }),
      );

      const map: Record<string, CheckResultDto | null> = {};
      for (const [id, chk] of checkResults) {
        map[id] = chk;
      }
      setLatestChecks(map);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load telemetry overview',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      loadData();
    }
  }, [authLoading]);

  // Derived operational values
  const totalMonitors = monitors.length;
  const activeMonitors = monitors.filter((m) => !m.isPaused).length;
  const pausedMonitors = monitors.filter((m) => m.isPaused).length;

  let passingCount = 0;
  let failingCount = 0;
  let neverCheckedCount = 0;

  for (const m of monitors) {
    const chk = latestChecks[m.id];
    if (!chk) {
      neverCheckedCount++;
    } else if (chk.isSuccess) {
      passingCount++;
    } else {
      failingCount++;
    }
  }

  // Filter active monitors to derive real-time active health
  const activeMonitorsList = monitors.filter((m) => !m.isPaused);
  let activePassingCount = 0;
  let activeFailingCount = 0;
  let activePendingCount = 0;

  for (const m of activeMonitorsList) {
    const chk = latestChecks[m.id];
    if (!chk) {
      activePendingCount++;
    } else if (chk.isSuccess) {
      activePassingCount++;
    } else {
      activeFailingCount++;
    }
  }

  const activeIncidents = incidents.filter((i) => !i.isResolved);
  const resolvedIncidents = incidents.filter((i) => i.isResolved);

  // Global health determination across operational states
  const hasOutages =
    activeIncidents.length > 0 ||
    (summary?.failingEndpoints ?? failingCount) > 0 ||
    activeFailingCount > 0;

  let globalHealthStatus: OperationalStatus = 'healthy';
  let globalHealthLabel = 'Monitored services operational';

  if (hasOutages) {
    globalHealthStatus = 'down';
    globalHealthLabel = 'Attention required';
  } else if (totalMonitors === 0) {
    globalHealthStatus = 'info';
    globalHealthLabel = 'No monitors configured';
  } else if (activeMonitors === 0) {
    globalHealthStatus = 'disabled';
    globalHealthLabel = 'All monitors paused';
  } else if (activePassingCount === 0 && activePendingCount > 0) {
    globalHealthStatus = 'info';
    globalHealthLabel = 'Awaiting health data';
  } else if (activePendingCount > 0) {
    globalHealthStatus = 'info';
    globalHealthLabel = 'Health data pending';
  } else {
    globalHealthStatus = 'healthy';
    globalHealthLabel = 'Monitored services operational';
  }

  if (authLoading || (loading && monitors.length === 0)) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-pulse">
          <div className="h-10 w-64 bg-[var(--surface)] rounded-[4px]" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="h-28 bg-[var(--surface)] rounded-[6px]" />
            <div className="h-28 bg-[var(--surface)] rounded-[6px]" />
            <div className="h-28 bg-[var(--surface)] rounded-[6px]" />
            <div className="h-28 bg-[var(--surface)] rounded-[6px]" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 h-96 bg-[var(--surface)] rounded-[6px]" />
            <div className="h-96 bg-[var(--surface)] rounded-[6px]" />
          </div>
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
          eyebrow="Reliability Overview"
          title="System Dashboard"
          description={`Monitored operational environment for ${user?.email || 'authenticated user'}.`}
          badge={
            <StatusIndicator
              status={globalHealthStatus}
              variant="badge"
              label={globalHealthLabel}
            />
          }
          actions={
            <div className="flex items-center gap-2">
              <Link href="/incidents">
                <Button variant="outline" size="sm" className="gap-1.5 font-mono text-xs">
                  <AlertTriangle
                    className={`h-3.5 w-3.5 ${
                      activeIncidents.length > 0 ? 'text-[var(--status-down)]' : 'text-[var(--text-muted)]'
                    }`}
                  />
                  <span>Incidents</span>
                  {activeIncidents.length > 0 && (
                    <span className="ml-1 px-1 rounded-[2px] bg-[var(--status-down)] text-white text-[10px] font-bold tabular-nums">
                      {activeIncidents.length}
                    </span>
                  )}
                </Button>
              </Link>
              <Link href="/monitors/new">
                <Button size="sm" className="gap-1.5 text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  <span>New Monitor</span>
                </Button>
              </Link>
            </div>
          }
        />

        {/* Urgent Outage Alert Banner (Only when active incidents exist) */}
        {activeIncidents.length > 0 && (
          <div className="rounded-[6px] border border-[var(--status-down)]/40 bg-[var(--status-down-bg)]/25 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-[var(--status-down)] shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-sm text-[var(--text-primary)] flex items-center gap-2">
                  <span>Ongoing Service Outage Detected</span>
                  <Badge variant="destructive" className="text-[10px] font-mono px-1.5 py-0">
                    {activeIncidents.length} ACTIVE
                  </Badge>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Automated incident recovery in progress. Failing endpoints have exceeded consecutive failure threshold.
                </p>
              </div>
            </div>
            <Link href="/incidents" className="shrink-0 self-start sm:self-center">
              <Button size="sm" variant="destructive" className="gap-1 text-xs font-mono">
                <span>View Incident Command</span>
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        )}

        {/* Demo Mode Notice (Restrained & Compact) */}
        {summary?.isDemo && (
          <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-subtle)] px-3.5 py-2 flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <div className="flex items-center gap-2 truncate">
              <Radio className="h-3.5 w-3.5 text-[var(--status-warning)] shrink-0" />
              <span className="font-medium text-[var(--text-primary)]">Demonstration Mode Active:</span>
              <span className="truncate">Sample metrics and seeded records are active for showcase purposes.</span>
            </div>
            <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0 ml-2">SIMULATED DATA</span>
          </div>
        )}

        {/* Error Notice */}
        {error && (
          <div className="rounded-[4px] border border-[var(--status-down)]/40 bg-[var(--status-down-bg)]/20 p-3.5 flex items-center justify-between gap-3 text-xs text-[var(--status-down)]">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => loadData()} className="h-6 text-[11px]">
              Retry
            </Button>
          </div>
        )}

        {/* Asymmetric Operational Health Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Primary Metric: System 24h Uptime */}
          <MetricCard
            label="SYSTEM UPTIME (24H)"
            value={
              summary?.systemUptime24h !== null && summary?.systemUptime24h !== undefined ? (
                <span>{summary.systemUptime24h}%</span>
              ) : (
                <span className="text-xl font-normal text-[var(--text-muted)]">No data yet</span>
              )
            }
            subvalue="Aggregated across all active endpoints"
            variant="default"
            icon={Activity}
          />

          {/* Urgent / Status Metric: Active Outages */}
          <MetricCard
            label="ACTIVE OUTAGES"
            value={summary?.activeIncidents ?? activeIncidents.length}
            subvalue={
              (summary?.activeIncidents ?? activeIncidents.length) > 0
                ? 'Services requiring immediate investigation'
                : 'Zero active outages reported'
            }
            variant={(summary?.activeIncidents ?? activeIncidents.length) > 0 ? 'urgent' : 'default'}
            badge={
              (summary?.activeIncidents ?? activeIncidents.length) > 0 ? (
                <Badge variant="destructive" className="text-[10px] font-mono px-1 py-0">
                  ACTION NEEDED
                </Badge>
              ) : (
                <Badge variant="healthy" className="text-[10px] font-mono px-1 py-0">
                  CALM
                </Badge>
              )
            }
          />

          {/* Contextual Metric: Monitored Services */}
          <MetricCard
            label="MONITORED SERVICES"
            value={summary?.totalMonitors ?? totalMonitors}
            subvalue={`${summary?.activeMonitors ?? activeMonitors} active • ${
              summary?.pausedMonitors ?? pausedMonitors
            } paused`}
            icon={Radio}
          />

          {/* Health Status Metric: Endpoint Health */}
          <MetricCard
            label="HEALTH STATUS"
            value={`${summary?.passingEndpoints ?? passingCount} / ${
              summary?.totalMonitors ?? totalMonitors
            }`}
            subvalue={`${summary?.failingEndpoints ?? failingCount} failing • ${summary?.neverCheckedEndpoints ?? neverCheckedCount} pending`}
            variant={
              (summary?.failingEndpoints ?? failingCount) > 0 ? 'urgent' : 'default'
            }
          />
        </div>

        {/* Operational Views: Monitors Overview (2 cols) & Incidents (1 col) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main 2-column section: Monitors Overview */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle>Monitors Overview</CardTitle>
                  <CardDescription>
                    Real-time operational status and latest execution results.
                  </CardDescription>
                </div>
                <Link href="/monitors">
                  <Button variant="ghost" size="sm" className="gap-1 text-xs text-[var(--primary)] hover:text-[var(--primary-hover)]">
                    <span>All Monitors ({totalMonitors})</span>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                {totalMonitors === 0 ? (
                  <div className="text-center py-12 px-4 space-y-3">
                    <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
                      No monitors configured. Add an endpoint target to begin automated health checks.
                    </p>
                    <Link href="/monitors/new">
                      <Button size="sm" className="gap-1.5">
                        <Plus className="h-3.5 w-3.5" />
                        <span>Create Monitor</span>
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-[var(--text-muted)] font-mono text-[11px] bg-[var(--surface-subtle)]">
                          <th className="py-2.5 px-4 font-medium w-10">STATUS</th>
                          <th className="py-2.5 px-4 font-medium">SERVICE / TARGET</th>
                          <th className="py-2.5 px-3 font-medium hidden sm:table-cell">CADENCE</th>
                          <th className="py-2.5 px-4 font-medium">LATEST RESULT</th>
                          <th className="py-2.5 px-4 font-medium text-right">ACTION</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {monitors.slice(0, 6).map((monitor) => {
                          const check = latestChecks[monitor.id];
                          const isPaused = monitor.isPaused;

                          let status: 'healthy' | 'down' | 'disabled' = 'healthy';
                          if (isPaused) {
                            status = 'disabled';
                          } else if (check && !check.isSuccess) {
                            status = 'down';
                          }

                          return (
                            <tr
                              key={monitor.id}
                              className="hover:bg-[var(--surface-hover)] transition-colors group"
                            >
                              <td className="py-2.5 px-4 whitespace-nowrap">
                                <StatusIndicator
                                  status={status}
                                  variant="dot"
                                  label={
                                    isPaused
                                      ? 'Paused'
                                      : check
                                        ? check.isSuccess
                                          ? 'Healthy'
                                          : 'Failing'
                                        : 'Pending'
                                  }
                                />
                              </td>
                              <td className="py-2.5 px-4 min-w-[200px]">
                                <div className="flex items-center gap-1.5">
                                  <Link
                                    href={`/monitors/${monitor.id}`}
                                    className="font-medium text-[var(--text-primary)] hover:text-[var(--primary)] transition-colors truncate"
                                  >
                                    {monitor.name}
                                  </Link>
                                  <span className="px-1 py-0 rounded-[2px] border border-[var(--border)] text-[10px] font-mono text-[var(--text-muted)]">
                                    {monitor.method}
                                  </span>
                                </div>
                                <div className="text-[11px] font-mono text-[var(--text-muted)] truncate max-w-xs mt-0.5">
                                  {monitor.url}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap hidden sm:table-cell font-mono text-[var(--text-secondary)] tabular-nums">
                                {monitor.intervalSeconds}s
                              </td>
                              <td className="py-2.5 px-4 whitespace-nowrap">
                                {check ? (
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant={check.isSuccess ? 'healthy' : 'down'}
                                      className="text-[10px] font-mono px-1 py-0 tabular-nums"
                                    >
                                      {check.statusCode ?? 'ERR'}
                                    </Badge>
                                    <span className="font-mono text-xs text-[var(--text-secondary)] tabular-nums">
                                      {check.latencyMs}ms
                                    </span>
                                    <span className="text-[11px] text-[var(--text-muted)] hidden md:inline">
                                      {timeAgo(check.checkedAt)}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-[var(--text-muted)] font-mono">
                                    Never checked
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-4 whitespace-nowrap text-right">
                                <Link href={`/monitors/${monitor.id}`}>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 px-2 text-[11px] font-mono"
                                  >
                                    Inspect
                                  </Button>
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column: Recent Outages & Incident Summary */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle>Incident History</CardTitle>
                  <CardDescription>
                    Service disruption log & recovery tracking.
                  </CardDescription>
                </div>
                <Link href="/incidents">
                  <Button variant="ghost" size="sm" className="gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    <span>Log</span>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                {incidents.length === 0 ? (
                  <div className="text-center py-10 px-4 space-y-2">
                    <p className="text-xs font-medium text-[var(--text-primary)]">
                      No Outages Recorded
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] max-w-xs mx-auto">
                      All health checks operational. Automated incidents trigger after 3 consecutive failures.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border)]">
                    {/* Active Incidents First */}
                    {activeIncidents.map((incident) => {
                      const elapsed = Math.max(
                        0,
                        Math.floor((Date.now() - new Date(incident.startedAt).getTime()) / 1000),
                      );

                      return (
                        <div
                          key={incident.id}
                          className="p-3.5 bg-[var(--status-down-bg)]/15 flex items-start justify-between gap-3"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="down" className="text-[9px] font-mono px-1 py-0">
                                ACTIVE OUTAGE
                              </Badge>
                              <Link
                                href={`/monitors/${incident.monitorId}`}
                                className="font-semibold text-xs text-[var(--text-primary)] hover:text-[var(--primary)] truncate"
                              >
                                {incident.monitorName || 'Service Target'}
                              </Link>
                            </div>
                            <p className="text-[11px] font-mono text-[var(--text-secondary)] truncate">
                              <span className="text-[var(--text-muted)]">Failure reason: </span>
                              {incident.cause}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono text-xs font-bold text-[var(--status-down)] tabular-nums">
                              {formatDuration(elapsed)}
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)]">downtime</div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Resolved Incidents */}
                    {resolvedIncidents.slice(0, 5).map((incident) => (
                      <div
                        key={incident.id}
                        className="p-3.5 hover:bg-[var(--surface-hover)] transition-colors flex items-start justify-between gap-3"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-[var(--status-healthy)] font-medium">
                              RESOLVED
                            </span>
                            <Link
                              href={`/monitors/${incident.monitorId}`}
                              className="font-medium text-xs text-[var(--text-primary)] hover:text-[var(--primary)] truncate"
                            >
                              {incident.monitorName || 'Service Target'}
                            </Link>
                          </div>
                          <p className="text-[11px] font-mono text-[var(--text-muted)] truncate max-w-xs">
                            <span className="text-[var(--text-dim)]">Failure reason: </span>
                            {incident.cause}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono text-xs text-[var(--text-secondary)] tabular-nums">
                            {formatDuration(incident.durationSeconds)}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">
                            {timeAgo(incident.resolvedAt || incident.startedAt)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
