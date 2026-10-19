import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Node,
  Wall,
  WallOpening,
  OpeningType,
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
import { Viewport3D } from './components/Viewport3D';

// Lazy-loaded modal components with React.lazy() to reduce initial bundle size and boost Lighthouse performance
const GLBModelModal = React.lazy(() =>
  import('./components/GLBModelModal').then((m) => ({ default: m.GLBModelModal }))
);
const CalibrateModal = React.lazy(() =>
  import('./components/CalibrateModal').then((m) => ({ default: m.CalibrateModal }))
);
const UploadModal = React.lazy(() =>
  import('./components/UploadModal').then((m) => ({ default: m.UploadModal }))
);
const SubmitModal = React.lazy(() =>
  import('./components/SubmitModal').then((m) => ({ default: m.SubmitModal }))
);
const ShortcutsModal = React.lazy(() =>
  import('./components/ShortcutsModal').then((m) => ({ default: m.ShortcutsModal }))
);

interface HistoryState {
  nodes: Node[];
  walls: Wall[];
  openings: WallOpening[];
}

export default function App() {
  const [currentLevel, setCurrentLevel] = useState<BlueprintLevel>(LEVELS[0]);
  const [customFloorPlan, setCustomFloorPlan] = useState<UploadedFloorPlan | null>(null);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [nodes, setNodes] = useState<Node[]>([]);
  const [walls, setWalls] = useState<Wall[]>([]);
  const [openings, setOpenings] = useState<WallOpening[]>([]);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [customRoomTypes, setCustomRoomTypes] = useState<Record<string, RoomType>>({});

  // Undo / Redo History Stack
  const [history, setHistory] = useState<HistoryState[]>([{ nodes: [], walls: [], openings: [] }]);
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
  const [isGLBModalOpen, setIsGLBModalOpen] = useState(false);
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
    (newNodes: Node[], newWalls: Wall[], newOpenings: WallOpening[] = openings) => {
      const nextHistory = history.slice(0, historyIndex + 1);
      nextHistory.push({ nodes: newNodes, walls: newWalls, openings: newOpenings });
      // Limit history to 40 steps
      if (nextHistory.length > 40) {
        nextHistory.shift();
      }
      setHistory(nextHistory);
      setHistoryIndex(nextHistory.length - 1);
    },
    [history, historyIndex, openings]
  );

  // Undo Handler
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIdx = historyIndex - 1;
      setHistoryIndex(newIdx);
      setNodes(history[newIdx].nodes);
      setWalls(history[newIdx].walls);
      setOpenings(history[newIdx].openings || []);
      setSelectedWallId(null);
      setSelectedOpeningId(null);
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
      setOpenings(history[newIdx].openings || []);
      setSelectedWallId(null);
      setSelectedOpeningId(null);
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
      pushHistory(newNodes, newWalls, openings);
    },
    [nodes, walls, openings, settings.wallThicknessMeters, pushHistory]
  );

  // Add Opening (Single Door, Double Door, Sliding Door, Window)
  const handleAddOpening = useCallback(
    (
      wallId: string,
      type: OpeningType,
      positionRatio: number,
      widthMeters?: number
    ) => {
      const defaultWidth =
        type === 'door'
          ? 0.85
          : type === 'double-door'
          ? 1.60
          : type === 'sliding-door'
          ? 1.65
          : 1.20;

      const newOpening: WallOpening = {
        id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        wallId,
        type,
        positionRatio,
        widthMeters: widthMeters || defaultWidth,
        swingDirection: 'left',
        swingFlip: false,
      };

      const newOpenings = [...openings, newOpening];
      setOpenings(newOpenings);
      setSelectedOpeningId(newOpening.id);
      pushHistory(nodes, walls, newOpenings);
      soundEngine.playPencilClick();

      const label =
        type === 'door'
          ? '🚪 Single Door (片開き戸)'
          : type === 'double-door'
          ? '🚪 Double Door (両開き戸)'
          : type === 'sliding-door'
          ? '🪟 Sliding Door (引違い戸)'
          : '🪟 Window (引違い窓)';

      setToastNotification(
        `${label} (${(widthMeters || defaultWidth).toFixed(2)}m) placed on wall.`
      );
    },
    [openings, nodes, walls, pushHistory]
  );

  // Update Opening
  const handleUpdateOpening = useCallback(
    (openingId: string, updates: Partial<WallOpening>) => {
      const newOpenings = openings.map((o) =>
        o.id === openingId ? { ...o, ...updates } : o
      );
      setOpenings(newOpenings);
      pushHistory(nodes, walls, newOpenings);
    },
    [openings, nodes, walls, pushHistory]
  );

  // Delete Opening
  const handleDeleteOpening = useCallback(
    (openingId: string) => {
      const newOpenings = openings.filter((o) => o.id !== openingId);
      setOpenings(newOpenings);
      if (selectedOpeningId === openingId) setSelectedOpeningId(null);
      pushHistory(nodes, walls, newOpenings);
      soundEngine.playDeleteSound();
    },
    [openings, selectedOpeningId, nodes, walls, pushHistory]
  );

  // Update Node Position (when dragged in select mode)
  const handleUpdateNodePosition = useCallback(
    (nodeId: string, newPos: Point) => {
      const updatedNodes = nodes.map((n) =>
        n.id === nodeId ? { ...n, x: newPos.x, y: newPos.y } : n
      );
      setNodes(updatedNodes);
      pushHistory(updatedNodes, walls, openings);
    },
    [nodes, walls, openings, pushHistory]
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
      const newOpenings = openings.filter((o) => o.wallId !== wallId);

      setWalls(newWalls);
      setNodes(newNodes);
      setOpenings(newOpenings);
      setSelectedWallId(null);
      if (selectedOpeningId && openings.some((o) => o.id === selectedOpeningId && o.wallId === wallId)) {
        setSelectedOpeningId(null);
      }
      pushHistory(newNodes, newWalls, newOpenings);
      soundEngine.playDeleteSound();
    },
    [walls, nodes, openings, selectedOpeningId, pushHistory]
  );

  // Delete Node
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      const deletedWallIds = new Set(
        walls
          .filter((w) => w.startNodeId === nodeId || w.endNodeId === nodeId)
          .map((w) => w.id)
      );
      const newWalls = walls.filter(
        (w) => w.startNodeId !== nodeId && w.endNodeId !== nodeId
      );
      const newNodes = nodes.filter((n) => n.id !== nodeId);
      const newOpenings = openings.filter((o) => !deletedWallIds.has(o.wallId));

      setWalls(newWalls);
      setNodes(newNodes);
      setOpenings(newOpenings);
      setSelectedWallId(null);
      if (selectedOpeningId && openings.some((o) => o.id === selectedOpeningId && deletedWallIds.has(o.wallId))) {
        setSelectedOpeningId(null);
      }
      pushHistory(newNodes, newWalls, newOpenings);
      soundEngine.playDeleteSound();
    },
    [walls, nodes, openings, selectedOpeningId, pushHistory]
  );

  // Clear Canvas
  const handleClear = useCallback(() => {
    if (walls.length === 0 && nodes.length === 0 && openings.length === 0) return;
    setNodes([]);
    setWalls([]);
    setOpenings([]);
    setSelectedWallId(null);
    setSelectedOpeningId(null);
    pushHistory([], [], []);
    soundEngine.playDeleteSound();
  }, [walls.length, nodes.length, openings.length, pushHistory]);

  // Select Level
  const handleSelectLevel = useCallback((lvl: BlueprintLevel) => {
    setCurrentLevel(lvl);
    setCustomFloorPlan(null);
    setNodes([]);
    setWalls([]);
    setOpenings([]);
    setSelectedWallId(null);
    setSelectedOpeningId(null);
    setHistory([{ nodes: [], walls: [], openings: [] }]);
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
      if (e.key === 'd' || e.key === 'D') {
        setActiveTool('door');
        setToastNotification('🚪 Single Door (片開き戸): Hover over any wall to snap.');
      }
      if (e.key === 'b' || e.key === 'B') {
        setActiveTool('double-door');
        setToastNotification('🚪 Double Door (両開き戸): Hover over any wall to snap dual swinging doors.');
      }
      if (e.key === 'l' || e.key === 'L') {
        setActiveTool('sliding-door');
        setToastNotification('🪟 Sliding Door (引違い戸): Hover over any wall to snap Japanese sliding door.');
      }
      if (e.key === 'n' || e.key === 'N') {
        setActiveTool('window');
        setToastNotification('🪟 Window (引違い窓): Hover over any wall to snap sash window.');
      }
      if (e.key === 'm' || e.key === 'M') setActiveTool('measure');
      if (e.key === 'c' || e.key === 'C') {
        setActiveTool('calibrate');
        setToastNotification(
          '📐 Calibration Tool: Click 2 points on blueprint to calibrate scale, or use presets.'
        );
      }
      if (e.key === 'e' || e.key === 'E') setActiveTool('erase');

      // Flip Door Swing hotkey (F)
      if (e.key === 'f' || e.key === 'F') {
        if (selectedOpeningId) {
          const targetOp = openings.find((o) => o.id === selectedOpeningId);
          if (targetOp && targetOp.type === 'door') {
            handleUpdateOpening(selectedOpeningId, { swingFlip: !targetOp.swingFlip });
            setToastNotification('Door swing flipped.');
          }
        }
      }

      // Delete key deletes selected opening if any
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedOpeningId) {
          handleDeleteOpening(selectedOpeningId);
        }
      }

      // Toggles
      if (e.key === 'Tab' || e.key === '3') {
        e.preventDefault();
        setViewMode((prev) => {
          const next = prev === '2d' ? '3d' : '2d';
          setToastNotification(
            next === '3d'
              ? 'Switched to 3D Architectural Model (Three.js active)'
              : 'Switched to 2D Blueprint Drafting (Three.js render loop stopped)'
          );
          return next;
        });
      }
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
  }, [handleUndo, handleRedo, selectedOpeningId, openings, handleUpdateOpening, handleDeleteOpening]);

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
      liveValidation.scorePercent,
      openings
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
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
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
        {/* 3D ARCHITECTURAL VIEWPORT (Three.js WebGL with auto loop management) */}
        <Viewport3D
          active={viewMode === '3d'}
          nodes={nodes}
          walls={walls}
          openings={openings}
          closedRooms={detectedRooms}
          scaleFactor={settings.scaleFactor}
          onSwitchTo2D={() => setViewMode('2d')}
        />

        {/* 2D BLUEPRINT DRAFTING MODE */}
        {viewMode === '2d' && (
          <>
            {/* LEFT FLOATING TOOLBAR */}
            <LeftToolbar
              activeTool={activeTool}
              onSelectTool={(t) => {
                setActiveTool(t);
                if (t === 'calibrate') {
                  handleStartCalibrationTool();
                } else if (t === 'door') {
                  setToastNotification('🚪 Door Opening Tool: Hover over any wall to snap a door opening.');
                } else if (t === 'window') {
                  setToastNotification('🪟 Window Opening Tool: Hover over any wall to snap a window opening.');
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
              openings={openings}
              activeTool={activeTool}
              settings={settings}
              selectedWallId={selectedWallId}
              onSelectWall={(wid) => {
                setSelectedWallId(wid);
                if (wid) setSelectedOpeningId(null);
              }}
              selectedOpeningId={selectedOpeningId}
              onSelectOpening={(oid) => {
                setSelectedOpeningId(oid);
                if (oid) setSelectedWallId(null);
              }}
              selectedRoomId={selectedRoomId}
              onSelectRoom={(rid) => {
                setSelectedRoomId(rid);
                if (rid) {
                  setSelectedWallId(null);
                  setSelectedOpeningId(null);
                }
              }}
              customRoomTypes={customRoomTypes}
              onCycleRoomType={handleCycleRoomType}
              onAddWall={handleAddWall}
              onAddOpening={handleAddOpening}
              onUpdateOpening={handleUpdateOpening}
              onDeleteOpening={handleDeleteOpening}
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
              selectedOpening={openings.find((o) => o.id === selectedOpeningId) || null}
              onUpdateOpening={handleUpdateOpening}
              onDeleteOpening={handleDeleteOpening}
              selectedRoom={selectedRoom}
              onChangeRoomType={handleChangeRoomType}
              nodes={nodes}
              onDeleteWall={handleDeleteWall}
              onOpenCalibrate={() => setIsCalibrateModalOpen(true)}
              isCollapsed={isInspectorCollapsed}
              onToggleCollapse={() => setIsInspectorCollapsed(!isInspectorCollapsed)}
            />
          </>
        )}
      </div>

      {/* 3. MODALS (Code-split with React.lazy and Suspense for Lighthouse performance) */}
      <React.Suspense fallback={null}>
        {/* Upload Blueprint Reference Modal */}
        {isUploadModalOpen && (
          <UploadModal
            isOpen={isUploadModalOpen}
            onClose={() => setIsUploadModalOpen(false)}
            onFloorPlanLoaded={handleFloorPlanLoaded}
          />
        )}

        {/* Scoring Evaluation Modal */}
        {isSubmitModalOpen && (
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
        )}

        {/* Scale Calibration Modal */}
        {isCalibrateModalOpen && (
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
        )}

        {/* Keyboard Shortcuts Modal */}
        {isShortcutsModalOpen && (
          <ShortcutsModal
            isOpen={isShortcutsModalOpen}
            onClose={() => setIsShortcutsModalOpen(false)}
          />
        )}

        {/* 3D GLB/GLTF Model Import Modal */}
        {isGLBModalOpen && (
          <GLBModelModal
            isOpen={isGLBModalOpen}
            onClose={() => setIsGLBModalOpen(false)}
            onModelLoaded={(_model, name) => {
              setToastNotification(`Model loaded: ${name}`);
            }}
            onShowToast={(msg) => setToastNotification(msg)}
          />
        )}
      </React.Suspense>
    </div>
  );
}
