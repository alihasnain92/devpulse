'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';
import { Activity, LogOut, ShieldCheck, User, Calendar, Mail, Key } from 'lucide-react';

export default function DashboardPage() {
  const { user, isLoading, logout } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 animate-pulse text-blue-500" />
          <span>Verifying secure session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-white font-bold text-lg">
            <Activity className="h-6 w-6 text-blue-500" />
            <span>DevPulse</span>
            <Badge variant="outline" className="border-blue-500/30 text-blue-400 text-xs ml-2">
              Phase 1
            </Badge>
          </Link>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-sm text-slate-300">
              <User className="h-4 w-4 text-slate-400" />
              <span>{user?.name}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="gap-2 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Status Alert */}
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-4 flex items-start gap-4">
          <ShieldCheck className="h-6 w-6 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-semibold text-emerald-300 text-sm">
              Authenticated Session Active • Phase 1 Complete
            </h3>
            <p className="text-xs text-slate-400">
              You are securely authenticated with HTTP-only SameSite=Lax JWT access tokens and cryptographically rotated refresh sessions.
            </p>
          </div>
        </div>

        {/* User Profile Card */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-xl text-white">Authenticated Profile</CardTitle>
            <CardDescription className="text-slate-400">
              Verified identity data retrieved from <code className="text-blue-400 bg-blue-950/40 px-1 py-0.5 rounded text-xs">GET /users/me</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
                <span className="text-xs text-slate-500 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" /> Full Name
                </span>
                <p className="font-medium text-white">{user?.name || '—'}</p>
              </div>

              <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
                <span className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> Email Address
                </span>
                <p className="font-medium text-white">{user?.email || '—'}</p>
              </div>

              <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
                <span className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5" /> User ID
                </span>
                <p className="font-mono text-xs text-slate-300 truncate">{user?.id || '—'}</p>
              </div>

              <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
                <span className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" /> Member Since
                </span>
                <p className="text-sm text-slate-300">
                  {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Phase Roadmap Note */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-6 text-center space-y-3">
          <Badge variant="outline" className="text-slate-400 border-slate-700">
            Roadmap Next Step
          </Badge>
          <h4 className="text-lg font-semibold text-white">
            Phase 2: Monitor Management & Health Check Workers
          </h4>
          <p className="text-sm text-slate-400 max-w-xl mx-auto">
            API monitor CRUD operations, SSRF safe URL dispatching, and BullMQ background workers will be enabled in Phase 2.
          </p>
        </div>
      </main>
    </div>
  );
}
