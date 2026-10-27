import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-[2px] border px-1.5 py-0.5 text-xs font-mono font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-focus)]',
  {
    variants: {
      variant: {
        default: 'border-[var(--primary)]/30 bg-[var(--primary)]/10 text-[var(--primary)]',
        secondary: 'border-[var(--border)] bg-[var(--surface-active)] text-[var(--text-secondary)]',
        destructive: 'border-[var(--status-down)]/30 bg-[var(--status-down-bg)]/40 text-[var(--status-down)]',
        outline: 'border-[var(--border)] bg-transparent text-[var(--text-secondary)]',
        success: 'border-[var(--status-healthy)]/30 bg-[var(--status-healthy-bg)]/40 text-[var(--status-healthy)]',
        healthy: 'border-[var(--status-healthy)]/30 bg-[var(--status-healthy-bg)]/40 text-[var(--status-healthy)]',
        degraded: 'border-[var(--status-degraded)]/30 bg-[var(--status-degraded-bg)]/40 text-[var(--status-degraded)]',
        down: 'border-[var(--status-down)]/30 bg-[var(--status-down-bg)]/40 text-[var(--status-down)]',
        warning: 'border-[var(--status-warning)]/30 bg-[var(--status-warning-bg)]/40 text-[var(--status-warning)]',
        info: 'border-[var(--status-info)]/30 bg-[var(--status-info-bg)]/40 text-[var(--status-info)]',
        disabled: 'border-[var(--border)] bg-[var(--surface-active)]/30 text-[var(--text-muted)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
