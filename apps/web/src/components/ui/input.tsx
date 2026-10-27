import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-8.5 w-full rounded-[4px] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] transition-colors focus-visible:outline-none focus-visible:border-[var(--border-focus)] focus-visible:ring-1 focus-visible:ring-[var(--border-focus)] disabled:cursor-not-allowed disabled:opacity-40 disabled:bg-[var(--background)]',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
