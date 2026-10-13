import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Node,
  Wall,
  ToolType,
  BlueprintLevel,
  DraftingSettings,
  Point,
  UploadedFloorPlan,
  RoomType,
} from './types';
import { LEVELS, DEFAULT_SCALE_FACTOR } from './data/levels';
import { validateDraft, detectClosedRooms, ROOM_THEMES } from './utils/geometry';
import { soundEngine } from './utils/audio';
import { exportBlueprintPng } from './utils/exportBlueprint';
import { TopBar } from './components/TopBar';
import { LeftToolbar } from './components/LeftToolbar';
import { Canvas2D } from './components/Canvas2D';
import { RightInspectorHUD } from './components/RightInspectorHUD';
import { SubmitModal } from './components/SubmitModal';
import { CalibrateModal } from './components/CalibrateModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { UploadModal } from './components/UploadModal';

interface HistoryState {
  nodes: Node[];
  walls: Wall[];
}

export default function App() {
  const [currentLevel, setCurrentLevel] = useState<BlueprintLevel>(LEVELS[0]);
  const [customFloorPlan, setCustomFloorPlan] = useState<UploadedFloorPlan | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [walls, setWalls] = useState<Wall[]>([]);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [customRoomTypes, setCustomRoomTypes] = useState<Record<string, RoomType>>({});

  // Undo / Redo History Stack
  const [history, setHistory] = useState<HistoryState[]>([{ nodes: [], walls: [] }]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Active Drafting Tool
  const [activeTool, setActiveTool] = useState<ToolType>('wall');

  // Drafting Settings
  const [settings, setSettings] = useState<DraftingSettings>({
    snapToGrid: true,
    snapToNodes: true,
    orthoSnapping: true,
    gridSizeMeters: 0.1, // 10cm grid
    ghostOpacity: 0.75,
    ghostVisible: true,
    soundEnabled: true,
    scaleFactor: DEFAULT_SCALE_FACTOR,
    wallThicknessMeters: 0.15, // 15cm
  });

  // Viewport Pan & Zoom
  const [zoom, setZoom] = useState<number>(currentLevel.initialViewport?.zoom || 1.0);
  const [pan, setPan] = useState<Point>(
    currentLevel.initialViewport?.pan || { x: 80, y: 50 }
  );

  // Modals & Panels
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isCalibrateModalOpen, setIsCalibrateModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [lastMeasuredPx, setLastMeasuredPx] = useState<number | undefined>(undefined);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [toastNotification, setToastNotification] = useState<string | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (toastNotification) {
      const timer = setTimeout(() => {
        setToastNotification(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toastNotification]);

  // Sync sound engine enabled state
  useEffect(() => {
    soundEngine.setEnabled(settings.soundEnabled);
  }, [settings.soundEnabled]);

  // Push new state to history
  const pushHistory = useCallback(
    (newNodes: Node[], newWalls: Wall[]) => {
      const nextHistory = history.slice(0, historyIndex + 1);
      nextHistory.push({ nodes: newNodes, walls: newWalls });
      // Limit history to 40 steps
      if (nextHistory.length > 40) {
        nextHistory.shift();
      }
      setHistory(nextHistory);
      setHistoryIndex(nextHistory.length - 1);
    },
    [history, historyIndex]
  );

  // Undo Handler
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIdx = historyIndex - 1;
      setHistoryIndex(newIdx);
      setNodes(history[newIdx].nodes);
      setWalls(history[newIdx].walls);
      setSelectedWallId(null);
      soundEngine.playPencilClick();
    }
  }, [historyIndex, history]);

  // Redo Handler
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIdx = historyIndex + 1;
      setHistoryIndex(newIdx);
      setNodes(history[newIdx].nodes);
      setWalls(history[newIdx].walls);
      setSelectedWallId(null);
      soundEngine.playPencilClick();
    }
  }, [historyIndex, history]);

  // Add Wall
  const handleAddWall = useCallback(
    (startNode: Node, endNode: Node) => {
      const nodeMap = new Map<string, Node>();
      nodes.forEach((n) => nodeMap.set(n.id, n));

      const newNodes = [...nodes];
      if (!nodeMap.has(startNode.id)) {
        newNodes.push(startNode);
        nodeMap.set(startNode.id, startNode);
      }
      if (!nodeMap.has(endNode.id)) {
        newNodes.push(endNode);
        nodeMap.set(endNode.id, endNode);
      }

      // Check if identical wall already exists
      const wallExists = walls.some(
        (w) =>
          (w.startNodeId === startNode.id && w.endNodeId === endNode.id) ||
          (w.startNodeId === endNode.id && w.endNodeId === startNode.id)
      );

      if (wallExists) return;

      const newWall: Wall = {
        id: `wall-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        startNodeId: startNode.id,
        endNodeId: endNode.id,
        thickness: settings.wallThicknessMeters,
      };

      const newWalls = [...walls, newWall];
      setNodes(newNodes);
      setWalls(newWalls);
      pushHistory(newNodes, newWalls);
    },
    [nodes, walls, settings.wallThicknessMeters, pushHistory]
  );

  // Update Node Position (when dragged in select mode)
  const handleUpdateNodePosition = useCallback(
    (nodeId: string, newPos: Point) => {
      const updatedNodes = nodes.map((n) =>
        n.id === nodeId ? { ...n, x: newPos.x, y: newPos.y } : n
      );
      setNodes(updatedNodes);
      pushHistory(updatedNodes, walls);
    },
    [nodes, walls, pushHistory]
  );

  // Delete Wall
  const handleDeleteWall = useCallback(
    (wallId: string) => {
      const newWalls = walls.filter((w) => w.id !== wallId);
      // Clean up orphaned nodes
      const usedNodeIds = new Set<string>();
      newWalls.forEach((w) => {
        usedNodeIds.add(w.startNodeId);
        usedNodeIds.add(w.endNodeId);
      });
      const newNodes = nodes.filter((n) => usedNodeIds.has(n.id));

      setWalls(newWalls);
      setNodes(newNodes);
      setSelectedWallId(null);
      pushHistory(newNodes, newWalls);
      soundEngine.playDeleteSound();
    },
    [walls, nodes, pushHistory]
  );

  // Delete Node
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      const newWalls = walls.filter(
        (w) => w.startNodeId !== nodeId && w.endNodeId !== nodeId
      );
      const newNodes = nodes.filter((n) => n.id !== nodeId);

      setWalls(newWalls);
      setNodes(newNodes);
      setSelectedWallId(null);
      pushHistory(newNodes, newWalls);
      soundEngine.playDeleteSound();
    },
    [walls, nodes, pushHistory]
  );

  // Clear Canvas
  const handleClear = useCallback(() => {
    if (walls.length === 0 && nodes.length === 0) return;
    setNodes([]);
    setWalls([]);
    setSelectedWallId(null);
    pushHistory([], []);
    soundEngine.playDeleteSound();
  }, [walls.length, nodes.length, pushHistory]);

  // Select Level
  const handleSelectLevel = useCallback((lvl: BlueprintLevel) => {
    setCurrentLevel(lvl);
    setCustomFloorPlan(null);
    setNodes([]);
    setWalls([]);
    setSelectedWallId(null);
    setHistory([{ nodes: [], walls: [] }]);
    setHistoryIndex(0);
    setSettings((prev) => ({
      ...prev,
      scaleFactor: lvl.scaleFactor,
    }));
    if (lvl.initialViewport) {
      setPan(lvl.initialViewport.pan);
      setZoom(lvl.initialViewport.zoom);
    }
  }, []);

  // Floor plan loaded via UploadModal
  const handleFloorPlanLoaded = useCallback(
    (plan: UploadedFloorPlan, startCalibration?: boolean) => {
      setCustomFloorPlan(plan);
      setPan({ x: 80, y: 50 });
      setZoom(1.0);
      if (startCalibration) {
        setActiveTool('calibrate');
        setToastNotification(
          '📐 Calibration Tool: Click 2 points with known distance (e.g. 1.0m door) on your blueprint to calibrate canvas scale!'
        );
      } else {
        setToastNotification(`Blueprint "${plan.name}" loaded successfully.`);
      }
    },
    []
  );

  // Start Calibration tool directly
  const handleStartCalibrationTool = useCallback(() => {
    setActiveTool('calibrate');
    setToastNotification(
      '📐 Calibration Tool Active: Click two reference points on your plan to set known distance.'
    );
  }, []);

  // Next Level Handler
  const currentLevelIndex = LEVELS.findIndex((l) => l.id === currentLevel.id);
  const hasNextLevel = currentLevelIndex < LEVELS.length - 1;

  const handleNextLevel = () => {
    if (hasNextLevel) {
      handleSelectLevel(LEVELS[currentLevelIndex + 1]);
      setIsSubmitModalOpen(false);
    }
  };

  // Zoom helpers
  const handleZoomIn = () => {
    setZoom((prev) => Math.min(4.0, prev * 1.2));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(0.3, prev / 1.2));
  };

  const handleResetZoom = () => {
    setZoom(1.0);
    if (currentLevel.initialViewport) {
      setPan(currentLevel.initialViewport.pan);
    } else {
      setPan({ x: 80, y: 50 });
    }
  };

  // Detected Closed Rooms & Themes
  const detectedRooms = useMemo(() => {
    return detectClosedRooms(nodes, walls, settings.scaleFactor, customRoomTypes);
  }, [nodes, walls, settings.scaleFactor, customRoomTypes]);

  const selectedRoom = useMemo(() => {
    return detectedRooms.find((r) => r.id === selectedRoomId) || null;
  }, [detectedRooms, selectedRoomId]);

  const handleCycleRoomType = useCallback((roomId: string) => {
    const types: RoomType[] = [
      'living',
      'bedroom',
      'kitchen',
      'bathroom',
      'office',
      'dining',
    ];
    setCustomRoomTypes((prev) => {
      const current = prev[roomId] || 'living';
      const nextIdx = (types.indexOf(current) + 1) % types.length;
      const nextType = types[nextIdx];
      setToastNotification(`Room updated: ${ROOM_THEMES[nextType].name}`);
      return { ...prev, [roomId]: nextType };
    });
    setSelectedRoomId(roomId);
  }, []);

  const handleChangeRoomType = useCallback((roomId: string, newType: RoomType) => {
    setCustomRoomTypes((prev) => ({ ...prev, [roomId]: newType }));
    setToastNotification(`Room updated: ${ROOM_THEMES[newType].name}`);
    setSelectedRoomId(roomId);
    soundEngine.playPencilClick();
  }, []);

  // Live Validation Result
  const liveValidation = useMemo(() => {
    return validateDraft(nodes, walls, currentLevel, settings.scaleFactor);
  }, [nodes, walls, currentLevel, settings.scaleFactor]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Hotkeys
      if (e.key === 'v' || e.key === 'V') setActiveTool('select');
      if (e.key === 'w' || e.key === 'W') setActiveTool('wall');
      if (e.key === 'm' || e.key === 'M') setActiveTool('measure');
      if (e.key === 'c' || e.key === 'C') {
        setActiveTool('calibrate');
        setToastNotification(
          '📐 Calibration Tool: Click 2 points on blueprint to calibrate scale, or use presets.'
        );
      }
      if (e.key === 'e' || e.key === 'E') setActiveTool('erase');

      // Toggles
      if (e.key === 's' || e.key === 'S') {
        setSettings((prev) => ({ ...prev, snapToGrid: !prev.snapToGrid }));
      }
      if (e.key === 'o' || e.key === 'O') {
        setSettings((prev) => ({ ...prev, orthoSnapping: !prev.orthoSnapping }));
      }
      if (e.key === 'g' || e.key === 'G') {
        setSettings((prev) => ({ ...prev, ghostVisible: !prev.ghostVisible }));
      }
      if (e.key === '?') {
        setIsShortcutsModalOpen(true);
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleUndo, handleRedo]);

  // Distance measured via Tape Measure or Calibration Tool
  const handleMeasuredDistance = (distM: number, pixelDist: number) => {
    setLastMeasuredPx(pixelDist);
    if (activeTool === 'calibrate') {
      setIsCalibrateModalOpen(true);
    }
  };

  // Export PNG Printout
  const handleExportPng = () => {
    exportBlueprintPng(
      nodes,
      walls,
      currentLevel,
      settings,
      liveValidation.scorePercent
    );
  };

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-slate-100 font-sans text-slate-800 antialiased select-none">
      {/* 1. TOP BAR */}
      <TopBar
        levels={LEVELS}
        currentLevel={currentLevel}
        onSelectLevel={handleSelectLevel}
        customFloorPlan={customFloorPlan}
        onClearCustomFloorPlan={() => setCustomFloorPlan(null)}
        onOpenUpload={() => setIsUploadModalOpen(true)}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClear={handleClear}
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        soundEnabled={settings.soundEnabled}
        onToggleSound={() =>
          setSettings((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled }))
        }
        onOpenShortcuts={() => setIsShortcutsModalOpen(true)}
        onSubmit={() => setIsSubmitModalOpen(true)}
        drawnWallsCount={walls.length}
        hasClosedRooms={liveValidation.detectedRoomsCount > 0}
      />

      {/* Toast Notification Banner */}
      {toastNotification && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 text-white backdrop-blur-md px-4 py-2 rounded-xl shadow-xl text-xs font-medium border border-slate-700/60 animate-in fade-in slide-in-from-top-2 flex items-center gap-2">
          <span>{toastNotification}</span>
          <button
            onClick={() => setToastNotification(null)}
            className="text-slate-400 hover:text-white ml-2 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. MAIN WORKSPACE */}
      <div className="relative flex-1 w-full h-[calc(100vh-56px)] overflow-hidden">
        {/* LEFT FLOATING TOOLBAR */}
        <LeftToolbar
          activeTool={activeTool}
          onSelectTool={(t) => {
            setActiveTool(t);
            if (t === 'calibrate') {
              handleStartCalibrationTool();
            }
          }}
          settings={settings}
          onUpdateSettings={setSettings}
        />

        {/* CENTER HTML5 DUAL-LAYER CANVAS */}
        <Canvas2D
          currentLevel={currentLevel}
          customFloorPlan={customFloorPlan}
          nodes={nodes}
          walls={walls}
          activeTool={activeTool}
          settings={settings}
          selectedWallId={selectedWallId}
          onSelectWall={setSelectedWallId}
          selectedRoomId={selectedRoomId}
          onSelectRoom={setSelectedRoomId}
          customRoomTypes={customRoomTypes}
          onCycleRoomType={handleCycleRoomType}
          onAddWall={handleAddWall}
          onUpdateNodePosition={handleUpdateNodePosition}
          onDeleteWall={handleDeleteWall}
          onDeleteNode={handleDeleteNode}
          zoom={zoom}
          pan={pan}
          onPanZoomChange={(newPan, newZoom) => {
            setPan(newPan);
            setZoom(newZoom);
          }}
          onMeasuredDistance={handleMeasuredDistance}
        />

        {/* RIGHT INSPECTOR HUD */}
        <RightInspectorHUD
          currentLevel={currentLevel}
          customFloorPlan={customFloorPlan}
          onOpenUpload={() => setIsUploadModalOpen(true)}
          onStartCalibrationTool={handleStartCalibrationTool}
          liveValidation={liveValidation}
          settings={settings}
          onUpdateSettings={setSettings}
          selectedWall={walls.find((w) => w.id === selectedWallId) || null}
          selectedRoom={selectedRoom}
          onChangeRoomType={handleChangeRoomType}
          nodes={nodes}
          onDeleteWall={handleDeleteWall}
          onOpenCalibrate={() => setIsCalibrateModalOpen(true)}
          isCollapsed={isInspectorCollapsed}
          onToggleCollapse={() => setIsInspectorCollapsed(!isInspectorCollapsed)}
        />
      </div>

      {/* 3. MODALS */}
      {/* Upload Blueprint Reference Modal */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onFloorPlanLoaded={handleFloorPlanLoaded}
      />

      {/* Scoring Evaluation Modal */}
      <SubmitModal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        result={liveValidation}
        currentLevel={currentLevel}
        hasNextLevel={hasNextLevel}
        onNextLevel={handleNextLevel}
        onRetry={() => setIsSubmitModalOpen(false)}
        onExportPng={handleExportPng}
      />

      {/* Scale Calibration Modal */}
      <CalibrateModal
        isOpen={isCalibrateModalOpen}
        onClose={() => setIsCalibrateModalOpen(false)}
        settings={settings}
        onSaveScale={(newScale) => {
          setSettings((prev) => ({ ...prev, scaleFactor: newScale }));
          soundEngine.playWallComplete();
          setToastNotification(
            `✅ Scale ratio updated: 1m = ${(1 / newScale).toFixed(1)}px (1px = ${(newScale * 100).toFixed(2)}cm)`
          );
          setActiveTool('wall');
        }}
        lastMeasuredPx={lastMeasuredPx}
        onStartTwoPointCalibration={handleStartCalibrationTool}
      />

      {/* Keyboard Shortcuts Modal */}
      <ShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />
    </div>
  );
}
