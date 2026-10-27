'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NotificationDto } from '@devpulse/shared';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { Navbar } from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { OperationalPageHeader } from '@/components/ui/operational-page-header';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Radio,
  RefreshCw,
  Settings,
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

function formatExactDate(dateString: string): string {
  try {
    const d = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return dateString;
  }
}

export default function NotificationsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [notifications, setNotifications] = React.useState<NotificationDto[]>([]);
  const [total, setTotal] = React.useState(0);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'unread' | 'read'>('all');
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isMarkingAll, setIsMarkingAll] = React.useState(false);
  const [markingReadId, setMarkingReadId] = React.useState<string | null>(null);

  const limit = 20;

  const loadNotifications = React.useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiClient.getNotifications({
        page,
        limit,
        status: statusFilter,
      });

      setNotifications(res.items);
      setTotal(res.total);
      setUnreadCount(res.unreadCount);
      setHasMore(res.hasMore);
    } catch (err: unknown) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to load notifications',
      );
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  React.useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (user) {
      loadNotifications();
    }
  }, [user, authLoading, router, loadNotifications]);

  async function handleMarkRead(id: string) {
    try {
      setMarkingReadId(id);
      const updated = await apiClient.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: updated.readAt } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      if (statusFilter === 'unread') {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        setTotal((t) => Math.max(0, t - 1));
      }
    } catch (err: unknown) {
      alert(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to mark notification as read',
      );
    } finally {
      setMarkingReadId(null);
    }
  }

  async function handleMarkAllRead() {
    try {
      setIsMarkingAll(true);
      await apiClient.markAllNotificationsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })),
      );
      setUnreadCount(0);
      if (statusFilter === 'unread') {
        setNotifications([]);
        setTotal(0);
      }
    } catch (err: unknown) {
      alert(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to mark all notifications as read',
      );
    } finally {
      setIsMarkingAll(false);
    }
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center text-[var(--text-muted)]">
        <RefreshCw className="h-6 w-6 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Header */}
        <OperationalPageHeader
          eyebrow="Incident Alerts"
          title="Notification Center"
          description="In-app operational alerts generated on incident creation and verified automated recovery."
          badge={
            unreadCount > 0 ? (
              <Badge variant="destructive" className="font-mono text-xs tabular-nums">
                {unreadCount} unread
              </Badge>
            ) : (
              <Badge variant="outline" className="font-mono text-xs text-[var(--text-muted)]">
                All read
              </Badge>
            )
          }
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAllRead}
                disabled={isMarkingAll || unreadCount === 0}
                className="gap-1.5 font-mono text-xs"
              >
                {isMarkingAll ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="h-3.5 w-3.5 text-[var(--status-healthy)]" />
                )}
                <span>Mark all as read</span>
              </Button>

              <Link href="/settings">
                <Button variant="secondary" size="sm" className="gap-1.5 font-mono text-xs">
                  <Settings className="h-3.5 w-3.5" />
                  <span>Preferences</span>
                </Button>
              </Link>
            </div>
          }
        />

        {/* Error Alert */}
        {error && (
          <div className="rounded-[4px] border border-[var(--status-down)]/40 bg-[var(--status-down-bg)]/20 p-3.5 flex items-center justify-between gap-3 text-xs text-[var(--status-down)]">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => loadNotifications()} className="h-6 text-[11px]">
              Retry
            </Button>
          </div>
        )}

        {/* Filter Controls */}
        <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setStatusFilter('all');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-[4px] text-xs font-mono font-medium transition-colors ${
                statusFilter === 'all'
                  ? 'bg-[var(--surface-active)] text-[var(--text-primary)] border border-[var(--border)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              All Alerts ({total})
            </button>
            <button
              onClick={() => {
                setStatusFilter('unread');
                setPage(1);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] text-xs font-mono font-medium transition-colors ${
                statusFilter === 'unread'
                  ? 'bg-[var(--surface-active)] text-[var(--text-primary)] border border-[var(--border)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span>Unread</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-[2px] text-[10px] font-bold font-mono bg-[var(--status-down)] text-white tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                setStatusFilter('read');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-[4px] text-xs font-mono font-medium transition-colors ${
                statusFilter === 'read'
                  ? 'bg-[var(--surface-active)] text-[var(--text-primary)] border border-[var(--border)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              Read
            </button>
          </div>

          <div className="text-xs font-mono text-[var(--text-muted)] hidden sm:block tabular-nums">
            {total} total {total === 1 ? 'alert' : 'alerts'}
          </div>
        </div>

        {/* Notification Feed */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-16 text-[var(--text-muted)] space-y-2">
            <RefreshCw className="h-6 w-6 animate-spin text-[var(--primary)]" />
            <p className="text-xs font-mono">Fetching operational alert log...</p>
          </div>
        ) : notifications.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center space-y-2 max-w-sm mx-auto">
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                {statusFilter === 'unread'
                  ? 'No unread notifications'
                  : 'No notifications recorded'}
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                {statusFilter === 'unread'
                  ? 'You have caught up with all operational alerts.'
                  : 'Automated alerts triggered by target outages or recoveries will appear here.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {notifications.map((notif) => {
              const isUnread = !notif.readAt;
              const isCreated = notif.type === 'INCIDENT_CREATED';
              const isResolved = notif.type === 'INCIDENT_RESOLVED';

              return (
                <div
                  key={notif.id}
                  className={`p-3.5 sm:p-4 rounded-[4px] border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isUnread
                      ? 'bg-[var(--surface)] border-[var(--border)] border-l-2 border-l-[var(--primary)]'
                      : 'bg-[var(--surface-subtle)] border-[var(--border-subtle)] opacity-85'
                  }`}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Operational Type Icon */}
                    <div
                      className={`h-7 w-7 rounded-[4px] shrink-0 flex items-center justify-center mt-0.5 border ${
                        isCreated
                          ? 'bg-[var(--status-down-bg)]/25 text-[var(--status-down)] border-[var(--status-down)]/30'
                          : isResolved
                            ? 'bg-[var(--status-healthy-bg)]/25 text-[var(--status-healthy)] border-[var(--status-healthy)]/30'
                            : 'bg-[var(--surface-active)] text-[var(--primary)] border-[var(--border)]'
                      }`}
                    >
                      {isCreated ? (
                        <AlertTriangle className="h-4 w-4" />
                      ) : isResolved ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <Bell className="h-4 w-4" />
                      )}
                    </div>

                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-semibold text-xs sm:text-sm truncate ${
                            isUnread ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                          }`}
                        >
                          {notif.title}
                        </span>
                        {isUnread && (
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)] shrink-0" />
                        )}
                      </div>

                      <p className="text-xs font-mono text-[var(--text-secondary)] leading-relaxed break-words">
                        {notif.message}
                      </p>

                      <div className="flex items-center gap-3 text-[11px] font-mono text-[var(--text-muted)] pt-0.5">
                        <span>{timeAgo(notif.createdAt)} ({formatExactDate(notif.createdAt)})</span>
                        {notif.readAt && (
                          <span className="text-[var(--text-dim)]">
                            • Read {timeAgo(notif.readAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Operational Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--border-subtle)]">
                    {notif.monitorId && (
                      <Link href={`/monitors/${notif.monitorId}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs font-mono gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        >
                          <Radio className="h-3 w-3 text-[var(--primary)]" />
                          <span>Target</span>
                        </Button>
                      </Link>
                    )}

                    {isUnread && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={markingReadId === notif.id}
                        onClick={() => handleMarkRead(notif.id)}
                        className="h-7 text-xs font-mono gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        {markingReadId === notif.id ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3 text-[var(--primary)]" />
                        )}
                        <span>Mark read</span>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
            <div className="text-xs font-mono text-[var(--text-muted)] tabular-nums">
              Page {page} of {totalPages} ({total} alerts)
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="gap-1 font-mono text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Previous</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasMore || isLoading}
                onClick={() => setPage((p) => p + 1)}
                className="gap-1 font-mono text-xs"
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
