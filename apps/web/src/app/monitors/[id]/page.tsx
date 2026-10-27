'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CheckResultDto,
  IncidentDto,
  MonitorDto,
  MonitorStatsDto,
  StatsWindow,
} from '@devpulse/shared';
import { apiClient } from '@/lib/api-client';
import { Navbar } from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { OperationalPageHeader } from '@/components/ui/operational-page-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { LatencyChart } from '@/components/charts/latency-chart';
import { UptimeBar } from '@/components/charts/uptime-bar';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Play,
  Pause,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
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

interface MonitorDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function MonitorDetailPage({ params }: MonitorDetailPageProps) {
  const router = useRouter();
  const { id } = use(params);

  const [monitor, setMonitor] = useState<MonitorDto | null>(null);
  const [latestCheck, setLatestCheck] = useState<CheckResultDto | null>(null);
  const [recentChecks, setRecentChecks] = useState<CheckResultDto[]>([]);
  const [incidents, setIncidents] = useState<IncidentDto[]>([]);
  const [statsWindow, setStatsWindow] = useState<StatsWindow>('24h');
  const [stats, setStats] = useState<MonitorStatsDto | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRunningCheck, setIsRunningCheck] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const fetchStats = async (monitorId: string, window: StatsWindow) => {
    try {
      setStatsLoading(true);
      const res = await apiClient.getMonitorStats(monitorId, window);
      setStats(res);
    } catch {
      // Non-blocking metrics fetch
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchChecks = async (monitorId: string) => {
    try {
      const [latest, history, monitorIncidents] = await Promise.all([
        apiClient.getLatestCheck(monitorId).catch(() => null),
        apiClient.getChecks(monitorId, 10).catch(() => []),
        apiClient.getMonitorIncidents(monitorId).catch(() => []),
      ]);
      setLatestCheck(latest);
      setRecentChecks(history);
      setIncidents(monitorIncidents);
    } catch {
      // Non-blocking telemetry fetch
    }
  };

  const fetchMonitor = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.getMonitor(id);
      setMonitor(data);
      await Promise.all([
        fetchChecks(data.id),
        fetchStats(data.id, statsWindow),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Monitor not found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonitor();
  }, [id]);

  useEffect(() => {
    if (monitor?.id) {
      fetchStats(monitor.id, statsWindow);
    }
  }, [statsWindow]);

  const handleTogglePause = async () => {
    if (!monitor) return;
    try {
      setIsToggling(true);
      const newStatus = !monitor.isPaused;
      const updated = await apiClient.updateMonitor(monitor.id, {
        isPaused: newStatus,
      });
      setMonitor(updated);
      setFeedback({
        type: 'success',
        text: `Monitor ${newStatus ? 'paused' : 'resumed'} successfully.`,
      });
      setTimeout(() => setFeedback(null), 3500);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update monitor',
      });
    } finally {
      setIsToggling(false);
    }
  };

  const handleTriggerCheck = async () => {
    if (!monitor) return;
    try {
      setIsRunningCheck(true);
      setFeedback({
        type: 'info',
        text: 'Executing manual health check...',
      });

      const initialTime = latestCheck?.checkedAt;
      await apiClient.triggerCheck(monitor.id);

      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const [updated, history] = await Promise.all([
          apiClient.getLatestCheck(monitor.id).catch(() => null),
          apiClient.getChecks(monitor.id, 10).catch(() => []),
        ]);

        if (updated && updated.checkedAt !== initialTime) {
          setLatestCheck(updated);
          setRecentChecks(history);
          setFeedback({
            type: updated.isSuccess ? 'success' : 'error',
            text: updated.isSuccess
              ? `Check passed with HTTP ${updated.statusCode} in ${updated.latencyMs}ms.`
              : `Check failed: ${updated.errorMessage || `HTTP ${updated.statusCode}`}.`,
          });
          fetchStats(monitor.id, statsWindow);
          break;
        }
      }

      setTimeout(() => setFeedback(null), 4500);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to trigger check',
      });
    } finally {
      setIsRunningCheck(false);
    }
  };

  const handleDelete = async () => {
    if (!monitor) return;
    try {
      setIsDeleting(true);
      await apiClient.deleteMonitor(monitor.id);
      router.push('/monitors');
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to delete monitor',
      });
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  if (loading && !monitor) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-pulse">
          <div className="h-6 w-32 bg-[var(--surface)] rounded-[4px]" />
          <div className="h-14 w-full bg-[var(--surface)] rounded-[6px]" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-20 bg-[var(--surface)] rounded-[4px]" />
            ))}
          </div>
          <div className="h-64 bg-[var(--surface)] rounded-[6px]" />
        </main>
      </div>
    );
  }

  if (error || !monitor) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center space-y-4">
          <AlertCircle className="h-8 w-8 text-[var(--status-down)] mx-auto" />
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">
            {error || 'Monitor not found'}
          </h2>
          <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
            The requested monitor could not be loaded or may have been deleted.
          </p>
          <Link href="/monitors">
            <Button size="sm" variant="outline" className="gap-1.5 font-mono">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Monitors</span>
            </Button>
          </Link>
        </main>
      </div>
    );
  }

  // Status computation
  let status: 'healthy' | 'down' | 'disabled' = 'healthy';
  if (monitor.isPaused) {
    status = 'disabled';
  } else if (latestCheck && !latestCheck.isSuccess) {
    status = 'down';
  }

  const activeIncidents = incidents.filter((i) => !i.isResolved);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Navigation Breadcrumb */}
        <div>
          <Link
            href="/monitors"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-focus)] rounded-[2px]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Monitors</span>
          </Link>
        </div>

        {/* Operational Header */}
        <OperationalPageHeader
          eyebrow={`Target • ${monitor.method} • Interval ${monitor.intervalSeconds}s`}
          title={monitor.name}
          badge={
            <StatusIndicator
              status={status}
              variant="badge"
              label={
                monitor.isPaused
                  ? 'PAUSED'
                  : latestCheck
                    ? latestCheck.isSuccess
                      ? 'HEALTHY'
                      : 'FAILING'
                    : 'PENDING'
              }
              isProcessing={isRunningCheck}
            />
          }
          description={monitor.url}
          actions={
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTriggerCheck}
                disabled={isRunningCheck || monitor.isPaused}
                className="gap-1.5 text-xs font-mono"
                title={monitor.isPaused ? 'Cannot test paused monitor' : 'Execute immediate check'}
              >
                <RefreshCw className={`h-3 w-3 ${isRunningCheck ? 'animate-spin text-[var(--primary)]' : ''}`} />
                <span>Check Now</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleTogglePause}
                disabled={isToggling}
                className="gap-1.5 text-xs"
              >
                {monitor.isPaused ? (
                  <>
                    <Play className="h-3 w-3 text-[var(--status-healthy)]" />
                    <span>Resume</span>
                  </>
                ) : (
                  <>
                    <Pause className="h-3 w-3 text-[var(--status-warning)]" />
                    <span>Pause</span>
                  </>
                )}
              </Button>

              <Link href={`/monitors/${monitor.id}/edit`}>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Edit className="h-3 w-3" />
                  <span>Edit</span>
                </Button>
              </Link>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                className="h-8 px-2 text-[var(--text-muted)] hover:text-[var(--status-down)] hover:bg-[var(--status-down-bg)]/20"
                title="Delete monitor"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          }
        />

        {/* Feedback Alert Toast */}
        {feedback && (
          <div
            className={`rounded-[4px] border p-3 flex items-center justify-between gap-3 text-xs transition-colors ${
              feedback.type === 'success'
                ? 'border-[var(--status-healthy)]/40 bg-[var(--status-healthy-bg)]/20 text-[var(--status-healthy)]'
                : feedback.type === 'error'
                  ? 'border-[var(--status-down)]/40 bg-[var(--status-down-bg)]/20 text-[var(--status-down)]'
                  : 'border-[var(--primary)]/40 bg-[var(--primary)]/10 text-[var(--text-primary)]'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--status-healthy)]" />
              ) : feedback.type === 'error' ? (
                <AlertCircle className="h-4 w-4 shrink-0 text-[var(--status-down)]" />
              ) : (
                <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-[var(--primary)]" />
              )}
              <span>{feedback.text}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Active Incident Banner (if this monitor is currently failing) */}
        {activeIncidents.length > 0 && (
          <div className="rounded-[4px] border border-[var(--status-down)]/40 bg-[var(--status-down-bg)]/25 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-[var(--status-down)] shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-sm text-[var(--text-primary)] flex items-center gap-2">
                  <span>Active Incident Detected</span>
                  <Badge variant="destructive" className="text-[10px] font-mono px-1.5 py-0">
                    ONGOING
                  </Badge>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5 font-mono">
                  <span className="text-[var(--text-muted)]">Failure reason: </span>
                  {activeIncidents[0].cause} • Started {timeAgo(activeIncidents[0].startedAt)}
                </p>
              </div>
            </div>
            <Link href="/incidents">
              <Button size="sm" variant="destructive" className="text-xs font-mono">
                View Incident Command
              </Button>
            </Link>
          </div>
        )}

        {/* Metric Strip with Time Window Selector */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-mono font-medium text-[var(--text-muted)] uppercase tracking-wider">
              TELEMETRY WINDOW
            </span>
            <div className="flex items-center gap-1 border border-[var(--border)] rounded-[4px] p-0.5 bg-[var(--surface)]">
              {(['24h', '7d', '30d'] as StatsWindow[]).map((w) => (
                <button
                  key={w}
                  onClick={() => setStatsWindow(w)}
                  disabled={statsLoading}
                  className={`px-2.5 py-1 text-xs font-mono rounded-[2px] transition-colors ${
                    statsWindow === w
                      ? 'bg-[var(--surface-active)] text-[var(--text-primary)] font-semibold shadow-xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          {/* Metric Tiles: Uptime, Avg Latency, p50, p95, p99, Checks */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Uptime % */}
            <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface)] p-3.5 space-y-1">
              <div className="text-[11px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                UPTIME ({statsWindow})
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
                {stats?.uptimePercent !== null && stats?.uptimePercent !== undefined ? (
                  <span>{stats.uptimePercent}%</span>
                ) : (
                  <span className="text-sm font-normal text-[var(--text-muted)]">—</span>
                )}
              </div>
            </div>

            {/* Avg Latency */}
            <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface)] p-3.5 space-y-1">
              <div className="text-[11px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                AVG LATENCY
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
                {stats?.avgLatencyMs !== null && stats?.avgLatencyMs !== undefined ? (
                  `${stats.avgLatencyMs}ms`
                ) : (
                  <span className="text-sm font-normal text-[var(--text-muted)]">—</span>
                )}
              </div>
            </div>

            {/* p50 Latency */}
            <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface)] p-3.5 space-y-1">
              <div className="text-[11px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                p50 LATENCY
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
                {stats?.p50LatencyMs !== null && stats?.p50LatencyMs !== undefined ? (
                  `${stats.p50LatencyMs}ms`
                ) : (
                  <span className="text-sm font-normal text-[var(--text-muted)]">—</span>
                )}
              </div>
            </div>

            {/* p95 Tail Latency */}
            <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface)] p-3.5 space-y-1">
              <div className="text-[11px] font-mono text-[var(--text-muted)] uppercase tracking-wider flex items-center justify-between">
                <span>p95 TAIL</span>
                <span className="text-[9px] text-[var(--text-dim)]">DIAGNOSTIC</span>
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
                {stats?.p95LatencyMs !== null && stats?.p95LatencyMs !== undefined ? (
                  `${stats.p95LatencyMs}ms`
                ) : (
                  <span className="text-sm font-normal text-[var(--text-muted)]">—</span>
                )}
              </div>
            </div>

            {/* p99 Outlier Latency */}
            <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface)] p-3.5 space-y-1">
              <div className="text-[11px] font-mono text-[var(--text-muted)] uppercase tracking-wider flex items-center justify-between">
                <span>p99 OUTLIER</span>
                <span className="text-[9px] text-[var(--text-dim)]">DIAGNOSTIC</span>
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
                {stats?.p99LatencyMs !== null && stats?.p99LatencyMs !== undefined ? (
                  `${stats.p99LatencyMs}ms`
                ) : (
                  <span className="text-sm font-normal text-[var(--text-muted)]">—</span>
                )}
              </div>
            </div>

            {/* Total Checks */}
            <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface)] p-3.5 space-y-1">
              <div className="text-[11px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                CHECKS RUN
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
                {stats?.totalChecks ?? 0}
              </div>
            </div>
          </div>
        </div>

        {/* Visualizations: Uptime Bar & Latency Trend */}
        <div className="space-y-4">
          {/* Uptime History Bar */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-mono">Uptime Timeline</CardTitle>
                <span className="text-[11px] font-mono text-[var(--text-muted)]">
                  Bucket view ({statsWindow})
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {stats?.series && stats.series.length > 0 ? (
                <UptimeBar series={stats.series} isLoading={statsLoading} />
              ) : (
                <div className="py-6 text-center text-xs text-[var(--text-muted)] font-mono">
                  No check history recorded in this window.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Average Latency Chart */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-mono">Average Response Latency</CardTitle>
                  <CardDescription className="text-xs">
                    Bucket average latency series across {statsWindow}. Percentiles (p50/p95/p99) reported in diagnostic summary above.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {stats?.series ? (
                <LatencyChart series={stats.series} isLoading={statsLoading} />
              ) : (
                <div className="py-12 text-center text-xs text-[var(--text-muted)] font-mono">
                  No latency series available.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Operational Log Tables: Check History & Incident History */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Check History Table */}
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-subtle)]">
              <div>
                <h3 className="font-semibold text-sm text-[var(--text-primary)] font-mono">
                  Recent Check Log
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Last {recentChecks.length} health check executions.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchChecks(monitor.id)}
                className="h-7 px-2 text-xs font-mono text-[var(--text-secondary)]"
                title="Refresh check history"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>
            <CardContent className="p-0">
              {recentChecks.length === 0 ? (
                <div className="py-10 text-center text-xs text-[var(--text-muted)] font-mono">
                  No checks executed yet. Click &quot;Check Now&quot; to test.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-[var(--text-muted)] font-mono text-[11px] bg-[var(--surface-subtle)]">
                        <th className="py-2 px-3 font-medium">TIME</th>
                        <th className="py-2 px-3 font-medium">RESULT</th>
                        <th className="py-2 px-3 font-medium">HTTP</th>
                        <th className="py-2 px-3 font-medium">LATENCY</th>
                        <th className="py-2 px-3 font-medium">DETAILS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)] font-mono">
                      {recentChecks.map((chk) => (
                        <tr
                          key={chk.id}
                          className={`hover:bg-[var(--surface-hover)] transition-colors ${
                            !chk.isSuccess ? 'bg-[var(--status-down-bg)]/10' : ''
                          }`}
                        >
                          <td className="py-2 px-3 whitespace-nowrap text-[var(--text-secondary)] text-[11px] tabular-nums">
                            {timeAgo(chk.checkedAt)}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <Badge
                              variant={chk.isSuccess ? 'healthy' : 'down'}
                              className="text-[10px] font-mono px-1 py-0 tabular-nums"
                            >
                              {chk.isSuccess ? 'PASS' : 'FAIL'}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap tabular-nums text-[var(--text-primary)]">
                            {chk.statusCode ?? 'ERR'}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap tabular-nums text-[var(--text-secondary)]">
                            {chk.latencyMs}ms
                          </td>
                          <td className="py-2 px-3 text-[11px] text-[var(--text-muted)] truncate max-w-[150px]">
                            {chk.errorMessage || (chk.isSuccess ? 'Expected status matched' : 'Check failed')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Incident History Table */}
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-subtle)]">
              <div>
                <h3 className="font-semibold text-sm text-[var(--text-primary)] font-mono">
                  Incident Log
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Outage and automated recovery events.
                </p>
              </div>
              <Link href="/incidents">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-mono text-[var(--text-secondary)]">
                  All Incidents &rarr;
                </Button>
              </Link>
            </div>
            <CardContent className="p-0">
              {incidents.length === 0 ? (
                <div className="py-10 text-center text-xs text-[var(--text-muted)] font-mono">
                  Zero incidents recorded for this monitor.
                </div>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {incidents.map((inc) => {
                    const isOngoing = !inc.isResolved;
                    const elapsed = isOngoing
                      ? Math.max(0, Math.floor((Date.now() - new Date(inc.startedAt).getTime()) / 1000))
                      : inc.durationSeconds;

                    return (
                      <div
                        key={inc.id}
                        className={`p-3.5 flex items-start justify-between gap-3 ${
                          isOngoing ? 'bg-[var(--status-down-bg)]/15' : 'hover:bg-[var(--surface-hover)]'
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={isOngoing ? 'down' : 'healthy'}
                              className="text-[9px] font-mono px-1 py-0"
                            >
                              {isOngoing ? 'ONGOING' : 'RESOLVED'}
                            </Badge>
                            <span className="font-mono text-xs text-[var(--text-primary)] font-medium">
                              {timeAgo(inc.startedAt)}
                            </span>
                          </div>
                          <p className="text-xs font-mono text-[var(--text-muted)] truncate max-w-sm">
                            <span className="text-[var(--text-dim)]">Failure reason: </span>
                            {inc.cause}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <div
                            className={`font-mono text-xs tabular-nums font-semibold ${
                              isOngoing ? 'text-[var(--status-down)]' : 'text-[var(--text-secondary)]'
                            }`}
                          >
                            {formatDuration(elapsed)}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] font-mono">
                            {isOngoing ? 'downtime' : 'duration'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Monitor"
        description={`Permanently delete "${monitor.name}"? This removes the monitor schedule and deletes all historical health checks and incident logs.`}
        confirmText="Delete Monitor"
        isDestructive={true}
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </div>
  );
}
