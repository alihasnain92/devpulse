'use client';

import * as React from 'react';
import { Button } from './button';
import { ModalDialog } from './modal-dialog';

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
  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      description={description}
      role={isDestructive ? 'alertdialog' : 'dialog'}
      maxWidth="max-w-md"
      closeOnEscape={!isLoading}
      closeOnBackdropClick={!isLoading}
    >
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
    </ModalDialog>
  );
}
