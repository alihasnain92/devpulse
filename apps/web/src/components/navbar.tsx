'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiClient } from '@/lib/api-client';
import { Button } from './ui/button';
import {
  Activity,
  LayoutDashboard,
  Radio,
  AlertTriangle,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
} from 'lucide-react';

export function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [unreadCount, setUnreadCount] = React.useState(0);

  React.useEffect(() => {
    if (!user) return;
    let isMounted = true;
    const fetchUnread = async () => {
      try {
        const data = await apiClient.getUnreadNotificationCount();
        if (isMounted) {
          setUnreadCount(data.count);
        }
      } catch {
        // Silently ignore background polling errors
      }
    };

    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user]);

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/monitors', label: 'Monitors', icon: Radio },
    { href: '/incidents', label: 'Incidents', icon: AlertTriangle },
    { href: '/notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="flex items-center gap-2.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] rounded-[4px]"
            >
              <div className="flex h-7.5 w-7.5 items-center justify-center rounded-[4px] bg-[var(--primary)] text-white">
                <Activity className="h-4 w-4" />
              </div>
              <span className="font-semibold text-sm tracking-tight text-[var(--text-primary)] group-hover:text-[var(--primary-hover)] transition-colors">
                DevPulse
              </span>
            </Link>

            {/* Desktop Navigation (Visible on lg >= 1024px to prevent tablet overflow) */}
            <nav className="hidden lg:flex items-center gap-1" aria-label="Main Navigation">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive =
                  pathname === link.href ||
                  (link.href !== '/dashboard' && pathname.startsWith(link.href));

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-[4px] text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] ${
                      isActive
                        ? 'bg-[var(--surface-active)] text-[var(--text-primary)] border border-[var(--border-focus)]/40'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] border border-transparent'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{link.label}</span>
                    {Boolean(link.badge && link.badge > 0) && (
                      <span className="ml-1 px-1.5 py-0.2 rounded-[2px] text-[10px] font-mono font-bold bg-[var(--status-down)] text-white leading-tight tabular-nums">
                        {link.badge! > 99 ? '99+' : link.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* User Profile & Sign Out (Desktop lg >= 1024px) */}
          <div className="hidden lg:flex items-center gap-3">
            {user && (
              <div className="text-right">
                <div className="text-xs font-medium text-[var(--text-primary)]">{user.name}</div>
                <div className="text-[11px] font-mono text-[var(--text-muted)]">{user.email}</div>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => logout()}
              className="gap-1.5 h-8 px-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[var(--border)] hover:bg-[var(--surface-active)] rounded-[4px]"
            >
              <LogOut className="h-3 w-3" />
              <span>Sign out</span>
            </Button>
          </div>

          {/* Mobile Menu Trigger (Visible on < 1024px) */}
          <div className="flex lg:hidden items-center gap-2">
            {unreadCount > 0 && (
              <Link
                href="/notifications"
                className="flex items-center gap-1 px-2 py-1 rounded-[4px] text-xs font-mono font-semibold bg-[var(--status-down-bg)]/40 text-[var(--status-down)] border border-[var(--status-down)]/30"
                aria-label={`${unreadCount} unread notifications`}
              >
                <Bell className="h-3.5 w-3.5" />
                <span className="tabular-nums">{unreadCount}</span>
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="h-10 w-10 min-h-[44px] min-w-[44px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-[4px]"
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Compact / Mobile Drawer (< 1024px) */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-[var(--border)] bg-[var(--surface)] px-4 pt-3 pb-4 space-y-2 animate-in fade-in duration-100">
          <nav className="space-y-1" aria-label="Mobile Navigation">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive =
                pathname === link.href ||
                (link.href !== '/dashboard' && pathname.startsWith(link.href));

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center justify-between px-3 py-2.5 min-h-[44px] rounded-[4px] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] ${
                    isActive
                      ? 'bg-[var(--surface-active)] text-[var(--text-primary)] border border-[var(--border-focus)]/40'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4" />
                    <span>{link.label}</span>
                  </div>
                  {Boolean(link.badge && link.badge > 0) && (
                    <span className="px-1.5 py-0.2 rounded-[2px] text-xs font-mono font-bold bg-[var(--status-down)] text-white leading-tight tabular-nums">
                      {link.badge! > 99 ? '99+' : link.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {user && (
            <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium text-[var(--text-primary)] truncate">{user.name}</div>
                <div className="text-xs font-mono text-[var(--text-muted)] truncate">{user.email}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                className="gap-1.5 h-9 px-3 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[var(--border)] hover:bg-[var(--surface-active)] rounded-[4px] shrink-0"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign out</span>
              </Button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
