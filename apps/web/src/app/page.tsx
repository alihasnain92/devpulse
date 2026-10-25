import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HttpMethod, MONITOR_LIMITS } from '@devpulse/shared';
import { Activity, ShieldCheck, Zap, Server } from 'lucide-react';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 lg:p-24 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <div className="z-10 max-w-5xl w-full flex flex-col items-center text-center space-y-8">
        
        {/* Header Badge */}
        <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-400 px-4 py-1.5 text-sm gap-2">
          <Activity className="h-4 w-4 animate-pulse" />
          DevPulse Level 1 • Infrastructure Live
        </Badge>

        {/* Hero Title */}
        <div className="space-y-4 max-w-3xl">
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white">
            High-Precision <span className="text-blue-500">API Monitoring</span> & Incident Management
          </h1>
          <p className="text-lg sm:text-xl text-slate-400">
            Real-time HTTP health checks, enterprise-grade SSRF defense, automated incident tracking, and deep latency metrics.
          </p>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left pt-6">
          <Card>
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 mb-2">
                <Zap className="h-5 w-5" />
              </div>
              <CardTitle>Autonomous Background Checks</CardTitle>
              <CardDescription>
                BullMQ Job Schedulers executing periodic {HttpMethod.GET} & {HttpMethod.HEAD} probes with {MONITOR_LIMITS.DEFAULT_INTERVAL_SECONDS}s cadence.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-xs text-slate-500">Shared Types & Constants Active</span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-2">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <CardTitle>SSRF Perimeter Defense</CardTitle>
              <CardDescription>
                Socket-level DNS IP pinning, strict CIDR filtering, and redirect re-evaluation protecting internal networks.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="success" className="text-xs">Banned IP Guard Active</Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 mb-2">
                <Server className="h-5 w-5" />
              </div>
              <CardTitle>Full-Stack Monorepo</CardTitle>
              <CardDescription>
                Next.js 16 App Router paired with NestJS 11 REST API, PostgreSQL 16 via Prisma 7, and Redis 7.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="text-xs text-purple-400 border-purple-500/30">Phase 0 Scaffolding</Badge>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 pt-4">
          <Link href="/register">
            <Button size="lg" className="font-semibold">
              Get Started
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="outline" size="lg" className="font-semibold">
              Sign in
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
