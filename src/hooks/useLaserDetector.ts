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

// Pure function - no hooks needed
function detectLaser(
  imageData: ImageData,
  settings: DetectorSettings
): DetectionResult {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;

  const step = 2;
  const sensitivityFactor = settings.sensitivity / 100;
  const saturationThreshold = 250 - (sensitivityFactor * 50);
  const bloomThreshold = 200 - (sensitivityFactor * 80);
  
  let maxScore = 0;
  let maxX = 0;
  let maxY = 0;
  let detectedColor: 'red' | 'green' | null = null;
  let foundBeam = false;

  const candidates: Array<{x: number; y: number; r: number; g: number; b: number; score: number}> = [];
  
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const brightness = (r + g + b) / 3;
      
      if (brightness < bloomThreshold) continue;
      
      let isLaserCandidate = false;
      let score = 0;
      let color: 'red' | 'green' | null = null;
      
      if (settings.colorMode === 'green' || settings.colorMode === 'auto') {
        const greenDominance = g - Math.max(r, b);
        const isSaturatedGreen = g >= saturationThreshold && (greenDominance > 20 || (g > 250 && r > 200 && b > 150));
        const isGreenBloom = g > bloomThreshold && g > r * 0.9 && g > b * 1.1;
        
        if (isSaturatedGreen || isGreenBloom) {
          isLaserCandidate = true;
          score = g + (greenDominance > 0 ? greenDominance * 2 : 0) + (brightness > 250 ? 100 : 0);
          color = 'green';
        }
      }
      
      if (settings.colorMode === 'red' || settings.colorMode === 'auto') {
        const redDominance = r - Math.max(g, b);
        const isSaturatedRed = r >= saturationThreshold && (redDominance > 20 || (r > 250 && g > 150 && b > 100));
        const isRedBloom = r > bloomThreshold && r > g * 1.2 && r > b * 1.3;
        
        if (isSaturatedRed || isRedBloom) {
          const redScore = r + (redDominance > 0 ? redDominance * 2 : 0) + (brightness > 250 ? 100 : 0);
          if (redScore > score) {
            isLaserCandidate = true;
            score = redScore;
            color = 'red';
          }
        }
      }
      
      if (isLaserCandidate && score > 0) {
        candidates.push({ x, y, r, g, b, score });
      }
    }
  }
  
  if (candidates.length === 0) {
    return { found: false, x: 0, y: 0, intensity: 0, detectedColor: null };
  }
  
  candidates.sort((a, b) => b.score - a.score);
  const topCandidate = candidates[0];
  
  const bloomRadius = 15;
  let bloomPixels = 0;
  let totalChecked = 0;
  
  for (let dy = -bloomRadius; dy <= bloomRadius; dy += 3) {
    for (let dx = -bloomRadius; dx <= bloomRadius; dx += 3) {
      const nx = topCandidate.x + dx;
      const ny = topCandidate.y + dy;
      
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      
      const ni = (ny * width + nx) * 4;
      const brightness = (data[ni] + data[ni + 1] + data[ni + 2]) / 3;
      
      totalChecked++;
      if (brightness > bloomThreshold * 0.7) {
        bloomPixels++;
      }
    }
  }
  
  const bloomRatio = totalChecked > 0 ? bloomPixels / totalChecked : 0;
  const hasBloom = bloomRatio > 0.15 - (sensitivityFactor * 0.1);
  const minScore = 200 - (sensitivityFactor * 100);
  
  if (topCandidate.score > minScore && hasBloom) {
    foundBeam = true;
    maxX = topCandidate.x;
    maxY = topCandidate.y;
    maxScore = topCandidate.score;
    
    if (topCandidate.g > topCandidate.r) {
      detectedColor = 'green';
    } else {
      detectedColor = 'red';
    }
    
    let sumX = 0, sumY = 0, sumWeight = 0;
    const refineRadius = 10;
    
    for (let dy = -refineRadius; dy <= refineRadius; dy++) {
      for (let dx = -refineRadius; dx <= refineRadius; dx++) {
        const nx = topCandidate.x + dx;
        const ny = topCandidate.y + dy;
        
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        
        const ni = (ny * width + nx) * 4;
        const brightness = (data[ni] + data[ni + 1] + data[ni + 2]) / 3;
        
        if (brightness > saturationThreshold) {
          const weight = brightness;
          sumX += nx * weight;
          sumY += ny * weight;
          sumWeight += weight;
        }
      }
    }
    
    if (sumWeight > 0) {
      maxX = Math.round(sumX / sumWeight);
      maxY = Math.round(sumY / sumWeight);
    }
  }

  return {
    found: foundBeam,
    x: maxX,
    y: maxY,
    intensity: Math.min(100, Math.round(maxScore / 4)),
    detectedColor: foundBeam ? detectedColor : null,
  };
}

export function useLaserDetector() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
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
    setState(s => ({ ...s, cameraActive: false }));
  }, []);

  const startCalibration = useCallback(() => {
    setState(s => ({ ...s, calibrating: true, calibrationComplete: false }));
    calibrationDataRef.current = null;

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

  // Smoothing helper
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

  // Frame processing effect
  useEffect(() => {
    if (!state.cameraActive || state.calibrating) return;

    let frameId: number | null = null;
    let lastTime = 0;
    let isActive = true;

    const processFrame = () => {
      if (!isActive) return;
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if (!video || !canvas) {
        frameId = requestAnimationFrame(processFrame);
        return;
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
        frameId = requestAnimationFrame(processFrame);
        return;
      }

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      ctx.save();
      if (settings.mirror) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0);
      ctx.restore();

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let detection = detectLaser(imageData, settings);

      if (detection.found && settings.smoothing > 0) {
        const smoothed = smoothPosition(detection.x, detection.y, settings.smoothing);
        detection = { ...detection, x: smoothed.x, y: smoothed.y };
      } else if (!detection.found) {
        positionHistoryRef.current = [];
      }

      const now = performance.now();
      if (lastTime) {
        const fps = 1000 / (now - lastTime);
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
      lastTime = now;

      frameId = requestAnimationFrame(processFrame);
    };

    const timeoutId = setTimeout(() => {
      if (isActive) {
        frameId = requestAnimationFrame(processFrame);
      }
    }, 100);

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [state.cameraActive, state.calibrating, settings, smoothPosition]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

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
