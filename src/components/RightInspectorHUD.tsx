import React from 'react';
import {
  Sparkles,
  ChevronRight,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Info,
  Maximize,
  Ruler,
  DoorOpen,
  AppWindow,
  RotateCw,
  Trash2,
} from 'lucide-react';
import {
  BlueprintLevel,
  ValidationResult,
  DraftingSettings,
  Wall,
  WallOpening,
  Node,
  UploadedFloorPlan,
  ClosedRoom,
  RoomType,
} from '../types';
import { pixelsToMeters, getDistance, formatMeters, ROOM_THEMES } from '../utils/geometry';

interface RightInspectorHUDProps {
  currentLevel: BlueprintLevel;
  customFloorPlan?: UploadedFloorPlan | null;
  onOpenUpload?: () => void;
  onStartCalibrationTool?: () => void;
  liveValidation: ValidationResult;
  settings: DraftingSettings;
  onUpdateSettings: (updater: (prev: DraftingSettings) => DraftingSettings) => void;
  selectedWall: Wall | null;
  selectedRoom?: ClosedRoom | null;
  onChangeRoomType?: (roomId: string, newType: RoomType) => void;
  selectedOpening?: WallOpening | null;
  onUpdateOpening?: (openingId: string, updates: Partial<WallOpening>) => void;
  onDeleteOpening?: (openingId: string) => void;
  nodes: Node[];
  onDeleteWall: (wallId: string) => void;
  onOpenCalibrate: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const RightInspectorHUD: React.FC<RightInspectorHUDProps> = ({
  currentLevel,
  customFloorPlan,
  onOpenUpload,
  onStartCalibrationTool,
  liveValidation,
  settings,
  onUpdateSettings,
  selectedWall,
  selectedRoom,
  onChangeRoomType,
  selectedOpening,
  onUpdateOpening,
  onDeleteOpening,
  nodes,
  onDeleteWall,
  onOpenCalibrate,
  isCollapsed,
  onToggleCollapse,
}) => {
  const client = currentLevel.client;
  const targetSpecs = currentLevel.targetSpecs;

  // Selected wall metrics
  let selectedWallLengthMeters = 0;
  if (selectedWall) {
    const n1 = nodes.find((n) => n.id === selectedWall.startNodeId);
    const n2 = nodes.find((n) => n.id === selectedWall.endNodeId);
    if (n1 && n2) {
      selectedWallLengthMeters = pixelsToMeters(
        getDistance(n1, n2),
        settings.scaleFactor
      );
    }
  }

  return (
    <div
      className={`absolute right-4 top-20 z-20 transition-all duration-300 select-none ${
        isCollapsed ? 'translate-x-[calc(100%+16px)]' : 'translate-x-0'
      }`}
    >
      {/* Collapse Toggle Handle */}
      <button
        onClick={onToggleCollapse}
        className="absolute -left-9 top-4 w-9 h-10 bg-white/95 backdrop-blur-md border border-slate-200/90 border-r-0 rounded-l-xl shadow-md flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors"
        title={isCollapsed ? 'Open HUD Inspector' : 'Collapse HUD'}
      >
        <ChevronRight
          className={`w-4 h-4 transition-transform ${isCollapsed ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Main HUD Panel */}
      <div className="w-80 md:w-88 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl shadow-slate-300/40 border border-slate-200/80 p-4.5 flex flex-col gap-4 max-h-[calc(100vh-100px)] overflow-y-auto">
        {/* Client Avatar & Challenge Brief / Custom Blueprint Card */}
        {customFloorPlan ? (
          <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
            <div className="relative shrink-0">
              <img
                src={customFloorPlan.dataUrl}
                alt={customFloorPlan.name}
                className="w-12 h-12 rounded-xl object-cover ring-2 ring-sky-500/30 shadow-xs border border-slate-200"
              />
              <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-sky-500 rounded-full border-2 border-white flex items-center justify-center text-[9px] text-white">
                ★
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <h3 className="font-semibold text-slate-900 text-xs truncate">
                  {customFloorPlan.name}
                </h3>
                <span className="text-[10px] text-sky-700 font-semibold bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded">
                  Custom
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate">
                {customFloorPlan.width} × {customFloorPlan.height} px reference
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                {onStartCalibrationTool && (
                  <button
                    onClick={onStartCalibrationTool}
                    className="flex-1 py-1 px-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 shadow-2xs transition-colors"
                  >
                    <Sliders className="w-3 h-3" />
                    <span>Calibrate 2 Points</span>
                  </button>
                )}
                {onOpenUpload && (
                  <button
                    onClick={onOpenUpload}
                    className="py-1 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-medium transition-colors"
                  >
                    Change
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
            <div className="relative shrink-0">
              <img
                src={client.avatar}
                alt={client.name}
                className="w-12 h-12 rounded-xl object-cover ring-2 ring-sky-500/20 shadow-xs"
              />
              <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center text-[9px] text-white">
                ✓
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <h3 className="font-semibold text-slate-900 text-xs truncate">
                  {client.name}
                </h3>
                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 px-1.5 py-0.5 rounded">
                  Ch. {currentLevel.levelNumber}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate">{client.role}</p>
              <div className="mt-1 text-[11px] text-slate-700 italic bg-slate-50 p-2 rounded-lg border border-slate-100/80 leading-relaxed">
                {client.quote}
              </div>
            </div>
          </div>
        )}

        {/* Real-time Accuracy & Deviation Gauge */}
        <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-200/60">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-sky-600" />
              Live Accuracy
            </span>
            <span
              className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                liveValidation.scorePercent >= 90
                  ? 'bg-emerald-100 text-emerald-800'
                  : liveValidation.scorePercent >= 70
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {liveValidation.scorePercent}% Match
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-2.5">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                liveValidation.scorePercent >= 90
                  ? 'bg-emerald-500'
                  : liveValidation.scorePercent >= 70
                  ? 'bg-amber-500'
                  : 'bg-sky-500'
              }`}
              style={{ width: `${liveValidation.scorePercent}%` }}
            />
          </div>

          {/* Key Target Metrics Matrix */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {/* Room Area */}
            <div className="bg-white p-2 rounded-lg border border-slate-100">
              <span className="text-slate-400 block text-[10px]">Room Area</span>
              <div className="font-semibold text-slate-800 font-mono mt-0.5">
                {liveValidation.drawnAreaMetersSq.toFixed(2)} m²
              </div>
              <span className="text-[10px] text-slate-500">
                Target: {targetSpecs.totalAreaMetersSq.toFixed(2)} m²
              </span>
            </div>

            {/* Perimeter & Deviation */}
            <div className="bg-white p-2 rounded-lg border border-slate-100">
              <span className="text-slate-400 block text-[10px]">Perimeter</span>
              <div className="font-semibold text-slate-800 font-mono mt-0.5">
                {liveValidation.totalDrawnPerimeterMeters.toFixed(2)} m
              </div>
              <span className="text-[10px] text-slate-500">
                Target: {targetSpecs.totalPerimeterMeters.toFixed(2)} m
              </span>
            </div>
          </div>

          {/* Real-time Deviation Readout */}
          <div className="mt-2.5 pt-2 border-t border-slate-200/50 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Dimension Deviation:</span>
            <span
              className={`font-mono font-semibold flex items-center gap-1 ${
                liveValidation.meanDeviationMeters <= targetSpecs.toleranceMeters
                  ? 'text-emerald-600'
                  : 'text-amber-600'
              }`}
            >
              {liveValidation.meanDeviationMeters <= targetSpecs.toleranceMeters ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              ) : (
                <AlertTriangle className="w-3 h-3 text-amber-500" />
              )}
              ±{liveValidation.meanDeviationMeters.toFixed(2)} m
            </span>
          </div>
        </div>

        {/* Selected Opening Inspector (When a Door or Window is clicked) */}
        {selectedOpening && (
          <div className="bg-sky-50/80 rounded-xl p-3 border border-sky-300 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-sky-900 flex items-center gap-1.5">
                {selectedOpening.type === 'door' || selectedOpening.type === 'double-door' ? (
                  <DoorOpen className="w-4 h-4 text-sky-600" />
                ) : (
                  <AppWindow className="w-4 h-4 text-sky-600" />
                )}
                {selectedOpening.type === 'door'
                  ? 'Single Door (片開き戸)'
                  : selectedOpening.type === 'double-door'
                  ? 'Double Door (両開き戸)'
                  : selectedOpening.type === 'sliding-door'
                  ? 'Sliding Door (引違い戸)'
                  : 'Window (引違い窓)'}
              </span>
              {onDeleteOpening && (
                <button
                  onClick={() => onDeleteOpening(selectedOpening.id)}
                  className="text-[11px] text-rose-600 hover:text-rose-700 hover:underline font-medium flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              )}
            </div>

            {/* Opening Type Selector */}
            {onUpdateOpening && (
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Symbol Convention
                </span>
                <div className="grid grid-cols-4 gap-1">
                  {(
                    [
                      { type: 'door', label: 'Single' },
                      { type: 'double-door', label: 'Double' },
                      { type: 'sliding-door', label: 'Sliding' },
                      { type: 'window', label: 'Window' },
                    ] as const
                  ).map((item) => {
                    const isCur = selectedOpening.type === item.type;
                    return (
                      <button
                        key={item.type}
                        onClick={() =>
                          onUpdateOpening(selectedOpening.id, {
                            type: item.type,
                            widthMeters:
                              item.type === 'door'
                                ? 0.85
                                : item.type === 'double-door'
                                ? 1.6
                                : item.type === 'sliding-door'
                                ? 1.65
                                : 1.2,
                          })
                        }
                        className={`px-1 py-1 rounded text-[10px] font-semibold text-center border transition-colors ${
                          isCur
                            ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                            : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Opening Width Presets */}
            <div>
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Opening Width
              </span>
              <div className="grid grid-cols-4 gap-1">
                {(selectedOpening.type === 'door'
                  ? [0.75, 0.8, 0.85, 0.9]
                  : selectedOpening.type === 'double-door'
                  ? [1.4, 1.6, 1.8, 2.0]
                  : selectedOpening.type === 'sliding-door'
                  ? [1.2, 1.5, 1.65, 1.8]
                  : [0.9, 1.2, 1.5, 1.8]
                ).map((w) => {
                  const isCurrent = Math.abs(selectedOpening.widthMeters - w) < 0.01;
                  return (
                    <button
                      key={w}
                      onClick={() => onUpdateOpening && onUpdateOpening(selectedOpening.id, { widthMeters: w })}
                      className={`px-1.5 py-1 rounded text-[10px] font-semibold text-center border transition-colors ${
                        isCurrent
                          ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {w.toFixed(2)}m
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Door Swing Controls */}
            {(selectedOpening.type === 'door' || selectedOpening.type === 'double-door') && onUpdateOpening && (
              <div className="pt-2 border-t border-sky-200/60 flex items-center justify-between gap-2">
                <button
                  onClick={() =>
                    onUpdateOpening(selectedOpening.id, {
                      swingDirection: selectedOpening.swingDirection === 'right' ? 'left' : 'right',
                    })
                  }
                  className="flex-1 px-2 py-1 bg-white hover:bg-sky-50 text-sky-800 text-[10px] font-semibold rounded-lg border border-sky-200 flex items-center justify-center gap-1 shadow-2xs"
                >
                  <RotateCw className="w-3 h-3" />
                  Hinge: {selectedOpening.swingDirection === 'right' ? 'Right' : 'Left'}
                </button>

                <button
                  onClick={() =>
                    onUpdateOpening(selectedOpening.id, {
                      swingFlip: !selectedOpening.swingFlip,
                    })
                  }
                  className="flex-1 px-2 py-1 bg-white hover:bg-sky-50 text-sky-800 text-[10px] font-semibold rounded-lg border border-sky-200 flex items-center justify-center gap-1 shadow-2xs"
                >
                  <span>Flip Swing (F)</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Selected Wall Inspector (When a wall is clicked) */}
        {selectedWall && (
          <div className="bg-sky-50/70 rounded-xl p-3 border border-sky-200/70">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-sky-900 flex items-center gap-1">
                <Ruler className="w-3.5 h-3.5 text-sky-600" />
                Selected Segment
              </span>
              <button
                onClick={() => onDeleteWall(selectedWall.id)}
                className="text-[11px] text-rose-600 hover:text-rose-700 hover:underline font-medium"
              >
                Delete
              </button>
            </div>
            <div className="text-xs font-mono font-bold text-slate-900">
              Length: {formatMeters(selectedWallLengthMeters)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Press <kbd className="px-1 bg-white rounded border text-slate-700">Del</kbd> to remove segment
            </div>
          </div>
        )}

        {/* Selected Room Inspector (When a closed room is clicked) */}
        {selectedRoom && (
          <div
            className="rounded-xl p-3 border shadow-2xs space-y-2 transition-all"
            style={{
              backgroundColor: selectedRoom.tagBgColor,
              borderColor: selectedRoom.borderColor,
            }}
          >
            <div className="flex items-center justify-between">
              <span
                className="text-[11px] font-bold flex items-center gap-1.5"
                style={{ color: selectedRoom.tagTextColor }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: selectedRoom.borderColor }}
                />
                {selectedRoom.name}
              </span>
              <span className="text-xs font-mono font-bold text-slate-900">
                {selectedRoom.areaMetersSq.toFixed(2)} m²
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-600">
              <span>Perimeter: {selectedRoom.perimeterMeters.toFixed(2)} m</span>
              <span className="text-[10px] text-slate-500 font-mono">
                {selectedRoom.points.length} corners
              </span>
            </div>

            {/* Quick Room Type Selector */}
            {onChangeRoomType && (
              <div className="pt-2 border-t border-slate-200/60">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Change Room Label & Theme
                </span>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      'living',
                      'bedroom',
                      'kitchen',
                      'bathroom',
                      'office',
                      'dining',
                    ] as RoomType[]
                  ).map((t) => {
                    const theme = ROOM_THEMES[t];
                    const isCurrent = selectedRoom.roomType === t;
                    return (
                      <button
                        key={t}
                        onClick={() => onChangeRoomType(selectedRoom.id, t)}
                        className={`px-1.5 py-1 rounded text-[10px] font-semibold text-center truncate border transition-colors ${
                          isCurrent
                            ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                            : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        {theme.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Ghost Blueprint Reference Layer Controls */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-700">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              Ghost Blueprint Opacity
            </span>
            <span className="font-mono text-slate-500 text-[11px]">
              {Math.round(settings.ghostOpacity * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.ghostOpacity}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                onUpdateSettings((prev) => ({
                  ...prev,
                  ghostOpacity: val,
                  ghostVisible: val > 0,
                }));
              }}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-600"
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>0% (Hide)</span>
            <button
              onClick={() =>
                onUpdateSettings((prev) => ({
                  ...prev,
                  ghostOpacity: prev.ghostOpacity === 0 ? 0.75 : 0,
                  ghostVisible: prev.ghostOpacity === 0,
                }))
              }
              className="text-sky-600 hover:underline font-medium"
            >
              {settings.ghostOpacity === 0 ? 'Reveal Blueprint' : 'Solo Vector'}
            </button>
            <span>100% (Solid)</span>
          </div>
        </div>

        {/* Level Instructions & Tips */}
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-xs">
          <div className="font-semibold text-slate-700 text-[11px] uppercase tracking-wider mb-1 flex items-center gap-1">
            <Info className="w-3 h-3 text-slate-400" />
            Architectural Tasks
          </div>
          <ul className="space-y-1.5 text-[11px] text-slate-600">
            {client.challengeInstructions.map((ins, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="text-sky-600 font-bold shrink-0">•</span>
                <span>{ins}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Scale & Calibration Footer */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1 font-mono">
            <span>Scale: 1 px = {(settings.scaleFactor * 100).toFixed(0)} cm</span>
          </div>
          <button
            onClick={onOpenCalibrate}
            className="flex items-center gap-1 text-sky-600 hover:text-sky-700 hover:underline font-medium"
          >
            <Sliders className="w-3 h-3" />
            Calibrate
          </button>
        </div>
      </div>
    </div>
  );
};
