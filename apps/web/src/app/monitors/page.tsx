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
import { StatusIndicator } from '@/components/ui/status-indicator';
import { OperationalPageHeader } from '@/components/ui/operational-page-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MonitorIdentity } from '@/components/monitors/monitor-identity';
import { MonitorActions } from '@/components/monitors/monitor-actions';
import {
  Plus,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  Search,
} from 'lucide-react';

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

export default function MonitorsPage() {
  const { isLoading: authLoading } = useAuth();
  const [monitors, setMonitors] = useState<MonitorDto[]>([]);
  const [latestChecks, setLatestChecks] = useState<
    Record<string, CheckResultDto | null>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingIds, setCheckingIds] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
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
        text: `Triggered health check for "${monitor.name}"...`,
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

  const filteredMonitors = monitors.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.url.toLowerCase().includes(q);
  });

  if (authLoading || (loading && monitors.length === 0)) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-pulse">
          <div className="h-10 w-48 bg-[var(--surface)] rounded-[4px]" />
          <div className="h-64 bg-[var(--surface)] rounded-[6px]" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {/* Header */}
        <OperationalPageHeader
          title="Monitors"
          badge={
            <Badge variant="secondary" className="font-mono text-xs tabular-nums">
              {monitors.length} total
            </Badge>
          }
          description="Configure, pause, resume, and inspect HTTP/HTTPS health check endpoints."
          actions={
            <Link href="/monitors/new">
              <Button size="sm" className="gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" />
                <span>Create Monitor</span>
              </Button>
            </Link>
          }
        />

        {/* Feedback Alert Toast */}
        {feedbackMessage && (
          <div
            className={`rounded-[4px] border p-3 flex items-center justify-between gap-3 text-xs transition-colors ${
              feedbackMessage.type === 'success'
                ? 'border-[var(--status-healthy)]/40 bg-[var(--status-healthy-bg)]/20 text-[var(--status-healthy)]'
                : feedbackMessage.type === 'error'
                  ? 'border-[var(--status-down)]/40 bg-[var(--status-down-bg)]/20 text-[var(--status-down)]'
                  : 'border-[var(--primary)]/40 bg-[var(--primary)]/10 text-[var(--text-primary)]'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedbackMessage.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--status-healthy)]" />
              ) : feedbackMessage.type === 'error' ? (
                <AlertCircle className="h-4 w-4 shrink-0 text-[var(--status-down)]" />
              ) : (
                <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-[var(--primary)]" />
              )}
              <span>{feedbackMessage.text}</span>
            </div>
            <button
              onClick={() => setFeedbackMessage(null)}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Fetch Error */}
        {error && (
          <div className="rounded-[4px] border border-[var(--status-down)]/40 bg-[var(--status-down-bg)]/20 p-3.5 flex items-center justify-between gap-3 text-xs text-[var(--status-down)]">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => loadMonitors()} className="h-6 text-[11px]">
              Retry
            </Button>
          </div>
        )}

        {/* Search & Filter Toolbar (Only when monitors exist) */}
        {monitors.length > 0 && (
          <div className="flex items-center justify-between gap-4">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by name or URL..."
                className="w-full h-8 pl-8 pr-3 text-xs rounded-[4px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus-visible:outline-none focus-visible:border-[var(--border-focus)] focus-visible:ring-1 focus-visible:ring-[var(--border-focus)]"
              />
            </div>
            <div className="text-xs font-mono text-[var(--text-muted)] shrink-0 hidden sm:block tabular-nums">
              Showing {filteredMonitors.length} of {monitors.length}
            </div>
          </div>
        )}

        {/* Empty State vs Table */}
        {monitors.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center space-y-3 max-w-sm mx-auto">
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                No monitors configured
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Add an HTTP endpoint target to begin automated health checks, latency tracking, and outage detection.
              </p>
              <div className="pt-2">
                <Link href="/monitors/new">
                  <Button size="sm" className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    <span>Create Monitor</span>
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : filteredMonitors.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-2">
              <p className="text-xs text-[var(--text-muted)]">
                No monitors matching &quot;{searchQuery}&quot;.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchQuery('')}
                className="text-xs font-mono"
              >
                Clear filter
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="p-0 overflow-hidden">
            {/* Desktop / Tablet Table View (>= 640px) */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-muted)] font-mono text-[11px] bg-[var(--surface-subtle)]">
                    <th className="py-2.5 px-3 font-medium w-8 text-center">STATUS</th>
                    <th className="py-2.5 px-3 font-medium">NAME / TARGET</th>
                    <th className="py-2.5 px-3 font-medium hidden lg:table-cell">EXPECTED</th>
                    <th className="py-2.5 px-3 font-medium">CADENCE</th>
                    <th className="py-2.5 px-3 font-medium hidden lg:table-cell">TIMEOUT</th>
                    <th className="py-2.5 px-3 font-medium">LATEST CHECK</th>
                    <th className="py-2.5 px-4 font-medium text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filteredMonitors.map((monitor) => {
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
                        className="hover:bg-[var(--surface-hover)] transition-colors h-11"
                      >
                        {/* Status */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <StatusIndicator
                            status={status}
                            variant="compact"
                            label={
                              isPaused
                                ? 'Paused'
                                : check
                                  ? check.isSuccess
                                    ? 'Healthy'
                                    : 'Failing'
                                  : 'Pending'
                            }
                            isProcessing={checkingIds[monitor.id]}
                          />
                        </td>

                        {/* Name + Target URL */}
                        <td className="py-2.5 px-3 min-w-[200px] max-w-sm">
                          <MonitorIdentity monitor={monitor} />
                        </td>

                        {/* Expected Status (hidden < 1024px) */}
                        <td className="py-2.5 px-3 whitespace-nowrap hidden lg:table-cell font-mono text-[var(--text-secondary)] tabular-nums">
                          HTTP {monitor.expectedStatus}
                        </td>

                        {/* Interval */}
                        <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[var(--text-secondary)] tabular-nums">
                          {monitor.intervalSeconds}s
                        </td>

                        {/* Timeout (hidden < 1024px) */}
                        <td className="py-2.5 px-3 whitespace-nowrap hidden lg:table-cell font-mono text-[var(--text-muted)] tabular-nums">
                          {monitor.timeoutMs / 1000}s
                        </td>

                        {/* Latest Check Result */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
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
                            <span className="text-[11px] text-[var(--text-muted)] font-mono">
                              Never checked
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <MonitorActions
                            monitor={monitor}
                            onTriggerCheck={handleTriggerCheck}
                            onTogglePause={handleTogglePause}
                            onDelete={openDeleteModal}
                            isChecking={checkingIds[monitor.id]}
                            isToggling={togglingId === monitor.id}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Structured Compact Records (< 640px) */}
            <div className="sm:hidden divide-y divide-[var(--border)]">
              {filteredMonitors.map((monitor) => {
                const check = latestChecks[monitor.id];
                const isPaused = monitor.isPaused;

                let status: 'healthy' | 'down' | 'disabled' = 'healthy';
                if (isPaused) {
                  status = 'disabled';
                } else if (check && !check.isSuccess) {
                  status = 'down';
                }

                return (
                  <div key={monitor.id} className="p-3.5 space-y-2.5">
                    {/* Header line: Status + Name + Method */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <StatusIndicator
                          status={status}
                          variant="compact"
                          label={
                            isPaused
                              ? 'Paused'
                              : check
                                ? check.isSuccess
                                  ? 'Healthy'
                                  : 'Failing'
                                : 'Pending'
                          }
                          isProcessing={checkingIds[monitor.id]}
                        />
                        <Link
                          href={`/monitors/${monitor.id}`}
                          className="font-semibold text-sm text-[var(--text-primary)] hover:text-[var(--primary)] truncate"
                        >
                          {monitor.name}
                        </Link>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="px-1 py-0 rounded-[2px] border border-[var(--border)] text-[10px] font-mono text-[var(--text-secondary)]">
                          {monitor.method}
                        </span>
                        {isPaused && (
                          <Badge variant="warning" className="text-[9px] font-mono px-1 py-0">
                            PAUSED
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Target URL */}
                    <div className="font-mono text-xs text-[var(--text-muted)] truncate select-all">
                      {monitor.url}
                    </div>

                    {/* Telemetry info row */}
                    <div className="flex items-center justify-between text-xs font-mono text-[var(--text-secondary)] pt-0.5">
                      <div className="flex items-center gap-2">
                        {check ? (
                          <>
                            <Badge
                              variant={check.isSuccess ? 'healthy' : 'down'}
                              className="text-[10px] font-mono px-1 py-0 tabular-nums"
                            >
                              {check.statusCode ?? 'ERR'}
                            </Badge>
                            <span className="tabular-nums">{check.latencyMs}ms</span>
                            <span className="text-[11px] text-[var(--text-muted)]">
                              {timeAgo(check.checkedAt)}
                            </span>
                          </>
                        ) : (
                          <span className="text-[11px] text-[var(--text-muted)]">Never checked</span>
                        )}
                      </div>
                      <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                        Cadence: {monitor.intervalSeconds}s
                      </span>
                    </div>

                    {/* Quick Actions Row */}
                    <div className="pt-1 flex items-center justify-between border-t border-[var(--border-subtle)]">
                      <Link href={`/monitors/${monitor.id}`}>
                        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs font-mono text-[var(--primary)] gap-1">
                          <span>View Details</span>
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </Link>

                      <MonitorActions
                        monitor={monitor}
                        onTriggerCheck={handleTriggerCheck}
                        onTogglePause={handleTogglePause}
                        onDelete={openDeleteModal}
                        isChecking={checkingIds[monitor.id]}
                        isToggling={togglingId === monitor.id}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={deleteModalState.isOpen}
        title="Delete Monitor"
        description={`Are you sure you want to permanently delete "${deleteModalState.monitor?.name}"? All historical health check records and incident events associated with this monitor will be purged.`}
        confirmText="Delete Monitor"
        isDestructive={true}
        isLoading={deleteModalState.isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteModalState({ isOpen: false, monitor: null, isDeleting: false })}
      />
    </div>
  );
}
