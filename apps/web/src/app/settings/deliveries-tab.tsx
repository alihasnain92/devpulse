'use client';

import * as React from 'react';
import {
  PaginatedWebhookDeliveriesDto,
  ReplayWebhookDeliveryResponseDto,
  WEBHOOK_DELIVERY_ORIGIN,
  WEBHOOK_DELIVERY_STATUS,
  WEBHOOK_EVENT_TYPES,
  WebhookAttemptDto,
  WebhookDeliveryDetailDto,
  WebhookDeliveryDto,
  WebhookDeliveryFilterDto,
  WebhookDeliveryOrigin,
  WebhookDeliveryStatus,
  WebhookEndpointDto,
  WebhookEventType,
} from '@devpulse/shared';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  History,
  Info,
  RefreshCw,
  RotateCw,
  Shield,
  X,
  XCircle,
} from 'lucide-react';

interface DeliveriesTabProps {
  webhooks: WebhookEndpointDto[];
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

function formatExactDateTime(dateString: string): string {
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

export function DeliveriesTab({ webhooks }: DeliveriesTabProps) {
  // Delivery List State
  const [deliveries, setDeliveries] = React.useState<WebhookDeliveryDto[]>([]);
  const [totalCount, setTotalCount] = React.useState<number | undefined>(undefined);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Filters State
  const [filterEndpointId, setFilterEndpointId] = React.useState<string>('');
  const [filterStatus, setFilterStatus] = React.useState<WebhookDeliveryStatus | ''>('');
  const [filterOrigin, setFilterOrigin] = React.useState<WebhookDeliveryOrigin | ''>('');
  const [filterEventType, setFilterEventType] = React.useState<WebhookEventType | ''>('');

  // Pagination State
  const [currentCursor, setCurrentCursor] = React.useState<string | null>(null);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [cursorHistory, setCursorHistory] = React.useState<(string | null)[]>([]);

  // Delivery Detail Modal State
  const [inspectingDeliveryId, setInspectingDeliveryId] = React.useState<string | null>(null);
  const [deliveryDetail, setDeliveryDetail] = React.useState<WebhookDeliveryDetailDto | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [attempts, setAttempts] = React.useState<WebhookAttemptDto[]>([]);
  const [attemptsLoading, setAttemptsLoading] = React.useState(false);
  const [copiedPayload, setCopiedPayload] = React.useState(false);
  const [inspectorTab, setInspectorTab] = React.useState<'payload' | 'response'>('payload');

  // Manual Replay Modal State
  const [replayingDelivery, setReplayingDelivery] = React.useState<WebhookDeliveryDto | null>(null);
  const [isReplaying, setIsReplaying] = React.useState(false);
  const [replaySuccess, setReplaySuccess] = React.useState<string | null>(null);
  const [replayError, setReplayError] = React.useState<string | null>(null);

  // Load deliveries whenever filters or current cursor changes
  const loadDeliveries = React.useCallback(async (cursorParam?: string | null) => {
    setIsLoading(true);
    setError(null);

    try {
      const filter: WebhookDeliveryFilterDto = {
        limit: 15,
        ...(cursorParam ? { cursor: cursorParam } : {}),
        ...(filterEndpointId ? { endpointId: filterEndpointId } : {}),
        ...(filterStatus ? { status: filterStatus } : {}),
        ...(filterOrigin ? { origin: filterOrigin } : {}),
        ...(filterEventType ? { eventType: filterEventType } : {}),
      };

      const res: PaginatedWebhookDeliveriesDto = await apiClient.getWebhookDeliveries(filter);
      setDeliveries(res.items);
      setHasMore(res.hasMore);
      setNextCursor(res.nextCursor);
      setTotalCount(res.total);
    } catch (err: unknown) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load delivery history');
    } finally {
      setIsLoading(false);
    }
  }, [filterEndpointId, filterStatus, filterOrigin, filterEventType]);

  React.useEffect(() => {
    // Reset pagination history when filters change
    setCursorHistory([]);
    setCurrentCursor(null);
    loadDeliveries(null);
  }, [loadDeliveries]);

  // Pagination Handlers
  function handleNextPage() {
    if (!hasMore || !nextCursor) return;
    setCursorHistory((prev) => [...prev, currentCursor]);
    setCurrentCursor(nextCursor);
    loadDeliveries(nextCursor);
  }

  function handlePrevPage() {
    if (cursorHistory.length === 0) return;
    const prevCursor = cursorHistory[cursorHistory.length - 1];
    setCursorHistory((prev) => prev.slice(0, -1));
    setCurrentCursor(prevCursor);
    loadDeliveries(prevCursor);
  }

  function handleResetFilters() {
    setFilterEndpointId('');
    setFilterStatus('');
    setFilterOrigin('');
    setFilterEventType('');
    setCursorHistory([]);
    setCurrentCursor(null);
  }

  // Load delivery detail & attempts when inspecting
  async function openDetailModal(deliveryId: string) {
    setInspectingDeliveryId(deliveryId);
    setDetailLoading(true);
    setDetailError(null);
    setAttemptsLoading(true);
    setInspectorTab('payload');

    try {
      const detailPromise = apiClient.getWebhookDelivery(deliveryId);
      const attemptsPromise = apiClient.getWebhookDeliveryAttempts(deliveryId);

      const [detailRes, attemptsRes] = await Promise.all([detailPromise, attemptsPromise]);
      setDeliveryDetail(detailRes);
      setAttempts(attemptsRes);
    } catch (err: unknown) {
      setDetailError(err instanceof ApiClientError ? err.message : 'Failed to load delivery details');
    } finally {
      setDetailLoading(false);
      setAttemptsLoading(false);
    }
  }

  // Trigger manual replay modal
  function openReplayModal(delivery: WebhookDeliveryDto) {
    setReplayingDelivery(delivery);
    setReplayError(null);
    setReplaySuccess(null);
  }

  async function handleConfirmReplay() {
    if (!replayingDelivery) return;

    setIsReplaying(true);
    setReplayError(null);
    setReplaySuccess(null);

    try {
      const idempotencyKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `replay-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const res: ReplayWebhookDeliveryResponseDto = await apiClient.replayWebhookDelivery(
        replayingDelivery.id,
        idempotencyKey,
      );

      const successText = res.isIdempotent
        ? 'Existing idempotent replay delivery returned.'
        : res.message || 'Replay accepted and scheduled for execution.';

      setReplaySuccess(successText);

      // Refresh list
      await loadDeliveries(currentCursor);

      // Auto close after brief pause
      setTimeout(() => {
        setReplayingDelivery(null);
        setReplaySuccess(null);
      }, 1800);
    } catch (err: unknown) {
      setReplayError(
        err instanceof ApiClientError ? err.message : 'Failed to trigger delivery replay',
      );
    } finally {
      setIsReplaying(false);
    }
  }

  // Status Badge Helper
  function renderStatusBadge(status: WebhookDeliveryStatus | string) {
    switch (status) {
      case WEBHOOK_DELIVERY_STATUS.DELIVERED:
        return (
          <Badge variant="healthy" className="gap-1 font-mono text-[10px] px-1.5 py-0">
            <CheckCircle2 className="h-3 w-3 shrink-0" />
            <span>DELIVERED</span>
          </Badge>
        );
      case WEBHOOK_DELIVERY_STATUS.FAILED:
        return (
          <Badge variant="destructive" className="gap-1 font-mono text-[10px] px-1.5 py-0">
            <XCircle className="h-3 w-3 shrink-0" />
            <span>FAILED</span>
          </Badge>
        );
      case WEBHOOK_DELIVERY_STATUS.RETRYING:
        return (
          <Badge variant="warning" className="gap-1 font-mono text-[10px] px-1.5 py-0">
            <Clock className="h-3 w-3 shrink-0" />
            <span>RETRYING</span>
          </Badge>
        );
      case WEBHOOK_DELIVERY_STATUS.PROCESSING:
        return (
          <Badge variant="outline" className="border-[var(--primary)] text-[var(--primary)] gap-1 font-mono text-[10px] px-1.5 py-0">
            <RefreshCw className="h-3 w-3 shrink-0 animate-spin" />
            <span>PROCESSING</span>
          </Badge>
        );
      case WEBHOOK_DELIVERY_STATUS.PENDING:
      default:
        return (
          <Badge variant="outline" className="border-[var(--border)] text-[var(--text-muted)] gap-1 font-mono text-[10px] px-1.5 py-0">
            <Clock className="h-3 w-3 shrink-0" />
            <span>PENDING</span>
          </Badge>
        );
    }
  }

  // Origin Badge Helper
  function renderOriginBadge(origin: WebhookDeliveryOrigin | string) {
    if (origin === WEBHOOK_DELIVERY_ORIGIN.MANUAL_REPLAY) {
      return (
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-[2px] bg-[var(--surface-active)] text-[var(--primary)] border border-[var(--primary)]/30">
          REPLAY
        </span>
      );
    }
    return (
      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-[2px] bg-[var(--surface-subtle)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
        AUTO
      </span>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold font-mono text-[var(--text-primary)] flex items-center gap-2">
            <History className="h-4 w-4 text-[var(--primary)]" />
            <span>Webhook Delivery Audit Log</span>
            {totalCount !== undefined && (
              <Badge variant="secondary" className="font-mono text-xs tabular-nums">
                {totalCount} total
              </Badge>
            )}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Immutable transactional delivery trail with attempt history, socket-pinned execution logs, and manual replay.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => loadDeliveries(currentCursor)}
          disabled={isLoading}
          className="gap-1.5 shrink-0 font-mono text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Filter Toolbar */}
      <Card className="p-0 overflow-hidden">
        <div className="p-3 sm:p-4 bg-[var(--surface-subtle)] border-b border-[var(--border)] text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Filter: Endpoint */}
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[var(--text-secondary)]">Endpoint</label>
              <select
                value={filterEndpointId}
                onChange={(e) => setFilterEndpointId(e.target.value)}
                className="w-full text-xs rounded-[4px] bg-[var(--surface)] border border-[var(--border)] px-2.5 py-1.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] font-mono"
              >
                <option value="">All Endpoints</option>
                {webhooks.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter: Status */}
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[var(--text-secondary)]">Delivery Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as WebhookDeliveryStatus | '')}
                className="w-full text-xs rounded-[4px] bg-[var(--surface)] border border-[var(--border)] px-2.5 py-1.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] font-mono"
              >
                <option value="">All Statuses</option>
                <option value={WEBHOOK_DELIVERY_STATUS.DELIVERED}>DELIVERED</option>
                <option value={WEBHOOK_DELIVERY_STATUS.FAILED}>FAILED</option>
                <option value={WEBHOOK_DELIVERY_STATUS.RETRYING}>RETRYING</option>
                <option value={WEBHOOK_DELIVERY_STATUS.PROCESSING}>PROCESSING</option>
                <option value={WEBHOOK_DELIVERY_STATUS.PENDING}>PENDING</option>
              </select>
            </div>

            {/* Filter: Origin */}
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[var(--text-secondary)]">Origin / Lineage</label>
              <select
                value={filterOrigin}
                onChange={(e) => setFilterOrigin(e.target.value as WebhookDeliveryOrigin | '')}
                className="w-full text-xs rounded-[4px] bg-[var(--surface)] border border-[var(--border)] px-2.5 py-1.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] font-mono"
              >
                <option value="">All Origins</option>
                <option value={WEBHOOK_DELIVERY_ORIGIN.AUTOMATIC}>AUTOMATIC</option>
                <option value={WEBHOOK_DELIVERY_ORIGIN.MANUAL_REPLAY}>MANUAL REPLAY</option>
              </select>
            </div>

            {/* Filter: Event Type */}
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[var(--text-secondary)]">Event Type</label>
              <select
                value={filterEventType}
                onChange={(e) => setFilterEventType(e.target.value as WebhookEventType | '')}
                className="w-full text-xs rounded-[4px] bg-[var(--surface)] border border-[var(--border)] px-2.5 py-1.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] font-mono"
              >
                <option value="">All Events</option>
                {WEBHOOK_EVENT_TYPES.map((ev) => (
                  <option key={ev} value={ev}>
                    {ev}
                  </option>
                ))}
              </select>
            </div>

            {/* Reset Filters */}
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="w-full text-xs font-mono h-8"
              >
                Reset Filters
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Error state */}
      {error && (
        <div className="rounded-[4px] border border-[var(--status-down)]/40 bg-[var(--status-down-bg)]/20 p-3.5 text-xs text-[var(--status-down)] flex items-center gap-2.5">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Deliveries Table & Mobile Card View */}
      <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
        {/* Desktop Table View (>= 768px) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-muted)] font-mono text-[11px] bg-[var(--surface-subtle)]">
                <th className="py-2.5 px-3 font-medium">STATUS</th>
                <th className="py-2.5 px-3 font-medium">ORIGIN</th>
                <th className="py-2.5 px-3 font-medium">ENDPOINT SNAPSHOT</th>
                <th className="py-2.5 px-3 font-medium">EVENT</th>
                <th className="py-2.5 px-3 font-medium text-center">ATTEMPTS</th>
                <th className="py-2.5 px-3 font-medium">CREATED</th>
                <th className="py-2.5 px-3 font-medium text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] font-mono">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[var(--text-muted)]">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin text-[var(--primary)]" />
                      <span>Loading delivery records...</span>
                    </div>
                  </td>
                </tr>
              ) : deliveries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-[var(--text-muted)]">
                    <div className="space-y-1 max-w-sm mx-auto">
                      <History className="h-8 w-8 mx-auto text-[var(--text-dim)] mb-2" />
                      <p className="text-xs font-semibold text-[var(--text-primary)]">No Webhook Deliveries Recorded</p>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {filterStatus || filterOrigin || filterEventType || filterEndpointId
                          ? 'No deliveries match the applied filters.'
                          : 'Deliveries are logged automatically when monitored targets trigger incidents or recoveries.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                deliveries.map((delivery) => (
                  <tr key={delivery.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                    {/* Status */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {renderStatusBadge(delivery.status)}
                    </td>

                    {/* Origin */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {renderOriginBadge(delivery.origin)}
                    </td>

                    {/* Endpoint Snapshot */}
                    <td className="py-2.5 px-3 max-w-xs">
                      <div className="font-semibold text-[var(--text-primary)] truncate">{delivery.endpointName}</div>
                      <div className="font-mono text-[11px] text-[var(--text-muted)] truncate select-all">
                        {delivery.destinationUrl}
                      </div>
                    </td>

                    {/* Event Type */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {delivery.eventType ? (
                        <span className="font-mono text-[10px] text-[var(--primary)] bg-[var(--primary)]/10 border border-[var(--primary)]/20 px-1.5 py-0.5 rounded-[2px]">
                          {delivery.eventType}
                        </span>
                      ) : (
                        <span className="text-[var(--text-dim)]">—</span>
                      )}
                    </td>

                    {/* Attempt Count */}
                    <td className="py-2.5 px-3 text-center whitespace-nowrap tabular-nums">
                      <span className="font-bold text-[var(--text-primary)]">
                        {delivery.attemptCount}
                      </span>
                      <span className="text-[var(--text-dim)] text-[10px]"> / 6</span>
                      {delivery.lastHttpStatus && (
                        <div className="text-[10px] font-mono text-[var(--text-muted)]">
                          HTTP {delivery.lastHttpStatus}
                        </div>
                      )}
                    </td>

                    {/* Timestamp */}
                    <td className="py-2.5 px-3 whitespace-nowrap text-[var(--text-muted)] text-[11px] tabular-nums">
                      <div>{timeAgo(delivery.createdAt)}</div>
                      <div className="text-[10px] text-[var(--text-dim)]">
                        {formatExactDateTime(delivery.createdAt)}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDetailModal(delivery.id)}
                        className="h-6 px-2 text-[11px] font-mono text-[var(--primary)] hover:text-[var(--primary-hover)]"
                      >
                        Inspect
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openReplayModal(delivery)}
                        className="h-6 px-2 text-[11px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] gap-1"
                      >
                        <RotateCw className="h-2.5 w-2.5" />
                        <span>Replay</span>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Structured Card List (< 768px) */}
        <div className="md:hidden divide-y divide-[var(--border)] font-mono">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)]">
              Loading deliveries...
            </div>
          ) : deliveries.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)]">
              No webhook deliveries recorded.
            </div>
          ) : (
            deliveries.map((delivery) => (
              <div key={delivery.id} className="p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {renderStatusBadge(delivery.status)}
                    {renderOriginBadge(delivery.origin)}
                  </div>
                  <div className="text-[10px] text-[var(--text-dim)] tabular-nums">
                    {timeAgo(delivery.createdAt)}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    {delivery.endpointName}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">
                    {delivery.destinationUrl}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--primary)]">
                      {delivery.eventType || 'event'}
                    </span>
                    <span className="text-[var(--text-dim)]">•</span>
                    <span className="text-[var(--text-muted)] tabular-nums">
                      {delivery.attemptCount}/6 attempts
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openDetailModal(delivery.id)}
                      className="h-6 px-1.5 text-[11px] text-[var(--primary)]"
                    >
                      Inspect
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openReplayModal(delivery)}
                      className="h-6 px-1.5 text-[11px] text-[var(--text-secondary)]"
                    >
                      Replay
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination Footer */}
        <div className="p-3 bg-[var(--surface-subtle)] border-t border-[var(--border)] flex items-center justify-between text-xs font-mono text-[var(--text-muted)]">
          <div>
            {cursorHistory.length > 0
              ? `Page ${cursorHistory.length + 1}`
              : deliveries.length > 0
              ? 'Page 1'
              : 'Page 0'}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={cursorHistory.length === 0 || isLoading}
              className="h-7 px-2.5 text-xs font-mono"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              <span>Previous</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={!hasMore || isLoading}
              className="h-7 px-2.5 text-xs font-mono"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* DELIVERY INSPECTION MODAL */}
      {inspectingDeliveryId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-[6px] shadow-2xl overflow-hidden font-sans">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--surface-subtle)]">
              <div className="flex items-center gap-2.5">
                <History className="h-4 w-4 text-[var(--primary)] shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold font-mono text-[var(--text-primary)] flex items-center gap-2">
                    <span>Delivery Inspector</span>
                    {deliveryDetail && renderStatusBadge(deliveryDetail.status)}
                    {deliveryDetail && renderOriginBadge(deliveryDetail.origin)}
                  </h3>
                  <p className="font-mono text-[11px] text-[var(--text-muted)] mt-0.5 select-all">
                    ID: {inspectingDeliveryId}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setInspectingDeliveryId(null)}
                className="p-1 rounded-[2px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                aria-label="Close delivery inspector"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {detailLoading ? (
                <div className="py-16 text-center text-[var(--text-muted)] flex flex-col items-center justify-center gap-2 font-mono text-xs">
                  <RefreshCw className="h-5 w-5 animate-spin text-[var(--primary)]" />
                  <span>Loading delivery attempts and execution trace...</span>
                </div>
              ) : detailError ? (
                <div className="rounded-[4px] border border-[var(--status-down)]/40 bg-[var(--status-down-bg)]/20 p-3 text-xs text-[var(--status-down)] flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-[var(--status-down)] shrink-0" />
                  <span>{detailError}</span>
                </div>
              ) : deliveryDetail ? (
                <>
                  {/* Section 1: Snapshot vs Current Endpoint Configuration */}
                  <div className="space-y-2.5">
                    <h4 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-[var(--primary)]" />
                      <span>Endpoint Routing & Snapshot History</span>
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Historical Snapshot */}
                      <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono uppercase text-[var(--text-dim)]">Snapshot at Dispatch</span>
                          <span className="text-[10px] font-mono text-[var(--text-muted)]">Historical</span>
                        </div>
                        <div className="text-xs font-semibold text-[var(--text-primary)]">{deliveryDetail.endpointName}</div>
                        <div className="font-mono text-[11px] text-[var(--primary)] break-all select-all">
                          {deliveryDetail.destinationUrl}
                        </div>
                      </div>

                      {/* Current Live State */}
                      <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono uppercase text-[var(--text-dim)]">Current Live Endpoint</span>
                          {deliveryDetail.currentEndpoint?.isDeleted ? (
                            <Badge variant="destructive" className="text-[9px] font-mono px-1 py-0">
                              DELETED
                            </Badge>
                          ) : !deliveryDetail.currentEndpoint?.isEnabled ? (
                            <Badge variant="warning" className="text-[9px] font-mono px-1 py-0">
                              DISABLED
                            </Badge>
                          ) : (
                            <Badge variant="healthy" className="text-[9px] font-mono px-1 py-0">
                              ACTIVE
                            </Badge>
                          )}
                        </div>

                        {deliveryDetail.currentEndpoint ? (
                          <>
                            <div className="text-xs font-semibold text-[var(--text-primary)]">
                              {deliveryDetail.currentEndpoint.name}
                            </div>
                            <div className="font-mono text-[11px] text-[var(--text-secondary)] break-all select-all">
                              {deliveryDetail.currentEndpoint.url}
                            </div>
                            {deliveryDetail.currentEndpoint.url !== deliveryDetail.destinationUrl && (
                              <div className="text-[10px] font-mono text-[var(--status-warning)] flex items-center gap-1 pt-1">
                                <Info className="h-3 w-3 shrink-0" />
                                <span>URL changed since original delivery</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-xs text-[var(--text-dim)] italic pt-1 font-mono">
                            Endpoint no longer exists in database.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Replay Lineage Note if present */}
                    {deliveryDetail.replayOfId && (
                      <div className="rounded-[4px] border border-[var(--primary)]/30 bg-[var(--primary)]/10 p-2.5 text-xs text-[var(--primary)] flex items-center gap-2 font-mono">
                        <RotateCw className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          Replayed from original delivery:{' '}
                          <strong className="select-all">{deliveryDetail.replayOfId}</strong>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Section 2: Safe Payload & Response Inspector */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between border-b border-[var(--border)] pb-1.5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setInspectorTab('payload')}
                          className={`text-xs font-mono font-medium pb-1 border-b-2 transition-colors ${
                            inspectorTab === 'payload'
                              ? 'border-[var(--primary)] text-[var(--text-primary)]'
                              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          Event Payload JSON
                        </button>
                        {deliveryDetail.latestAttempt?.responsePreview && (
                          <button
                            type="button"
                            onClick={() => setInspectorTab('response')}
                            className={`text-xs font-mono font-medium pb-1 border-b-2 transition-colors ${
                              inspectorTab === 'response'
                                ? 'border-[var(--primary)] text-[var(--text-primary)]'
                                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            Latest Response Preview
                          </button>
                        )}
                      </div>

                      {inspectorTab === 'payload' && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              JSON.stringify(deliveryDetail.event.payload, null, 2),
                            );
                            setCopiedPayload(true);
                            setTimeout(() => setCopiedPayload(false), 2000);
                          }}
                          className="flex items-center gap-1 text-[11px] font-mono text-[var(--primary)] hover:underline"
                        >
                          {copiedPayload ? (
                            <Check className="h-3 w-3 text-[var(--status-healthy)]" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          <span>{copiedPayload ? 'Copied' : 'Copy JSON'}</span>
                        </button>
                      )}
                    </div>

                    {inspectorTab === 'payload' ? (
                      <div className="rounded-[4px] border border-[var(--border)] bg-[var(--background)] p-3 max-h-52 overflow-auto font-mono text-xs text-[var(--text-primary)] select-all whitespace-pre-wrap break-words">
                        {JSON.stringify(deliveryDetail.event.payload, null, 2)}
                      </div>
                    ) : (
                      <div className="rounded-[4px] border border-[var(--border)] bg-[var(--background)] p-3 max-h-52 overflow-auto font-mono text-xs text-[var(--text-secondary)] select-all whitespace-pre-wrap break-words">
                        {deliveryDetail.latestAttempt?.responsePreview || 'No response body recorded.'}
                      </div>
                    )}
                  </div>

                  {/* Section 3: Chronological Attempt Timeline */}
                  <div className="space-y-2.5">
                    <h4 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-[var(--primary)]" />
                      <span>Execution Trace ({attempts.length} Attempt{attempts.length === 1 ? '' : 's'})</span>
                    </h4>

                    {attemptsLoading ? (
                      <div className="py-6 text-center text-xs font-mono text-[var(--text-muted)]">
                        Loading execution trace...
                      </div>
                    ) : attempts.length === 0 ? (
                      <div className="p-3.5 rounded-[4px] bg-[var(--surface-subtle)] border border-[var(--border)] text-xs font-mono text-[var(--text-muted)] text-center">
                        Zero execution attempts recorded yet (delivery is queued).
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {attempts.map((attempt) => (
                          <div
                            key={attempt.id}
                            className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3 space-y-1.5 font-mono"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-[var(--text-primary)]">
                                  Attempt #{attempt.attemptNumber}
                                </span>
                                <Badge
                                  variant={
                                    attempt.outcome === 'SUCCESS'
                                      ? 'healthy'
                                      : attempt.outcome === 'FAILED'
                                      ? 'destructive'
                                      : 'outline'
                                  }
                                  className="text-[9px] px-1 py-0"
                                >
                                  {attempt.outcome}
                                </Badge>
                                {attempt.httpStatus && (
                                  <span className="text-[10px] text-[var(--text-secondary)] tabular-nums">
                                    HTTP {attempt.httpStatus}
                                  </span>
                                )}
                              </div>

                              <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-2 tabular-nums">
                                {attempt.durationMs !== null && (
                                  <span>{attempt.durationMs}ms</span>
                                )}
                                <span>{formatExactDateTime(attempt.startedAt)}</span>
                              </div>
                            </div>

                            {attempt.errorCode && (
                              <div className="text-xs text-[var(--status-down)]">
                                Error: {attempt.errorCode}
                              </div>
                            )}

                            {attempt.responsePreview && (
                              <div className="text-[11px] text-[var(--text-dim)] truncate pt-0.5">
                                Response: {attempt.responsePreview}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between p-3.5 border-t border-[var(--border)] bg-[var(--surface-subtle)]">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setInspectingDeliveryId(null)}
                className="font-mono text-xs"
              >
                Close
              </Button>

              {deliveryDetail && (
                <Button
                  size="sm"
                  onClick={() => {
                    const d = deliveryDetail;
                    setInspectingDeliveryId(null);
                    openReplayModal(d);
                  }}
                  className="font-mono text-xs gap-1.5"
                >
                  <RotateCw className="h-3 w-3" />
                  <span>Replay Delivery</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MANUAL REPLAY CONFIRMATION MODAL */}
      {replayingDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-[6px] shadow-2xl p-5 space-y-4 font-sans">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-[4px] bg-[var(--surface-active)] text-[var(--primary)] shrink-0">
                <RotateCw className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold font-mono text-[var(--text-primary)]">
                  Confirm Manual Webhook Replay
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Re-dispatches the stored event payload to the destination endpoint.
                </p>
              </div>
            </div>

            {/* Receiver Idempotency Warning */}
            <div className="rounded-[4px] border border-[var(--status-warning)]/40 bg-[var(--status-warning-bg)]/20 p-3 text-xs text-[var(--status-warning)] space-y-1">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>Receiver Idempotency Notice</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                If the destination server does not deduplicate requests using the{' '}
                <code className="bg-[var(--surface)] px-1 py-0.5 rounded-[2px] font-mono">
                  X-DevPulse-Event-Id
                </code>{' '}
                header, this replay will trigger duplicate webhook handling.
              </p>
            </div>

            {/* Target Summary */}
            <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-xs font-mono space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Endpoint:</span>
                <span className="text-[var(--text-primary)] font-semibold">{replayingDelivery.endpointName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Destination:</span>
                <span className="text-[var(--primary)] truncate max-w-xs">{replayingDelivery.destinationUrl}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Original Event:</span>
                <span className="text-[var(--text-secondary)]">{replayingDelivery.eventType || 'incident alert'}</span>
              </div>
              <div className="pt-1.5 text-[10px] text-[var(--text-muted)] space-y-0.5 border-t border-[var(--border-subtle)]">
                <div>• Event ID &amp; payload: Reused unchanged (<code className="font-mono text-[var(--text-secondary)]">X-DevPulse-Event-Id</code>)</div>
                <div>• Delivery ID: Fresh unique ID (<code className="font-mono text-[var(--text-secondary)]">X-DevPulse-Delivery-Id</code>)</div>
                <div>• Signing: Re-signed with current endpoint secret and fresh timestamp</div>
              </div>
            </div>

            {replaySuccess && (
              <div className="rounded-[4px] border border-[var(--status-healthy)]/40 bg-[var(--status-healthy-bg)]/20 p-3 text-xs text-[var(--status-healthy)] flex items-center gap-2 font-mono">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{replaySuccess}</span>
              </div>
            )}

            {replayError && (
              <div className="rounded-[4px] border border-[var(--status-down)]/40 bg-[var(--status-down-bg)]/20 p-3 text-xs text-[var(--status-down)] flex items-center gap-2 font-mono">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{replayError}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)] font-mono text-xs">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReplayingDelivery(null)}
                disabled={isReplaying}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmReplay}
                disabled={isReplaying}
                className="gap-1.5"
              >
                <RotateCw className={`h-3 w-3 ${isReplaying ? 'animate-spin' : ''}`} />
                <span>{isReplaying ? 'Dispatching...' : 'Dispatch Replay'}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
