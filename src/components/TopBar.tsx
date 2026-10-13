import React from 'react';
import {
  Compass,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Trash2,
  Volume2,
  VolumeX,
  Send,
  HelpCircle,
  Layers,
  ChevronDown,
} from 'lucide-react';
import { BlueprintLevel, UploadedFloorPlan } from '../types';
import { UploadCloud } from 'lucide-react';

interface TopBarProps {
  levels: BlueprintLevel[];
  currentLevel: BlueprintLevel;
  onSelectLevel: (lvl: BlueprintLevel) => void;
  customFloorPlan?: UploadedFloorPlan | null;
  onClearCustomFloorPlan?: () => void;
  onOpenUpload: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenShortcuts: () => void;
  onSubmit: () => void;
  drawnWallsCount: number;
  hasClosedRooms: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  levels,
  currentLevel,
  onSelectLevel,
  customFloorPlan,
  onClearCustomFloorPlan,
  onOpenUpload,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  soundEnabled,
  onToggleSound,
  onOpenShortcuts,
  onSubmit,
  drawnWallsCount,
  hasClosedRooms,
}) => {
  const [levelDropdownOpen, setLevelDropdownOpen] = React.useState(false);

  return (
    <header className="h-14 bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-4 flex items-center justify-between select-none z-30 shadow-xs">
      {/* Brand & Level Select */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center shadow-sm shadow-sky-200">
            <Compass className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900 tracking-tight text-sm">
                Blueprint Studio 2D
              </span>
              <span className="text-[11px] font-medium text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200/60">
                CAD Mode
              </span>
            </div>
          </div>
        </div>

        <div className="h-5 w-px bg-slate-200 mx-1 hidden sm:block" />

        {/* Level Dropdown */}
        <div className="relative">
          <button
            onClick={() => setLevelDropdownOpen(!levelDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/80 active:bg-slate-200 rounded-lg transition-colors border border-slate-200/60"
            title="Switch blueprint challenge"
          >
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            <span className="truncate max-w-[160px] md:max-w-[220px]">
              Ch. {currentLevel.levelNumber}: {currentLevel.title}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {levelDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setLevelDropdownOpen(false)}
              />
              <div className="absolute left-0 mt-1.5 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Client Blueprint Challenges
                </div>
                {levels.map((lvl) => {
                  const isCurrent = lvl.id === currentLevel.id;
                  return (
                    <button
                      key={lvl.id}
                      onClick={() => {
                        onSelectLevel(lvl);
                        setLevelDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors ${
                        isCurrent
                          ? 'bg-sky-50 text-sky-900 font-semibold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span>
                            {lvl.levelNumber}. {lvl.title}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-normal">
                          {lvl.client.name} · {lvl.targetSpecs.totalAreaMetersSq} m²
                        </div>
                      </div>
                      <span className="text-[10px] uppercase font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        {lvl.difficulty}
                      </span>
                    </button>
                  );
                })}

                <div className="pt-1.5 mt-1 border-t border-slate-100 px-1.5">
                  <button
                    onClick={() => {
                      setLevelDropdownOpen(false);
                      onOpenUpload();
                    }}
                    className="w-full text-left px-2.5 py-1.5 text-xs text-sky-700 hover:bg-sky-50 rounded-lg font-semibold flex items-center gap-2 transition-colors"
                  >
                    <UploadCloud className="w-3.5 h-3.5 text-sky-600" />
                    <span>Upload Custom Plan (PNG/PDF)</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Quick Upload Plan Button */}
        <button
          onClick={onOpenUpload}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
            customFloorPlan
              ? 'bg-sky-50 text-sky-800 border-sky-300 shadow-2xs'
              : 'bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 border-slate-200/80 shadow-2xs'
          }`}
          title="Upload your own 2D floor plan image (PNG/JPG) or PDF page"
        >
          <UploadCloud className="w-3.5 h-3.5 text-sky-600" />
          <span className="hidden md:inline">
            {customFloorPlan ? 'Plan Loaded' : 'Upload Plan'}
          </span>
        </button>

        {customFloorPlan && onClearCustomFloorPlan && (
          <button
            onClick={onClearCustomFloorPlan}
            className="text-[10px] text-slate-400 hover:text-rose-600 hover:underline px-1 py-0.5"
            title="Reset to challenge floor plan"
          >
            Clear Plan
          </button>
        )}
      </div>

      {/* Center Tools: Undo, Redo, Zoom Controls */}
      <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-xl border border-slate-200/70">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white disabled:opacity-35 disabled:hover:bg-transparent transition-all"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white disabled:opacity-35 disabled:hover:bg-transparent transition-all"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-slate-200 mx-0.5" />

        <button
          onClick={onZoomOut}
          className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-all"
          title="Zoom Out (-)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <button
          onClick={onResetZoom}
          className="px-2 py-1 rounded-lg text-xs font-mono font-medium text-slate-700 hover:bg-white hover:text-slate-900 transition-all min-w-[50px] text-center"
          title="Reset Zoom to 100%"
        >
          {Math.round(zoom * 100)}%
        </button>

        <button
          onClick={onZoomIn}
          className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-all"
          title="Zoom In (+)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <button
          onClick={onResetZoom}
          className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-all"
          title="Reset View"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-slate-200 mx-0.5" />

        <button
          onClick={onClear}
          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-all"
          title="Clear all drafted walls"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Right Actions: Sound, Help, Submit */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleSound}
          className={`p-2 rounded-lg border transition-all ${
            soundEnabled
              ? 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'
              : 'text-slate-400 bg-slate-100 border-slate-200'
          }`}
          title={soundEnabled ? 'Mute Drafting Audio' : 'Unmute Drafting Audio'}
        >
          {soundEnabled ? (
            <Volume2 className="w-4 h-4 text-sky-600" />
          ) : (
            <VolumeX className="w-4 h-4" />
          )}
        </button>

        <button
          onClick={onOpenShortcuts}
          className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all"
          title="Keyboard Shortcuts & CAD Controls (?)"
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        {/* Submit Plan Button */}
        <button
          onClick={onSubmit}
          disabled={drawnWallsCount === 0}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all transform active:scale-95 ${
            drawnWallsCount === 0
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
              : hasClosedRooms
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-200 shadow-md ring-2 ring-emerald-500/20'
              : 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-200 shadow-md'
          }`}
          title={
            drawnWallsCount === 0
              ? 'Draft at least one wall first'
              : 'Submit blueprint drawing for client scoring'
          }
        >
          <Send className="w-3.5 h-3.5" />
          <span>Submit Plan</span>
        </button>
      </div>
    </header>
  );
};
