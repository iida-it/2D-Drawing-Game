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
  UploadCloud,
  Box,
} from 'lucide-react';
import { BlueprintLevel, UploadedFloorPlan } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

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
  viewMode: '2d' | '3d';
  onToggleViewMode: (mode: '2d' | '3d') => void;
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
  viewMode,
  onToggleViewMode,
}) => {
  const [levelDropdownOpen, setLevelDropdownOpen] = React.useState(false);
  const { language, toggleLanguage, t } = useLanguage();

  return (
    <header className="h-14 bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-4 flex items-center justify-between select-none z-30 shadow-xs">
      {/* Brand & Level Select */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center shadow-sm shadow-sky-200 shrink-0">
            <Compass className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900 tracking-tight text-sm whitespace-nowrap">
                {t('brandTitle')}
              </span>
              <span className="text-[11px] font-medium text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200/60 hidden sm:inline whitespace-nowrap">
                {viewMode === '3d' ? t('view3D') : t('cadMode')}
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
            title={t('challengesTitle')}
          >
            <Layers className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="truncate max-w-[140px] md:max-w-[200px]">
              Ch. {currentLevel.levelNumber}: {currentLevel.title}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {levelDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setLevelDropdownOpen(false)}
              />
              <div className="absolute left-0 mt-1.5 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  {t('challengesTitle')}
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
                    <span>{t('uploadCustomPlan')}</span>
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
          title={t('uploadCustomPlan')}
        >
          <UploadCloud className="w-3.5 h-3.5 text-sky-600 shrink-0" />
          <span className="hidden md:inline whitespace-nowrap">
            {customFloorPlan ? t('planLoaded') : t('uploadPlan')}
          </span>
        </button>

        {customFloorPlan && onClearCustomFloorPlan && (
          <button
            onClick={onClearCustomFloorPlan}
            className="text-[10px] text-slate-400 hover:text-rose-600 hover:underline px-1 py-0.5 whitespace-nowrap"
            title={t('clearPlan')}
          >
            {t('clearPlan')}
          </button>
        )}
      </div>

      {/* Center Section: 2D/3D Toggle Switcher + CAD Controls */}
      <div className="flex items-center gap-2.5">
        {/* Clean 2D / 3D Mode Toggle Switcher */}
        <div className="flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 shadow-2xs">
          <button
            onClick={() => onToggleViewMode('2d')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              viewMode === '2d'
                ? 'bg-white text-sky-800 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
            }`}
            title={`${t('view2D')} (Tab)`}
          >
            <Compass className="w-3.5 h-3.5 text-sky-600" />
            <span>{t('view2D')}</span>
          </button>
          <button
            onClick={() => onToggleViewMode('3d')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              viewMode === '3d'
                ? 'bg-sky-600 text-white shadow-2xs shadow-sky-200'
                : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
            }`}
            title={`${t('view3D')} (Tab)`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>{t('view3D')}</span>
            {hasClosedRooms && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            )}
          </button>
        </div>

        {/* Center Tools: Undo, Redo, Zoom Controls (active in 2D mode) */}
        {viewMode === '2d' && (
          <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-xl border border-slate-200/70">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white disabled:opacity-35 disabled:hover:bg-transparent transition-all"
              title={`${t('undo')} (Ctrl+Z)`}
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white disabled:opacity-35 disabled:hover:bg-transparent transition-all"
              title={`${t('redo')} (Ctrl+Y)`}
            >
              <Redo2 className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-slate-200 mx-0.5" />

            <button
              onClick={onZoomOut}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-all"
              title={`${t('zoomOut')} (-)`}
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <button
              onClick={onResetZoom}
              className="px-2 py-1 rounded-lg text-xs font-mono font-medium text-slate-700 hover:bg-white hover:text-slate-900 transition-all min-w-[50px] text-center"
              title={t('resetView')}
            >
              {Math.round(zoom * 100)}%
            </button>

            <button
              onClick={onZoomIn}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-all"
              title={`${t('zoomIn')} (+)`}
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <button
              onClick={onResetZoom}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-all"
              title={t('resetView')}
            >
              <Maximize2 className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-slate-200 mx-0.5" />

            <button
              onClick={onClear}
              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-all"
              title={t('clearAll')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Right Actions: Compact Language Switcher, Sound, Help, Submit */}
      <div className="flex items-center gap-2">
        {/* Compact High-Contrast Language Switcher (EN | 日本語) */}
        <button
          type="button"
          onClick={toggleLanguage}
          aria-label={t('languageToggleAria')}
          title="Switch Language / 言語切替 (EN / 日本語)"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200/90 bg-white/95 hover:bg-white text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-300 transition-all select-none"
        >
          <span
            className={
              language === 'en'
                ? 'text-sky-600 font-bold bg-sky-50 px-1.5 py-0.5 rounded'
                : 'text-slate-400 font-medium'
            }
          >
            EN
          </span>
          <span className="text-slate-300 font-light select-none text-[10px]">|</span>
          <span
            className={
              language === 'ja'
                ? 'text-sky-600 font-bold bg-sky-50 px-1.5 py-0.5 rounded'
                : 'text-slate-400 font-medium'
            }
          >
            日本語
          </span>
        </button>

        <button
          onClick={onToggleSound}
          className={`p-2 rounded-lg border transition-all ${
            soundEnabled
              ? 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'
              : 'text-slate-400 bg-slate-100 border-slate-200'
          }`}
          title={soundEnabled ? t('muteAudio') : t('unmuteAudio')}
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
          title={t('shortcuts')}
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        {/* Submit Plan Button */}
        <button
          onClick={onSubmit}
          disabled={drawnWallsCount === 0}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all transform active:scale-95 whitespace-nowrap ${
            drawnWallsCount === 0
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
              : hasClosedRooms
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-200 shadow-md ring-2 ring-emerald-500/20'
              : 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-200 shadow-md'
          }`}
          title={
            drawnWallsCount === 0
              ? 'Draft at least one wall first'
              : t('submitPlan')
          }
        >
          <Send className="w-3.5 h-3.5" />
          <span>{t('submitPlan')}</span>
        </button>
      </div>
    </header>
  );
};
