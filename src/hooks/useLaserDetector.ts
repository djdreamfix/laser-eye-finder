import { useRef, useState, useCallback, useEffect } from 'react';

export type ColorMode = 'red' | 'green' | 'auto';

export interface DetectorSettings {
  sensitivity: number; // 0-100
  colorMode: ColorMode;
  smoothing: number; // 0-10
  flickerFilter: boolean;
  mirror: boolean;
  rotation: number; // 0, 90, 180, 270
}

export interface DetectionResult {
  found: boolean;
  x: number;
  y: number;
  intensity: number;
  detectedColor: 'red' | 'green' | null;
}

interface LaserDetectorState {
  cameraActive: boolean;
  fps: number;
  detection: DetectionResult;
  error: string | null;
  calibrating: boolean;
  calibrationComplete: boolean;
}

const DEFAULT_SETTINGS: DetectorSettings = {
  sensitivity: 50,
  colorMode: 'auto',
  smoothing: 3,
  flickerFilter: true,
  mirror: false,
  rotation: 0,
};

export function useLaserDetector() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  const fpsHistoryRef = useRef<number[]>([]);
  const positionHistoryRef = useRef<{ x: number; y: number }[]>([]);
  const calibrationDataRef = useRef<{ avgBrightness: number; threshold: number } | null>(null);

  const [settings, setSettings] = useState<DetectorSettings>(DEFAULT_SETTINGS);
  const [state, setState] = useState<LaserDetectorState>({
    cameraActive: false,
    fps: 0,
    detection: { found: false, x: 0, y: 0, intensity: 0, detectedColor: null },
    error: null,
    calibrating: false,
    calibrationComplete: false,
  });

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        await videoRef.current.play();
        setState(s => ({ ...s, cameraActive: true, error: null }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не вдалося отримати доступ до камери';
      setState(s => ({ ...s, error: message }));
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    setState(s => ({ ...s, cameraActive: false }));
  }, []);

  const startCalibration = useCallback(() => {
    setState(s => ({ ...s, calibrating: true, calibrationComplete: false }));
    calibrationDataRef.current = null;

    // Collect calibration data for 2 seconds
    let frames: number[] = [];
    const startTime = Date.now();

    const collectFrame = () => {
      if (!canvasRef.current || !videoRef.current) return;

      const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(videoRef.current, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
      const data = imageData.data;

      let totalBrightness = 0;
      for (let i = 0; i < data.length; i += 4) {
        totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
      }
      const avgBrightness = totalBrightness / (data.length / 4);
      frames.push(avgBrightness);

      if (Date.now() - startTime < 2000) {
        requestAnimationFrame(collectFrame);
      } else {
        const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
        calibrationDataRef.current = {
          avgBrightness: avg,
          threshold: avg + 50 + (100 - settings.sensitivity),
        };
        setState(s => ({ ...s, calibrating: false, calibrationComplete: true }));
      }
    };

    collectFrame();
  }, [settings.sensitivity]);

  const detectLaser = useCallback((
    imageData: ImageData,
    settings: DetectorSettings
  ): DetectionResult => {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    let maxIntensity = 0;
    let maxX = 0;
    let maxY = 0;
    let detectedColor: 'red' | 'green' | null = null;

    // Sensitivity affects threshold (higher sensitivity = lower threshold)
    const baseThreshold = calibrationDataRef.current?.threshold || 200;
    const threshold = baseThreshold - (settings.sensitivity * 1.5);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        let intensity = 0;
        let color: 'red' | 'green' | null = null;

        // Check for red laser
        if (settings.colorMode === 'red' || settings.colorMode === 'auto') {
          if (r > threshold && r > g * 1.5 && r > b * 1.5) {
            intensity = r;
            color = 'red';
          }
        }

        // Check for green laser
        if (settings.colorMode === 'green' || settings.colorMode === 'auto') {
          if (g > threshold && g > r * 1.2 && g > b * 1.5) {
            if (g > intensity) {
              intensity = g;
              color = 'green';
            }
          }
        }

        if (intensity > maxIntensity) {
          maxIntensity = intensity;
          maxX = x;
          maxY = y;
          detectedColor = color;
        }
      }
    }

    const found = maxIntensity > threshold;

    return {
      found,
      x: maxX,
      y: maxY,
      intensity: maxIntensity,
      detectedColor: found ? detectedColor : null,
    };
  }, []);

  const smoothPosition = useCallback((x: number, y: number, smoothing: number) => {
    positionHistoryRef.current.push({ x, y });
    if (positionHistoryRef.current.length > smoothing + 1) {
      positionHistoryRef.current.shift();
    }

    if (positionHistoryRef.current.length === 0) return { x, y };

    const avgX = positionHistoryRef.current.reduce((sum, p) => sum + p.x, 0) / positionHistoryRef.current.length;
    const avgY = positionHistoryRef.current.reduce((sum, p) => sum + p.y, 0) / positionHistoryRef.current.length;

    return { x: avgX, y: avgY };
  }, []);

  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !state.cameraActive) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animationRef.current = requestAnimationFrame(processFrame);
      return;
    }

    // Update canvas size to match video
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    // Apply transformations
    ctx.save();
    if (settings.mirror) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    ctx.restore();

    // Detect laser
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let detection = detectLaser(imageData, settings);

    // Apply smoothing
    if (detection.found && settings.smoothing > 0) {
      const smoothed = smoothPosition(detection.x, detection.y, settings.smoothing);
      detection = { ...detection, x: smoothed.x, y: smoothed.y };
    } else if (!detection.found) {
      positionHistoryRef.current = [];
    }

    // Calculate FPS
    const now = performance.now();
    if (lastFrameTimeRef.current) {
      const fps = 1000 / (now - lastFrameTimeRef.current);
      fpsHistoryRef.current.push(fps);
      if (fpsHistoryRef.current.length > 30) {
        fpsHistoryRef.current.shift();
      }
      const avgFps = Math.round(
        fpsHistoryRef.current.reduce((a, b) => a + b, 0) / fpsHistoryRef.current.length
      );
      setState(s => ({ ...s, fps: avgFps, detection }));
    } else {
      setState(s => ({ ...s, detection }));
    }
    lastFrameTimeRef.current = now;

    animationRef.current = requestAnimationFrame(processFrame);
  }, [state.cameraActive, settings, detectLaser, smoothPosition]);

  useEffect(() => {
    if (state.cameraActive && !state.calibrating) {
      animationRef.current = requestAnimationFrame(processFrame);
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [state.cameraActive, state.calibrating, processFrame]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    videoRef,
    canvasRef,
    settings,
    setSettings,
    state,
    startCamera,
    stopCamera,
    startCalibration,
  };
}
