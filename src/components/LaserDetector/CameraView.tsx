import React from 'react';
import { DetectionResult, DetectorSettings } from '@/hooks/useLaserDetector';

interface CameraViewProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  detection: DetectionResult;
  settings: DetectorSettings;
  cameraActive: boolean;
}

export function CameraView({ 
  videoRef, 
  canvasRef, 
  detection, 
  settings,
  cameraActive 
}: CameraViewProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = React.useState({ width: 0, height: 0 });

  React.useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Calculate marker position relative to display
  const getMarkerPosition = () => {
    if (!videoRef.current || !detection.found) return null;

    const video = videoRef.current;
    const videoWidth = video.videoWidth || 1;
    const videoHeight = video.videoHeight || 1;

    const scaleX = dimensions.width / videoWidth;
    const scaleY = dimensions.height / videoHeight;

    let x = detection.x * scaleX;
    let y = detection.y * scaleY;

    // Apply mirror if needed
    if (settings.mirror) {
      x = dimensions.width - x;
    }

    return { x, y };
  };

  const markerPos = getMarkerPosition();

  const rotationStyle = settings.rotation !== 0 
    ? { transform: `rotate(${settings.rotation}deg)` } 
    : {};

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full bg-black overflow-hidden"
      style={rotationStyle}
    >
      {/* Video feed */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: settings.mirror ? 'scaleX(-1)' : 'none' }}
        playsInline
        muted
        autoPlay
      />

      {/* Hidden canvas for processing */}
      <canvas
        ref={canvasRef}
        className="hidden"
      />

      {/* Center guide crosshair (static) */}
      {cameraActive && (
        <>
          <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-muted-foreground/30" />
          <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-muted-foreground/30" />
        </>
      )}

      {/* Detection marker */}
      {detection.found && markerPos && (
        <>
          {/* Crosshair lines */}
          <div 
            className="crosshair-line h-[2px]"
            style={{
              left: 0,
              right: 0,
              top: markerPos.y,
              backgroundColor: detection.detectedColor === 'green' 
                ? 'hsl(var(--laser-green))' 
                : 'hsl(var(--primary))',
              boxShadow: detection.detectedColor === 'green'
                ? '0 0 8px hsl(var(--laser-green)), 0 0 16px hsl(var(--laser-green) / 0.5)'
                : undefined,
            }}
          />
          <div 
            className="crosshair-line w-[2px]"
            style={{
              top: 0,
              bottom: 0,
              left: markerPos.x,
              backgroundColor: detection.detectedColor === 'green' 
                ? 'hsl(var(--laser-green))' 
                : 'hsl(var(--primary))',
              boxShadow: detection.detectedColor === 'green'
                ? '0 0 8px hsl(var(--laser-green)), 0 0 16px hsl(var(--laser-green) / 0.5)'
                : undefined,
            }}
          />

          {/* Center marker */}
          <div 
            className="detection-marker"
            style={{
              left: markerPos.x,
              top: markerPos.y,
              borderColor: detection.detectedColor === 'green' 
                ? 'hsl(var(--laser-green))' 
                : 'hsl(var(--primary))',
              boxShadow: detection.detectedColor === 'green'
                ? '0 0 20px hsl(var(--laser-green)), 0 0 40px hsl(var(--laser-green) / 0.5)'
                : undefined,
            }}
          />
        </>
      )}
    </div>
  );
}
