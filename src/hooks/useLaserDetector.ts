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

    // Step size for initial scan (performance optimization)
    const step = 2;
    
    // Sensitivity: 0-100 maps to detection parameters
    // Higher sensitivity = detect dimmer lasers
    const sensitivityFactor = settings.sensitivity / 100;
    
    // For direct beam detection, we look for:
    // 1. Extremely bright pixels (near saturation: 250-255)
    // 2. "Blooming" effect - bright area spreading from center
    // 3. Color dominance (green > red+blue for green laser)
    
    const saturationThreshold = 250 - (sensitivityFactor * 50); // 200-250
    const bloomThreshold = 200 - (sensitivityFactor * 80); // 120-200
    
    // Find the brightest saturated point (laser hitting sensor directly)
    let maxScore = 0;
    let maxX = 0;
    let maxY = 0;
    let detectedColor: 'red' | 'green' | null = null;
    let foundBeam = false;

    // Pass 1: Find candidates - extremely bright saturated pixels
    const candidates: Array<{x: number; y: number; r: number; g: number; b: number; score: number}> = [];
    
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Check for saturated pixels (direct laser beam causes sensor saturation)
        const brightness = (r + g + b) / 3;
        
        // Direct laser creates very bright, often saturated pixels
        if (brightness < bloomThreshold) continue;
        
        let isLaserCandidate = false;
        let score = 0;
        let color: 'red' | 'green' | null = null;
        
        // Green laser detection (most common for levels)
        if (settings.colorMode === 'green' || settings.colorMode === 'auto') {
          // Green laser hitting sensor: high G, lower R and B, or saturated white-ish
          // Also detect bloom (green tint spreading)
          const greenDominance = g - Math.max(r, b);
          const isSaturatedGreen = g >= saturationThreshold && (greenDominance > 20 || (g > 250 && r > 200 && b > 150));
          const isGreenBloom = g > bloomThreshold && g > r * 0.9 && g > b * 1.1;
          
          if (isSaturatedGreen || isGreenBloom) {
            isLaserCandidate = true;
            // Score based on saturation and green dominance
            score = g + (greenDominance > 0 ? greenDominance * 2 : 0) + (brightness > 250 ? 100 : 0);
            color = 'green';
          }
        }
        
        // Red laser detection
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
    
    // Sort by score and analyze top candidates
    candidates.sort((a, b) => b.score - a.score);
    
    // Pass 2: Verify bloom pattern around best candidate
    // Real laser beam creates a "bloom" - bright area radiating from center
    const topCandidate = candidates[0];
    
    // Check for bloom pattern (bright pixels surrounding the peak)
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
    
    // Bloom ratio - laser creates concentrated bright area
    const bloomRatio = totalChecked > 0 ? bloomPixels / totalChecked : 0;
    const hasBloom = bloomRatio > 0.15 - (sensitivityFactor * 0.1); // 5-15% of surrounding area bright
    
    // Final verification: need good score and bloom pattern
    const minScore = 200 - (sensitivityFactor * 100); // 100-200
    
    if (topCandidate.score > minScore && hasBloom) {
      foundBeam = true;
      maxX = topCandidate.x;
      maxY = topCandidate.y;
      maxScore = topCandidate.score;
      
      // Determine color from the peak
      if (topCandidate.g > topCandidate.r) {
        detectedColor = 'green';
      } else {
        detectedColor = 'red';
      }
      
      // Refine position: find centroid of saturated area for sub-pixel accuracy
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
    if (!videoRef.current || !canvasRef.current) return;

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

  // Start processing loop when camera becomes active
  useEffect(() => {
    if (state.cameraActive && !state.calibrating) {
      // Small delay to ensure video is ready
      const timeoutId = setTimeout(() => {
        animationRef.current = requestAnimationFrame(processFrame);
      }, 100);
      return () => {
        clearTimeout(timeoutId);
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    }
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
