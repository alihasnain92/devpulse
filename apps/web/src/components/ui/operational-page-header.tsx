import * as React from 'react';
import { cn } from '@/lib/utils';

interface OperationalPageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  eyebrow?: React.ReactNode;
  title: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

export function OperationalPageHeader({
  eyebrow,
  title,
  description,
  badge,
  actions,
  className,
  ...props
}: OperationalPageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-[var(--border)]',
        className,
      )}
      {...props}
    >
      <div className="space-y-1 min-w-0">
        {eyebrow && (
          <div className="text-[11px] font-mono font-medium text-[var(--text-muted)] tracking-wider uppercase">
            {eyebrow}
          </div>
        )}
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            {title}
          </h1>
          {badge && <div className="shrink-0">{badge}</div>}
        </div>
        {description && (
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-3xl">
            {description}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0">
          {actions}
        </div>
      )}
    </div>
  );
}
