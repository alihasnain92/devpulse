'use client';

import React, { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { HttpMethod, MONITOR_LIMITS } from '@devpulse/shared';
import { apiClient } from '@/lib/api-client';
import { Navbar } from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { OperationalPageHeader } from '@/components/ui/operational-page-header';
import { ArrowLeft, Save, AlertCircle, ShieldCheck } from 'lucide-react';

interface EditMonitorPageProps {
  params: Promise<{ id: string }>;
}

export default function EditMonitorPage({ params }: EditMonitorPageProps) {
  const router = useRouter();
  const { id } = use(params);

  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState<HttpMethod>(HttpMethod.GET);
  const [intervalSeconds, setIntervalSeconds] = useState<number>(60);
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(10);
  const [expectedStatus, setExpectedStatus] = useState<number>(200);

  useEffect(() => {
    async function loadMonitor() {
      try {
        setLoading(true);
        setErrorMessage(null);
        const data = await apiClient.getMonitor(id);
        setName(data.name);
        setUrl(data.url);
        setMethod(data.method);
        setIntervalSeconds(data.intervalSeconds);
        setTimeoutSeconds(data.timeoutMs / 1000);
        setExpectedStatus(data.expectedStatus);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load monitor');
      } finally {
        setLoading(false);
      }
    }

    loadMonitor();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage('Monitor name is required');
      return;
    }

    if (!url.trim()) {
      setErrorMessage('URL is required');
      return;
    }

    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setErrorMessage('URL protocol must be http: or https:');
        return;
      }
    } catch {
      setErrorMessage('Please enter a valid HTTP or HTTPS URL (e.g. https://api.example.com/health)');
      return;
    }

    if (
      intervalSeconds < MONITOR_LIMITS.MIN_INTERVAL_SECONDS ||
      intervalSeconds > MONITOR_LIMITS.MAX_INTERVAL_SECONDS
    ) {
      setErrorMessage(
        `Interval must be between ${MONITOR_LIMITS.MIN_INTERVAL_SECONDS} and ${MONITOR_LIMITS.MAX_INTERVAL_SECONDS} seconds`,
      );
      return;
    }

    if (
      timeoutSeconds < 1 ||
      timeoutSeconds > MONITOR_LIMITS.MAX_TIMEOUT_MS / 1000
    ) {
      setErrorMessage(
        `Timeout must be between 1 and ${MONITOR_LIMITS.MAX_TIMEOUT_MS / 1000} seconds`,
      );
      return;
    }

    if (expectedStatus < 100 || expectedStatus > 599) {
      setErrorMessage('Expected HTTP status code must be between 100 and 599');
      return;
    }

    try {
      setIsSubmitting(true);
      await apiClient.updateMonitor(id, {
        name: name.trim(),
        url: url.trim(),
        method,
        intervalSeconds: Number(intervalSeconds),
        timeoutMs: Number(timeoutSeconds) * 1000,
        expectedStatus: Number(expectedStatus),
      });

      router.push(`/monitors/${id}`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to update monitor',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6 animate-pulse">
          <div className="h-6 w-32 bg-[var(--surface)] rounded-[4px]" />
          <div className="h-10 w-64 bg-[var(--surface)] rounded-[4px]" />
          <div className="h-96 bg-[var(--surface)] rounded-[6px]" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Back Link */}
        <div>
          <Link
            href={`/monitors/${id}`}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-focus)] rounded-[2px]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Monitor Details</span>
          </Link>
        </div>

        {/* Page Header */}
        <OperationalPageHeader
          eyebrow="Configuration"
          title="Edit Monitor"
          description={`Update health check parameters and targets for ${name || 'endpoint'}.`}
        />

        {/* Operational Security Notice */}
        <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3.5 flex items-start gap-3">
          <ShieldCheck className="h-4 w-4 text-[var(--primary)] shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--text-secondary)] space-y-0.5 leading-relaxed">
            <span className="font-semibold text-[var(--text-primary)] block">
              SSRF & Egress Protection Active
            </span>
            <span>
              Updated target URLs are re-validated against strict private network ranges and SSRF protections before checks resume.
            </span>
          </div>
        </div>

        {/* Validation Error Message */}
        {errorMessage && (
          <div
            role="alert"
            className="rounded-[4px] border border-[var(--status-down)]/40 bg-[var(--status-down-bg)]/20 p-3.5 flex items-center gap-2.5 text-xs text-[var(--status-down)]"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form Card */}
        <Card className="p-0 overflow-hidden">
          <form onSubmit={handleSubmit}>
            <div className="p-5 sm:p-6 space-y-5">
              {/* Group 1: Identity & Target */}
              <div className="space-y-4">
                <div className="border-b border-[var(--border-subtle)] pb-1.5">
                  <h2 className="text-xs font-mono font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Endpoint Details
                  </h2>
                </div>

                {/* Monitor Name */}
                <div className="space-y-1.5">
                  <Label htmlFor="edit-monitor-name">Service / Monitor Name</Label>
                  <Input
                    id="edit-monitor-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Descriptive name shown across dashboards and incident logs.
                  </p>
                </div>

                {/* Method & URL Sharing Row */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="space-y-1.5 sm:col-span-1">
                    <Label htmlFor="edit-monitor-method">HTTP Method</Label>
                    <select
                      id="edit-monitor-method"
                      value={method}
                      onChange={(e) => setMethod(e.target.value as HttpMethod)}
                      className="w-full h-8.5 px-2.5 py-1 text-xs rounded-[4px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] font-mono focus-visible:outline-none focus-visible:border-[var(--border-focus)] focus-visible:ring-1 focus-visible:ring-[var(--border-focus)]"
                    >
                      <option value={HttpMethod.GET}>GET</option>
                      <option value={HttpMethod.HEAD}>HEAD</option>
                    </select>
                  </div>

                  <div className="space-y-1.5 sm:col-span-3">
                    <Label htmlFor="edit-monitor-url">Target Endpoint URL</Label>
                    <Input
                      id="edit-monitor-url"
                      type="url"
                      required
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Group 2: Check Schedule & Limits */}
              <div className="space-y-4 pt-2">
                <div className="border-b border-[var(--border-subtle)] pb-1.5">
                  <h2 className="text-xs font-mono font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Execution Schedule
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Interval */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="edit-monitor-interval">Check Interval</Label>
                      <span className="text-[11px] font-mono text-[var(--text-muted)]">
                        {MONITOR_LIMITS.MIN_INTERVAL_SECONDS}s – {MONITOR_LIMITS.MAX_INTERVAL_SECONDS}s
                      </span>
                    </div>
                    <div className="relative">
                      <Input
                        id="edit-monitor-interval"
                        type="number"
                        min={MONITOR_LIMITS.MIN_INTERVAL_SECONDS}
                        max={MONITOR_LIMITS.MAX_INTERVAL_SECONDS}
                        required
                        value={intervalSeconds}
                        onChange={(e) => setIntervalSeconds(Number(e.target.value))}
                        className="font-mono tabular-nums pr-16"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-[var(--text-muted)] pointer-events-none">
                        seconds
                      </span>
                    </div>
                  </div>

                  {/* Timeout */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="edit-monitor-timeout">Request Timeout</Label>
                      <span className="text-[11px] font-mono text-[var(--text-muted)]">
                        Max {MONITOR_LIMITS.MAX_TIMEOUT_MS / 1000}s
                      </span>
                    </div>
                    <div className="relative">
                      <Input
                        id="edit-monitor-timeout"
                        type="number"
                        min={1}
                        max={MONITOR_LIMITS.MAX_TIMEOUT_MS / 1000}
                        required
                        value={timeoutSeconds}
                        onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                        className="font-mono tabular-nums pr-16"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-[var(--text-muted)] pointer-events-none">
                        seconds
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Group 3: Expected Response Criteria */}
              <div className="space-y-4 pt-2">
                <div className="border-b border-[var(--border-subtle)] pb-1.5">
                  <h2 className="text-xs font-mono font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Response Validation
                  </h2>
                </div>

                <div className="space-y-1.5 sm:max-w-xs">
                  <Label htmlFor="edit-monitor-status">Expected HTTP Status Code</Label>
                  <Input
                    id="edit-monitor-status"
                    type="number"
                    min={100}
                    max={599}
                    required
                    value={expectedStatus}
                    onChange={(e) => setExpectedStatus(Number(e.target.value))}
                    className="font-mono tabular-nums"
                  />
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Responses with differing status codes trigger failure counting.
                  </p>
                </div>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="p-4 sm:p-5 border-t border-[var(--border)] bg-[var(--surface-subtle)] flex items-center justify-end gap-2.5">
              <Link href={`/monitors/${id}`}>
                <Button type="button" variant="outline" size="sm">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" size="sm" disabled={isSubmitting} className="gap-1.5 font-medium">
                <Save className="h-3.5 w-3.5" />
                <span>{isSubmitting ? 'Saving Changes...' : 'Save Changes'}</span>
              </Button>
            </div>
          </form>
        </Card>
      </main>
    </div>
  );
}
