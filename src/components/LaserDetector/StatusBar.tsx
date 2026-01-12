import React from 'react';
import { Crosshair, XCircle } from 'lucide-react';
import { DetectionResult } from '@/hooks/useLaserDetector';

interface StatusBarProps {
  detection: DetectionResult;
  fps: number;
  calibrating: boolean;
}

export function StatusBar({ detection, fps, calibrating }: StatusBarProps) {
  if (calibrating) {
    return (
      <div className="flex items-center justify-between px-4 py-3 bg-card/90 backdrop-blur-sm border-b border-border">
        <div className="status-indicator bg-status-warning/20 text-status-warning border border-status-warning/50">
          <div className="w-2 h-2 rounded-full bg-status-warning animate-pulse" />
          <span>Калібрування...</span>
        </div>
        <div className="fps-badge">{fps} FPS</div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-card/90 backdrop-blur-sm border-b border-border">
      {detection.found ? (
        <div className="status-indicator status-found">
          <Crosshair className="w-4 h-4" />
          <span>Промінь знайдено</span>
          {detection.detectedColor && (
            <span className="ml-1 text-xs opacity-75">
              ({detection.detectedColor === 'red' ? 'червоний' : 'зелений'})
            </span>
          )}
        </div>
      ) : (
        <div className="status-indicator status-not-found">
          <XCircle className="w-4 h-4" />
          <span>Промінь не знайдено</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        {detection.found && (
          <div className="text-xs text-muted-foreground font-mono">
            {Math.round(detection.intensity)}
          </div>
        )}
        <div className="fps-badge">{fps} FPS</div>
      </div>
    </div>
  );
}
