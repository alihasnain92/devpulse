'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MonitorDto } from '@devpulse/shared';
import { apiClient } from '@/lib/api-client';
import { Navbar } from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Activity,
  ArrowLeft,
  Clock,
  Edit,
  ExternalLink,
  Globe,
  Pause,
  Play,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Layers,
} from 'lucide-react';

interface MonitorDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function MonitorDetailPage({ params }: MonitorDetailPageProps) {
  const router = useRouter();
  const { id } = use(params);

  const [monitor, setMonitor] = useState<MonitorDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const fetchMonitor = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.getMonitor(id);
      setMonitor(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Monitor not found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonitor();
  }, [id]);

  const handleTogglePause = async () => {
    if (!monitor) return;
    try {
      setIsToggling(true);
      const newStatus = !monitor.isPaused;
      const updated = await apiClient.updateMonitor(monitor.id, {
        isPaused: newStatus,
      });
      setMonitor(updated);
      setFeedback({
        type: 'success',
        text: `Monitor ${newStatus ? 'paused' : 'resumed'} successfully.`,
      });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update monitor',
      });
    } finally {
      setIsToggling(false);
    }
  };

  const handleDelete = async () => {
    if (!monitor) return;
    try {
      setIsDeleting(true);
      await apiClient.deleteMonitor(monitor.id);
      router.push('/monitors');
    } catch (err) {
      setIsDeleting(false);
      setShowDeleteDialog(false);
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to delete monitor',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-8 text-slate-400">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 animate-pulse text-blue-500" />
            <span>Loading monitor configuration...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !monitor) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-16 text-center space-y-4">
          <div className="h-16 w-16 rounded-2xl bg-red-600/10 border border-red-500/20 flex items-center justify-center mx-auto text-red-400">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Monitor Not Found</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            {error || 'The requested monitor does not exist or you do not have permission to view it.'}
          </p>
          <div className="pt-2">
            <Link href="/monitors">
              <Button variant="outline" className="border-slate-700">
                Back to Monitors
              </Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Navigation Breadcrumb */}
        <div>
          <Link
            href="/monitors"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Monitors</span>
          </Link>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`rounded-xl border p-4 flex items-center justify-between text-sm ${
              feedback.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
                : 'border-red-500/30 bg-red-950/20 text-red-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
          </div>
        )}

        {/* Header with Title and Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                {monitor.name}
              </h1>
              <Badge
                variant={monitor.isPaused ? 'warning' : 'success'}
                className="text-xs uppercase font-bold"
              >
                {monitor.isPaused ? 'Paused' : 'Active'}
              </Badge>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
              <Globe className="h-3.5 w-3.5 text-slate-500" />
              <span>{monitor.url}</span>
              <a
                href={monitor.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 hover:text-slate-300"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant={monitor.isPaused ? 'outline' : 'secondary'}
              size="sm"
              onClick={handleTogglePause}
              disabled={isToggling}
              className="gap-1.5 text-xs h-9"
            >
              {monitor.isPaused ? (
                <>
                  <Play className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Resume Monitor</span>
                </>
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5 text-amber-400" />
                  <span>Pause Monitor</span>
                </>
              )}
            </Button>

            <Link href={`/monitors/${monitor.id}/edit`}>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-9 border-slate-700">
                <Edit className="h-3.5 w-3.5" />
                <span>Edit</span>
              </Button>
            </Link>

            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              className="gap-1.5 text-xs h-9 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white border border-red-500/30"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete</span>
            </Button>
          </div>
        </div>

        {/* Configuration Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-slate-800 bg-slate-900/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-slate-400">
                HTTP Method
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-white font-mono">{monitor.method}</div>
              <p className="text-[11px] text-slate-500 mt-1">Outbound request method</p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-slate-400">
                Check Cadence
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-white font-mono">{monitor.intervalSeconds}s</div>
              <p className="text-[11px] text-slate-500 mt-1">Scheduled check interval</p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-slate-400">
                Network Timeout
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-white font-mono">{monitor.timeoutMs / 1000}s</div>
              <p className="text-[11px] text-slate-500 mt-1">{monitor.timeoutMs}ms limit</p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-slate-400">
                Expected Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-emerald-400 font-mono">{monitor.expectedStatus}</div>
              <p className="text-[11px] text-slate-500 mt-1">Target HTTP response code</p>
            </CardContent>
          </Card>
        </div>

        {/* Telemetry / Honest Scope Card */}
        <Card className="border-slate-800 bg-slate-900/50 shadow-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg text-white">Execution Telemetry</CardTitle>
                <CardDescription className="text-slate-400">
                  Background health check execution and latency records
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-slate-400 border-slate-700">
                Phase 3 Feature
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/60 p-8 text-center space-y-3">
              <div className="h-12 w-12 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mx-auto text-blue-400">
                <Clock className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-white">No Check Results Recorded Yet</h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  Scheduled outbound HTTP health checks, SSRF safe dispatching, and Redis/BullMQ background worker execution will be introduced in Phase 3. No synthetic or simulated uptime data is generated.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-400 pt-2 border-t border-slate-800/80">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-500" />
                <span>Created: {new Date(monitor.createdAt).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-slate-500" />
                <span>Last Updated: {new Date(monitor.updatedAt).toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Incidents Card (Honest State) */}
        <Card className="border-slate-800 bg-slate-900/50 shadow-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg text-white">Incident History</CardTitle>
                <CardDescription className="text-slate-400">
                  Automated incident lifecycle tracking and recovery status
                </CardDescription>
              </div>
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-xs">
                Zero Incidents
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-400">
              No incidents on record. Incident detection evaluates consecutive health check failures (threshold K=3) once background workers are activated in Phase 3.
            </p>
          </CardContent>
        </Card>
      </main>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Monitor"
        description={`Are you sure you want to delete "${monitor.name}"? This action cannot be undone.`}
        confirmText="Delete Monitor"
        cancelText="Cancel"
        isDestructive={true}
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </div>
  );
}
