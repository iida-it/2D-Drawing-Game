import React, { useState, useEffect } from 'react';
import { X, Sliders, Check, Ruler, Sparkles, ArrowRight } from 'lucide-react';
import { DraftingSettings } from '../types';

interface CalibrateModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: DraftingSettings;
  onSaveScale: (newScaleFactor: number) => void;
  lastMeasuredPx?: number;
  onStartTwoPointCalibration?: () => void;
}

export const CalibrateModal: React.FC<CalibrateModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveScale,
  lastMeasuredPx,
  onStartTwoPointCalibration,
}) => {
  const [pixelsInput, setPixelsInput] = useState<string>('50');
  const [metersInput, setMetersInput] = useState<string>('1.00');

  useEffect(() => {
    if (lastMeasuredPx && lastMeasuredPx > 0) {
      setPixelsInput(lastMeasuredPx.toFixed(1));
    } else {
      setPixelsInput((1 / settings.scaleFactor).toFixed(1));
    }
  }, [lastMeasuredPx, settings.scaleFactor, isOpen]);

  if (!isOpen) return null;

  const pxVal = parseFloat(pixelsInput) || 50;
  const mVal = parseFloat(metersInput) || 1.0;
  const computedScale = pxVal > 0 && mVal > 0 ? mVal / pxVal : 0.02;
  const computedCmPerPx = computedScale * 100;
  const computedPxPerMeter = 1 / computedScale;

  const quickMeters = [
    { label: '0.90 m (Standard Door)', val: '0.90' },
    { label: '1.00 m (1 Meter Standard)', val: '1.00' },
    { label: '2.00 m (Double Door / Corridor)', val: '2.00' },
    { label: '3.00 m (Room Wall)', val: '3.00' },
  ];

  const presets = [
    { label: '1m = 50px (Standard 1:50)', scale: 0.02 },
    { label: '1m = 100px (High-Res 1:20)', scale: 0.01 },
    { label: '1m = 25px (Overview Plan)', scale: 0.04 },
  ];

  const handleApply = () => {
    if (computedScale > 0 && isFinite(computedScale)) {
      onSaveScale(computedScale);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-50 text-sky-600 border border-sky-100">
              <Ruler className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">
                Blueprint Scale Calibration
              </h3>
              <p className="text-[11px] text-slate-500">
                Calibrate real-world dimensions against your uploaded floor plan
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="py-4 space-y-4">
          {/* Active 2-Point Calibration Callout */}
          {lastMeasuredPx && lastMeasuredPx > 0 ? (
            <div className="bg-sky-50/80 rounded-xl p-3 border border-sky-200/80 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold text-sky-700 uppercase tracking-wide flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-sky-600" />
                  Point-to-Point Measurement Captured
                </span>
                <div className="text-sm font-bold font-mono text-slate-900 mt-0.5">
                  {lastMeasuredPx.toFixed(1)} Pixels measured
                </div>
              </div>
              <span className="text-[11px] text-sky-700 bg-white px-2 py-1 rounded-lg border border-sky-200 shadow-2xs font-medium">
                Ready to Calibrate
              </span>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/70 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-800">
                  Interactive 2-Point Measure
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Click two known points on the floor plan (e.g. door jamb width)
                </p>
              </div>
              {onStartTwoPointCalibration && (
                <button
                  onClick={() => {
                    onClose();
                    onStartTwoPointCalibration();
                  }}
                  className="px-3 py-1.5 bg-white text-sky-700 hover:bg-sky-50 text-xs font-semibold rounded-lg border border-sky-200 transition-colors shadow-2xs"
                >
                  Pick 2 Points
                </button>
              )}
            </div>
          )}

          {/* Known Distance Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-slate-700 block mb-1">
                Measured Reference (Pixels)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  value={pixelsInput}
                  onChange={(e) => setPixelsInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                  placeholder="e.g. 50"
                />
                <span className="absolute right-3 top-2 text-[10px] text-slate-400 font-mono">
                  px
                </span>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-700 block mb-1">
                Known Real Distance (Meters)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.05"
                  value={metersInput}
                  onChange={(e) => setMetersInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                  placeholder="e.g. 1.00"
                />
                <span className="absolute right-3 top-2 text-[10px] text-slate-400 font-mono">
                  m
                </span>
              </div>
            </div>
          </div>

          {/* Quick presets for known dimensions */}
          <div>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
              Quick Reference Benchmarks
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {quickMeters.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => setMetersInput(item.val)}
                  className={`text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors border ${
                    metersInput === item.val
                      ? 'bg-sky-50 border-sky-300 text-sky-800 font-semibold'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Calculated Scale Ratio Preview */}
          <div className="p-3 bg-slate-900 text-white rounded-xl flex items-center justify-between text-xs">
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-mono">
                Calculated Ratio
              </span>
              <div className="font-mono font-bold text-sky-400 text-sm mt-0.5">
                1 px = {computedCmPerPx.toFixed(2)} cm
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block uppercase font-mono">
                Resolution
              </span>
              <div className="font-mono font-semibold text-slate-200 mt-0.5">
                {computedPxPerMeter.toFixed(1)} px / meter
              </div>
            </div>
          </div>

          {/* Standard Presets */}
          <div className="pt-2 border-t border-slate-100">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
              Or Use Standard Scale Presets
            </span>
            <div className="grid grid-cols-3 gap-2">
              {presets.map((p, idx) => {
                const isSelected = Math.abs(settings.scaleFactor - p.scale) < 1e-5;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      onSaveScale(p.scale);
                      onClose();
                    }}
                    className={`p-2 rounded-lg border text-left text-xs transition-colors ${
                      isSelected
                        ? 'border-sky-500 bg-sky-50 text-sky-900 font-semibold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <div className="truncate">{p.label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={handleApply}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-sky-200 transition-all transform active:scale-95"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Apply Calibration</span>
          </button>
        </div>
      </div>
    </div>
  );
};
