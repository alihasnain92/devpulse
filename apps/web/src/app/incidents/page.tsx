'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { IncidentDto } from '@devpulse/shared';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Navbar } from '@/components/navbar';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Radio,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Calendar,
  AlertCircle,
} from 'lucide-react';

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.max(1, seconds)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
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

  // Periodic tick for real-time ongoing incident duration updates
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 5000);
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
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="flex items-center gap-3 text-slate-400">
            <AlertTriangle className="h-6 w-6 animate-pulse text-amber-500" />
            <span>Loading incident telemetry...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <span>Incident History</span>
              {ongoingIncidents.length > 0 && (
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Automated detection and recovery records for your monitored services.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadIncidents(true)}
              disabled={isRefreshing}
              className="gap-2 border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
            <Link href="/monitors">
              <Button size="sm" variant="secondary" className="gap-2">
                <Radio className="h-4 w-4" />
                <span>Monitors</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 flex items-center gap-3 text-red-300 text-sm">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Metric Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card
            className={`border-slate-800 ${
              ongoingIncidents.length > 0
                ? 'bg-red-950/20 border-red-900/50'
                : 'bg-slate-900/60'
            }`}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">
                Active Outages
              </CardTitle>
              {ongoingIncidents.length > 0 ? (
                <AlertTriangle className="h-4 w-4 text-red-400 animate-pulse" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              )}
            </CardHeader>
            <CardContent>
              <div
                className={`text-3xl font-bold ${
                  ongoingIncidents.length > 0 ? 'text-red-400' : 'text-emerald-400'
                }`}
              >
                {ongoingIncidents.length}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {ongoingIncidents.length > 0
                  ? 'Active incident affecting monitored targets'
                  : 'All monitored services operational'}
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">
                Resolved Incidents
              </CardTitle>
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">
                {resolvedIncidents.length}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Successfully recovered events
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">
                Total Detected
              </CardTitle>
              <Clock className="h-4 w-4 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">
                {incidents.length}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Triggered after 3 consecutive failures
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filter Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === 'all'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            All Incidents ({incidents.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              statusFilter === 'active'
                ? 'bg-red-600/20 text-red-400 border border-red-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            <span>Ongoing</span>
            {ongoingIncidents.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-red-500/30 text-red-300 text-[10px]">
                {ongoingIncidents.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setStatusFilter('resolved')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === 'resolved'
                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            Resolved ({resolvedIncidents.length})
          </button>
        </div>

        {/* Incidents List */}
        {filteredIncidents.length === 0 ? (
          <Card className="border-slate-800 bg-slate-900/40 text-center py-12 px-4">
            <div className="max-w-md mx-auto space-y-3">
              <div className="h-12 w-12 rounded-full bg-slate-800/80 flex items-center justify-center mx-auto text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-base font-medium text-white">
                {statusFilter === 'active'
                  ? 'No Active Outages'
                  : 'No Incidents Found'}
              </h3>
              <p className="text-xs text-slate-400">
                {statusFilter === 'active'
                  ? 'All monitored services are responding within expected parameters.'
                  : 'DevPulse automatically detects incidents when a monitor encounters 3 consecutive failures.'}
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredIncidents.map((incident) => {
              const isOngoing = !incident.isResolved;
              const startedTime = new Date(incident.startedAt).getTime();
              const elapsedSeconds = isOngoing
                ? Math.max(0, Math.floor((Date.now() - startedTime) / 1000))
                : incident.durationSeconds;

              return (
                <Card
                  key={incident.id}
                  className={`border-slate-800 transition-colors ${
                    isOngoing
                      ? 'bg-red-950/15 border-red-900/40 hover:border-red-800/60'
                      : 'bg-slate-900/60 hover:border-slate-700/80'
                  }`}
                >
                  <CardContent className="p-5">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Left: Monitor info & Status badge */}
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2.5">
                          {isOngoing ? (
                            <Badge
                              variant="destructive"
                              className="bg-red-950 text-red-400 border border-red-800/60 gap-1.5"
                            >
                              <span className="flex h-1.5 w-1.5 rounded-full bg-red-400 animate-ping"></span>
                              Ongoing Outage
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/30 bg-emerald-950/30 text-emerald-400 gap-1"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Resolved
                            </Badge>
                          )}

                          {incident.isSeeded && (
                            <Badge
                              variant="outline"
                              className="border-amber-500/40 bg-amber-500/10 text-amber-400 text-[10px]"
                            >
                              Simulated Event
                            </Badge>
                          )}

                          <Link
                            href={`/monitors/${incident.monitorId}`}
                            className="font-semibold text-white hover:text-blue-400 flex items-center gap-1.5 transition-colors"
                          >
                            <span>{incident.monitorName || 'Monitored Service'}</span>
                            <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                          </Link>
                        </div>

                        {/* Sanitized Cause description */}
                        <div className="text-xs text-slate-300 font-mono bg-slate-950/60 rounded px-2.5 py-1.5 border border-slate-800/80 max-w-2xl break-all">
                          {incident.cause}
                        </div>
                      </div>

                      {/* Right: Timing details */}
                      <div className="flex flex-wrap items-center gap-6 text-xs text-slate-400 shrink-0">
                        <div className="space-y-0.5">
                          <div className="text-[11px] text-slate-500 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>Duration</span>
                          </div>
                          <div
                            className={`font-semibold ${
                              isOngoing ? 'text-red-400' : 'text-slate-200'
                            }`}
                          >
                            {formatDuration(elapsedSeconds)}
                          </div>
                        </div>

                        <div className="space-y-0.5">
                          <div className="text-[11px] text-slate-500 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>Started At</span>
                          </div>
                          <div className="text-slate-200">
                            {formatDate(incident.startedAt)}
                          </div>
                        </div>

                        <div className="space-y-0.5">
                          <div className="text-[11px] text-slate-500 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Resolved At</span>
                          </div>
                          <div className="text-slate-200">
                            {incident.resolvedAt
                              ? formatDate(incident.resolvedAt)
                              : 'Ongoing'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
