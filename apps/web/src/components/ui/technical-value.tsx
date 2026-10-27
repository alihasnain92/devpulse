'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Check, Copy } from 'lucide-react';

interface TechnicalValueProps extends React.HTMLAttributes<HTMLSpanElement> {
  value: string;
  copyable?: boolean;
  truncate?: boolean;
  type?: 'url' | 'code' | 'id' | 'metric' | 'timestamp';
}

export function TechnicalValue({
  value,
  copyable = false,
  truncate = false,
  type = 'code',
  className,
  ...props
}: TechnicalValueProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback or ignore
    }
  };

  return (
    <span
      data-type={type}
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-[var(--text-primary)]',
        truncate && 'max-w-xs truncate',
        className,
      )}
      title={value}
      {...props}
    >
      <span className={cn(truncate && 'truncate')}>{value}</span>

      {copyable && (
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? 'Copied to clipboard' : `Copy ${value} to clipboard`}
          className="inline-flex items-center justify-center h-4 w-4 p-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-focus)] rounded-[2px]"
        >
          {copied ? (
            <Check className="h-3 w-3 text-[var(--status-healthy)]" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      )}
    </span>
  );
}
