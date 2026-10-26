'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckResultDto, MonitorDto } from '@devpulse/shared';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Navbar } from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Activity,
  Plus,
  Play,
  Pause,
  Edit,
  Trash2,
  ExternalLink,
  Clock,
  Radio,
  AlertCircle,
  CheckCircle2,
  Zap,
  RefreshCw,
} from 'lucide-react';

export default function MonitorsPage() {
  const { isLoading: authLoading } = useAuth();
  const [monitors, setMonitors] = useState<MonitorDto[]>([]);
  const [latestChecks, setLatestChecks] = useState<
    Record<string, CheckResultDto | null>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingIds, setCheckingIds] = useState<Record<string, boolean>>({});
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Delete modal state
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    monitor: MonitorDto | null;
    isDeleting: boolean;
  }>({
    isOpen: false,
    monitor: null,
    isDeleting: false,
  });

  // Action loading state for pause/resume
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadMonitors = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.getMonitors();
      setMonitors(data);

      // Load latest check for all monitors in parallel
      const checkResults = await Promise.all(
        data.map(async (m) => {
          const chk = await apiClient.getLatestCheck(m.id).catch(() => null);
          return [m.id, chk] as const;
        }),
      );

      const checksMap: Record<string, CheckResultDto | null> = {};
      for (const [id, chk] of checkResults) {
        checksMap[id] = chk;
      }
      setLatestChecks(checksMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load monitors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      loadMonitors();
    }
  }, [authLoading]);

  // Handle Pause / Resume toggle
  const handleTogglePause = async (monitor: MonitorDto) => {
    try {
      setTogglingId(monitor.id);
      const newPausedState = !monitor.isPaused;
      const updated = await apiClient.updateMonitor(monitor.id, {
        isPaused: newPausedState,
      });

      setMonitors((prev) =>
        prev.map((m) => (m.id === updated.id ? updated : m)),
      );

      setFeedbackMessage({
        type: 'success',
        text: `Monitor "${monitor.name}" ${newPausedState ? 'paused' : 'resumed'}.`,
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
    } catch (err) {
      setFeedbackMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Failed to update monitor status',
      });
    } finally {
      setTogglingId(null);
    }
  };

  // Trigger manual check
  const handleTriggerCheck = async (monitor: MonitorDto) => {
    try {
      setCheckingIds((prev) => ({ ...prev, [monitor.id]: true }));
      setFeedbackMessage({
        type: 'info',
        text: `Queued health check for "${monitor.name}"...`,
      });

      const initialTime = latestChecks[monitor.id]?.checkedAt;
      await apiClient.triggerCheck(monitor.id);

      // Poll for update
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const updated = await apiClient.getLatestCheck(monitor.id).catch(() => null);
        if (updated && updated.checkedAt !== initialTime) {
          setLatestChecks((prev) => ({ ...prev, [monitor.id]: updated }));
          setFeedbackMessage({
            type: updated.isSuccess ? 'success' : 'error',
            text: updated.isSuccess
              ? `Check passed for "${monitor.name}" (HTTP ${updated.statusCode} in ${updated.latencyMs}ms).`
              : `Check failed for "${monitor.name}": ${updated.errorMessage || `HTTP ${updated.statusCode}`}.`,
          });
          break;
        }
      }

      setTimeout(() => setFeedbackMessage(null), 4500);
    } catch (err) {
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to trigger check',
      });
    } finally {
      setCheckingIds((prev) => ({ ...prev, [monitor.id]: false }));
    }
  };

  const openDeleteModal = (monitor: MonitorDto) => {
    setDeleteModalState({
      isOpen: true,
      monitor,
      isDeleting: false,
    });
  };

  const handleConfirmDelete = async () => {
    const { monitor } = deleteModalState;
    if (!monitor) return;

    try {
      setDeleteModalState((prev) => ({ ...prev, isDeleting: true }));
      await apiClient.deleteMonitor(monitor.id);

      setMonitors((prev) => prev.filter((m) => m.id !== monitor.id));
      setDeleteModalState({ isOpen: false, monitor: null, isDeleting: false });

      setFeedbackMessage({
        type: 'success',
        text: `Monitor "${monitor.name}" was permanently deleted.`,
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
    } catch (err) {
      setFeedbackMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Failed to delete monitor',
      });
      setDeleteModalState((prev) => ({ ...prev, isDeleting: false }));
    }
  };

  if (authLoading || (loading && monitors.length === 0)) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="flex items-center gap-3 text-slate-400">
            <Activity className="h-6 w-6 animate-pulse text-blue-500" />
            <span>Loading monitor dashboard...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <span>Monitors</span>
              <Badge variant="secondary" className="text-xs bg-slate-800 text-slate-300">
                {monitors.length} total
              </Badge>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Configure, pause, resume, and inspect HTTP/HTTPS health check endpoints.
            </p>
          </div>

          <Link href="/monitors/new">
            <Button className="gap-2 shadow-lg shadow-blue-600/20">
              <Plus className="h-4 w-4" />
              <span>Create Monitor</span>
            </Button>
          </Link>
        </div>

        {/* Feedback Alert Banner */}
        {feedbackMessage && (
          <div
            className={`rounded-xl border p-4 flex items-center justify-between gap-3 text-sm animate-in fade-in duration-150 ${
              feedbackMessage.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
                : feedbackMessage.type === 'error'
                  ? 'border-red-500/30 bg-red-950/20 text-red-300'
                  : 'border-blue-500/30 bg-blue-950/20 text-blue-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {feedbackMessage.type === 'success' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              ) : feedbackMessage.type === 'error' ? (
                <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
              ) : (
                <RefreshCw className="h-5 w-5 text-blue-400 shrink-0 animate-spin" />
              )}
              <span>{feedbackMessage.text}</span>
            </div>
            <button
              onClick={() => setFeedbackMessage(null)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Fetch Error */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 flex items-center gap-3 text-red-300 text-sm">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Empty State vs List */}
        {monitors.length === 0 ? (
          <Card className="border-dashed border-slate-800 bg-slate-900/20 text-center py-20 px-4">
            <CardContent className="space-y-4 max-w-md mx-auto">
              <div className="h-16 w-16 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mx-auto text-blue-400">
                <Radio className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-semibold text-white">No monitors configured</h3>
                <p className="text-sm text-slate-400">
                  You don’t have any active monitors. Create your first endpoint target to manage intervals, timeouts, and expected statuses.
                </p>
              </div>
              <div className="pt-2">
                <Link href="/monitors/new">
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    <span>Create Monitor</span>
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {monitors.map((monitor) => {
              const check = latestChecks[monitor.id];
              const isChecking = Boolean(checkingIds[monitor.id]);

              return (
                <Card
                  key={monitor.id}
                  className="border-slate-800 bg-slate-900/50 hover:border-slate-700/80 transition-all shadow-xs"
                >
                  <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left Column: Info */}
                    <div className="space-y-2 min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <Link
                          href={`/monitors/${monitor.id}`}
                          className="text-base sm:text-lg font-semibold text-white hover:text-blue-400 transition-colors"
                        >
                          {monitor.name}
                        </Link>

                        <Badge
                          variant={monitor.isPaused ? 'warning' : 'success'}
                          className="text-xs uppercase font-bold"
                        >
                          {monitor.isPaused ? 'Paused' : 'Active'}
                        </Badge>

                        {/* Real Telemetry Outcome Badge */}
                        {check ? (
                          <Badge
                            variant={check.isSuccess ? 'success' : 'destructive'}
                            className="text-xs font-bold flex items-center gap-1 font-mono"
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                check.isSuccess ? 'bg-emerald-400' : 'bg-red-400'
                              }`}
                            />
                            <span>
                              {check.isSuccess
                                ? `${check.statusCode} OK • ${check.latencyMs}ms`
                                : `${check.statusCode ?? 'ERR'} • ${check.latencyMs}ms`}
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

                        {monitor.isSeeded && (
                          <Badge
                            variant="outline"
                            className="text-xs border-amber-500/40 text-amber-400 bg-amber-500/10 font-medium"
                          >
                            Demo
                          </Badge>
                        )}

                        <Badge
                          variant="outline"
                          className="text-xs text-blue-400 border-blue-500/30 bg-blue-500/10 font-mono"
                        >
                          {monitor.method}
                        </Badge>

                        <Badge
                          variant="outline"
                          className="text-xs text-slate-400 border-slate-700 font-mono"
                        >
                          Expected {monitor.expectedStatus}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span className="font-mono text-xs flex items-center gap-1.5 truncate max-w-sm sm:max-w-lg text-slate-300">
                          {monitor.url}
                          <a
                            href={monitor.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-500 hover:text-slate-300 inline-flex"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </span>

                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-slate-500" />
                          Interval: {monitor.intervalSeconds}s
                        </span>

                        <span>Timeout: {monitor.timeoutMs / 1000}s</span>

                        {check && (
                          <span className="text-slate-500">
                            Last checked: {new Date(check.checkedAt).toLocaleTimeString()}
                          </span>
                        )}
                      </div>

                      {check?.errorMessage && (
                        <div className="text-[11px] text-red-400 font-mono flex items-center gap-1.5 pt-0.5 truncate max-w-xl">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{check.errorMessage}</span>
                        </div>
                      )}
                    </div>

                    {/* Right Column: Actions */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-800">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleTriggerCheck(monitor)}
                        disabled={isChecking || monitor.isPaused}
                        className="gap-1.5 text-xs h-9 bg-blue-600 hover:bg-blue-500 text-white"
                      >
                        {isChecking ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            <span>Checking...</span>
                          </>
                        ) : (
                          <>
                            <Zap className="h-3.5 w-3.5" />
                            <span>Run Check</span>
                          </>
                        )}
                      </Button>

                      <Button
                        variant={monitor.isPaused ? 'outline' : 'secondary'}
                        size="sm"
                        onClick={() => handleTogglePause(monitor)}
                        disabled={togglingId === monitor.id}
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

                      <Link href={`/monitors/${monitor.id}`}>
                        <Button variant="outline" size="sm" className="text-xs h-9 border-slate-700">
                          Details
                        </Button>
                      </Link>

                      <Link href={`/monitors/${monitor.id}/edit`}>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 border-slate-700 text-slate-300 hover:text-white"
                          aria-label="Edit monitor"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </Link>

                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => openDeleteModal(monitor)}
                        className="h-9 w-9 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white border border-red-500/30"
                        aria-label="Delete monitor"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={deleteModalState.isOpen}
        title="Delete Monitor"
        description={`Are you sure you want to delete "${deleteModalState.monitor?.name}"? All associated historical configuration and records will be permanently removed. This action cannot be undone.`}
        confirmText="Delete Monitor"
        cancelText="Cancel"
        isDestructive={true}
        isLoading={deleteModalState.isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() =>
          setDeleteModalState({ isOpen: false, monitor: null, isDeleting: false })
        }
      />
    </div>
  );
}
