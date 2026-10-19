import React from 'react';
import {
  MousePointer2,
  PenTool,
  DoorOpen,
  SplitSquareVertical,
  SlidersHorizontal,
  AppWindow,
  Ruler,
  Sliders,
  Eraser,
  Grid3X3,
  CornerDownRight,
  Eye,
  EyeOff,
  Hand,
} from 'lucide-react';
import { ToolType, DraftingSettings } from '../types';

interface LeftToolbarProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  settings: DraftingSettings;
  onUpdateSettings: (updater: (prev: DraftingSettings) => DraftingSettings) => void;
}

export const LeftToolbar: React.FC<LeftToolbarProps> = ({
  activeTool,
  onSelectTool,
  settings,
  onUpdateSettings,
}) => {
  const tools: {
    id: ToolType;
    label: string;
    sublabel?: string;
    shortcut: string;
    icon: React.FC<{ className?: string }>;
    category?: 'draft' | 'openings' | 'measure';
  }[] = [
    { id: 'select', label: 'Select & Move', shortcut: 'V', icon: MousePointer2, category: 'draft' },
    { id: 'wall', label: 'Draw Wall', shortcut: 'W', icon: PenTool, category: 'draft' },

    // Standard Japanese Architectural Openings
    { id: 'door', label: 'Single Door', sublabel: '片開き戸 (90° Arc)', shortcut: 'D', icon: DoorOpen, category: 'openings' },
    { id: 'double-door', label: 'Double Door', sublabel: '両開き戸 (Dual)', shortcut: 'B', icon: SplitSquareVertical, category: 'openings' },
    { id: 'sliding-door', label: 'Sliding Door', sublabel: '引違い戸 (Sliding)', shortcut: 'L', icon: SlidersHorizontal, category: 'openings' },
    { id: 'window', label: 'Window', sublabel: '引違い窓 (Sash)', shortcut: 'N', icon: AppWindow, category: 'openings' },

    // Measurement & Utilities
    { id: 'measure', label: 'Tape Measure', shortcut: 'M', icon: Ruler, category: 'measure' },
    { id: 'calibrate', label: 'Calibrate Scale', shortcut: 'C', icon: Sliders, category: 'measure' },
    { id: 'erase', label: 'Erase Wall / Opening', shortcut: 'E', icon: Eraser, category: 'measure' },
    { id: 'pan', label: 'Pan Canvas', shortcut: 'Space', icon: Hand, category: 'measure' },
  ];

  const toggleSnap = () => {
    onUpdateSettings((prev) => ({ ...prev, snapToGrid: !prev.snapToGrid }));
  };

  const toggleOrtho = () => {
    onUpdateSettings((prev) => ({ ...prev, orthoSnapping: !prev.orthoSnapping }));
  };

  const toggleGhost = () => {
    onUpdateSettings((prev) => ({ ...prev, ghostVisible: !prev.ghostVisible }));
  };

  return (
    <div className="absolute left-4 top-20 z-20 flex flex-col gap-2 select-none">
      {/* Primary Drafting Tool Dock */}
      <div className="bg-white/95 backdrop-blur-md rounded-2xl p-1.5 shadow-lg shadow-slate-300/40 border border-slate-200/80 flex flex-col gap-1 items-center">
        {tools.map((t, index) => {
          const Icon = t.icon;
          const isActive = activeTool === t.id;
          const showDivider = t.id === 'door' || t.id === 'measure';
          return (
            <React.Fragment key={t.id}>
              {showDivider && <div className="w-6 h-px bg-slate-200/80 my-0.5" />}
              <button
                onClick={() => onSelectTool(t.id)}
                className={`relative group w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                  isActive
                    ? 'bg-sky-600 text-white shadow-sm shadow-sky-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
                title={`${t.label} (${t.shortcut})`}
              >
                <Icon className="w-5 h-5 stroke-[2.2]" />

                {/* Tooltip */}
                <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 text-white text-[11px] font-medium rounded-lg shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 flex items-center gap-2">
                  <div className="flex flex-col text-left">
                    <span className="font-semibold text-white">{t.label}</span>
                    {t.sublabel && (
                      <span className="text-[10px] text-sky-300 font-sans">{t.sublabel}</span>
                    )}
                  </div>
                  <kbd className="bg-slate-700 text-slate-200 px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0">
                    {t.shortcut}
                  </kbd>
                </div>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Drafting Modes & Toggles Dock */}
      <div className="bg-white/95 backdrop-blur-md rounded-2xl p-1.5 shadow-lg shadow-slate-300/40 border border-slate-200/80 flex flex-col gap-1 items-center">
        {/* Snap to Grid */}
        <button
          onClick={toggleSnap}
          className={`relative group w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
            settings.snapToGrid
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
          }`}
          title="Toggle Grid Snapping (S)"
        >
          <Grid3X3 className="w-5 h-5 stroke-[2]" />
          {settings.snapToGrid && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          )}

          <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 text-white text-[11px] font-medium rounded-lg shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 flex items-center gap-1.5">
            <span>Grid Snap: {settings.snapToGrid ? 'ON (10cm)' : 'OFF'}</span>
            <kbd className="bg-slate-700 text-slate-200 px-1.5 py-0.5 rounded text-[10px] font-mono">
              S
            </kbd>
          </div>
        </button>

        {/* Ortho Angle Snapping */}
        <button
          onClick={toggleOrtho}
          className={`relative group w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
            settings.orthoSnapping
              ? 'bg-sky-50 text-sky-700 border border-sky-200'
              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
          }`}
          title="Toggle Ortho Angles 0°/45°/90° (O)"
        >
          <CornerDownRight className="w-5 h-5 stroke-[2]" />
          {settings.orthoSnapping && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
          )}

          <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 text-white text-[11px] font-medium rounded-lg shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 flex items-center gap-1.5">
            <span>Ortho Angle: {settings.orthoSnapping ? '0° / 45° / 90°' : 'Freeform'}</span>
            <kbd className="bg-slate-700 text-slate-200 px-1.5 py-0.5 rounded text-[10px] font-mono">
              O
            </kbd>
          </div>
        </button>

        {/* Ghost Blueprint Visibility */}
        <button
          onClick={toggleGhost}
          className={`relative group w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
            settings.ghostVisible
              ? 'text-slate-700 hover:bg-slate-100'
              : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'
          }`}
          title="Toggle Ghost Blueprint Layer (G)"
        >
          {settings.ghostVisible ? (
            <Eye className="w-5 h-5 stroke-[2]" />
          ) : (
            <EyeOff className="w-5 h-5 stroke-[2]" />
          )}

          <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 text-white text-[11px] font-medium rounded-lg shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 flex items-center gap-1.5">
            <span>Ghost Layer: {settings.ghostVisible ? 'Visible' : 'Hidden'}</span>
            <kbd className="bg-slate-700 text-slate-200 px-1.5 py-0.5 rounded text-[10px] font-mono">
              G
            </kbd>
          </div>
        </button>
      </div>
    </div>
  );
};
