import React from 'react';
import { Settings, RotateCw, FlipHorizontal2, Gauge, Palette, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { DetectorSettings, ColorMode } from '@/hooks/useLaserDetector';

interface SettingsPanelProps {
  settings: DetectorSettings;
  onSettingsChange: (settings: DetectorSettings) => void;
  onCalibrate: () => void;
  calibrating: boolean;
  calibrationComplete: boolean;
}

export function SettingsPanel({ 
  settings, 
  onSettingsChange, 
  onCalibrate,
  calibrating,
  calibrationComplete 
}: SettingsPanelProps) {
  const handleSensitivityChange = (value: number[]) => {
    onSettingsChange({ ...settings, sensitivity: value[0] });
  };

  const handleSmoothingChange = (value: number[]) => {
    onSettingsChange({ ...settings, smoothing: value[0] });
  };

  const handleColorModeChange = (mode: ColorMode) => {
    onSettingsChange({ ...settings, colorMode: mode });
  };

  const handleFlickerFilterToggle = (checked: boolean) => {
    onSettingsChange({ ...settings, flickerFilter: checked });
  };

  const handleMirrorToggle = (checked: boolean) => {
    onSettingsChange({ ...settings, mirror: checked });
  };

  const handleRotation = () => {
    const nextRotation = (settings.rotation + 90) % 360;
    onSettingsChange({ ...settings, rotation: nextRotation });
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" size="icon" className="control-button">
          <Settings className="w-6 h-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="bg-card border-border h-auto max-h-[80vh] overflow-y-auto safe-area-inset">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-foreground flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Налаштування
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6">
          {/* Calibration */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-foreground">
              <Sparkles className="w-4 h-4" />
              Калібрування
            </Label>
            <p className="text-sm text-muted-foreground">
              Наведіть камеру на поверхню без лазера та натисніть кнопку
            </p>
            <Button 
              onClick={onCalibrate} 
              disabled={calibrating}
              variant="outline"
              className="w-full mt-2"
            >
              {calibrating ? 'Калібрування...' : calibrationComplete ? 'Перекалібрувати' : 'Калібрувати'}
            </Button>
          </div>

          {/* Sensitivity */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2 text-foreground">
              <Gauge className="w-4 h-4" />
              Чутливість: {settings.sensitivity}%
            </Label>
            <Slider
              value={[settings.sensitivity]}
              onValueChange={handleSensitivityChange}
              min={0}
              max={100}
              step={1}
              className="w-full"
            />
          </div>

          {/* Color Mode */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2 text-foreground">
              <Palette className="w-4 h-4" />
              Режим кольору
            </Label>
            <div className="flex gap-2">
              <Button
                variant={settings.colorMode === 'auto' ? 'default' : 'secondary'}
                size="sm"
                onClick={() => handleColorModeChange('auto')}
                className="flex-1"
              >
                Авто
              </Button>
              <Button
                variant={settings.colorMode === 'red' ? 'default' : 'secondary'}
                size="sm"
                onClick={() => handleColorModeChange('red')}
                className="flex-1"
              >
                🔴 Червоний
              </Button>
              <Button
                variant={settings.colorMode === 'green' ? 'default' : 'secondary'}
                size="sm"
                onClick={() => handleColorModeChange('green')}
                className="flex-1"
              >
                🟢 Зелений
              </Button>
            </div>
          </div>

          {/* Smoothing */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2 text-foreground">
              <Sparkles className="w-4 h-4" />
              Згладжування: {settings.smoothing}
            </Label>
            <Slider
              value={[settings.smoothing]}
              onValueChange={handleSmoothingChange}
              min={0}
              max={10}
              step={1}
              className="w-full"
            />
          </div>

          {/* Flicker Filter */}
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-foreground">
              <Zap className="w-4 h-4" />
              Фільтр мерехтіння
            </Label>
            <Switch
              checked={settings.flickerFilter}
              onCheckedChange={handleFlickerFilterToggle}
            />
          </div>

          {/* Mirror */}
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-foreground">
              <FlipHorizontal2 className="w-4 h-4" />
              Дзеркало
            </Label>
            <Switch
              checked={settings.mirror}
              onCheckedChange={handleMirrorToggle}
            />
          </div>

          {/* Rotation */}
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-foreground">
              <RotateCw className="w-4 h-4" />
              Поворот: {settings.rotation}°
            </Label>
            <Button variant="secondary" size="sm" onClick={handleRotation}>
              Повернути
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
