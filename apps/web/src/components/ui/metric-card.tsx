import * as React from 'react';
import { cn } from '@/lib/utils';

export interface MetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  subvalue?: React.ReactNode;
  badge?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: 'default' | 'primary' | 'healthy' | 'warning' | 'urgent';
}

const variantStyles: Record<NonNullable<MetricCardProps['variant']>, {
  border: string;
  valueColor: string;
  bg: string;
}> = {
  default: {
    border: 'border-[var(--border)]',
    valueColor: 'text-[var(--text-primary)]',
    bg: 'bg-[var(--surface)]',
  },
  primary: {
    border: 'border-[var(--primary)]/40',
    valueColor: 'text-[var(--primary)]',
    bg: 'bg-[var(--surface)]',
  },
  healthy: {
    border: 'border-[var(--status-healthy)]/30',
    valueColor: 'text-[var(--status-healthy)]',
    bg: 'bg-[var(--surface)]',
  },
  warning: {
    border: 'border-[var(--status-warning)]/40',
    valueColor: 'text-[var(--status-warning)]',
    bg: 'bg-[var(--surface)]',
  },
  urgent: {
    border: 'border-[var(--status-down)]/40',
    valueColor: 'text-[var(--status-down)]',
    bg: 'bg-[var(--status-down-bg)]/10',
  },
};

export function MetricCard({
  label,
  value,
  subvalue,
  badge,
  icon: Icon,
  variant = 'default',
  className,
  ...props
}: MetricCardProps) {
  const styles = variantStyles[variant] || variantStyles.default;

  return (
    <div
      className={cn(
        'rounded-[6px] border p-4 sm:p-5 flex flex-col justify-between transition-colors',
        styles.border,
        styles.bg,
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-[var(--text-secondary)] tracking-tight">
          {label}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {badge}
          {Icon && (
            <Icon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          )}
        </div>
      </div>

      <div className="space-y-1">
        <div
          className={cn(
            'text-2xl sm:text-3xl font-bold font-mono tracking-tight tabular-nums',
            styles.valueColor,
          )}
        >
          {value}
        </div>
        {subvalue && (
          <div className="text-[11px] text-[var(--text-muted)] leading-normal truncate">
            {subvalue}
          </div>
        )}
      </div>
    </div>
  );
}
