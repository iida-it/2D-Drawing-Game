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
import { useLanguage } from '../i18n/LanguageContext';

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
  const { t } = useLanguage();

  const tools: {
    id: ToolType;
    label: string;
    sublabel?: string;
    shortcut: string;
    icon: React.FC<{ className?: string }>;
    category?: 'draft' | 'openings' | 'measure';
  }[] = [
    { id: 'select', label: t('toolSelect'), shortcut: 'V', icon: MousePointer2, category: 'draft' },
    { id: 'wall', label: t('toolWall'), shortcut: 'W', icon: PenTool, category: 'draft' },

    // Standard Architectural Openings
    { id: 'door', label: t('toolSingleDoor'), sublabel: t('toolSingleDoorSub'), shortcut: 'D', icon: DoorOpen, category: 'openings' },
    { id: 'double-door', label: t('toolDoubleDoor'), sublabel: t('toolDoubleDoorSub'), shortcut: 'B', icon: SplitSquareVertical, category: 'openings' },
    { id: 'sliding-door', label: t('toolSlidingDoor'), sublabel: t('toolSlidingDoorSub'), shortcut: 'L', icon: SlidersHorizontal, category: 'openings' },
    { id: 'window', label: t('toolWindow'), sublabel: t('toolWindowSub'), shortcut: 'N', icon: AppWindow, category: 'openings' },

    // Measurement & Utilities
    { id: 'measure', label: t('toolMeasure'), shortcut: 'M', icon: Ruler, category: 'measure' },
    { id: 'calibrate', label: t('toolCalibrate'), shortcut: 'C', icon: Sliders, category: 'measure' },
    { id: 'erase', label: t('toolErase'), shortcut: 'E', icon: Eraser, category: 'measure' },
    { id: 'pan', label: t('toolPan'), shortcut: 'Space', icon: Hand, category: 'measure' },
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
        {tools.map((item) => {
          const Icon = item.icon;
          const isActive = activeTool === item.id;
          const showDivider = item.id === 'door' || item.id === 'measure';
          return (
            <React.Fragment key={item.id}>
              {showDivider && <div className="w-6 h-px bg-slate-200/80 my-0.5" />}
              <button
                onClick={() => onSelectTool(item.id)}
                className={`relative group w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                  isActive
                    ? 'bg-sky-600 text-white shadow-sm shadow-sky-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
                title={`${item.label} (${item.shortcut})`}
              >
                <Icon className="w-5 h-5 stroke-[2.2]" />

                {/* Tooltip */}
                <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 text-white text-[11px] font-medium rounded-lg shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 flex items-center gap-2">
                  <div className="flex flex-col text-left">
                    <span className="font-semibold text-white">{item.label}</span>
                    {item.sublabel && (
                      <span className="text-[10px] text-sky-300 font-sans">{item.sublabel}</span>
                    )}
                  </div>
                  <kbd className="bg-slate-700 text-slate-200 px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0">
                    {item.shortcut}
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
          title={`${t('gridSnap')} (S)`}
        >
          <Grid3X3 className="w-5 h-5 stroke-[2]" />
          {settings.snapToGrid && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          )}

          <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 text-white text-[11px] font-medium rounded-lg shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 flex items-center gap-1.5">
            <span>{settings.snapToGrid ? t('gridSnapOn') : t('gridSnapOff')}</span>
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
          title={`${t('orthoAngle')} (O)`}
        >
          <CornerDownRight className="w-5 h-5 stroke-[2]" />
          {settings.orthoSnapping && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
          )}

          <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 text-white text-[11px] font-medium rounded-lg shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 flex items-center gap-1.5">
            <span>{settings.orthoSnapping ? t('orthoAngleOn') : t('orthoAngleOff')}</span>
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
          title={`${t('ghostLayer')} (G)`}
        >
          {settings.ghostVisible ? (
            <Eye className="w-5 h-5 stroke-[2]" />
          ) : (
            <EyeOff className="w-5 h-5 stroke-[2]" />
          )}

          <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 text-white text-[11px] font-medium rounded-lg shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 flex items-center gap-1.5">
            <span>{settings.ghostVisible ? t('ghostVisible') : t('ghostHidden')}</span>
            <kbd className="bg-slate-700 text-slate-200 px-1.5 py-0.5 rounded text-[10px] font-mono">
              G
            </kbd>
          </div>
        </button>
      </div>
    </div>
  );
};
