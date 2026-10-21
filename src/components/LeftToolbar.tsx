import React, { useState, useEffect, useRef } from 'react';
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
  ChevronRight,
} from 'lucide-react';
import { ToolType, OpeningType, DraftingSettings } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

interface LeftToolbarProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  settings: DraftingSettings;
  onUpdateSettings: (updater: (prev: DraftingSettings) => DraftingSettings) => void;
}

// Crisp CAD Vector Icons for Arc Wall Modes
const Arc3PtIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className || 'w-5 h-5'}
  >
    <path d="M4 19 A 15 15 0 0 1 19 4" />
    <circle cx="4" cy="19" r="1.75" fill="currentColor" />
    <circle cx="11.5" cy="7.5" r="1.75" fill="currentColor" />
    <circle cx="19" cy="4" r="1.75" fill="currentColor" />
  </svg>
);

const ArcRadiusIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className || 'w-5 h-5'}
  >
    <path d="M4 19 A 15 15 0 0 1 19 4" />
    <circle cx="4" cy="19" r="1.75" fill="currentColor" />
    <circle cx="19" cy="4" r="1.75" fill="currentColor" />
    <path d="M11.5 11.5 L15 15" strokeDasharray="2 2" strokeWidth="1.5" />
    <circle cx="11.5" cy="11.5" r="1.25" fill="currentColor" />
  </svg>
);

export const LeftToolbar: React.FC<LeftToolbarProps> = ({
  activeTool,
  onSelectTool,
  settings,
  onUpdateSettings,
}) => {
  const { t } = useLanguage();
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  // Flyout Popover state
  const [openFlyout, setOpenFlyout] = useState<'openings' | 'arc' | null>(null);
  const [selectedOpeningTool, setSelectedOpeningTool] = useState<OpeningType>('door');
  const [selectedArcTool, setSelectedArcTool] = useState<
    'arc-3pt' | 'arc-ser' | 'arc-radius'
  >('arc-3pt');

  // Sync active opening / arc tool to the main button icon & badge
  useEffect(() => {
    if (
      activeTool === 'door' ||
      activeTool === 'double-door' ||
      activeTool === 'sliding-door' ||
      activeTool === 'window'
    ) {
      setSelectedOpeningTool(activeTool);
    }
    if (
      activeTool === 'arc-3pt' ||
      activeTool === 'arc-ser' ||
      activeTool === 'arc-radius'
    ) {
      setSelectedArcTool(activeTool);
    }
  }, [activeTool]);

  // Click outside listener to automatically dismiss flyout popovers
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as globalThis.Node)) {
        setOpenFlyout(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Openings Flyout Options List
  const openingItems: {
    id: OpeningType;
    label: string;
    sublabel?: string;
    shortcut: string;
    icon: React.FC<{ className?: string }>;
  }[] = [
    {
      id: 'door',
      label: t('toolSingleDoor'),
      sublabel: t('toolSingleDoorSub'),
      shortcut: 'D',
      icon: DoorOpen,
    },
    {
      id: 'double-door',
      label: t('toolDoubleDoor'),
      sublabel: t('toolDoubleDoorSub'),
      shortcut: 'B',
      icon: SplitSquareVertical,
    },
    {
      id: 'sliding-door',
      label: t('toolSlidingDoor'),
      sublabel: t('toolSlidingDoorSub'),
      shortcut: 'S',
      icon: SlidersHorizontal,
    },
    {
      id: 'window',
      label: t('toolWindow'),
      sublabel: t('toolWindowSub'),
      shortcut: 'W',
      icon: AppWindow,
    },
  ];

  // Arc Wall / Curve Flyout Options List
  const arcItems: {
    id: 'arc-3pt' | 'arc-ser' | 'arc-radius';
    label: string;
    sublabel?: string;
    shortcut: string;
    icon: React.FC<{ className?: string }>;
  }[] = [
    {
      id: 'arc-3pt',
      label: t('toolArc3Pt'),
      sublabel: t('toolArc3PtSub'),
      shortcut: 'A',
      icon: Arc3PtIcon,
    },
    {
      id: 'arc-ser',
      label: t('toolArcRadius'),
      sublabel: t('toolArcRadiusSub'),
      shortcut: 'R',
      icon: ArcRadiusIcon,
    },
  ];

  const isOpeningsActive =
    activeTool === 'door' ||
    activeTool === 'double-door' ||
    activeTool === 'sliding-door' ||
    activeTool === 'window';

  const isArcActive =
    activeTool === 'arc-3pt' ||
    activeTool === 'arc-ser' ||
    activeTool === 'arc-radius';

  const currentOpening =
    openingItems.find((o) => o.id === selectedOpeningTool) || openingItems[0];
  const OpeningDisplayIcon = currentOpening.icon;

  const currentArc = arcItems.find((a) => a.id === selectedArcTool) || arcItems[0];
  const ArcDisplayIcon = currentArc.icon;

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
    <div ref={toolbarRef} className="absolute left-4 top-20 z-20 flex flex-col gap-2 select-none">
      {/* Primary Drafting Tool Dock */}
      <div className="bg-white/95 backdrop-blur-md rounded-2xl p-1.5 shadow-lg shadow-slate-300/40 border border-slate-200/80 flex flex-col gap-1 items-center">
        {/* 1. Select Tool */}
        <div className="relative">
          <button
            onClick={() => {
              setOpenFlyout(null);
              onSelectTool('select');
            }}
            className={`relative group w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
              activeTool === 'select'
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title={`${t('toolSelect')} (V)`}
          >
            <MousePointer2 className="w-5 h-5 stroke-[2.2]" />
            <span
              className={`absolute bottom-0.5 right-1 text-[9px] font-mono font-bold px-1 rounded leading-none transition-colors select-none pointer-events-none ${
                activeTool === 'select'
                  ? 'bg-sky-700/90 text-sky-100 border border-sky-400/30'
                  : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-800 border border-slate-200/60'
              }`}
            >
              V
            </span>

            {/* Tooltip */}
            <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 text-white text-[11px] font-medium rounded-lg shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 flex items-center gap-2">
              <span className="font-semibold text-white">{t('toolSelect')}</span>
              <kbd className="bg-slate-700 text-slate-200 px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0">
                V
              </kbd>
            </div>
          </button>
        </div>

        {/* 2. Straight Wall / Pen Tool */}
        <div className="relative">
          <button
            onClick={() => {
              setOpenFlyout(null);
              onSelectTool('wall');
            }}
            className={`relative group w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
              activeTool === 'wall'
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title={`${t('toolWall')} (P)`}
          >
            <PenTool className="w-5 h-5 stroke-[2.2]" />
            <span
              className={`absolute bottom-0.5 right-1 text-[9px] font-mono font-bold px-1 rounded leading-none transition-colors select-none pointer-events-none ${
                activeTool === 'wall'
                  ? 'bg-sky-700/90 text-sky-100 border border-sky-400/30'
                  : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-800 border border-slate-200/60'
              }`}
            >
              P
            </span>

            {/* Tooltip */}
            <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 text-white text-[11px] font-medium rounded-lg shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 flex items-center gap-2">
              <span className="font-semibold text-white">{t('toolWall')}</span>
              <kbd className="bg-slate-700 text-slate-200 px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0">
                P
              </kbd>
            </div>
          </button>
        </div>

        {/* 3. Arc Wall / Curve Group (Flyout Sub-Menu) */}
        <div className="relative">
          <button
            onClick={() => {
              const nextState = openFlyout === 'arc' ? null : 'arc';
              setOpenFlyout(nextState);
              if (!isArcActive) {
                onSelectTool(selectedArcTool);
              }
            }}
            className={`relative group w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
              isArcActive
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title={`${t('toolArcWall')} (${currentArc.shortcut})`}
          >
            <ArcDisplayIcon className="w-5 h-5 stroke-[2.2]" />

            {/* CAD Corner Flyout Indicator Arrow */}
            <svg
              className={`absolute top-1 right-1 w-2 h-2 transition-colors pointer-events-none ${
                isArcActive ? 'text-sky-200' : 'text-slate-400 group-hover:text-slate-600'
              }`}
              viewBox="0 0 6 6"
              fill="currentColor"
            >
              <polygon points="6,0 6,6 0,6" />
            </svg>

            {/* Corner Shortcut Key Badge */}
            <span
              className={`absolute bottom-0.5 right-1 text-[9px] font-mono font-bold px-1 rounded leading-none transition-colors select-none pointer-events-none ${
                isArcActive
                  ? 'bg-sky-700/90 text-sky-100 border border-sky-400/30'
                  : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-800 border border-slate-200/60'
              }`}
            >
              {currentArc.shortcut}
            </span>

            {/* Hover Tooltip (Hidden when flyout is open) */}
            {openFlyout !== 'arc' && (
              <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 text-white text-[11px] font-medium rounded-lg shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 flex items-center gap-2">
                <div className="flex flex-col text-left">
                  <span className="font-semibold text-white">{t('toolArcWall')}</span>
                  <span className="text-[10px] text-sky-300 font-sans">{currentArc.label}</span>
                </div>
                <kbd className="bg-slate-700 text-slate-200 px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0">
                  {currentArc.shortcut}
                </kbd>
              </div>
            )}
          </button>

          {/* Arc Wall Floating Flyout Popover */}
          {openFlyout === 'arc' && (
            <div className="absolute left-full top-0 ml-3 bg-white/98 backdrop-blur-md rounded-2xl p-2 shadow-2xl shadow-slate-900/20 border border-slate-200/90 z-50 flex flex-col gap-1 min-w-[230px] animate-in fade-in zoom-in-95 duration-100">
              <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-0.5 flex items-center justify-between">
                <span>{t('toolArcWall')}</span>
                <span className="text-[9px] text-slate-400 font-normal">CAD CURVES</span>
              </div>
              {arcItems.map((item) => {
                const ItemIcon = item.icon;
                const isItemActive = activeTool === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSelectedArcTool(item.id);
                      onSelectTool(item.id);
                      setOpenFlyout(null);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-all ${
                      isItemActive
                        ? 'bg-sky-600 text-white shadow-xs font-semibold'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950 font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`p-1 rounded-lg ${
                          isItemActive ? 'bg-sky-700/80 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <ItemIcon className="w-4 h-4 stroke-[2.2]" />
                      </div>
                      <div className="flex flex-col text-left">
                        <span className="leading-tight">{item.label}</span>
                        {item.sublabel && (
                          <span
                            className={`text-[10px] font-normal leading-tight mt-0.5 ${
                              isItemActive ? 'text-sky-200' : 'text-slate-400'
                            }`}
                          >
                            {item.sublabel}
                          </span>
                        )}
                      </div>
                    </div>
                    <kbd
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ml-2 ${
                        isItemActive
                          ? 'bg-sky-700/80 text-white border border-sky-400/40'
                          : 'bg-slate-100 text-slate-600 border border-slate-200/80'
                      }`}
                    >
                      {item.shortcut}
                    </kbd>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Divider between wall tools and openings */}
        <div className="w-6 h-px bg-slate-200/80 my-0.5" />

        {/* 4. Openings Group (Doors & Windows Flyout Sub-Menu) */}
        <div className="relative">
          <button
            onClick={() => {
              const nextState = openFlyout === 'openings' ? null : 'openings';
              setOpenFlyout(nextState);
              if (!isOpeningsActive) {
                onSelectTool(selectedOpeningTool);
              }
            }}
            className={`relative group w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
              isOpeningsActive
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title={`${t('toolOpenings')} (${currentOpening.shortcut})`}
          >
            <OpeningDisplayIcon className="w-5 h-5 stroke-[2.2]" />

            {/* CAD Corner Flyout Indicator Arrow */}
            <svg
              className={`absolute top-1 right-1 w-2 h-2 transition-colors pointer-events-none ${
                isOpeningsActive ? 'text-sky-200' : 'text-slate-400 group-hover:text-slate-600'
              }`}
              viewBox="0 0 6 6"
              fill="currentColor"
            >
              <polygon points="6,0 6,6 0,6" />
            </svg>

            {/* Corner Shortcut Key Badge */}
            <span
              className={`absolute bottom-0.5 right-1 text-[9px] font-mono font-bold px-1 rounded leading-none transition-colors select-none pointer-events-none ${
                isOpeningsActive
                  ? 'bg-sky-700/90 text-sky-100 border border-sky-400/30'
                  : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-800 border border-slate-200/60'
              }`}
            >
              {currentOpening.shortcut}
            </span>

            {/* Hover Tooltip (Hidden when flyout is open) */}
            {openFlyout !== 'openings' && (
              <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 text-white text-[11px] font-medium rounded-lg shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 flex items-center gap-2">
                <div className="flex flex-col text-left">
                  <span className="font-semibold text-white">{t('toolOpenings')}</span>
                  <span className="text-[10px] text-sky-300 font-sans">{currentOpening.label}</span>
                </div>
                <kbd className="bg-slate-700 text-slate-200 px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0">
                  {currentOpening.shortcut}
                </kbd>
              </div>
            )}
          </button>

          {/* Openings Floating Flyout Popover */}
          {openFlyout === 'openings' && (
            <div className="absolute left-full top-0 ml-3 bg-white/98 backdrop-blur-md rounded-2xl p-2 shadow-2xl shadow-slate-900/20 border border-slate-200/90 z-50 flex flex-col gap-1 min-w-[240px] animate-in fade-in zoom-in-95 duration-100">
              <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-0.5 flex items-center justify-between">
                <span>{t('toolOpenings')}</span>
                <span className="text-[9px] text-slate-400 font-normal">DOORS & WINDOWS</span>
              </div>
              {openingItems.map((item) => {
                const ItemIcon = item.icon;
                const isItemActive = activeTool === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSelectedOpeningTool(item.id);
                      onSelectTool(item.id);
                      setOpenFlyout(null);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-all ${
                      isItemActive
                        ? 'bg-sky-600 text-white shadow-xs font-semibold'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950 font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`p-1 rounded-lg ${
                          isItemActive ? 'bg-sky-700/80 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <ItemIcon className="w-4 h-4 stroke-[2.2]" />
                      </div>
                      <div className="flex flex-col text-left">
                        <span className="leading-tight">{item.label}</span>
                        {item.sublabel && (
                          <span
                            className={`text-[10px] font-normal leading-tight mt-0.5 ${
                              isItemActive ? 'text-sky-200' : 'text-slate-400'
                            }`}
                          >
                            {item.sublabel}
                          </span>
                        )}
                      </div>
                    </div>
                    <kbd
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ml-2 ${
                        isItemActive
                          ? 'bg-sky-700/80 text-white border border-sky-400/40'
                          : 'bg-slate-100 text-slate-600 border border-slate-200/80'
                      }`}
                    >
                      {item.shortcut}
                    </kbd>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Divider between openings and measurement tools */}
        <div className="w-6 h-px bg-slate-200/80 my-0.5" />

        {/* 5. Measurement Tools & Utilities */}
        {[
          { id: 'measure' as ToolType, label: t('toolMeasure'), shortcut: 'M', icon: Ruler },
          { id: 'calibrate' as ToolType, label: t('toolCalibrate'), shortcut: 'C', icon: Sliders },
          { id: 'erase' as ToolType, label: t('toolErase'), shortcut: 'E', icon: Eraser },
          { id: 'pan' as ToolType, label: t('toolPan'), shortcut: 'H', icon: Hand },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = activeTool === item.id;
          return (
            <div key={item.id} className="relative">
              <button
                onClick={() => {
                  setOpenFlyout(null);
                  onSelectTool(item.id);
                }}
                className={`relative group w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                  isActive
                    ? 'bg-sky-600 text-white shadow-sm shadow-sky-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
                title={`${item.label} (${item.shortcut})`}
              >
                <Icon className="w-5 h-5 stroke-[2.2]" />

                {/* Corner Shortcut Key Badge */}
                <span
                  className={`absolute bottom-0.5 right-1 text-[9px] font-mono font-bold px-1 rounded leading-none transition-colors select-none pointer-events-none ${
                    isActive
                      ? 'bg-sky-700/90 text-sky-100 border border-sky-400/30'
                      : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-800 border border-slate-200/60'
                  }`}
                >
                  {item.shortcut}
                </span>

                {/* Tooltip */}
                <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 text-white text-[11px] font-medium rounded-lg shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 flex items-center gap-2">
                  <span className="font-semibold text-white">{item.label}</span>
                  <kbd className="bg-slate-700 text-slate-200 px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0">
                    {item.shortcut}
                  </kbd>
                </div>
              </button>
            </div>
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
          title={`${t('gridSnap')} (Shift+S)`}
        >
          <Grid3X3 className="w-5 h-5 stroke-[2]" />
          {settings.snapToGrid && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          )}

          <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 text-white text-[11px] font-medium rounded-lg shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 flex items-center gap-1.5">
            <span>{settings.snapToGrid ? t('gridSnapOn') : t('gridSnapOff')}</span>
            <kbd className="bg-slate-700 text-slate-200 px-1.5 py-0.5 rounded text-[10px] font-mono">
              Shift+S
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
