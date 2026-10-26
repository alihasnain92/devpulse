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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Save, AlertCircle, Activity } from 'lucide-react';

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
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-8 text-slate-400">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 animate-pulse text-blue-500" />
            <span>Loading monitor settings...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <Link
            href={`/monitors/${id}`}
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Monitor Details</span>
          </Link>
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Edit API Monitor
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Modify endpoint target configuration and threshold settings.
          </p>
        </div>

        <Card className="border-slate-800 bg-slate-900/60 shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg text-white">Update Configuration</CardTitle>
            <CardDescription className="text-slate-400">
              Changes apply immediately to your monitor record.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {errorMessage && (
                <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-3.5 flex items-center gap-3 text-red-300 text-sm">
                  <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-slate-200">
                  Monitor Name <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  required
                  disabled={isSubmitting}
                  className="bg-slate-900/80 border-slate-700"
                />
              </div>

              {/* URL */}
              <div className="space-y-2">
                <Label htmlFor="url" className="text-slate-200">
                  Target Endpoint URL <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  disabled={isSubmitting}
                  className="bg-slate-900/80 border-slate-700 font-mono text-sm"
                />
              </div>

              {/* Method */}
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
                  </label>
                </div>
              </div>

              {/* Intervals & Limits */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                    disabled={isSubmitting}
                    className="bg-slate-900/80 border-slate-700 font-mono text-sm"
                  />
                  <p className="text-[11px] text-slate-500">30s to 3600s</p>
                </div>

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
                    disabled={isSubmitting}
                    className="bg-slate-900/80 border-slate-700 font-mono text-sm"
                  />
                  <p className="text-[11px] text-slate-500">1s to 30s</p>
                </div>

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
                    disabled={isSubmitting}
                    className="bg-slate-900/80 border-slate-700 font-mono text-sm"
                  />
                  <p className="text-[11px] text-slate-500">e.g. 200</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <Link href={`/monitors/${id}`}>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting}
                    className="border-slate-700 text-slate-300 hover:text-white"
                  >
                    Cancel
                  </Button>
                </Link>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="gap-2 min-w-[130px]"
                >
                  <Save className="h-4 w-4" />
                  <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
