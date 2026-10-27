import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusIndicator } from '@/components/ui/status-indicator';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock,
  Radio,
  Webhook,
} from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] flex flex-col font-sans">
      {/* Top Console Navigation Bar */}
      <header className="border-b border-[var(--border)] bg-[var(--surface)] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-7.5 w-7.5 items-center justify-center rounded-[4px] bg-[var(--primary)] text-white">
              <Activity className="h-4 w-4" />
            </div>
            <span className="font-semibold text-sm tracking-tight text-[var(--text-primary)]">
              DevPulse
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-[2px] bg-[var(--surface-subtle)] text-[var(--text-muted)] border border-[var(--border-subtle)] hidden sm:inline">
              v0.1.0
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <Link href="/login">
              <Button variant="ghost" size="sm" className="text-xs">
                Sign in
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm" className="text-xs">
                Register
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16 space-y-12">
        {/* Hero Section */}
        <div className="space-y-4 max-w-3xl">
          <div className="flex items-center gap-2">
            <StatusIndicator status="healthy" variant="badge" label="Developer Reliability Console" />
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--text-primary)] leading-tight">
            Automated API Monitoring, Incident Detection, and Webhook Verification
          </h1>

          <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
            Continuous HTTP and HEAD health checks from 30 seconds with socket-pinned SSRF defense, incident
            alerts after confirmed consecutive failures, p50/p95/p99 latency analysis, and transactional webhook replay.
          </p>

          <div className="flex items-center gap-3 pt-2 flex-wrap">
            <Link href="/dashboard">
              <Button size="sm" className="gap-1.5 font-mono text-xs">
                <span>Open Console</span>
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="sm" className="text-xs font-mono">
                <span>Sign in</span>
              </Button>
            </Link>
            <Link href="/register">
              <Button variant="secondary" size="sm" className="text-xs font-mono">
                <span>Create Account</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Console Telemetry Inspection Preview (Static Illustrative Treatment) */}
        <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface)] overflow-hidden font-mono text-xs shadow-xl">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-muted)] text-[11px]">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--status-healthy)]" />
              <span className="text-[var(--text-primary)] font-semibold">Example Telemetry • Product Preview</span>
            </div>
            <Badge
              variant="outline"
              className="text-[10px] font-mono px-1.5 py-0 border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--text-muted)]"
            >
              Illustrative Sample
            </Badge>
          </div>

          <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-[var(--border-subtle)]">
            <div className="space-y-1">
              <span className="text-[10px] text-[var(--text-muted)] uppercase">Target Endpoint</span>
              <div className="text-[var(--text-primary)] font-semibold truncate">
                GET https://api.production.dev/v1/health
              </div>
              <div className="text-[11px] text-[var(--text-secondary)]">Cadence: 60s • Timeout: 10s</div>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] text-[var(--text-muted)] uppercase">Execution Result</span>
              <div className="flex items-center gap-2">
                <Badge variant="healthy" className="px-1.5 py-0 text-[10px] font-mono">
                  200 OK
                </Badge>
                <span className="text-[var(--status-healthy)] font-bold">42ms latency</span>
              </div>
              <div className="text-[11px] text-[var(--text-secondary)]">Expected 200 • Status Verified</div>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] text-[var(--text-muted)] uppercase">Latency Percentiles</span>
              <div className="text-[var(--text-primary)]">
                p50: <span className="text-[var(--primary)] font-semibold">38ms</span> • p95:{' '}
                <span className="text-[var(--primary)] font-semibold">124ms</span> • p99:{' '}
                <span className="text-[var(--primary)] font-semibold">210ms</span>
              </div>
              <div className="text-[11px] text-[var(--text-secondary)]">24/7 continuous HTTP checks</div>
            </div>
          </div>

          <div className="px-4 py-2.5 bg-[var(--surface-subtle)] text-[11px] text-[var(--text-secondary)] flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--status-healthy)]" />
              <span>Sample webhook dispatch: event <code className="text-[var(--text-primary)]">incident.resolved</code></span>
            </div>
            <span className="text-[var(--text-muted)]">Signed: <code className="text-[var(--text-primary)]">t=timestamp,v1=hmac_sha256</code></span>
          </div>
        </div>

        {/* 3 Core Architecture Panels */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Capability 1 */}
          <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
            <div className="flex items-center gap-2 text-[var(--primary)]">
              <Radio className="h-4 w-4" />
              <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-[var(--text-primary)]">
                Automated Health Checks
              </h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Configurable 30s–3600s GET and HEAD polling with socket-level DNS IP pinning, private CIDR filtering,
              and redirect validation against outbound SSRF.
            </p>
            <div className="text-[11px] font-mono text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-2.5">
              • Custom expected status codes<br />
              • Latency tracking in milliseconds<br />
              • DNS rebinding prevention
            </div>
          </div>

          {/* Capability 2 */}
          <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
            <div className="flex items-center gap-2 text-[var(--status-down)]">
              <Clock className="h-4 w-4" />
              <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-[var(--text-primary)]">
                Automated Incident Triage
              </h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Automated outage lifecycle triggered on 3 consecutive failed checks. Records exact HTTP errors,
              connection timeouts, and running downtime durations.
            </p>
            <div className="text-[11px] font-mono text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-2.5">
              • Root cause and error code capture<br />
              • Automatic recovery detection<br />
              • In-app and email incident notifications
            </div>
          </div>

          {/* Capability 3 */}
          <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
            <div className="flex items-center gap-2 text-[var(--status-healthy)]">
              <Webhook className="h-4 w-4" />
              <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-[var(--text-primary)]">
                Transactional Webhooks
              </h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Reliable queue delivery with AES-256-GCM secret storage, versioned HMAC-SHA256 request signatures,
              and manual replay with client idempotency keys.
            </p>
            <div className="text-[11px] font-mono text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-2.5">
              • Header: <code className="text-[var(--text-secondary)]">X-DevPulse-Event-Id</code><br />
              • Exponential retry backoff<br />
              • Response preview diagnostics
            </div>
          </div>
        </div>
      </main>

      {/* Minimal Engineering Footer */}
      <footer className="border-t border-[var(--border)] bg-[var(--surface)] py-6 text-xs text-[var(--text-muted)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[11px]">
          <div>DevPulse — Developer Reliability Console</div>
          <div className="flex items-center gap-4 text-[var(--text-dim)]">
            <span>Next.js 16</span>
            <span>NestJS</span>
            <span>PostgreSQL 16</span>
            <span>Redis 7</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
