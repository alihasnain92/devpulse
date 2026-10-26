'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { MonitorDto } from '@devpulse/shared';
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
  PauseCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [monitors, setMonitors] = useState<MonitorDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const data = await apiClient.getMonitors();
        setMonitors(data);
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

        {/* Phase Boundary Notice: Honest State */}
        <div className="rounded-xl border border-blue-500/20 bg-blue-950/20 p-4 sm:p-5 flex items-start gap-4">
          <ShieldCheck className="h-6 w-6 text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <div className="font-semibold text-blue-300 flex items-center gap-2">
              <span>Phase 2 Active: Monitor Management & Dashboard Shell</span>
              <Badge variant="outline" className="border-blue-400/30 text-blue-300 text-xs">
                Real DB Records
              </Badge>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Monitors are persisted in PostgreSQL with tenant isolation. Outbound HTTP ping execution, BullMQ distributed schedulers, and incident detection will be enabled in Phase 3. No synthetic or simulated health stats are displayed.
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Card className="border-slate-800 bg-slate-900/60 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">
                Total Monitors
              </CardTitle>
              <Radio className="h-4 w-4 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{totalMonitors}</div>
              <p className="text-xs text-slate-400 mt-1">Configured in account</p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/60 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">
                Active Monitors
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-emerald-400">{activeMonitors}</div>
              <p className="text-xs text-slate-400 mt-1">Ready for scheduled checks</p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/60 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">
                Paused Monitors
              </CardTitle>
              <PauseCircle className="h-4 w-4 text-amber-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-400">{pausedMonitors}</div>
              <p className="text-xs text-slate-400 mt-1">Checks temporarily disabled</p>
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
                  Recent API targets registered in your account
                </CardDescription>
              </div>
              <Link href="/monitors">
                <Button variant="ghost" size="sm" className="gap-1.5 text-blue-400 hover:text-blue-300">
                  <span>View All ({totalMonitors})</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-slate-800/80">
                {recentMonitors.map((monitor) => (
                  <div
                    key={monitor.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-800/20 rounded-lg px-2 transition-colors"
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
                        <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-700">
                          {monitor.method}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-slate-400">
                        <span className="truncate max-w-xs sm:max-w-md flex items-center gap-1 font-mono text-[11px]">
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
                        <span className="hidden sm:inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {monitor.intervalSeconds}s interval
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant="outline" className="text-slate-400 border-slate-800 bg-slate-900/60 text-xs">
                        Checks Pending (Phase 3)
                      </Badge>
                      <Link href={`/monitors/${monitor.id}`}>
                        <Button variant="outline" size="sm" className="h-8 text-xs border-slate-700">
                          Details
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
