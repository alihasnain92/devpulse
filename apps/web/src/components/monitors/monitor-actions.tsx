'use client';

import * as React from 'react';
import Link from 'next/link';
import { MonitorDto } from '@devpulse/shared';
import { Button } from '@/components/ui/button';
import { Play, Pause, Edit, Trash2, RefreshCw } from 'lucide-react';

export interface MonitorActionsProps {
  monitor: MonitorDto;
  onTriggerCheck: (monitor: MonitorDto) => void;
  onTogglePause: (monitor: MonitorDto) => void;
  onDelete: (monitor: MonitorDto) => void;
  isChecking?: boolean;
  isToggling?: boolean;
  size?: 'default' | 'sm';
}

export function MonitorActions({
  monitor,
  onTriggerCheck,
  onTogglePause,
  onDelete,
  isChecking = false,
  isToggling = false,
  size = 'sm',
}: MonitorActionsProps) {
  return (
    <div className="flex items-center gap-1.5 shrink-0" role="toolbar" aria-label="Monitor actions">
      <Button
        variant="outline"
        size={size}
        onClick={(e) => {
          e.stopPropagation();
          onTriggerCheck(monitor);
        }}
        disabled={isChecking || monitor.isPaused}
        className="h-7 px-2 text-xs font-mono"
        title={monitor.isPaused ? 'Cannot test paused monitor' : 'Execute immediate check'}
        aria-label={`Run immediate check for ${monitor.name}`}
      >
        <RefreshCw className={`h-3 w-3 ${isChecking ? 'animate-spin text-[var(--primary)]' : ''}`} />
        <span className="hidden sm:inline ml-1">Check</span>
      </Button>

      <Button
        variant="outline"
        size={size}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePause(monitor);
        }}
        disabled={isToggling}
        className="h-7 px-2 text-xs"
        title={monitor.isPaused ? 'Resume monitoring' : 'Pause monitoring'}
        aria-label={`${monitor.isPaused ? 'Resume' : 'Pause'} ${monitor.name}`}
      >
        {monitor.isPaused ? (
          <>
            <Play className="h-3 w-3 text-[var(--status-healthy)]" />
            <span className="hidden sm:inline ml-1">Resume</span>
          </>
        ) : (
          <>
            <Pause className="h-3 w-3 text-[var(--status-warning)]" />
            <span className="hidden sm:inline ml-1">Pause</span>
          </>
        )}
      </Button>

      <Link href={`/monitors/${monitor.id}/edit`} onClick={(e) => e.stopPropagation()}>
        <Button
          variant="outline"
          size={size}
          className="h-7 px-2 text-xs"
          title="Edit monitor settings"
          aria-label={`Edit ${monitor.name}`}
        >
          <Edit className="h-3 w-3" />
          <span className="hidden sm:inline ml-1">Edit</span>
        </Button>
      </Link>

      <Button
        variant="ghost"
        size={size}
        onClick={(e) => {
          e.stopPropagation();
          onDelete(monitor);
        }}
        className="h-7 px-2 text-xs text-[var(--text-muted)] hover:text-[var(--status-down)] hover:bg-[var(--status-down-bg)]/20"
        title="Delete monitor"
        aria-label={`Delete ${monitor.name}`}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}
