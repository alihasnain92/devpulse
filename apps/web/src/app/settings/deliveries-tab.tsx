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
import { Card, CardContent } from '@/components/ui/card';
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

      setReplaySuccess(
        res.message || 'Replay accepted. Delivery will be processed asynchronously.',
      );

      // Refresh list
      await loadDeliveries(currentCursor);

      // Auto close after brief pause
      setTimeout(() => {
        setReplayingDelivery(null);
        setReplaySuccess(null);
      }, 1800);
    } catch (err: unknown) {
      setReplayError(err instanceof ApiClientError ? err.message : 'Failed to trigger replay');
    } finally {
      setIsReplaying(false);
    }
  }

  // Status Badge Helper
  function renderStatusBadge(status: WebhookDeliveryStatus | string) {
    switch (status) {
      case WEBHOOK_DELIVERY_STATUS.DELIVERED:
        return (
          <Badge className="bg-emerald-950/70 border-emerald-500/30 text-emerald-400 hover:bg-emerald-950/90 gap-1 font-mono text-[11px]">
            <CheckCircle2 className="h-3 w-3 shrink-0" />
            <span>DELIVERED</span>
          </Badge>
        );
      case WEBHOOK_DELIVERY_STATUS.FAILED:
        return (
          <Badge className="bg-red-950/70 border-red-500/30 text-red-400 hover:bg-red-950/90 gap-1 font-mono text-[11px]">
            <XCircle className="h-3 w-3 shrink-0" />
            <span>FAILED</span>
          </Badge>
        );
      case WEBHOOK_DELIVERY_STATUS.RETRYING:
        return (
          <Badge className="bg-amber-950/70 border-amber-500/30 text-amber-400 hover:bg-amber-950/90 gap-1 font-mono text-[11px]">
            <Clock className="h-3 w-3 shrink-0" />
            <span>RETRYING</span>
          </Badge>
        );
      case WEBHOOK_DELIVERY_STATUS.PROCESSING:
        return (
          <Badge className="bg-blue-950/70 border-blue-500/30 text-blue-400 hover:bg-blue-950/90 gap-1 font-mono text-[11px]">
            <RefreshCw className="h-3 w-3 shrink-0 animate-spin" />
            <span>PROCESSING</span>
          </Badge>
        );
      case WEBHOOK_DELIVERY_STATUS.PENDING:
      default:
        return (
          <Badge className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 gap-1 font-mono text-[11px]">
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
        <Badge className="bg-purple-950/70 border-purple-500/40 text-purple-300 hover:bg-purple-950/90 gap-1 font-mono text-[11px]">
          <RotateCw className="h-3 w-3 shrink-0" />
          <span>REPLAY</span>
        </Badge>
      );
    }
    return (
      <Badge className="bg-slate-800/80 border-slate-700/60 text-slate-400 font-mono text-[11px]">
        <span>AUTO</span>
      </Badge>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <History className="h-5 w-5 text-blue-400" />
            <span>Delivery History & Inspection</span>
            {totalCount !== undefined && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {totalCount} Total
              </Badge>
            )}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Immutable audit trail of all automatic and manual webhook dispatch attempts with payload and response inspection.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => loadDeliveries(currentCursor)}
          disabled={isLoading}
          className="gap-2 shrink-0 border-slate-700 hover:bg-slate-800 text-slate-300"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Filters Bar */}
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Filter: Endpoint */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-400">Endpoint</label>
              <select
                value={filterEndpointId}
                onChange={(e) => setFilterEndpointId(e.target.value)}
                className="w-full text-xs rounded-md bg-slate-950 border border-slate-800 px-3 py-2 text-slate-200 focus:outline-hidden focus:border-blue-500"
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
              <label className="text-[11px] font-medium text-slate-400">Delivery Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as WebhookDeliveryStatus | '')}
                className="w-full text-xs rounded-md bg-slate-950 border border-slate-800 px-3 py-2 text-slate-200 focus:outline-hidden focus:border-blue-500"
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
              <label className="text-[11px] font-medium text-slate-400">Origin / Lineage</label>
              <select
                value={filterOrigin}
                onChange={(e) => setFilterOrigin(e.target.value as WebhookDeliveryOrigin | '')}
                className="w-full text-xs rounded-md bg-slate-950 border border-slate-800 px-3 py-2 text-slate-200 focus:outline-hidden focus:border-blue-500"
              >
                <option value="">All Origins</option>
                <option value={WEBHOOK_DELIVERY_ORIGIN.AUTOMATIC}>AUTOMATIC</option>
                <option value={WEBHOOK_DELIVERY_ORIGIN.MANUAL_REPLAY}>MANUAL REPLAY</option>
              </select>
            </div>

            {/* Filter: Event Type */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-400">Event Type</label>
              <select
                value={filterEventType}
                onChange={(e) => setFilterEventType(e.target.value as WebhookEventType | '')}
                className="w-full text-xs rounded-md bg-slate-950 border border-slate-800 px-3 py-2 text-slate-200 focus:outline-hidden focus:border-blue-500"
              >
                <option value="">All Event Types</option>
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
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="w-full text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                Reset Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-4 text-xs text-red-300 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Deliveries Table */}
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 text-[11px] font-medium">
                <tr>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Origin</th>
                  <th className="py-3 px-4">Endpoint Snapshot</th>
                  <th className="py-3 px-4">Event</th>
                  <th className="py-3 px-4 text-center">Attempts</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                        <span>Loading webhook delivery records...</span>
                      </div>
                    </td>
                  </tr>
                ) : deliveries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      <div className="space-y-1">
                        <History className="h-8 w-8 mx-auto text-slate-600 mb-2 opacity-50" />
                        <p className="text-sm font-medium text-slate-300">No Webhook Deliveries Recorded</p>
                        <p className="text-xs text-slate-500">
                          {filterStatus || filterOrigin || filterEventType || filterEndpointId
                            ? 'No deliveries match the applied filters.'
                            : 'Deliveries will be logged automatically when incidents are detected or resolved.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  deliveries.map((delivery) => (
                    <tr key={delivery.id} className="hover:bg-slate-800/40 transition-colors">
                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {renderStatusBadge(delivery.status)}
                      </td>

                      {/* Origin */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {renderOriginBadge(delivery.origin)}
                      </td>

                      {/* Endpoint Snapshot */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-medium text-slate-200 truncate">{delivery.endpointName}</div>
                        <div className="font-mono text-[11px] text-slate-400 truncate mt-0.5">
                          {delivery.destinationUrl}
                        </div>
                      </td>

                      {/* Event Type */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {delivery.eventType ? (
                          <span className="font-mono text-[11px] text-blue-300 bg-blue-950/40 border border-blue-500/20 px-2 py-0.5 rounded">
                            {delivery.eventType}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>

                      {/* Attempt Count */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span className="font-mono text-slate-300 font-medium">
                          {delivery.attemptCount}
                        </span>
                        <span className="text-slate-500 text-[10px]"> / 6</span>
                        {delivery.lastHttpStatus && (
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                            HTTP {delivery.lastHttpStatus}
                          </div>
                        )}
                      </td>

                      {/* Timestamp */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-400 text-[11px]">
                        <div>{new Date(delivery.createdAt).toLocaleDateString()}</div>
                        <div className="text-slate-500 text-[10px]">
                          {new Date(delivery.createdAt).toLocaleTimeString()}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDetailModal(delivery.id)}
                          className="h-7 px-2 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-950/40"
                        >
                          Inspect
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openReplayModal(delivery)}
                          className="h-7 px-2 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-950/40 gap-1"
                        >
                          <RotateCw className="h-3 w-3" />
                          <span>Replay</span>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="p-3 bg-slate-950/40 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
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
                className="h-7 px-2.5 text-xs border-slate-700 hover:bg-slate-800"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={!hasMore || isLoading}
                className="h-7 px-2.5 text-xs border-slate-700 hover:bg-slate-800"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* MODAL 1: DELIVERY INSPECTION MODAL */}
      {inspectingDeliveryId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-950/60 border border-blue-500/30 text-blue-400">
                  <History className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <span>Delivery Inspection</span>
                    {deliveryDetail && renderStatusBadge(deliveryDetail.status)}
                    {deliveryDetail && renderOriginBadge(deliveryDetail.origin)}
                  </h3>
                  <p className="font-mono text-xs text-slate-400 mt-0.5 select-all">
                    ID: {inspectingDeliveryId}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setInspectingDeliveryId(null)}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {detailLoading ? (
                <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
                  <span>Loading delivery metadata and attempts...</span>
                </div>
              ) : detailError ? (
                <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-4 text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
                  <span>{detailError}</span>
                </div>
              ) : deliveryDetail ? (
                <>
                  {/* Section 1: Snapshot vs Current Endpoint Configuration */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-blue-400" />
                      <span>Endpoint Routing & Snapshot History</span>
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Historical Snapshot */}
                      <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-slate-400">Historical Snapshot</span>
                          <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-700">
                            At Dispatch
                          </Badge>
                        </div>
                        <div className="text-sm font-medium text-slate-200">{deliveryDetail.endpointName}</div>
                        <div className="font-mono text-xs text-blue-300 break-all select-all">
                          {deliveryDetail.destinationUrl}
                        </div>
                      </div>

                      {/* Current Live State */}
                      <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-slate-400">Live Endpoint Status</span>
                          {deliveryDetail.currentEndpoint?.isDeleted ? (
                            <Badge className="bg-red-950/80 border-red-500/30 text-red-400 text-[10px]">
                              Deleted
                            </Badge>
                          ) : !deliveryDetail.currentEndpoint?.isEnabled ? (
                            <Badge className="bg-amber-950/80 border-amber-500/30 text-amber-400 text-[10px]">
                              Disabled
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-950/80 border-emerald-500/30 text-emerald-400 text-[10px]">
                              Active
                            </Badge>
                          )}
                        </div>

                        {deliveryDetail.currentEndpoint ? (
                          <>
                            <div className="text-sm font-medium text-slate-200">
                              {deliveryDetail.currentEndpoint.name}
                            </div>
                            <div className="font-mono text-xs text-slate-400 break-all select-all">
                              {deliveryDetail.currentEndpoint.url}
                            </div>
                            {deliveryDetail.currentEndpoint.url !== deliveryDetail.destinationUrl && (
                              <div className="text-[11px] text-amber-400 flex items-center gap-1 pt-1">
                                <Info className="h-3 w-3 shrink-0" />
                                <span>Destination URL has changed since this delivery</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-xs text-slate-500 italic pt-1">
                            Endpoint no longer exists in database.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Replay Lineage Note if present */}
                    {deliveryDetail.replayOfId && (
                      <div className="rounded-lg border border-purple-500/30 bg-purple-950/20 p-2.5 text-xs text-purple-300 flex items-center gap-2">
                        <RotateCw className="h-4 w-4 shrink-0 text-purple-400" />
                        <span>
                          This delivery was manually replayed from original delivery{' '}
                          <strong className="font-mono">{deliveryDetail.replayOfId}</strong>.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Section 2: Safe Event Payload Inspector */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5 text-blue-400" />
                        <span>Dispatched Event Payload</span>
                      </h4>

                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            JSON.stringify(deliveryDetail.event.payload, null, 2),
                          );
                          setCopiedPayload(true);
                          setTimeout(() => setCopiedPayload(false), 2000);
                        }}
                        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                      >
                        {copiedPayload ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span>{copiedPayload ? 'Copied!' : 'Copy JSON'}</span>
                      </button>
                    </div>

                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 max-h-56 overflow-y-auto">
                      <pre className="font-mono text-xs text-emerald-300 break-words whitespace-pre-wrap select-all">
                        {JSON.stringify(deliveryDetail.event.payload, null, 2)}
                      </pre>
                    </div>
                  </div>

                  {/* Section 3: Chronological Attempt Timeline */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-blue-400" />
                      <span>Attempt Timeline ({attempts.length} Attempt{attempts.length === 1 ? '' : 's'})</span>
                    </h4>

                    {attemptsLoading ? (
                      <div className="py-6 text-center text-xs text-slate-500">
                        Loading attempts timeline...
                      </div>
                    ) : attempts.length === 0 ? (
                      <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-slate-500 text-center">
                        No execution attempts recorded yet (delivery is queued).
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {attempts.map((attempt) => (
                          <div
                            key={attempt.id}
                            className="rounded-lg border border-slate-800 bg-slate-950/90 p-3 space-y-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-xs text-white">
                                  Attempt #{attempt.attemptNumber}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${
                                    attempt.outcome === 'SUCCESS'
                                      ? 'border-emerald-500/40 text-emerald-400'
                                      : attempt.outcome === 'FAILED'
                                      ? 'border-red-500/40 text-red-400'
                                      : attempt.outcome === 'ABANDONED'
                                      ? 'border-amber-500/40 text-amber-400'
                                      : 'border-blue-500/40 text-blue-400'
                                  }`}
                                >
                                  {attempt.outcome}
                                </Badge>
                                {attempt.httpStatus && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-mono border-slate-700 text-slate-300"
                                  >
                                    HTTP {attempt.httpStatus}
                                  </Badge>
                                )}
                              </div>

                              <div className="text-[11px] text-slate-500 flex items-center gap-2">
                                {attempt.durationMs !== null && (
                                  <span>{attempt.durationMs}ms</span>
                                )}
                                <span>{new Date(attempt.startedAt).toLocaleTimeString()}</span>
                              </div>
                            </div>

                            {attempt.errorCode && (
                              <div className="text-xs text-red-400 font-mono">
                                Error: {attempt.errorCode}
                              </div>
                            )}

                            {attempt.responsePreview && (
                              <div className="space-y-1 pt-1">
                                <span className="text-[10px] font-medium text-slate-500">Response Preview:</span>
                                <div className="p-2 rounded bg-slate-900 border border-slate-800/80 font-mono text-[11px] text-slate-300 break-words max-h-24 overflow-y-auto">
                                  {attempt.responsePreview}
                                </div>
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
            <div className="flex items-center justify-between p-4 border-t border-slate-800 bg-slate-950/60">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setInspectingDeliveryId(null)}
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
                  className="bg-purple-600 hover:bg-purple-500 text-white gap-1.5"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  <span>Manual Replay</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: MANUAL REPLAY CONFIRMATION */}
      {replayingDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-slate-900 border border-purple-500/30 rounded-xl shadow-2xl p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-purple-950/60 border border-purple-500/30 text-purple-400 shrink-0">
                <RotateCw className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Confirm Manual Webhook Replay</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Re-dispatches the exact historical event payload to the current endpoint destination.
                </p>
              </div>
            </div>

            {/* Warning Banner */}
            <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3.5 text-xs text-amber-300 space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                <span>Receiver Idempotency Notice</span>
              </div>
              <p className="leading-relaxed">
                If the receiving server does not deduplicate requests using{' '}
                <code className="bg-amber-950/80 px-1 py-0.5 rounded text-amber-100 font-mono">
                  X-DevPulse-Event-Id
                </code>
                , this replay may trigger duplicate notifications or side-effects.
              </p>
            </div>

            {/* Target Summary */}
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-3.5 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Endpoint:</span>
                <span className="text-slate-200 font-medium">{replayingDelivery.endpointName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Destination:</span>
                <span className="font-mono text-blue-300 truncate max-w-xs">{replayingDelivery.destinationUrl}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Original Event ID:</span>
                <span className="font-mono text-slate-300">{replayingDelivery.eventId.slice(0, 16)}...</span>
              </div>
            </div>

            {replaySuccess && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>{replaySuccess}</span>
              </div>
            )}

            {replayError && (
              <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{replayError}</span>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-800">
              <Button
                variant="outline"
                onClick={() => setReplayingDelivery(null)}
                disabled={isReplaying}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmReplay}
                disabled={isReplaying}
                className="bg-purple-600 hover:bg-purple-500 text-white gap-2"
              >
                <RotateCw className={`h-3.5 w-3.5 ${isReplaying ? 'animate-spin' : ''}`} />
                <span>{isReplaying ? 'Accepting Replay...' : 'Dispatch Replay Now'}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
