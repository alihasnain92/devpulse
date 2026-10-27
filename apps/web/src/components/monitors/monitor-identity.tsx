import * as React from 'react';
import Link from 'next/link';
import { MonitorDto } from '@devpulse/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface MonitorIdentityProps extends React.HTMLAttributes<HTMLDivElement> {
  monitor: MonitorDto;
  linkDisabled?: boolean;
}

export function MonitorIdentity({
  monitor,
  linkDisabled = false,
  className,
  ...props
}: MonitorIdentityProps) {
  const content = (
    <div className={cn('min-w-0 flex flex-col justify-center', className)} {...props}>
      <div className="flex items-center gap-2 flex-wrap">
        {linkDisabled ? (
          <span className="font-semibold text-sm text-[var(--text-primary)] truncate">
            {monitor.name}
          </span>
        ) : (
          <Link
            href={`/monitors/${monitor.id}`}
            className="font-semibold text-sm text-[var(--text-primary)] hover:text-[var(--primary)] transition-colors truncate focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-focus)] rounded-[2px]"
          >
            {monitor.name}
          </Link>
        )}

        <span className="px-1 py-0 rounded-[2px] border border-[var(--border)] bg-[var(--surface-active)] text-[10px] font-mono text-[var(--text-secondary)] font-medium">
          {monitor.method}
        </span>

        {monitor.isPaused && (
          <Badge variant="warning" className="text-[10px] uppercase font-mono px-1 py-0">
            Paused
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
        <span
          className="font-mono text-xs text-[var(--text-muted)] truncate max-w-xs sm:max-w-md select-all"
          title={monitor.url}
        >
          {monitor.url}
        </span>
      </div>
    </div>
  );

  return content;
}
