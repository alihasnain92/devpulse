'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckResultDto, IncidentDto, MonitorDto } from '@devpulse/shared';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Navbar } from '@/components/navbar';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  Plus,
  Radio,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
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

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [monitors, setMonitors] = useState<MonitorDto[]>([]);
  const [latestChecks, setLatestChecks] = useState<
    Record<string, CheckResultDto | null>
  >({});
  const [incidents, setIncidents] = useState<IncidentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [monitorsData, incidentsData] = await Promise.all([
          apiClient.getMonitors(),
          apiClient.getIncidents({ limit: 10 }).catch(() => [] as IncidentDto[]),
        ]);

        setMonitors(monitorsData);
        setIncidents(incidentsData);

        // Fetch latest checks for the monitors
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
          err instanceof Error ? err.message : 'Failed to load monitor data',
        );
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) {
      loadData();
    }
  }, [authLoading]);

  if (authLoading || (loading && monitors.length === 0)) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="flex items-center gap-3 text-slate-400">
            <Activity className="h-6 w-6 animate-pulse text-blue-500" />
            <span>Loading dashboard telemetry...</span>
          </div>
        </div>
      </div>
    );
  }

  const totalMonitors = monitors.length;
  const activeMonitors = monitors.filter((m) => !m.isPaused).length;
  const pausedMonitors = monitors.filter((m) => m.isPaused).length;
  const activeIncidents = incidents.filter((i) => !i.isResolved);

  // Real telemetry metrics
  let passingCount = 0;
  let failingCount = 0;

  for (const m of monitors) {
    const chk = latestChecks[m.id];
    if (chk) {
      if (chk.isSuccess) {
        passingCount++;
      } else {
        failingCount++;
      }
    }
  }

  const recentMonitors = monitors.slice(0, 5);
  const recentIncidents = incidents.slice(0, 5);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Welcome & Action Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              System Dashboard
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Welcome back,{' '}
              <span className="text-slate-200 font-medium">
                {user?.name || user?.email}
              </span>
              . Real-time overview of your monitored services.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/incidents">
              <Button variant="outline" size="sm" className="gap-2 border-slate-700 bg-slate-900 text-slate-300">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <span>Incidents ({activeIncidents.length})</span>
              </Button>
            </Link>
            <Link href="/monitors/new">
              <Button size="sm" className="gap-2 shadow-lg shadow-blue-600/20">
                <Plus className="h-4 w-4" />
                <span>New Monitor</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Active Outage Alert Banner (If Any Active Incidents) */}
        {activeIncidents.length > 0 && (
          <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-4 sm:p-5 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-3 w-3 relative mt-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </div>
              <div className="space-y-1 text-sm">
                <div className="font-semibold text-red-300 flex items-center gap-2">
                  <span>Ongoing Service Outage Detected</span>
                  <Badge variant="destructive" className="bg-red-900/60 text-red-200 text-xs">
                    {activeIncidents.length} Active {activeIncidents.length === 1 ? 'Incident' : 'Incidents'}
                  </Badge>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Automated incident detection triggered after 3 consecutive check failures. Service health degradation requires attention.
                </p>
              </div>
            </div>
            <Link href="/incidents" className="shrink-0">
              <Button size="sm" variant="destructive" className="gap-1.5 text-xs">
                <span>View Incident Log</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        )}

        {/* Phase Architecture Banner */}
        <div className="rounded-xl border border-blue-500/20 bg-blue-950/20 p-4 sm:p-5 flex items-start gap-4">
          <ShieldCheck className="h-6 w-6 text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <div className="font-semibold text-blue-300 flex items-center gap-2">
              <span>Phase 4 Active: Automated Incident Detection & Recovery</span>
              <Badge variant="outline" className="border-blue-400/30 text-blue-300 text-xs">
                3-Failure Streak Trigger
              </Badge>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              devpulse automatically tracks consecutive failures, opens serialized active incidents with row-level locks, prevents duplicate records, and resolves incidents when endpoints recover.
            </p>
          </div>
        </div>

        {/* Error Banner if fetch failed */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 flex items-center gap-3 text-red-300 text-sm">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-slate-800 bg-slate-900/60 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">
                Total Monitors
              </CardTitle>
              <Radio className="h-4 w-4 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{totalMonitors}</div>
              <p className="text-xs text-slate-400 mt-1">
                {activeMonitors} active, {pausedMonitors} paused
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/60 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">
                Passing Endpoints
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-emerald-400">{passingCount}</div>
              <p className="text-xs text-slate-400 mt-1">Expected HTTP status verified</p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/60 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">
                Failing Endpoints
              </CardTitle>
              <AlertCircle className="h-4 w-4 text-red-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-400">{failingCount}</div>
              <p className="text-xs text-slate-400 mt-1">Status mismatch or network error</p>
            </CardContent>
          </Card>

          <Card
            className={`border-slate-800 shadow-xs ${
              activeIncidents.length > 0
                ? 'bg-red-950/20 border-red-900/50'
                : 'bg-slate-900/60'
            }`}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">
                Active Outages
              </CardTitle>
              {activeIncidents.length > 0 ? (
                <AlertTriangle className="h-4 w-4 text-red-400 animate-pulse" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              )}
            </CardHeader>
            <CardContent>
              <div
                className={`text-3xl font-bold ${
                  activeIncidents.length > 0 ? 'text-red-400' : 'text-emerald-400'
                }`}
              >
                {activeIncidents.length}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {activeIncidents.length > 0
                  ? 'Ongoing incident in progress'
                  : 'Zero active outages recorded'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Monitors & Recent Incidents Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Monitors List */}
          {totalMonitors === 0 ? (
            <Card className="border-dashed border-slate-800 bg-slate-900/20 text-center py-12 px-4">
              <CardContent className="space-y-3 max-w-md mx-auto">
                <div className="h-12 w-12 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mx-auto text-blue-400">
                  <Radio className="h-6 w-6" />
                </div>
                <h3 className="text-base font-semibold text-white">No monitors configured</h3>
                <p className="text-xs text-slate-400">
                  Add an HTTP endpoint to start automated health checks and incident tracking.
                </p>
                <Link href="/monitors/new" className="inline-block pt-1">
                  <Button size="sm" className="gap-2">
                    <Plus className="h-4 w-4" />
                    <span>Create Monitor</span>
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base text-white">Monitors Overview</CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    Latest status of monitored services
                  </CardDescription>
                </div>
                <Link href="/monitors">
                  <Button variant="ghost" size="sm" className="gap-1 text-xs text-blue-400 hover:text-blue-300">
                    <span>View All</span>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-slate-800/80">
                  {recentMonitors.map((monitor) => {
                    const check = latestChecks[monitor.id];

                    return (
                      <div
                        key={monitor.id}
                        className="py-3 flex items-center justify-between gap-3 first:pt-0 last:pb-0"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/monitors/${monitor.id}`}
                              className="font-medium text-sm text-white hover:text-blue-400 transition-colors truncate"
                            >
                              {monitor.name}
                            </Link>
                            <Badge
                              variant={monitor.isPaused ? 'warning' : 'success'}
                              className="text-[9px] uppercase font-bold px-1.5 py-0"
                            >
                              {monitor.isPaused ? 'Paused' : 'Active'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span className="font-mono text-[11px] truncate max-w-[200px]">
                              {monitor.url}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {check ? (
                            <Badge
                              variant={check.isSuccess ? 'success' : 'destructive'}
                              className="text-[10px] font-bold font-mono"
                            >
                              {check.isSuccess
                                ? `${check.statusCode} OK`
                                : `FAIL ${check.statusCode ?? 'ERR'}`}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-slate-400 border-slate-700"
                            >
                              Never Checked
                            </Badge>
                          )}
                          <Link href={`/monitors/${monitor.id}`}>
                            <Button variant="outline" size="sm" className="text-xs h-7 px-2 border-slate-700">
                              Details
                            </Button>
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Incidents Section */}
          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base text-white">Recent Incidents</CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Automated outage and recovery events
                </CardDescription>
              </div>
              <Link href="/incidents">
                <Button variant="ghost" size="sm" className="gap-1 text-xs text-blue-400 hover:text-blue-300">
                  <span>View All ({incidents.length})</span>
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {recentIncidents.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto" />
                  <div className="text-sm font-medium text-white">No incidents logged</div>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">
                    No outages detected yet. Incidents are created after 3 consecutive check failures.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800/80">
                  {recentIncidents.map((incident) => {
                    const isOngoing = !incident.isResolved;
                    const elapsed = isOngoing
                      ? Math.max(0, Math.floor((Date.now() - new Date(incident.startedAt).getTime()) / 1000))
                      : incident.durationSeconds;

                    return (
                      <div
                        key={incident.id}
                        className="py-3 flex items-center justify-between gap-3 first:pt-0 last:pb-0"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
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
                            <Link
                              href={`/monitors/${incident.monitorId}`}
                              className="font-medium text-sm text-white hover:text-blue-400 transition-colors truncate"
                            >
                              {incident.monitorName || 'Monitored Service'}
                            </Link>
                          </div>
                          <p className="text-xs text-slate-400 truncate max-w-xs font-mono">
                            {incident.cause}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <div className={`text-xs font-medium ${isOngoing ? 'text-red-400' : 'text-slate-300'}`}>
                            {formatDuration(elapsed)}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {isOngoing ? 'downtime' : 'total duration'}
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
    </div>
  );
}
