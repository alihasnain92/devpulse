import * as React from 'react';
import { cn } from '@/lib/utils';

export type OperationalStatus =
  | 'healthy'
  | 'degraded'
  | 'down'
  | 'warning'
  | 'info'
  | 'disabled';

interface StatusIndicatorProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: OperationalStatus | string;
  variant?: 'dot' | 'badge' | 'compact';
  label?: string;
  isProcessing?: boolean;
}

const statusConfig: Record<
  OperationalStatus,
  {
    label: string;
    dotClass: string;
    textClass: string;
    badgeClass: string;
  }
> = {
  healthy: {
    label: 'Healthy',
    dotClass: 'bg-[var(--status-healthy)]',
    textClass: 'text-[var(--status-healthy)]',
    badgeClass: 'border-[var(--status-healthy)]/30 bg-[var(--status-healthy-bg)]/30 text-[var(--status-healthy)]',
  },
  degraded: {
    label: 'Degraded',
    dotClass: 'bg-[var(--status-degraded)]',
    textClass: 'text-[var(--status-degraded)]',
    badgeClass: 'border-[var(--status-degraded)]/30 bg-[var(--status-degraded-bg)]/30 text-[var(--status-degraded)]',
  },
  down: {
    label: 'Down',
    dotClass: 'bg-[var(--status-down)]',
    textClass: 'text-[var(--status-down)]',
    badgeClass: 'border-[var(--status-down)]/30 bg-[var(--status-down-bg)]/30 text-[var(--status-down)]',
  },
  warning: {
    label: 'Warning',
    dotClass: 'bg-[var(--status-warning)]',
    textClass: 'text-[var(--status-warning)]',
    badgeClass: 'border-[var(--status-warning)]/30 bg-[var(--status-warning-bg)]/30 text-[var(--status-warning)]',
  },
  info: {
    label: 'Info',
    dotClass: 'bg-[var(--status-info)]',
    textClass: 'text-[var(--status-info)]',
    badgeClass: 'border-[var(--status-info)]/30 bg-[var(--status-info-bg)]/30 text-[var(--status-info)]',
  },
  disabled: {
    label: 'Disabled',
    dotClass: 'bg-[var(--status-disabled)]',
    textClass: 'text-[var(--status-disabled)]',
    badgeClass: 'border-[var(--border)] bg-[var(--surface-active)]/40 text-[var(--status-disabled)]',
  },
};

export function StatusIndicator({
  status,
  variant = 'dot',
  label,
  isProcessing = false,
  className,
  ...props
}: StatusIndicatorProps) {
  const normalizedKey = (status?.toLowerCase() as OperationalStatus) || 'disabled';
  const config = statusConfig[normalizedKey] || statusConfig.disabled;
  const displayLabel = label || config.label;

  if (variant === 'compact') {
    return (
      <span
        role="status"
        aria-label={displayLabel}
        title={displayLabel}
        className={cn('inline-flex items-center justify-center', className)}
        {...props}
      >
        <span
          className={cn(
            'h-2 w-2 rounded-full shrink-0',
            config.dotClass,
            isProcessing && 'animate-pulse motion-reduce:animate-none',
          )}
        />
      </span>
    );
  }

  if (variant === 'badge') {
    return (
      <span
        role="status"
        className={cn(
          'inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-[2px] border text-[11px] font-mono font-medium tracking-wide uppercase',
          config.badgeClass,
          className,
        )}
        {...props}
      >
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full shrink-0',
            config.dotClass,
            isProcessing && 'animate-pulse motion-reduce:animate-none',
          )}
        />
        <span>{displayLabel}</span>
      </span>
    );
  }

  // Default 'dot' variant
  return (
    <span
      role="status"
      className={cn('inline-flex items-center gap-1.5 text-xs font-medium', className)}
      {...props}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full shrink-0',
          config.dotClass,
          isProcessing && 'animate-pulse motion-reduce:animate-none',
        )}
      />
      <span className={config.textClass}>{displayLabel}</span>
    </span>
  );
}
