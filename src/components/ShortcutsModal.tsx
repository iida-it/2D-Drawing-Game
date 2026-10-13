import React from 'react';
import { X, Keyboard, Mouse } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const toolShortcuts = [
    { key: 'V', desc: 'Select & Move Tool' },
    { key: 'W', desc: 'Draw Wall Tool' },
    { key: 'D', desc: 'Door Opening Tool (Snap to wall)' },
    { key: 'N', desc: 'Window Opening Tool (Snap to wall)' },
    { key: 'M', desc: 'Tape Measure Tool' },
    { key: 'C', desc: 'Calibrate Scale' },
    { key: 'E', desc: 'Erase Wall / Opening' },
    { key: 'F', desc: 'Flip Door Swing (Inside/Outside)' },
    { key: 'S', desc: 'Toggle 10cm Grid Snap' },
    { key: 'O', desc: 'Toggle Ortho Angle Clamping (0°/45°/90°)' },
    { key: 'G', desc: 'Toggle Ghost Blueprint Layer' },
  ];

  const canvasShortcuts = [
    { key: 'Space + Drag', desc: 'Pan canvas smoothly' },
    { key: 'Middle Mouse Drag', desc: 'Pan canvas' },
    { key: 'Mouse Wheel', desc: 'Zoom centered at cursor' },
    { key: 'Shift (Hold)', desc: 'Temporarily lock 0° / 45° / 90° angles' },
    { key: 'Esc / Right-Click', desc: 'Cancel active drawing segment' },
    { key: 'Del / Backspace', desc: 'Delete selected wall segment' },
    { key: 'Ctrl + Z', desc: 'Undo last drafting action' },
    { key: 'Ctrl + Y', desc: 'Redo drafting action' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-sky-50 text-sky-600">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">
                CAD Keyboard & Mouse Controls
              </h3>
              <p className="text-[11px] text-slate-400">
                Planner 5D inspired drafting hotkeys
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
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
              <Keyboard className="w-3.5 h-3.5" />
              Tool Selection Hotkeys
            </div>
            <div className="grid grid-cols-2 gap-2">
              {toolShortcuts.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs"
                >
                  <span className="text-slate-600 text-[11px]">{item.desc}</span>
                  <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-800 font-semibold shadow-2xs">
                    {item.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
              <Mouse className="w-3.5 h-3.5" />
              Canvas Navigation & Snapping
            </div>
            <div className="space-y-1.5">
              {canvasShortcuts.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs"
                >
                  <span className="text-slate-600 text-[11px]">{item.desc}</span>
                  <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-800 font-semibold shadow-2xs">
                    {item.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
