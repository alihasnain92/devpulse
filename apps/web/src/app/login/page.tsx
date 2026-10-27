'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAuth } from '@/lib/auth-context';
import { Activity, Eye, EyeOff, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Please fill in all fields.');
      return;
    }

    try {
      setIsSubmitting(true);
      await login({ email: email.trim(), password });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Authentication failed. Please verify your credentials.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 bg-[var(--background)]">
      <div className="w-full max-w-sm">
        {/* Brand header */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-[var(--text-primary)] hover:opacity-90 transition-opacity"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-input)] bg-[var(--primary)] text-white shadow-xs">
              <Activity className="h-4 w-4" />
            </div>
            <span className="font-semibold text-sm tracking-tight text-[var(--text-primary)]">
              DevPulse
            </span>
          </Link>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-[var(--radius-badge)] bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
            CONSOLE
          </span>
        </div>

        <Card className="border-[var(--border)] bg-[var(--surface)] shadow-sm">
          <CardHeader className="space-y-1.5 text-center pb-2">
            <CardTitle className="text-base font-semibold text-[var(--text-primary)]">
              Sign in to DevPulse
            </CardTitle>
            <CardDescription className="text-xs text-[var(--text-secondary)]">
              Access your API reliability monitors, alerts, and incident timelines
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4 pt-2">
              {error && (
                <div
                  role="alert"
                  className="rounded-[var(--radius-input)] bg-[var(--status-down-bg)] border border-[var(--status-down-border)] p-3 text-xs text-[var(--status-down)]"
                >
                  {error}
                </div>
              )}

              <div className="space-y-1.5 text-left">
                <Label htmlFor="email" className="text-xs font-medium text-[var(--text-secondary)]">
                  Email address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="developer@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-1.5 text-left">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-medium text-[var(--text-secondary)]">
                    Password
                  </Label>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    disabled={isSubmitting}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors focus:outline-none"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col space-y-4 pt-2">
              <Button
                type="submit"
                className="w-full font-medium text-xs h-9"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>

              {/* Showcase Demo Credentials Helper */}
              <div className="w-full rounded-[var(--radius-input)] border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3 text-xs space-y-1.5 text-left">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Showcase Account
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail('demo@devpulse.dev');
                      setPassword('Password123!');
                    }}
                    className="text-xs font-mono text-[var(--primary)] hover:underline cursor-pointer"
                  >
                    Auto-fill demo
                  </button>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)]">
                  <span>demo@devpulse.dev</span>
                  <span className="tracking-widest">••••••••••••</span>
                </div>
              </div>

              <p className="text-center text-xs text-[var(--text-secondary)]">
                Don&apos;t have an account?{' '}
                <Link
                  href="/register"
                  className="text-[var(--primary)] hover:underline font-medium"
                >
                  Create an account
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
