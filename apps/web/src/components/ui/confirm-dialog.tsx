'use client';

import * as React from 'react';
import { Button } from './button';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = true,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 animate-in fade-in duration-100">
      <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-[8px] p-6 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-[var(--text-primary)] tracking-tight">{title}</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed">
            {description}
          </p>
        </div>

        <div className="flex justify-end gap-2.5 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={isDestructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
