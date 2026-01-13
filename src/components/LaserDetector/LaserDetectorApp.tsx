import React from 'react';
import { Camera, CameraOff, Download, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLaserDetector } from '@/hooks/useLaserDetector';
import { CameraView } from './CameraView';
import { StatusBar } from './StatusBar';
import { SettingsPanel } from './SettingsPanel';

export function LaserDetectorApp() {
  const {
    videoRef,
    canvasRef,
    settings,
    setSettings,
    state,
    startCamera,
    stopCamera,
    startCalibration,
  } = useLaserDetector();

  const [deferredPrompt, setDeferredPrompt] = React.useState<any>(null);
  const [canInstall, setCanInstall] = React.useState(false);

  React.useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setCanInstall(false);
      }
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-background safe-area-inset">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-card border-b border-border">
        <div className="flex items-center gap-2">
          <Target className="w-6 h-6 text-primary" />
          <h1 className="text-lg font-bold text-foreground">Laser Level</h1>
        </div>
        
        {canInstall && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleInstall}
            className="text-xs"
          >
            <Download className="w-4 h-4 mr-1" />
            Встановити
          </Button>
        )}
      </header>

      {/* Status bar - only show when camera is active */}
      {state.cameraActive && (
        <StatusBar 
          detection={state.detection} 
          fps={state.fps}
          calibrating={state.calibrating}
        />
      )}

      {/* Main camera view */}
      <main className="flex-1 relative overflow-hidden">
        {/* Keep CameraView mounted so refs exist before camera start */}
        <CameraView
          videoRef={videoRef}
          canvasRef={canvasRef}
          detection={state.detection}
          settings={settings}
          cameraActive={state.cameraActive}
        />

        {/* Intro overlay (shown when camera is not active) */}
        {!state.cameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-background">
            <div className="w-24 h-24 mb-6 rounded-full bg-secondary flex items-center justify-center">
              <Camera className="w-12 h-12 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-2 text-foreground">
              Laser Level Detector
            </h2>
            <p className="text-muted-foreground mb-8 max-w-sm">
              Виявляє лазерну лінію та показує центр променя. Замінює окремий приймач лазерного рівня.
            </p>

            <Button
              onClick={startCamera}
              size="lg"
              className="control-button px-8 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Camera className="w-6 h-6 mr-2" />
              Увімкнути камеру
            </Button>

            {state.error && (
              <p className="mt-4 text-destructive text-sm">
                {state.error}
              </p>
            )}

            <div className="mt-8 p-4 bg-secondary/50 rounded-lg max-w-sm">
              <h3 className="text-sm font-semibold text-foreground mb-2">
                🔒 Приватність
              </h3>
              <p className="text-xs text-muted-foreground">
                Усі дані обробляються локально на вашому пристрої.
                Жодна інформація не відправляється на сервер.
              </p>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {state.cameraActive && state.error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <div className="p-6 bg-card rounded-lg text-center">
              <p className="text-destructive">{state.error}</p>
              <Button onClick={stopCamera} className="mt-4">
                Закрити
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Control bar */}
      {state.cameraActive && (
        <footer className="flex items-center justify-center gap-4 px-4 py-4 bg-card border-t border-border">
          <Button
            variant="destructive"
            size="icon"
            className="control-button"
            onClick={stopCamera}
          >
            <CameraOff className="w-6 h-6" />
          </Button>

          <SettingsPanel
            settings={settings}
            onSettingsChange={setSettings}
            onCalibrate={startCalibration}
            calibrating={state.calibrating}
            calibrationComplete={state.calibrationComplete}
          />
        </footer>
      )}
    </div>
  );
}
