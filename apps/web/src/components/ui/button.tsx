import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-[4px] text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] active:bg-[var(--primary-hover)]',
        destructive:
          'border border-[var(--status-down)]/40 bg-[var(--status-down-bg)]/30 text-[var(--status-down)] hover:bg-[var(--status-down)] hover:text-white',
        outline:
          'border border-[var(--border)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-active)] hover:text-white',
        secondary:
          'border border-[var(--border)] bg-[var(--surface-active)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]',
        ghost:
          'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-active)]/50',
        link:
          'text-[var(--primary)] hover:text-[var(--primary-hover)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8.5 px-3.5 py-1.5',
        sm: 'h-7.5 px-2.5 text-xs',
        lg: 'h-9.5 px-5 text-sm',
        icon: 'h-8.5 w-8.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
