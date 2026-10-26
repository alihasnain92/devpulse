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
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Radio,
  RefreshCw,
} from 'lucide-react';

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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <RefreshCw className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
                <Bell className="h-7 w-7 text-blue-500" />
                <span>Notifications</span>
              </h1>
              {unreadCount > 0 && (
                <Badge className="bg-red-600 hover:bg-red-500 text-white font-semibold px-2 py-0.5 text-xs">
                  {unreadCount} unread
                </Badge>
              )}
            </div>
            <p className="text-slate-400 text-sm mt-1">
              Real-time in-app alerts for incident creation and recovery across your monitored targets.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={isMarkingAll || unreadCount === 0}
              className="gap-2 border-slate-700 text-slate-300 hover:text-white"
            >
              {isMarkingAll ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="h-4 w-4 text-emerald-400" />
              )}
              <span>Mark all as read</span>
            </Button>

            <Link href="/settings">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-slate-700 text-slate-300 hover:text-white"
              >
                <span>Alert Settings</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex rounded-lg border border-slate-800 p-1 bg-slate-900/60">
            <button
              onClick={() => {
                setStatusFilter('all');
                setPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Notifications
            </button>
            <button
              onClick={() => {
                setStatusFilter('unread');
                setPage(1);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === 'unread'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Unread</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-red-600 text-white">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                setStatusFilter('read');
                setPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === 'read'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Read
            </button>
          </div>

          <div className="text-xs text-slate-400">
            {total} total {total === 1 ? 'alert' : 'alerts'}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-lg bg-red-950/40 border border-red-800 text-red-300 text-sm flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Notification List */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-16 text-slate-400">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-500 mb-3" />
            <p className="text-sm">Fetching notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <Card className="bg-slate-900/60 border-slate-800 text-center py-16">
            <CardContent className="flex flex-col items-center justify-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400">
                <BellOff className="h-6 w-6" />
              </div>
              <h3 className="text-base font-semibold text-slate-200">
                No notifications found
              </h3>
              <p className="text-xs text-slate-400 max-w-sm">
                {statusFilter === 'unread'
                  ? 'You are all caught up! No unread incident alerts.'
                  : 'Alerts generated by monitor outages or recoveries will appear here.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {notifications.map((notif) => {
              const isUnread = !notif.readAt;
              const isCreated = notif.type === 'INCIDENT_CREATED';
              const isResolved = notif.type === 'INCIDENT_RESOLVED';

              return (
                <div
                  key={notif.id}
                  className={`p-4 rounded-lg border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    isUnread
                      ? 'bg-slate-900/90 border-blue-900/50 shadow-sm'
                      : 'bg-slate-950/40 border-slate-800/80 text-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    {/* Status Icon */}
                    <div
                      className={`h-9 w-9 rounded-lg shrink-0 flex items-center justify-center mt-0.5 ${
                        isCreated
                          ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                          : isResolved
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}
                    >
                      {isCreated ? (
                        <AlertTriangle className="h-5 w-5" />
                      ) : isResolved ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <Bell className="h-5 w-5" />
                      )}
                    </div>

                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-white truncate">
                          {notif.title}
                        </span>
                        {isUnread && (
                          <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed break-words">
                        {notif.message}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-1">
                        <span>
                          {new Date(notif.createdAt).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                        {notif.readAt && (
                          <span className="text-slate-500">
                            • Read {new Date(notif.readAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {notif.monitorId && (
                      <Link href={`/monitors/${notif.monitorId}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs gap-1.5 text-slate-300 hover:text-white"
                        >
                          <Radio className="h-3.5 w-3.5 text-blue-400" />
                          <span>View Monitor</span>
                        </Button>
                      </Link>
                    )}

                    {isUnread && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={markingReadId === notif.id}
                        onClick={() => handleMarkRead(notif.id)}
                        className="h-8 text-xs gap-1.5 border-slate-700 text-slate-300 hover:text-white"
                      >
                        {markingReadId === notif.id ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5 text-blue-400" />
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
          <div className="flex items-center justify-between border-t border-slate-800 pt-4">
            <div className="text-xs text-slate-400">
              Page {page} of {totalPages} ({total} alerts)
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="gap-1 border-slate-700 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Previous</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasMore || isLoading}
                onClick={() => setPage((p) => p + 1)}
                className="gap-1 border-slate-700 text-xs"
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
