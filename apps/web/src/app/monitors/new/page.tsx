'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { HttpMethod, MONITOR_LIMITS } from '@devpulse/shared';
import { apiClient } from '@/lib/api-client';
import { Navbar } from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Plus, AlertCircle, ShieldAlert } from 'lucide-react';

export default function NewMonitorPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState<HttpMethod>(HttpMethod.GET);
  const [intervalSeconds, setIntervalSeconds] = useState<number>(
    MONITOR_LIMITS.DEFAULT_INTERVAL_SECONDS,
  );
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(
    MONITOR_LIMITS.DEFAULT_TIMEOUT_MS / 1000,
  );
  const [expectedStatus, setExpectedStatus] = useState<number>(
    MONITOR_LIMITS.DEFAULT_EXPECTED_STATUS,
  );

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Client-side validations
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
      setIsLoading(true);
      await apiClient.createMonitor({
        name: name.trim(),
        url: url.trim(),
        method,
        intervalSeconds: Number(intervalSeconds),
        timeoutMs: Number(timeoutSeconds) * 1000,
        expectedStatus: Number(expectedStatus),
      });

      router.push('/monitors');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to create monitor',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Back Link */}
        <div>
          <Link
            href="/monitors"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Monitors</span>
          </Link>
        </div>

        {/* Title */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Create API Monitor
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Configure an endpoint target for automated health checks.
          </p>
        </div>

        {/* SSRF Boundary Notice */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-4 flex items-start gap-3.5">
          <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-400 space-y-1">
            <span className="font-semibold text-amber-300 block">
              SSRF & Security Scope Notice
            </span>
            <span>
              URL syntax is validated now (HTTP/HTTPS only). Background network check execution and SSRF defenses (IP/CIDR blocking, socket-level DNS pinning, redirect revalidation) will be active when the Phase 3 worker is deployed.
            </span>
          </div>
        </div>

        {/* Form Card */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg text-white">Monitor Details</CardTitle>
            <CardDescription className="text-slate-400">
              Specify the target URL, HTTP method, check cadence, and expected status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Error Banner */}
              {errorMessage && (
                <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-3.5 flex items-center gap-3 text-red-300 text-sm">
                  <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Monitor Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-slate-200">
                  Monitor Name <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="e.g., Auth Service Health"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  required
                  disabled={isLoading}
                  className="bg-slate-900/80 border-slate-700"
                />
                <p className="text-xs text-slate-500">
                  A friendly label to distinguish this endpoint in alerts and dashboards.
                </p>
              </div>

              {/* URL */}
              <div className="space-y-2">
                <Label htmlFor="url" className="text-slate-200">
                  Target Endpoint URL <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="url"
                  type="url"
                  placeholder="https://api.example.com/health"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  disabled={isLoading}
                  className="bg-slate-900/80 border-slate-700 font-mono text-sm"
                />
                <p className="text-xs text-slate-500">
                  Accepts only public HTTP or HTTPS web services.
                </p>
              </div>

              {/* HTTP Method */}
              <div className="space-y-2">
                <Label className="text-slate-200">HTTP Method</Label>
                <div className="flex gap-4">
                  <label
                    className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                      method === HttpMethod.GET
                        ? 'border-blue-500 bg-blue-950/30 text-white'
                        : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="method"
                      value={HttpMethod.GET}
                      checked={method === HttpMethod.GET}
                      onChange={() => setMethod(HttpMethod.GET)}
                      className="sr-only"
                    />
                    <span className="font-semibold text-sm">GET</span>
                    <span className="text-xs text-slate-500 hidden sm:inline">(Standard)</span>
                  </label>

                  <label
                    className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                      method === HttpMethod.HEAD
                        ? 'border-blue-500 bg-blue-950/30 text-white'
                        : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="method"
                      value={HttpMethod.HEAD}
                      checked={method === HttpMethod.HEAD}
                      onChange={() => setMethod(HttpMethod.HEAD)}
                      className="sr-only"
                    />
                    <span className="font-semibold text-sm">HEAD</span>
                    <span className="text-xs text-slate-500 hidden sm:inline">(Headers Only)</span>
                  </label>
                </div>
              </div>

              {/* Cadence & Thresholds */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Interval */}
                <div className="space-y-2">
                  <Label htmlFor="interval" className="text-slate-200">
                    Interval (seconds)
                  </Label>
                  <Input
                    id="interval"
                    type="number"
                    min={MONITOR_LIMITS.MIN_INTERVAL_SECONDS}
                    max={MONITOR_LIMITS.MAX_INTERVAL_SECONDS}
                    value={intervalSeconds}
                    onChange={(e) => setIntervalSeconds(Number(e.target.value))}
                    disabled={isLoading}
                    className="bg-slate-900/80 border-slate-700 font-mono text-sm"
                  />
                  <p className="text-[11px] text-slate-500">30s to 3600s (1hr)</p>
                </div>

                {/* Timeout */}
                <div className="space-y-2">
                  <Label htmlFor="timeout" className="text-slate-200">
                    Timeout (seconds)
                  </Label>
                  <Input
                    id="timeout"
                    type="number"
                    min={1}
                    max={MONITOR_LIMITS.MAX_TIMEOUT_MS / 1000}
                    value={timeoutSeconds}
                    onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                    disabled={isLoading}
                    className="bg-slate-900/80 border-slate-700 font-mono text-sm"
                  />
                  <p className="text-[11px] text-slate-500">1s to 30s</p>
                </div>

                {/* Expected Status */}
                <div className="space-y-2">
                  <Label htmlFor="expectedStatus" className="text-slate-200">
                    Expected Status
                  </Label>
                  <Input
                    id="expectedStatus"
                    type="number"
                    min={100}
                    max={599}
                    value={expectedStatus}
                    onChange={(e) => setExpectedStatus(Number(e.target.value))}
                    disabled={isLoading}
                    className="bg-slate-900/80 border-slate-700 font-mono text-sm"
                  />
                  <p className="text-[11px] text-slate-500">e.g. 200, 204</p>
                </div>
              </div>

              {/* Submit / Cancel Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <Link href="/monitors">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isLoading}
                    className="border-slate-700 text-slate-300 hover:text-white"
                  >
                    Cancel
                  </Button>
                </Link>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="gap-2 min-w-[140px]"
                >
                  <Plus className="h-4 w-4" />
                  <span>{isLoading ? 'Creating...' : 'Create Monitor'}</span>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
