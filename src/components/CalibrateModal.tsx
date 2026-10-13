import React, { useState } from 'react';
import { X, Sliders, Check } from 'lucide-react';
import { DraftingSettings } from '../types';

interface CalibrateModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: DraftingSettings;
  onSaveScale: (newScaleFactor: number) => void;
  lastMeasuredPx?: number;
}

export const CalibrateModal: React.FC<CalibrateModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveScale,
  lastMeasuredPx,
}) => {
  const [pixelsInput, setPixelsInput] = useState<string>(
    lastMeasuredPx ? Math.round(lastMeasuredPx).toString() : '50'
  );
  const [metersInput, setMetersInput] = useState<string>('1.00');

  if (!isOpen) return null;

  const presets = [
    { label: 'Standard Architectural (1m = 50px)', scale: 0.02, px: 50, m: 1.0 },
    { label: 'High Precision CAD (1m = 100px)', scale: 0.01, px: 100, m: 1.0 },
    { label: 'Overview Plan (1m = 25px)', scale: 0.04, px: 25, m: 1.0 },
  ];

  const handleApplyCustom = () => {
    const px = parseFloat(pixelsInput);
    const m = parseFloat(metersInput);
    if (!isNaN(px) && !isNaN(m) && px > 0 && m > 0) {
      const scale = m / px;
      onSaveScale(scale);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-sky-50 text-sky-600">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">
                Scale Calibration
              </h3>
              <p className="text-[11px] text-slate-400">
                Current: 1 px = {(settings.scaleFactor * 100).toFixed(1)} cm (
                {(1 / settings.scaleFactor).toFixed(0)} px/m)
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
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">
              Scale Presets
            </span>
            <div className="space-y-1.5">
              {presets.map((p, idx) => {
                const isSelected = Math.abs(settings.scaleFactor - p.scale) < 1e-5;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      onSaveScale(p.scale);
                      onClose();
                    }}
                    className={`w-full text-left p-2.5 rounded-xl border text-xs flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'border-sky-500 bg-sky-50 text-sky-900 font-semibold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span>{p.label}</span>
                    {isSelected && <Check className="w-4 h-4 text-sky-600" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">
              Custom Calibration
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">
                  Pixel Distance
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={pixelsInput}
                    onChange={(e) => setPixelsInput(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                  />
                  <span className="absolute right-2.5 top-1.5 text-[10px] text-slate-400">
                    px
                  </span>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-500 block mb-1">
                  Real Distance
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    value={metersInput}
                    onChange={(e) => setMetersInput(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                  />
                  <span className="absolute right-2.5 top-1.5 text-[10px] text-slate-400">
                    m
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleApplyCustom}
              className="mt-3 w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors"
            >
              Apply Custom Scale
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
