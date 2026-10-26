'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckResultDto, IncidentDto, MonitorDto } from '@devpulse/shared';
import { apiClient } from '@/lib/api-client';
import { Navbar } from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Activity,
  ArrowLeft,
  Clock,
  Edit,
  ExternalLink,
  Globe,
  Pause,
  Play,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Layers,
  RefreshCw,
  Zap,
} from 'lucide-react';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
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
      await fetchChecks(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Monitor not found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonitor();
  }, [id]);

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
      setTimeout(() => setFeedback(null), 3000);
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
        text: 'Check queued! Dispatching SSRF-safe request via BullMQ background worker...',
      });

      const initialLatestTime = latestCheck?.checkedAt;
      await apiClient.triggerCheck(monitor.id);

      // Poll for check completion (up to 8 attempts, 1s apart)
      let resolvedCheck: CheckResultDto | null = null;
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const updated = await apiClient.getLatestCheck(monitor.id).catch(() => null);
        if (updated && updated.checkedAt !== initialLatestTime) {
          resolvedCheck = updated;
          break;
        }
      }

      await fetchChecks(monitor.id);

      if (resolvedCheck) {
        setFeedback({
          type: resolvedCheck.isSuccess ? 'success' : 'error',
          text: resolvedCheck.isSuccess
            ? `Check passed! HTTP ${resolvedCheck.statusCode} in ${resolvedCheck.latencyMs}ms.`
            : `Check failed: ${resolvedCheck.errorMessage || `HTTP ${resolvedCheck.statusCode}`}.`,
        });
      } else {
        setFeedback({
          type: 'success',
          text: 'Check queued successfully. History refreshed.',
        });
      }
      setTimeout(() => setFeedback(null), 5000);
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
      setIsDeleting(false);
      setShowDeleteDialog(false);
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to delete monitor',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="flex items-center gap-3 text-slate-400">
            <Activity className="h-6 w-6 animate-pulse text-blue-500" />
            <span>Loading monitor configuration & telemetry...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !monitor) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-12">
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-6 space-y-4 text-center">
            <AlertCircle className="h-10 w-10 text-red-400 mx-auto" />
            <h2 className="text-xl font-bold text-white">Monitor Not Found</h2>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              {error || 'The requested monitor does not exist or you do not have permission to view it.'}
            </p>
            <Link href="/monitors">
              <Button variant="outline" className="gap-2 border-slate-700">
                <ArrowLeft className="h-4 w-4" />
                <span>Return to Monitors</span>
              </Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Navigation Breadcrumb */}
        <div>
          <Link
            href="/monitors"
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Monitors</span>
          </Link>
        </div>

        {/* Feedback Alert Banner */}
        {feedback && (
          <div
            className={`rounded-xl border p-4 flex items-center justify-between gap-3 text-sm animate-in fade-in duration-150 ${
              feedback.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
                : feedback.type === 'error'
                  ? 'border-red-500/30 bg-red-950/20 text-red-300'
                  : 'border-blue-500/30 bg-blue-950/20 text-blue-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              ) : feedback.type === 'error' ? (
                <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
              ) : (
                <RefreshCw className="h-5 w-5 text-blue-400 shrink-0 animate-spin" />
              )}
              <span>{feedback.text}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Active Outage Alert Banner */}
        {(() => {
          const activeIncident = incidents.find((i) => !i.isResolved);
          if (!activeIncident) return null;
          const elapsed = Math.max(
            0,
            Math.floor((Date.now() - new Date(activeIncident.startedAt).getTime()) / 1000),
          );

          return (
            <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-4 sm:p-5 flex items-start gap-4">
              <div className="flex h-3 w-3 relative mt-1 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </div>
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-red-300">
                    Active Service Outage Detected
                  </span>
                  <Badge
                    variant="destructive"
                    className="bg-red-900/60 text-red-200 text-xs uppercase"
                  >
                    Ongoing Outage
                  </Badge>
                </div>
                <div className="text-xs text-slate-300 leading-relaxed font-mono bg-red-950/60 p-2.5 rounded border border-red-900/50 break-all">
                  {activeIncident.cause}
                </div>
                <div className="text-xs text-slate-400 flex flex-wrap items-center gap-3 pt-0.5">
                  <span>
                    Started: {new Date(activeIncident.startedAt).toLocaleString()}
                  </span>
                  <span>•</span>
                  <span>Downtime Duration: {formatDuration(elapsed)}</span>
                  <span>•</span>
                  <span>Triggered by 3 consecutive check failures</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Top Header Card */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                {monitor.name}
              </h1>

              <Badge
                variant={monitor.isPaused ? 'warning' : 'success'}
                className="text-xs uppercase font-bold"
              >
                {monitor.isPaused ? 'Paused' : 'Active'}
              </Badge>

              {latestCheck ? (
                <Badge
                  variant={latestCheck.isSuccess ? 'success' : 'destructive'}
                  className="text-xs font-bold flex items-center gap-1"
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      latestCheck.isSuccess ? 'bg-emerald-400' : 'bg-red-400'
                    }`}
                  />
                  <span>
                    {latestCheck.isSuccess
                      ? `Passing • ${latestCheck.statusCode} OK`
                      : `Failing • ${latestCheck.statusCode ?? 'ERR'}`}
                  </span>
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-xs text-slate-400 border-slate-700"
                >
                  Never Checked
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-400 font-mono">
              <Globe className="h-4 w-4 text-slate-500 shrink-0" />
              <span className="truncate max-w-md sm:max-w-xl text-slate-300">
                {monitor.url}
              </span>
              <a
                href={monitor.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 hover:text-slate-300"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="default"
              size="sm"
              onClick={handleTriggerCheck}
              disabled={isRunningCheck || monitor.isPaused}
              className="gap-1.5 text-xs h-9 bg-blue-600 hover:bg-blue-500 text-white shadow-xs"
            >
              {isRunningCheck ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Checking...</span>
                </>
              ) : (
                <>
                  <Zap className="h-3.5 w-3.5" />
                  <span>Run Check Now</span>
                </>
              )}
            </Button>

            <Button
              variant={monitor.isPaused ? 'outline' : 'secondary'}
              size="sm"
              onClick={handleTogglePause}
              disabled={isToggling}
              className="gap-1.5 text-xs h-9"
            >
              {monitor.isPaused ? (
                <>
                  <Play className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Resume</span>
                </>
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5 text-amber-400" />
                  <span>Pause</span>
                </>
              )}
            </Button>

            <Link href={`/monitors/${monitor.id}/edit`}>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-9 border-slate-700"
              >
                <Edit className="h-3.5 w-3.5" />
                <span>Edit</span>
              </Button>
            </Link>

            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              className="gap-1.5 text-xs h-9 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white border border-red-500/30"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete</span>
            </Button>
          </div>
        </div>

        {/* Configuration Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-slate-800 bg-slate-900/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-slate-400">
                HTTP Method
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-white font-mono">
                {monitor.method}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Outbound request method
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-slate-400">
                Check Cadence
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-white font-mono">
                {monitor.intervalSeconds}s
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Scheduled BullMQ interval
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-slate-400">
                Network Timeout
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-white font-mono">
                {monitor.timeoutMs / 1000}s
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {monitor.timeoutMs}ms safety limit
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-slate-400">
                Expected Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-emerald-400 font-mono">
                {monitor.expectedStatus}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Target HTTP response code
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Live Execution Telemetry Card */}
        <Card className="border-slate-800 bg-slate-900/50 shadow-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg text-white">
                  Execution Telemetry
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Real-time health check outcomes, response latency, and SSRF verification
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchChecks(monitor.id)}
                  className="h-8 gap-1.5 text-xs border-slate-700 text-slate-300"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Refresh</span>
                </Button>
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-xs"
                >
                  Phase 3 Active
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {latestCheck ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl border border-slate-800 bg-slate-950/60">
                <div>
                  <div className="text-xs text-slate-500 font-medium">Last HTTP Status</div>
                  <div className="text-2xl font-bold mt-1 font-mono flex items-center gap-2">
                    <span
                      className={
                        latestCheck.isSuccess ? 'text-emerald-400' : 'text-red-400'
                      }
                    >
                      {latestCheck.statusCode ?? 'Error'}
                    </span>
                    <Badge
                      variant={latestCheck.isSuccess ? 'success' : 'destructive'}
                      className="text-[11px] font-bold"
                    >
                      {latestCheck.isSuccess ? 'PASSING' : 'FAILING'}
                    </Badge>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500 font-medium">Response Latency</div>
                  <div className="text-2xl font-bold text-white mt-1 font-mono">
                    {latestCheck.latencyMs}
                    <span className="text-sm font-normal text-slate-400 ml-1">ms</span>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500 font-medium">Last Executed</div>
                  <div className="text-sm font-medium text-slate-200 mt-2">
                    {new Date(latestCheck.checkedAt).toLocaleString()}
                  </div>
                </div>

                {latestCheck.errorMessage && (
                  <div className="col-span-1 sm:col-span-3 pt-3 border-t border-slate-800/80">
                    <div className="text-xs font-semibold text-red-400 mb-1">
                      Check Error Diagnostics:
                    </div>
                    <div className="text-xs font-mono text-red-300 bg-red-950/30 border border-red-900/50 p-2.5 rounded-lg break-all">
                      {latestCheck.errorMessage}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/60 p-8 text-center space-y-3">
                <div className="h-12 w-12 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mx-auto text-blue-400">
                  <Clock className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-semibold text-white">No Check Results Recorded Yet</h4>
                  <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                    This monitor has not executed any health checks yet. Click &quot;Run Check Now&quot; above to trigger an immediate check or wait for the BullMQ scheduled cadence.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={handleTriggerCheck}
                  disabled={isRunningCheck || monitor.isPaused}
                  className="gap-2 text-xs"
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span>Execute First Check</span>
                </Button>
              </div>
            )}

            {/* Recent Checks History Table */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-white flex items-center justify-between">
                <span>Recent Checks History</span>
                <span className="text-xs font-normal text-slate-400">
                  Showing last {recentChecks.length} records
                </span>
              </h4>

              {recentChecks.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No historical checks found.</p>
              ) : (
                <div className="border border-slate-800 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800 font-medium">
                        <tr>
                          <th className="py-2.5 px-3">Timestamp</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Latency</th>
                          <th className="py-2.5 px-3">Outcome</th>
                          <th className="py-2.5 px-3">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {recentChecks.map((chk) => (
                          <tr key={chk.id} className="hover:bg-slate-900/30">
                            <td className="py-2.5 px-3 font-mono text-slate-300">
                              {new Date(chk.checkedAt).toLocaleTimeString()} (
                              {new Date(chk.checkedAt).toLocaleDateString()})
                            </td>
                            <td className="py-2.5 px-3 font-mono">
                              {chk.statusCode ? (
                                <span
                                  className={
                                    chk.isSuccess ? 'text-emerald-400' : 'text-red-400'
                                  }
                                >
                                  {chk.statusCode}
                                </span>
                              ) : (
                                <span className="text-red-400">Failed</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-300">
                              {chk.latencyMs}ms
                            </td>
                            <td className="py-2.5 px-3">
                              <Badge
                                variant={chk.isSuccess ? 'success' : 'destructive'}
                                className="text-[10px] py-0 px-2 uppercase font-bold"
                              >
                                {chk.isSuccess ? 'Pass' : 'Fail'}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3 text-slate-400 truncate max-w-xs font-mono text-[11px]">
                              {chk.errorMessage || 'Expected status matched'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-400 pt-3 border-t border-slate-800/80">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-500" />
                <span>Created: {new Date(monitor.createdAt).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-slate-500" />
                <span>Last Updated: {new Date(monitor.updatedAt).toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Incident History Table */}
        <Card className="border-slate-800 bg-slate-900/50 shadow-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg text-white">Incident History</CardTitle>
                <CardDescription className="text-slate-400">
                  Automated incident lifecycle tracking and outage duration logs
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className="border-slate-700 text-slate-300 text-xs"
              >
                {incidents.length} {incidents.length === 1 ? 'Incident' : 'Incidents'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {incidents.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto" />
                <div className="text-sm font-medium text-white">No incidents recorded</div>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  This monitor has not breached the 3-consecutive-failure threshold. All outages are automatically tracked and resolved here.
                </p>
              </div>
            ) : (
              <div className="border border-slate-800 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800 font-medium">
                      <tr>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Failure Cause</th>
                        <th className="py-2.5 px-3">Started At</th>
                        <th className="py-2.5 px-3">Resolved At</th>
                        <th className="py-2.5 px-3">Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {incidents.map((inc) => {
                        const isOngoing = !inc.isResolved;
                        const elapsed = isOngoing
                          ? Math.max(0, Math.floor((Date.now() - new Date(inc.startedAt).getTime()) / 1000))
                          : inc.durationSeconds;

                        return (
                          <tr key={inc.id} className="hover:bg-slate-900/30">
                            <td className="py-2.5 px-3">
                              {isOngoing ? (
                                <Badge
                                  variant="destructive"
                                  className="text-[9px] uppercase font-bold px-1.5 py-0 bg-red-950 text-red-400 border border-red-800/60"
                                >
                                  Ongoing
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] uppercase font-bold px-1.5 py-0 border-emerald-500/30 text-emerald-400"
                                >
                                  Resolved
                                </Badge>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-300 max-w-xs truncate">
                              {inc.cause}
                            </td>
                            <td className="py-2.5 px-3 text-slate-400">
                              {new Date(inc.startedAt).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-slate-400">
                              {inc.resolvedAt
                                ? new Date(inc.resolvedAt).toLocaleString()
                                : 'Ongoing Outage'}
                            </td>
                            <td className="py-2.5 px-3 font-medium">
                              <span className={isOngoing ? 'text-red-400' : 'text-slate-300'}>
                                {formatDuration(elapsed)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Monitor"
        description={`Are you sure you want to delete "${monitor.name}"? All associated check results and configuration will be permanently deleted. This action cannot be undone.`}
        confirmText="Delete Monitor"
        cancelText="Cancel"
        isDestructive={true}
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </div>
  );
}
