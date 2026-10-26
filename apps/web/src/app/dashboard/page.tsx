'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckResultDto, MonitorDto } from '@devpulse/shared';
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
  Clock,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [monitors, setMonitors] = useState<MonitorDto[]>([]);
  const [latestChecks, setLatestChecks] = useState<
    Record<string, CheckResultDto | null>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const data = await apiClient.getMonitors();
        setMonitors(data);

        // Fetch latest checks for the monitors
        const checkResults = await Promise.all(
          data.map(async (m) => {
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

  // Real telemetry metrics
  let passingCount = 0;
  let failingCount = 0;
  let neverCheckedCount = 0;

  for (const m of monitors) {
    const chk = latestChecks[m.id];
    if (!chk) {
      neverCheckedCount++;
    } else if (chk.isSuccess) {
      passingCount++;
    } else {
      failingCount++;
    }
  }

  const recentMonitors = monitors.slice(0, 5);

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
            <Link href="/monitors/new">
              <Button className="gap-2 shadow-lg shadow-blue-600/20">
                <Plus className="h-4 w-4" />
                <span>New Monitor</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Phase 3 Boundary Banner */}
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4 sm:p-5 flex items-start gap-4">
          <ShieldCheck className="h-6 w-6 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <div className="font-semibold text-emerald-300 flex items-center gap-2">
              <span>Phase 3 Active: SSRF-Safe Monitoring & Background Processing</span>
              <Badge variant="outline" className="border-emerald-400/30 text-emerald-300 text-xs">
                BullMQ + Redis Active
              </Badge>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Outbound HTTP/HTTPS checks execute with connection pinning, redirect hop verification, 1MB limits, and multi-layer SSRF defense. Manual checks and recurring schedules run via BullMQ 6.
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

          <Card className="border-slate-800 bg-slate-900/60 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">
                Awaiting Checks
              </CardTitle>
              <Clock className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-300">{neverCheckedCount}</div>
              <p className="text-xs text-slate-400 mt-1">Newly created or unexecuted</p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Monitors Section */}
        {totalMonitors === 0 ? (
          /* Honest Empty State */
          <Card className="border-dashed border-slate-800 bg-slate-900/20 text-center py-16 px-4">
            <CardContent className="space-y-4 max-w-md mx-auto">
              <div className="h-14 w-14 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mx-auto text-blue-400">
                <Radio className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-white">No monitors configured</h3>
                <p className="text-sm text-slate-400">
                  You have not created any API monitors yet. Add your first HTTP endpoint to track availability and latency.
                </p>
              </div>
              <Link href="/monitors/new" className="inline-block pt-2">
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  <span>Create First Monitor</span>
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          /* Recent Monitors List */
          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg text-white">Configured Monitors</CardTitle>
                <CardDescription className="text-slate-400">
                  Latest status and telemetry across your monitored targets
                </CardDescription>
              </div>
              <Link href="/monitors">
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-blue-400 hover:text-blue-300">
                  <span>View All</span>
                  <ArrowRight className="h-3.5 w-3.5" />
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
                      className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 first:pt-0 last:pb-0"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2.5">
                          <Link
                            href={`/monitors/${monitor.id}`}
                            className="font-medium text-white hover:text-blue-400 transition-colors truncate"
                          >
                            {monitor.name}
                          </Link>
                          <Badge
                            variant={monitor.isPaused ? 'warning' : 'success'}
                            className="text-[10px] uppercase font-bold"
                          >
                            {monitor.isPaused ? 'Paused' : 'Active'}
                          </Badge>
                          {check ? (
                            <Badge
                              variant={check.isSuccess ? 'success' : 'destructive'}
                              className="text-[10px] font-bold font-mono"
                            >
                              {check.isSuccess
                                ? `${check.statusCode} OK • ${check.latencyMs}ms`
                                : `FAIL • ${check.statusCode ?? 'ERR'}`}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-slate-400 border-slate-700"
                            >
                              Never Checked
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-400">
                          <span className="font-mono text-slate-300 truncate max-w-xs sm:max-w-md">
                            {monitor.url}
                          </span>
                          <span>•</span>
                          <span>{monitor.intervalSeconds}s interval</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                        <Link href={`/monitors/${monitor.id}`}>
                          <Button variant="outline" size="sm" className="text-xs h-8 border-slate-700">
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
      </main>
    </div>
  );
}
