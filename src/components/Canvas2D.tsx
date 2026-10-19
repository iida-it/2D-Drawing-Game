import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Point,
  Node,
  Wall,
  WallOpening,
  OpeningType,
  ToolType,
  BlueprintLevel,
  DraftingSettings,
  ClosedRoom,
  UploadedFloorPlan,
  RoomType,
} from '../types';
import {
  getDistance,
  getAngleDegrees,
  clampOrthoAngle,
  snapToGrid,
  findAxialAlignments,
  pixelsToMeters,
  metersToPixels,
  formatMeters,
  detectClosedRooms,
  isPointInPolygon,
  projectPointOntoSegment,
  getWallOpeningsBreakdown,
} from '../utils/geometry';
import { soundEngine } from '../utils/audio';
import { Check, X, Pencil } from 'lucide-react';

interface Canvas2DProps {
  currentLevel: BlueprintLevel;
  customFloorPlan?: UploadedFloorPlan | null;
  nodes: Node[];
  walls: Wall[];
  openings?: WallOpening[];
  activeTool: ToolType;
  settings: DraftingSettings;
  selectedWallId: string | null;
  onSelectWall: (wallId: string | null) => void;
  selectedOpeningId?: string | null;
  onSelectOpening?: (openingId: string | null) => void;
  selectedRoomId?: string | null;
  onSelectRoom?: (roomId: string | null) => void;
  customRoomTypes?: Record<string, RoomType>;
  onCycleRoomType?: (roomId: string) => void;
  onAddWall: (startNode: Node, endNode: Node) => void;
  onAddOpening?: (
    wallId: string,
    type: OpeningType,
    positionRatio: number,
    widthMeters?: number
  ) => void;
  onUpdateOpening?: (openingId: string, updates: Partial<WallOpening>) => void;
  onDeleteOpening?: (openingId: string) => void;
  onUpdateNodePosition: (nodeId: string, newPos: Point) => void;
  onDeleteWall: (wallId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  zoom: number;
  pan: Point;
  onPanZoomChange: (newPan: Point, newZoom: number) => void;
  onMeasuredDistance?: (distanceMeters: number, pixelDist: number) => void;
}

interface ProcessedPointResult {
  point: Point;
  snappedNode: Node | null;
  axialGuides: { type: 'x' | 'y'; value: number }[];
}

export const Canvas2D: React.FC<Canvas2DProps> = ({
  currentLevel,
  customFloorPlan,
  nodes,
  walls,
  openings = [],
  activeTool,
  settings,
  selectedWallId,
  onSelectWall,
  selectedOpeningId,
  onSelectOpening,
  selectedRoomId,
  onSelectRoom,
  customRoomTypes = {},
  onCycleRoomType,
  onAddWall,
  onAddOpening,
  onUpdateOpening,
  onDeleteOpening,
  onUpdateNodePosition,
  onDeleteWall,
  onDeleteNode,
  zoom,
  pan,
  onPanZoomChange,
  onMeasuredDistance,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Interaction State
  const [activeDrawingNode, setActiveDrawingNode] = useState<Node | null>(null);
  const [cursorWorldPos, setCursorWorldPos] = useState<Point>({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [hoveredWall, setHoveredWall] = useState<Wall | null>(null);
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null);
  const [hoveredOpening, setHoveredOpening] = useState<WallOpening | null>(null);
  const [hoveredOpeningWall, setHoveredOpeningWall] = useState<{
    wall: Wall;
    t: number;
    point: Point;
    n1: Node;
    n2: Node;
    type: OpeningType;
  } | null>(null);

  const isOpeningTool = useCallback((tool: ToolType): tool is OpeningType => {
    return (
      tool === 'door' ||
      tool === 'double-door' ||
      tool === 'sliding-door' ||
      tool === 'window'
    );
  }, []);

  const getDefaultOpeningWidthMeters = useCallback((type: OpeningType): number => {
    switch (type) {
      case 'door':
        return 0.85;
      case 'double-door':
        return 1.60;
      case 'sliding-door':
        return 1.65;
      case 'window':
        return 1.20;
      default:
        return 0.85;
    }
  }, []);

  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStartScreen, setDragStartScreen] = useState<Point>({ x: 0, y: 0 });
  const [dragStartPan, setDragStartPan] = useState<Point>({ x: 0, y: 0 });
  const didPanWithRightClickRef = useRef<boolean>(false);

  // Marquee Box Drag Selection in Select Tool
  const [isMarqueeDragging, setIsMarqueeDragging] = useState<boolean>(false);
  const [marqueeStart, setMarqueeStart] = useState<Point | null>(null);
  const [marqueeCurrent, setMarqueeCurrent] = useState<Point | null>(null);
  const [selectedWallIds, setSelectedWallIds] = useState<string[]>([]);
  const [selectedOpeningIds, setSelectedOpeningIds] = useState<string[]>([]);
  const [selectedFurnitureIndices, setSelectedFurnitureIndices] = useState<number[]>([]);

  // Keep selectedWallIds and selectedOpeningIds in sync with props
  useEffect(() => {
    if (selectedWallId) {
      setSelectedWallIds((prev) => (prev.includes(selectedWallId) ? prev : [selectedWallId]));
    } else {
      setSelectedWallIds([]);
    }
  }, [selectedWallId]);

  useEffect(() => {
    if (selectedOpeningId) {
      setSelectedOpeningIds((prev) => (prev.includes(selectedOpeningId) ? prev : [selectedOpeningId]));
    } else {
      setSelectedOpeningIds([]);
    }
  }, [selectedOpeningId]);

  // Moving node in select mode
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);

  // Tape Measure & Calibration tool state
  const [measureStartPoint, setMeasureStartPoint] = useState<Point | null>(null);
  const [calibratePointA, setCalibratePointA] = useState<Point | null>(null);

  // Closed rooms for visual fills
  const [closedRooms, setClosedRooms] = useState<ClosedRoom[]>([]);

  // Inline Dimension Editing State
  const [activeEditingDimension, setActiveEditingDimension] = useState<{
    wallId: string;
    startNodeId: string;
    endNodeId: string;
    currentLengthMeters: number;
    badgeWorldPos: Point;
  } | null>(null);
  const [dimensionInputValue, setDimensionInputValue] = useState<string>('');
  const [hoveredDimensionWallId, setHoveredDimensionWallId] = useState<string | null>(null);
  const dimensionInputRef = useRef<HTMLInputElement | null>(null);
  const isCancellingRef = useRef<boolean>(false);

  // Update closed rooms whenever geometry changes
  useEffect(() => {
    const rooms = detectClosedRooms(nodes, walls, settings.scaleFactor, customRoomTypes);
    setClosedRooms(rooms);
  }, [nodes, walls, settings.scaleFactor, customRoomTypes]);

  // Cleanly reset active drafting and measuring state when active tool changes
  useEffect(() => {
    setActiveDrawingNode(null);
    setMeasureStartPoint(null);
    setCalibratePointA(null);
    setIsMarqueeDragging(false);
    setMarqueeStart(null);
    setMarqueeCurrent(null);
  }, [activeTool]);

  // Coordinate Conversion: Screen to World
  const screenToWorld = useCallback(
    (screenX: number, screenY: number): Point => {
      return {
        x: (screenX - pan.x) / zoom,
        y: (screenY - pan.y) / zoom,
      };
    },
    [pan, zoom]
  );

  // World to Screen
  const worldToScreen = useCallback(
    (worldX: number, worldY: number): Point => {
      return {
        x: worldX * zoom + pan.x,
        y: worldY * zoom + pan.y,
      };
    },
    [pan, zoom]
  );

  // Auto-focus and select dimension input text when editing begins
  useEffect(() => {
    if (activeEditingDimension && dimensionInputRef.current) {
      const input = dimensionInputRef.current;
      input.focus();
      requestAnimationFrame(() => {
        if (input) {
          if (input.value.length === 1 && /[\d.]/.test(input.value)) {
            input.setSelectionRange(input.value.length, input.value.length);
          } else {
            input.select();
          }
        }
      });
    }
  }, [activeEditingDimension]);

  // Helper to compute badge position and metrics for any wall
  const getWallDimensionBadge = useCallback(
    (w: Wall): {
      wall: Wall;
      n1: Node;
      n2: Node;
      currentLengthMeters: number;
      centerWorld: Point;
    } | null => {
      const nodeMap = new Map<string, Node>();
      nodes.forEach((n) => nodeMap.set(n.id, n));
      const n1 = nodeMap.get(w.startNodeId);
      const n2 = nodeMap.get(w.endNodeId);
      if (!n1 || !n2) return null;

      const dx = n2.x - n1.x;
      const dy = n2.y - n1.y;
      const lenPx = Math.hypot(dx, dy);
      if (lenPx < 1e-4) return null;

      const wallDistMeters = pixelsToMeters(lenPx, settings.scaleFactor);
      const wallOpenings = openings.filter((o) => o.wallId === w.id);
      const hasOpenings = wallOpenings.length > 0;

      // Position matches dimension line offset
      const offsetDist = (hasOpenings ? 36 : 18) / zoom;
      const nx = -dy / lenPx;
      const ny = dx / lenPx;
      const midX = (n1.x + n2.x) / 2;
      const midY = (n1.y + n2.y) / 2;

      const badgeWorld: Point = {
        x: midX + nx * offsetDist,
        y: midY + ny * offsetDist,
      };

      return {
        wall: w,
        n1,
        n2,
        currentLengthMeters: wallDistMeters,
        centerWorld: badgeWorld,
      };
    },
    [nodes, openings, settings.scaleFactor, zoom]
  );

  // Open dimension editing overlay for a wall
  const openDimensionInputForWall = useCallback(
    (wall: Wall, initialChar?: string) => {
      const badgeInfo = getWallDimensionBadge(wall);
      if (!badgeInfo) return;

      // Cancel any in-progress drawing chain when editing dimension
      setActiveDrawingNode(null);

      onSelectWall(wall.id);
      setSelectedWallIds([wall.id]);
      if (onSelectOpening) onSelectOpening(null);
      if (onSelectRoom) onSelectRoom(null);

      setActiveEditingDimension({
        wallId: wall.id,
        startNodeId: badgeInfo.n1.id,
        endNodeId: badgeInfo.n2.id,
        currentLengthMeters: badgeInfo.currentLengthMeters,
        badgeWorldPos: badgeInfo.centerWorld,
      });

      if (initialChar !== undefined) {
        setDimensionInputValue(initialChar);
      } else {
        setDimensionInputValue(badgeInfo.currentLengthMeters.toFixed(2));
      }
      soundEngine.playPencilClick();
    },
    [getWallDimensionBadge, onSelectWall, onSelectOpening, onSelectRoom]
  );

  // Check if screen coordinates hit any wall dimension label
  const checkDimensionBadgeClick = useCallback(
    (screenX: number, screenY: number) => {
      // Prioritize checking selected wall first
      const candidateWalls = selectedWallId
        ? [
            walls.find((w) => w.id === selectedWallId),
            ...walls.filter((w) => w.id !== selectedWallId),
          ].filter(Boolean) as Wall[]
        : walls;

      for (const w of candidateWalls) {
        const badgeInfo = getWallDimensionBadge(w);
        if (!badgeInfo) continue;

        const badgeScreen = worldToScreen(badgeInfo.centerWorld.x, badgeInfo.centerWorld.y);
        const distX = Math.abs(screenX - badgeScreen.x);
        const distY = Math.abs(screenY - badgeScreen.y);

        // Click target area around badge
        if (distX <= 48 && distY <= 18) {
          return badgeInfo;
        }
      }
      return null;
    },
    [getWallDimensionBadge, selectedWallId, walls, worldToScreen]
  );

  // Commit new wall dimension using unit vector scaling formula
  const handleDimensionSubmit = useCallback(() => {
    if (!activeEditingDimension) return;
    if (isCancellingRef.current) {
      isCancellingRef.current = false;
      setActiveEditingDimension(null);
      return;
    }

    const cleanStr = dimensionInputValue.trim().replace(',', '.').replace(/[^\d.-]/g, '');
    const newLength = parseFloat(cleanStr);
    const { startNodeId, endNodeId, currentLengthMeters } = activeEditingDimension;

    const nodeMap = new Map<string, Node>();
    nodes.forEach((n) => nodeMap.set(n.id, n));
    const n1 = nodeMap.get(startNodeId);
    const n2 = nodeMap.get(endNodeId);

    if (
      n1 &&
      n2 &&
      !isNaN(newLength) &&
      newLength > 0.05 &&
      newLength < 250 &&
      currentLengthMeters > 1e-4
    ) {
      // Formula specified by user request:
      // x2_new = x1 + (x2 - x1) / currentLength * newLength
      // y2_new = y1 + (y2 - y1) / currentLength * newLength
      const x1 = n1.x;
      const y1 = n1.y;
      const x2 = n2.x;
      const y2 = n2.y;

      const x2_new = x1 + ((x2 - x1) / currentLengthMeters) * newLength;
      const y2_new = y1 + ((y2 - y1) / currentLengthMeters) * newLength;

      onUpdateNodePosition(endNodeId, { x: x2_new, y: y2_new });
      soundEngine.playSnapSound();
    }

    setActiveEditingDimension(null);
  }, [activeEditingDimension, dimensionInputValue, nodes, onUpdateNodePosition]);

  // Handle key down in inline dimension input
  const handleDimensionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      handleDimensionSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      isCancellingRef.current = true;
      setActiveEditingDimension(null);
    }
  };

  // Snap calculation for a world point
  const getProcessedPoint = useCallback(
    (rawWorldPoint: Point, referenceStartNode?: Node | null): ProcessedPointResult => {
      let candidate = { ...rawWorldPoint };
      let snappedToExistingNode: Node | null = null;
      let axialGuides: { type: 'x' | 'y'; value: number }[] = [];

      // 1. Magnetic Node Snap (Within 14 screen pixels)
      const screenSnapThreshold = 14 / zoom;
      let minNodeDist = screenSnapThreshold;

      for (const n of nodes) {
        if (referenceStartNode && n.id === referenceStartNode.id) continue;
        const dist = getDistance(rawWorldPoint, n);
        if (dist < minNodeDist) {
          minNodeDist = dist;
          candidate = { x: n.x, y: n.y };
          snappedToExistingNode = n;
        }
      }

      // If not snapped to a node:
      if (!snappedToExistingNode) {
        // 2. Ortho angle clamp (if ortho enabled or shift pressed)
        if (referenceStartNode && (settings.orthoSnapping || isShiftPressed)) {
          candidate = clampOrthoAngle(referenceStartNode, candidate);
        }

        // 3. Axial alignments (Horizontal / Vertical guide rays)
        const axial = findAxialAlignments(
          candidate,
          nodes,
          10 / zoom,
          referenceStartNode ? [referenceStartNode.id] : []
        );
        candidate = axial.snappedPoint;
        axialGuides = axial.guides.map((g) => ({ type: g.type, value: g.value }));

        // 4. Snap to 10cm Grid if enabled
        if (settings.snapToGrid) {
          const gridPx = metersToPixels(settings.gridSizeMeters, settings.scaleFactor);
          candidate = snapToGrid(candidate, gridPx);
        }
      }

      return {
        point: candidate,
        snappedNode: snappedToExistingNode,
        axialGuides,
      };
    },
    [nodes, zoom, settings.orthoSnapping, isShiftPressed, settings.snapToGrid, settings.gridSizeMeters, settings.scaleFactor]
  );

  // Handle Resize and Canvas Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI retina display
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Clear background with architectural soft gray
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.save();
    // Apply pan and zoom transform
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // -------------------------------------------------------------
    // LAYER 0: CAD Architectural Subtle Dot Grid
    // -------------------------------------------------------------
    const gridSpacingMeters = 0.5; // 50cm major grid
    const gridSpacingPx = metersToPixels(gridSpacingMeters, settings.scaleFactor);
    const subGridPx = metersToPixels(0.1, settings.scaleFactor); // 10cm subgrid

    const viewMin = screenToWorld(0, 0);
    const viewMax = screenToWorld(rect.width, rect.height);

    const startX = Math.floor(viewMin.x / gridSpacingPx) * gridSpacingPx;
    const endX = Math.ceil(viewMax.x / gridSpacingPx) * gridSpacingPx;
    const startY = Math.floor(viewMin.y / gridSpacingPx) * gridSpacingPx;
    const endY = Math.ceil(viewMax.y / gridSpacingPx) * gridSpacingPx;

    // Sub-grid dots (visible when zoomed in)
    if (zoom >= 0.7) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
      const subStartX = Math.floor(viewMin.x / subGridPx) * subGridPx;
      const subEndX = Math.ceil(viewMax.x / subGridPx) * subGridPx;
      const subStartY = Math.floor(viewMin.y / subGridPx) * subGridPx;
      const subEndY = Math.ceil(viewMax.y / subGridPx) * subGridPx;

      for (let x = subStartX; x <= subEndX; x += subGridPx) {
        for (let y = subStartY; y <= subEndY; y += subGridPx) {
          ctx.beginPath();
          ctx.arc(x, y, 1.0 / zoom, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Major grid lines / intersections
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.45)';
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    for (let x = startX; x <= endX; x += gridSpacingPx) {
      ctx.moveTo(x, viewMin.y);
      ctx.lineTo(x, viewMax.y);
    }
    for (let y = startY; y <= endY; y += gridSpacingPx) {
      ctx.moveTo(viewMin.x, y);
      ctx.lineTo(viewMax.x, y);
    }
    ctx.stroke();

    // -------------------------------------------------------------
    // LAYER 1: GHOST BLUEPRINT REFERENCE LAYER
    // -------------------------------------------------------------
    if (settings.ghostVisible && settings.ghostOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = settings.ghostOpacity;

      if (customFloorPlan) {
        // Draw uploaded 2D floor plan image or PDF render
        const img = customFloorPlan.imageElement;
        const w = customFloorPlan.width * customFloorPlan.scale;
        const h = customFloorPlan.height * customFloorPlan.scale;
        const x = customFloorPlan.position.x;
        const y = customFloorPlan.position.y;

        // Clean white paper backing so transparent PNGs/SVGs render crisply
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, w, h);

        try {
          ctx.drawImage(img, x, y, w, h);
        } catch {
          // Image draw fallback
        }

        // Blueprint technical border & frame
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.5 / zoom;
        ctx.strokeRect(x, y, w, h);

        // Header technical label
        ctx.fillStyle = '#0284c7';
        ctx.font = `600 ${Math.max(10, 11 / zoom)}px "Fira Code", monospace`;
        ctx.textAlign = 'left';
        ctx.fillText(
          `REFERENCE: ${customFloorPlan.name} (${customFloorPlan.width}×${customFloorPlan.height})`,
          x,
          y - 8 / zoom
        );
      } else {
        // Draw Built-in Blueprint Reference Rooms / Floor Base
        currentLevel.referenceRooms.forEach((r) => {
          ctx.beginPath();
          r.polygon.forEach((pt, idx) => {
            if (idx === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.closePath();
          ctx.fillStyle = 'rgba(238, 246, 255, 0.75)';
          ctx.fill();
          ctx.strokeStyle = '#93c5fd';
          ctx.lineWidth = 1.5 / zoom;
          ctx.stroke();
        });

      // Reference Walls (Blueprint Cyan/Indigo Double lines)
      currentLevel.referenceWalls.forEach((rw) => {
        ctx.beginPath();
        ctx.moveTo(rw.start.x, rw.start.y);
        ctx.lineTo(rw.end.x, rw.end.y);
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 7 / zoom;
        ctx.lineCap = 'square';
        ctx.stroke();

        // Inner lighter stroke for authentic CAD blueprint look
        ctx.beginPath();
        ctx.moveTo(rw.start.x, rw.start.y);
        ctx.lineTo(rw.end.x, rw.end.y);
        ctx.strokeStyle = '#bae6fd';
        ctx.lineWidth = 3 / zoom;
        ctx.stroke();
      });

      // Blueprint Doors
      currentLevel.ghostSvgElements.doors.forEach((door) => {
        ctx.save();
        ctx.translate(door.x, door.y);
        ctx.rotate((door.angle * Math.PI) / 180);

        // Door frame
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.5 / zoom;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(door.width, 0);
        ctx.stroke();

        // Swing Arc
        ctx.setLineDash([3 / zoom, 3 / zoom]);
        ctx.strokeStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(0, 0, door.width, 0, Math.PI / 2, false);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      });

      // Blueprint Windows
      currentLevel.ghostSvgElements.windows.forEach((win) => {
        ctx.save();
        ctx.translate(win.x, win.y);
        ctx.rotate((win.angle * Math.PI) / 180);
        ctx.fillStyle = '#e0f2fe';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.5 / zoom;
        ctx.fillRect(-win.width / 2, -win.height / 2, win.width, win.height);
        ctx.strokeRect(-win.width / 2, -win.height / 2, win.width, win.height);
        // Glass center mullion
        ctx.beginPath();
        ctx.moveTo(-win.width / 2, 0);
        ctx.lineTo(win.width / 2, 0);
        ctx.stroke();
        ctx.restore();
      });

      // Blueprint Furniture Blocks (Light Blueprint silhouettes)
      currentLevel.ghostSvgElements.furniture.forEach((f, idx) => {
        const isFurnSelected = selectedFurnitureIndices.includes(idx);
        ctx.save();
        ctx.translate(f.x, f.y);
        if (f.angle) ctx.rotate((f.angle * Math.PI) / 180);
        ctx.strokeStyle = isFurnSelected ? '#0284c7' : '#60a5fa';
        ctx.lineWidth = (isFurnSelected ? 2.5 : 1.2) / zoom;
        ctx.fillStyle = isFurnSelected ? 'rgba(56, 189, 248, 0.45)' : 'rgba(224, 242, 254, 0.4)';
        ctx.fillRect(-f.width / 2, -f.height / 2, f.width, f.height);
        ctx.strokeRect(-f.width / 2, -f.height / 2, f.width, f.height);

        // Furniture detail based on type
        if (f.type === 'bed') {
          // Pillows
          ctx.fillStyle = 'rgba(186, 230, 253, 0.8)';
          ctx.fillRect(-f.width / 2 + 6, -f.height / 2 + 5, 30, 18);
          ctx.fillRect(f.width / 2 - 36, -f.height / 2 + 5, 30, 18);
        }

        // Label
        ctx.fillStyle = '#0369a1';
        ctx.font = `${Math.max(9, 10 / zoom)}px "Plus Jakarta Sans", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(f.label, 0, 0);
        ctx.restore();
      });

      // Blueprint Dimension Guides
      currentLevel.ghostSvgElements.dimensionGuides.forEach((g) => {
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1 / zoom;
        ctx.setLineDash([2 / zoom, 2 / zoom]);
        ctx.beginPath();
        ctx.moveTo(g.p1.x, g.p1.y);
        ctx.lineTo(g.p2.x, g.p2.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Dimension text
        const midX = (g.p1.x + g.p2.x) / 2;
        const midY = (g.p1.y + g.p2.y) / 2;
        ctx.fillStyle = '#0369a1';
        ctx.font = `600 ${Math.max(10, 11 / zoom)}px "Fira Code", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(g.label, midX, midY - 8 / zoom);
      });

      // Room Title Badges
      currentLevel.ghostSvgElements.roomLabels.forEach((rl) => {
        ctx.fillStyle = '#0c4a6e';
        ctx.font = `700 ${Math.max(11, 12 / zoom)}px "Plus Jakarta Sans", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(rl.name, rl.x, rl.y);
        ctx.fillStyle = '#0284c7';
        ctx.font = `500 ${Math.max(9, 10 / zoom)}px "Fira Code", monospace`;
        ctx.fillText(rl.targetDim, rl.x, rl.y + 14 / zoom);
      });
      }

      ctx.restore();
    }

    // -------------------------------------------------------------
    // LAYER 2: VECTOR USER DRAFTING LAYER
    // -------------------------------------------------------------

    // 2A: Closed Rooms Polygons Fill & Area Label
    closedRooms.forEach((r) => {
      const isHovered = hoveredRoomId === r.id;
      const isSelected = selectedRoomId === r.id;

      // Draw Polygon Path
      ctx.beginPath();
      r.points.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.closePath();

      // Translucent Pastel Fill (e.g., light blue for Living Room, light green for Bedroom)
      ctx.fillStyle = isSelected
        ? r.fillColor.replace('0.40', '0.62')
        : isHovered
        ? r.fillColor.replace('0.40', '0.52')
        : r.fillColor;
      ctx.fill();

      // Translucent boundary stroke
      ctx.strokeStyle = isSelected ? r.borderColor : isHovered ? r.borderColor : r.borderColor + '99';
      ctx.lineWidth = (isSelected ? 2.5 : isHovered ? 2.0 : 1.5) / zoom;
      ctx.stroke();

      // Centered Architectural Room Badge (Inside Room Center)
      const roomTitle = r.name.toUpperCase();
      const areaText = `${r.areaMetersSq.toFixed(2)} m²`;

      ctx.font = `700 ${Math.max(9, 10 / zoom)}px "Plus Jakarta Sans", sans-serif`;
      const titleMetrics = ctx.measureText(roomTitle);

      ctx.font = `700 ${Math.max(11, 12 / zoom)}px "Fira Code", monospace`;
      const areaMetrics = ctx.measureText(areaText);

      const maxTextWidth = Math.max(titleMetrics.width, areaMetrics.width);
      const padX = 14 / zoom;
      const badgeW = maxTextWidth + padX * 2;
      const badgeH = 38 / zoom;

      const badgeX = r.centroid.x - badgeW / 2;
      const badgeY = r.centroid.y - badgeH / 2;

      // Badge Card Background (Crisp rounded card with subtle shadow)
      ctx.fillStyle = r.tagBgColor;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6 / zoom);
      ctx.fill();

      // Badge Card Border
      ctx.strokeStyle = isSelected ? r.borderColor : isHovered ? r.borderColor : r.borderColor + '88';
      ctx.lineWidth = (isSelected ? 2 : 1.5) / zoom;
      ctx.stroke();

      // Room Name Text
      ctx.fillStyle = r.tagTextColor;
      ctx.font = `700 ${Math.max(9, 10 / zoom)}px "Plus Jakarta Sans", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(roomTitle, r.centroid.x, badgeY + 12 / zoom);

      // Area in m² Text
      ctx.fillStyle = '#0f172a';
      ctx.font = `700 ${Math.max(11, 12 / zoom)}px "Fira Code", monospace`;
      ctx.fillText(areaText, r.centroid.x, badgeY + 26 / zoom);
    });

    // 2B: Player Drawn Walls
    const nodeMap = new Map<string, Node>();
    nodes.forEach((n) => nodeMap.set(n.id, n));

    const wallThicknessPx = metersToPixels(
      settings.wallThicknessMeters,
      settings.scaleFactor
    );

    walls.forEach((w) => {
      const n1 = nodeMap.get(w.startNodeId);
      const n2 = nodeMap.get(w.endNodeId);
      if (!n1 || !n2) return;

      const isSelected = selectedWallId === w.id || selectedWallIds.includes(w.id);
      const isHovered = hoveredWall?.id === w.id;
      const wallOpenings = openings.filter((o) => o.wallId === w.id);

      if (wallOpenings.length === 0) {
        // Continuous wall without openings
        ctx.beginPath();
        ctx.moveTo(n1.x, n1.y);
        ctx.lineTo(n2.x, n2.y);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Outer Wall Stroke
        ctx.strokeStyle = isSelected
          ? '#0284c7'
          : isHovered
          ? '#334155'
          : '#1e293b';
        ctx.lineWidth = wallThicknessPx;
        ctx.stroke();

        // Wall Inner Core Highlight
        ctx.beginPath();
        ctx.moveTo(n1.x, n1.y);
        ctx.lineTo(n2.x, n2.y);
        ctx.strokeStyle = isSelected
          ? '#38bdf8'
          : isHovered
          ? '#475569'
          : '#334155';
        ctx.lineWidth = Math.max(1, wallThicknessPx * 0.45);
        ctx.stroke();

        // Dynamic Dimension Badge along the wall
        const wallDistPx = getDistance(n1, n2);
        const wallDistMeters = pixelsToMeters(wallDistPx, settings.scaleFactor);
        const midX = (n1.x + n2.x) / 2;
        const midY = (n1.y + n2.y) / 2;

        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const len = Math.hypot(dx, dy);
        if (len > 1e-4) {
          const nx = -dy / len;
          const ny = dx / len;
          const offsetDist = 18 / zoom;

          const dimP1 = { x: n1.x + nx * offsetDist, y: n1.y + ny * offsetDist };
          const dimP2 = { x: n2.x + nx * offsetDist, y: n2.y + ny * offsetDist };

          // Dimension line
          ctx.strokeStyle = isSelected ? '#0284c7' : '#0ea5e9';
          ctx.lineWidth = 1 / zoom;
          ctx.beginPath();
          ctx.moveTo(dimP1.x, dimP1.y);
          ctx.lineTo(dimP2.x, dimP2.y);
          ctx.stroke();

          // Dimension tick marks at endpoints
          const tickSize = 4 / zoom;
          [dimP1, dimP2].forEach((p) => {
            ctx.beginPath();
            ctx.moveTo(p.x - ny * tickSize, p.y + nx * tickSize);
            ctx.lineTo(p.x + ny * tickSize, p.y - nx * tickSize);
            ctx.stroke();
          });

          // Dimension pill badge
          const isDimHovered = hoveredDimensionWallId === w.id;
          const isDimEditing = activeEditingDimension?.wallId === w.id;
          const dimText = isSelected ? `${formatMeters(wallDistMeters)} ✎` : formatMeters(wallDistMeters);
          ctx.font = `600 ${Math.max(10, 11 / zoom)}px "Fira Code", monospace`;
          const metrics = ctx.measureText(dimText);
          const padX = 6 / zoom;
          const padY = 3 / zoom;
          const badgeW = metrics.width + padX * 2;
          const badgeH = 16 / zoom;
          const badgeX = midX + nx * offsetDist - badgeW / 2;
          const badgeY = midY + ny * offsetDist - badgeH / 2;

          ctx.fillStyle = isDimEditing
            ? 'rgba(255, 255, 255, 0.3)'
            : isSelected || isDimHovered
            ? '#f0f9ff'
            : '#ffffff';
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3 / zoom);
          ctx.fill();
          ctx.strokeStyle = isSelected || isDimHovered ? '#0284c7' : '#bae6fd';
          ctx.lineWidth = (isSelected || isDimHovered ? 1.5 : 1) / zoom;
          ctx.stroke();

          if (!isDimEditing) {
            ctx.fillStyle = isSelected || isDimHovered ? '#0369a1' : '#0284c7';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(dimText, midX + nx * offsetDist, midY + ny * offsetDist);
          }
        }
      } else {
        // Wall broken by openings: architectural door swings, window symbols, and chain dimensions
        const breakdown = getWallOpeningsBreakdown(n1, n2, wallOpenings, settings.scaleFactor);

        // 1. Draw solid wall segments
        breakdown.solidSegments.forEach((seg) => {
          ctx.beginPath();
          ctx.moveTo(seg.startPt.x, seg.startPt.y);
          ctx.lineTo(seg.endPt.x, seg.endPt.y);
          ctx.lineCap = 'butt';
          ctx.lineJoin = 'round';
          ctx.strokeStyle = isSelected
            ? '#0284c7'
            : isHovered
            ? '#334155'
            : '#1e293b';
          ctx.lineWidth = wallThicknessPx;
          ctx.stroke();

          // Wall inner core highlight
          ctx.beginPath();
          ctx.moveTo(seg.startPt.x, seg.startPt.y);
          ctx.lineTo(seg.endPt.x, seg.endPt.y);
          ctx.strokeStyle = isSelected
            ? '#38bdf8'
            : isHovered
            ? '#475569'
            : '#334155';
          ctx.lineWidth = Math.max(1, wallThicknessPx * 0.45);
          ctx.stroke();

          // Capped jamb ticks at ends
          [seg.startPt, seg.endPt].forEach((pt) => {
            ctx.beginPath();
            ctx.moveTo(
              pt.x - breakdown.normal.x * (wallThicknessPx / 2),
              pt.y - breakdown.normal.y * (wallThicknessPx / 2)
            );
            ctx.lineTo(
              pt.x + breakdown.normal.x * (wallThicknessPx / 2),
              pt.y + breakdown.normal.y * (wallThicknessPx / 2)
            );
            ctx.strokeStyle = isSelected ? '#0284c7' : '#1e293b';
            ctx.lineWidth = 1.5 / zoom;
            ctx.stroke();
          });
        });

        // Helper to render opening badge
        const renderOpeningBadge = (tag: string, centerPt: Point, isSelectedOpening: boolean) => {
          ctx.font = `600 ${Math.max(9, 10 / zoom)}px "Fira Code", monospace`;
          const dMetrics = ctx.measureText(tag);
          const dW = dMetrics.width + 10 / zoom;
          const dH = 15 / zoom;
          ctx.fillStyle = isSelectedOpening ? '#0284c7' : '#ffffff';
          ctx.beginPath();
          ctx.roundRect(centerPt.x - dW / 2, centerPt.y - dH / 2, dW, dH, 3 / zoom);
          ctx.fill();
          ctx.strokeStyle = isSelectedOpening ? '#0284c7' : '#bae6fd';
          ctx.lineWidth = 1 / zoom;
          ctx.stroke();
          ctx.fillStyle = isSelectedOpening ? '#ffffff' : '#0369a1';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(tag, centerPt.x, centerPt.y);
        };

        // 2. Draw openings: Single Door, Double Door, Sliding Door, and Window
        breakdown.openings.forEach((op) => {
          const isOpSelected = selectedOpeningId === op.opening.id || selectedOpeningIds.includes(op.opening.id);
          const isOpHovered = hoveredOpening?.id === op.opening.id;
          const p1 = op.startPt;
          const p2 = op.endPt;
          const nx = breakdown.normal.x;
          const ny = breakdown.normal.y;
          const ux = breakdown.unitVec.x;
          const uy = breakdown.unitVec.y;
          const flip = op.opening.swingFlip ? -1 : 1;
          const halfThick = wallThicknessPx / 2;

          // Common jamb boundary tick marks at the two ends of the opening gap
          [p1, p2].forEach((pt) => {
            ctx.beginPath();
            ctx.moveTo(pt.x - nx * halfThick, pt.y - ny * halfThick);
            ctx.lineTo(pt.x + nx * halfThick, pt.y + ny * halfThick);
            ctx.strokeStyle = isOpSelected ? '#0284c7' : '#0f172a';
            ctx.lineWidth = (isOpSelected ? 2.5 : 1.5) / zoom;
            ctx.stroke();
          });

          if (op.opening.type === 'door') {
            // SINGLE DOOR (片開き戸: door leaf line + 90-degree swing arc)
            const hinge = op.opening.swingDirection === 'right' ? p2 : p1;
            const strike = op.opening.swingDirection === 'right' ? p1 : p2;
            const leafEnd = {
              x: hinge.x + nx * op.widthPx * flip,
              y: hinge.y + ny * op.widthPx * flip,
            };

            const radius = op.widthPx;
            const startAngle = Math.atan2(strike.y - hinge.y, strike.x - hinge.x);
            const endAngle = Math.atan2(leafEnd.y - hinge.y, leafEnd.x - hinge.x);

            // Translucent swing sweep arc fan
            ctx.fillStyle = isOpSelected
              ? 'rgba(2, 132, 199, 0.16)'
              : isOpHovered
              ? 'rgba(2, 132, 199, 0.12)'
              : 'rgba(2, 132, 199, 0.07)';
            ctx.beginPath();
            ctx.moveTo(hinge.x, hinge.y);
            ctx.arc(hinge.x, hinge.y, radius, startAngle, endAngle, flip < 0);
            ctx.closePath();
            ctx.fill();

            // Swing arc line
            ctx.beginPath();
            ctx.arc(hinge.x, hinge.y, radius, startAngle, endAngle, flip < 0);
            ctx.strokeStyle = isOpSelected ? '#0284c7' : '#38bdf8';
            ctx.lineWidth = (isOpSelected ? 2.2 : 1.5) / zoom;
            ctx.stroke();

            // Door leaf thick line
            ctx.beginPath();
            ctx.moveTo(hinge.x, hinge.y);
            ctx.lineTo(leafEnd.x, leafEnd.y);
            ctx.strokeStyle = isOpSelected ? '#0284c7' : '#0f172a';
            ctx.lineWidth = (isOpSelected ? 3 : 2.5) / zoom;
            ctx.lineCap = 'round';
            ctx.stroke();

            // Door pivot hinge marker
            ctx.beginPath();
            ctx.arc(hinge.x, hinge.y, (isOpSelected ? 4 : 3) / zoom, 0, Math.PI * 2);
            ctx.fillStyle = isOpSelected ? '#0284c7' : '#0369a1';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1 / zoom;
            ctx.stroke();

            renderOpeningBadge(`${op.widthMeters.toFixed(2)}m Door`, op.centerPt, isOpSelected);
          } else if (op.opening.type === 'double-door') {
            // DOUBLE DOOR (両開き戸: dual opposing swing arcs meeting at center)
            const halfWidth = op.widthPx / 2;
            const midPt = op.centerPt;

            // Left leaf (hinged at p1)
            const leftLeafEnd = {
              x: p1.x + nx * halfWidth * flip,
              y: p1.y + ny * halfWidth * flip,
            };
            const leftStartAngle = Math.atan2(midPt.y - p1.y, midPt.x - p1.x);
            const leftEndAngle = Math.atan2(leftLeafEnd.y - p1.y, leftLeafEnd.x - p1.x);

            // Right leaf (hinged at p2)
            const rightLeafEnd = {
              x: p2.x + nx * halfWidth * flip,
              y: p2.y + ny * halfWidth * flip,
            };
            const rightStartAngle = Math.atan2(midPt.y - p2.y, midPt.x - p2.x);
            const rightEndAngle = Math.atan2(rightLeafEnd.y - p2.y, rightLeafEnd.x - p2.x);

            // Translucent dual swing sweep fills
            ctx.fillStyle = isOpSelected
              ? 'rgba(2, 132, 199, 0.16)'
              : isOpHovered
              ? 'rgba(2, 132, 199, 0.12)'
              : 'rgba(2, 132, 199, 0.07)';

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.arc(p1.x, p1.y, halfWidth, leftStartAngle, leftEndAngle, flip < 0);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(p2.x, p2.y);
            ctx.arc(p2.x, p2.y, halfWidth, rightStartAngle, rightEndAngle, flip > 0);
            ctx.closePath();
            ctx.fill();

            // Swing arc lines
            ctx.strokeStyle = isOpSelected ? '#0284c7' : '#38bdf8';
            ctx.lineWidth = (isOpSelected ? 2.2 : 1.5) / zoom;
            ctx.beginPath();
            ctx.arc(p1.x, p1.y, halfWidth, leftStartAngle, leftEndAngle, flip < 0);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(p2.x, p2.y, halfWidth, rightStartAngle, rightEndAngle, flip > 0);
            ctx.stroke();

            // Left and Right door leaf lines
            ctx.strokeStyle = isOpSelected ? '#0284c7' : '#0f172a';
            ctx.lineWidth = (isOpSelected ? 3 : 2.5) / zoom;
            ctx.lineCap = 'round';

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(leftLeafEnd.x, leftLeafEnd.y);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(p2.x, p2.y);
            ctx.lineTo(rightLeafEnd.x, rightLeafEnd.y);
            ctx.stroke();

            // Pivot hinge dots at p1 and p2
            [p1, p2].forEach((hinge) => {
              ctx.beginPath();
              ctx.arc(hinge.x, hinge.y, (isOpSelected ? 4 : 3) / zoom, 0, Math.PI * 2);
              ctx.fillStyle = isOpSelected ? '#0284c7' : '#0369a1';
              ctx.fill();
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1 / zoom;
              ctx.stroke();
            });

            renderOpeningBadge(`${op.widthMeters.toFixed(2)}m Double Door`, op.centerPt, isOpSelected);
          } else if (op.opening.type === 'sliding-door') {
            // SLIDING DOOR (引違い戸: offset parallel sliding lines matching Japanese floor plan convention)
            const overlapPx = Math.max(8 / zoom, op.widthPx * 0.15);
            const sashOffset = 3.5 / zoom;

            // Panel 1: from p1 to (center + overlap/2), offset +sashOffset
            const p1_start = {
              x: p1.x + nx * sashOffset,
              y: p1.y + ny * sashOffset,
            };
            const p1_end = {
              x: op.centerPt.x + ux * (overlapPx / 2) + nx * sashOffset,
              y: op.centerPt.y + uy * (overlapPx / 2) + ny * sashOffset,
            };

            // Panel 2: from (center - overlap/2) to p2, offset -sashOffset
            const p2_start = {
              x: op.centerPt.x - ux * (overlapPx / 2) - nx * sashOffset,
              y: op.centerPt.y - uy * (overlapPx / 2) - ny * sashOffset,
            };
            const p2_end = {
              x: p2.x - nx * sashOffset,
              y: p2.y - ny * sashOffset,
            };

            // Draw the two overlapping sashes
            ctx.strokeStyle = isOpSelected ? '#0284c7' : '#0f172a';
            ctx.lineWidth = (isOpSelected ? 2.5 : 2.0) / zoom;
            ctx.lineCap = 'square';

            ctx.beginPath();
            ctx.moveTo(p1_start.x, p1_start.y);
            ctx.lineTo(p1_end.x, p1_end.y);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(p2_start.x, p2_start.y);
            ctx.lineTo(p2_end.x, p2_end.y);
            ctx.stroke();

            // End tick marks on sashes
            const sashTick = 2.5 / zoom;
            [p1_start, p1_end, p2_start, p2_end].forEach((pt) => {
              ctx.beginPath();
              ctx.moveTo(pt.x - nx * sashTick, pt.y - ny * sashTick);
              ctx.lineTo(pt.x + nx * sashTick, pt.y + ny * sashTick);
              ctx.stroke();
            });

            renderOpeningBadge(`${op.widthMeters.toFixed(2)}m Sliding Door`, op.centerPt, isOpSelected);
          } else {
            // WINDOW (引違い窓: parallel glass sash lines with wall boundary)
            // Outer frame / sill lines
            ctx.beginPath();
            ctx.moveTo(p1.x + nx * halfThick, p1.y + ny * halfThick);
            ctx.lineTo(p2.x + nx * halfThick, p2.y + ny * halfThick);
            ctx.moveTo(p1.x - nx * halfThick, p1.y - ny * halfThick);
            ctx.lineTo(p2.x - nx * halfThick, p2.y - ny * halfThick);
            ctx.strokeStyle = isOpSelected ? '#0284c7' : '#475569';
            ctx.lineWidth = 1.5 / zoom;
            ctx.stroke();

            // Double parallel glass panes along center
            const glassOffset = 3 / zoom;
            ctx.beginPath();
            ctx.moveTo(p1.x + nx * glassOffset, p1.y + ny * glassOffset);
            ctx.lineTo(p2.x + nx * glassOffset, p2.y + ny * glassOffset);
            ctx.moveTo(p1.x - nx * glassOffset, p1.y - ny * glassOffset);
            ctx.lineTo(p2.x - nx * glassOffset, p2.y - ny * glassOffset);
            ctx.strokeStyle = isOpSelected ? '#0284c7' : '#0ea5e9';
            ctx.lineWidth = 1.5 / zoom;
            ctx.stroke();

            // Center sash divider mark
            ctx.beginPath();
            ctx.moveTo(op.centerPt.x - nx * halfThick, op.centerPt.y - ny * halfThick);
            ctx.lineTo(op.centerPt.x + nx * halfThick, op.centerPt.y + ny * halfThick);
            ctx.strokeStyle = isOpSelected ? '#0284c7' : '#0284c7';
            ctx.lineWidth = 2 / zoom;
            ctx.stroke();

            renderOpeningBadge(`${op.widthMeters.toFixed(2)}m Window`, op.centerPt, isOpSelected);
          }
        });

        // 3. Chain Dimensioning: Remaining wall margins & opening widths
        const offsetDist = 20 / zoom;
        const dimP1 = {
          x: n1.x + breakdown.normal.x * offsetDist,
          y: n1.y + breakdown.normal.y * offsetDist,
        };
        const dimP2 = {
          x: n2.x + breakdown.normal.x * offsetDist,
          y: n2.y + breakdown.normal.y * offsetDist,
        };

        // Continuous dimension line
        ctx.strokeStyle = isSelected ? '#0284c7' : '#0ea5e9';
        ctx.lineWidth = 1 / zoom;
        ctx.beginPath();
        ctx.moveTo(dimP1.x, dimP1.y);
        ctx.lineTo(dimP2.x, dimP2.y);
        ctx.stroke();

        // End tick marks
        const tickSize = 4 / zoom;
        [dimP1, dimP2].forEach((p) => {
          ctx.beginPath();
          ctx.moveTo(
            p.x - breakdown.unitVec.x * tickSize,
            p.y - breakdown.unitVec.y * tickSize
          );
          ctx.lineTo(
            p.x + breakdown.unitVec.x * tickSize,
            p.y + breakdown.unitVec.y * tickSize
          );
          ctx.stroke();
        });

        // Interior ticks and margin badges
        breakdown.marginDimensions.forEach((m) => {
          [m.p1, m.p2].forEach((pt) => {
            const ptOnDim = {
              x: pt.x + breakdown.normal.x * offsetDist,
              y: pt.y + breakdown.normal.y * offsetDist,
            };
            ctx.beginPath();
            ctx.moveTo(
              ptOnDim.x - breakdown.unitVec.x * tickSize,
              ptOnDim.y - breakdown.unitVec.y * tickSize
            );
            ctx.lineTo(
              ptOnDim.x + breakdown.unitVec.x * tickSize,
              ptOnDim.y + breakdown.unitVec.y * tickSize
            );
            ctx.strokeStyle = '#0ea5e9';
            ctx.lineWidth = 1 / zoom;
            ctx.stroke();
          });

          // Badge along margin
          const dimMid = {
            x: m.midPt.x + breakdown.normal.x * offsetDist,
            y: m.midPt.y + breakdown.normal.y * offsetDist,
          };
          const text = m.subLabel ? `${m.label} [${m.subLabel}]` : m.label;
          ctx.font = `600 ${Math.max(9, 10 / zoom)}px "Fira Code", monospace`;
          const metrics = ctx.measureText(text);
          const padX = 5 / zoom;
          const badgeW = metrics.width + padX * 2;
          const badgeH = 15 / zoom;

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.roundRect(dimMid.x - badgeW / 2, dimMid.y - badgeH / 2, badgeW, badgeH, 3 / zoom);
          ctx.fill();
          ctx.strokeStyle = m.type === 'opening' ? '#0284c7' : '#bae6fd';
          ctx.lineWidth = 1 / zoom;
          ctx.stroke();

          ctx.fillStyle = m.type === 'opening' ? '#0284c7' : '#0369a1';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, dimMid.x, dimMid.y);
        });

        // 4. Overall Total Wall Dimension line & badge when selected or hovered
        if (isSelected || hoveredDimensionWallId === w.id) {
          const totalDistPx = getDistance(n1, n2);
          const totalDistM = pixelsToMeters(totalDistPx, settings.scaleFactor);
          const totalMidX = (n1.x + n2.x) / 2;
          const totalMidY = (n1.y + n2.y) / 2;
          const totalOffset = 36 / zoom;
          const totalDimP1 = {
            x: n1.x + breakdown.normal.x * totalOffset,
            y: n1.y + breakdown.normal.y * totalOffset,
          };
          const totalDimP2 = {
            x: n2.x + breakdown.normal.x * totalOffset,
            y: n2.y + breakdown.normal.y * totalOffset,
          };

          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 1 / zoom;
          ctx.beginPath();
          ctx.moveTo(totalDimP1.x, totalDimP1.y);
          ctx.lineTo(totalDimP2.x, totalDimP2.y);
          ctx.stroke();

          // End tick marks
          const tickSize = 4 / zoom;
          [totalDimP1, totalDimP2].forEach((p) => {
            ctx.beginPath();
            ctx.moveTo(
              p.x - breakdown.unitVec.x * tickSize,
              p.y - breakdown.unitVec.y * tickSize
            );
            ctx.lineTo(
              p.x + breakdown.unitVec.x * tickSize,
              p.y + breakdown.unitVec.y * tickSize
            );
            ctx.stroke();
          });

          // Overall Wall Dimension Badge
          const isDimHovered = hoveredDimensionWallId === w.id;
          const isDimEditing = activeEditingDimension?.wallId === w.id;
          const dimText = `${formatMeters(totalDistM)} ✎`;
          ctx.font = `600 ${Math.max(10, 11 / zoom)}px "Fira Code", monospace`;
          const metrics = ctx.measureText(dimText);
          const padX = 6 / zoom;
          const padY = 3 / zoom;
          const badgeW = metrics.width + padX * 2;
          const badgeH = 16 / zoom;
          const badgeMid = {
            x: totalMidX + breakdown.normal.x * totalOffset,
            y: totalMidY + breakdown.normal.y * totalOffset,
          };

          ctx.fillStyle = isDimEditing
            ? 'rgba(255, 255, 255, 0.3)'
            : isDimHovered || isSelected
            ? '#f0f9ff'
            : '#ffffff';
          ctx.beginPath();
          ctx.roundRect(badgeMid.x - badgeW / 2, badgeMid.y - badgeH / 2, badgeW, badgeH, 3 / zoom);
          ctx.fill();
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = (isSelected || isDimHovered ? 1.5 : 1) / zoom;
          ctx.stroke();

          if (!isDimEditing) {
            ctx.fillStyle = '#0369a1';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(dimText, badgeMid.x, badgeMid.y);
          }
        }
      }
    });

    // 2C: Nodes (Junction Points)
    nodes.forEach((n) => {
      const isStartDrawingNode = activeDrawingNode?.id === n.id;
      const isHovered = hoveredNode?.id === n.id;
      const radius = isStartDrawingNode
        ? 6 / zoom
        : isHovered
        ? 5 / zoom
        : 4 / zoom;

      ctx.beginPath();
      ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = isStartDrawingNode
        ? '#0284c7'
        : isHovered
        ? '#38bdf8'
        : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5 / zoom;
      ctx.stroke();

      if (isStartDrawingNode) {
        // Pulsing ring around active node
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius + 4 / zoom, 0, Math.PI * 2);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5 / zoom;
        ctx.stroke();
      }
    });

    // 2D: Active Wall Drawing Rubber-Band Preview
    if (activeTool === 'wall' && activeDrawingNode) {
      const processed = getProcessedPoint(cursorWorldPos, activeDrawingNode);
      const targetPoint = processed.point;

      // Draw rubber-band wall
      ctx.beginPath();
      ctx.moveTo(activeDrawingNode.x, activeDrawingNode.y);
      ctx.lineTo(targetPoint.x, targetPoint.y);
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = wallThicknessPx;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Dynamic dimension badge on rubber-band
      const distPx = getDistance(activeDrawingNode, targetPoint);
      const distM = pixelsToMeters(distPx, settings.scaleFactor);
      const angle = Math.round(getAngleDegrees(activeDrawingNode, targetPoint));
      const midX = (activeDrawingNode.x + targetPoint.x) / 2;
      const midY = (activeDrawingNode.y + targetPoint.y) / 2;

      const previewText = `${formatMeters(distM)} · ${angle}°`;
      ctx.font = `600 ${Math.max(11, 12 / zoom)}px "Fira Code", monospace`;
      const pMetrics = ctx.measureText(previewText);
      const pBadgeW = pMetrics.width + 12 / zoom;
      const pBadgeH = 20 / zoom;

      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.roundRect(
        midX - pBadgeW / 2,
        midY - 22 / zoom - pBadgeH / 2,
        pBadgeW,
        pBadgeH,
        4 / zoom
      );
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(previewText, midX, midY - 22 / zoom);

      // Snap highlight target
      if (processed.snappedNode) {
        ctx.beginPath();
        ctx.arc(
          processed.snappedNode.x,
          processed.snappedNode.y,
          8 / zoom,
          0,
          Math.PI * 2
        );
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();
      }

      // Axial Alignment Rays
      processed.axialGuides.forEach((g) => {
        ctx.strokeStyle = 'rgba(2, 132, 199, 0.6)';
        ctx.setLineDash([3 / zoom, 3 / zoom]);
        ctx.lineWidth = 1 / zoom;
        ctx.beginPath();
        if (g.type === 'x') {
          ctx.moveTo(g.value, viewMin.y);
          ctx.lineTo(g.value, viewMax.y);
        } else {
          ctx.moveTo(viewMin.x, g.value);
          ctx.lineTo(viewMax.x, g.value);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }

    // 2E: Tape Measure Tool Live Render
    if (activeTool === 'measure' && measureStartPoint) {
      const processed = getProcessedPoint(cursorWorldPos);
      const measureEnd = processed.point;

      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      ctx.beginPath();
      ctx.moveTo(measureStartPoint.x, measureStartPoint.y);
      ctx.lineTo(measureEnd.x, measureEnd.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Start & End markers
      [measureStartPoint, measureEnd].forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = '#0284c7';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5 / zoom;
        ctx.stroke();
      });

      // Measurement tag
      const distPx = getDistance(measureStartPoint, measureEnd);
      const distM = pixelsToMeters(distPx, settings.scaleFactor);
      const dxM = pixelsToMeters(
        Math.abs(measureEnd.x - measureStartPoint.x),
        settings.scaleFactor
      );
      const dyM = pixelsToMeters(
        Math.abs(measureEnd.y - measureStartPoint.y),
        settings.scaleFactor
      );

      const midX = (measureStartPoint.x + measureEnd.x) / 2;
      const midY = (measureStartPoint.y + measureEnd.y) / 2;
      const label = `${formatMeters(distM)} (ΔX:${dxM.toFixed(2)}m, ΔY:${dyM.toFixed(2)}m)`;

      ctx.font = `600 ${Math.max(10, 11 / zoom)}px "Fira Code", monospace`;
      const mMetrics = ctx.measureText(label);
      const mW = mMetrics.width + 12 / zoom;
      const mH = 18 / zoom;

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(midX - mW / 2, midY - 14 / zoom, mW, mH, 4 / zoom);
      ctx.fill();

      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, midX, midY - 14 / zoom + mH / 2);
    }

    // 2E.2: Calibration Tool Live Render
    if (activeTool === 'calibrate' && calibratePointA) {
      const processed = getProcessedPoint(cursorWorldPos);
      const calibEnd = processed.point;

      // High-visibility glowing amber/cyan calibration line
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.5 / zoom;
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      ctx.beginPath();
      ctx.moveTo(calibratePointA.x, calibratePointA.y);
      ctx.lineTo(calibEnd.x, calibEnd.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Start & End markers
      [calibratePointA, calibEnd].forEach((p, idx) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = idx === 0 ? '#f59e0b' : '#38bdf8';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();
      });

      const distPx = getDistance(calibratePointA, calibEnd);
      const distM = pixelsToMeters(distPx, settings.scaleFactor);
      const midX = (calibratePointA.x + calibEnd.x) / 2;
      const midY = (calibratePointA.y + calibEnd.y) / 2;

      const calibText = `📏 ${distPx.toFixed(1)} px (${formatMeters(distM)}) · Click 2nd Point`;
      ctx.font = `700 ${Math.max(11, 12 / zoom)}px "Fira Code", monospace`;
      const cMetrics = ctx.measureText(calibText);
      const cW = cMetrics.width + 16 / zoom;
      const cH = 22 / zoom;

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(midX - cW / 2, midY - 24 / zoom - cH / 2, cW, cH, 4 / zoom);
      ctx.fill();

      ctx.fillStyle = '#fbbf24';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(calibText, midX, midY - 24 / zoom);
    }

    // 2E.3: Live Hover Ghost Preview for All Opening Tools (Single Door, Double Door, Sliding Door, Window)
    if (isOpeningTool(activeTool) && hoveredOpeningWall) {
      const hw = hoveredOpeningWall;
      const previewWidthM = getDefaultOpeningWidthMeters(hw.type);
      const previewWidthPx = metersToPixels(previewWidthM, settings.scaleFactor);

      const previewOpening: WallOpening = {
        id: 'preview-op',
        wallId: hw.wall.id,
        type: hw.type,
        positionRatio: hw.t,
        widthMeters: previewWidthM,
        swingDirection: 'left',
        swingFlip: false,
      };

      const ghostBreakdown = getWallOpeningsBreakdown(
        hw.n1,
        hw.n2,
        [...openings.filter((o) => o.wallId === hw.wall.id), previewOpening],
        settings.scaleFactor
      );

      // Ghost Opening Gap Outline on wall line
      const ghostP1 = {
        x: hw.point.x - ghostBreakdown.unitVec.x * (previewWidthPx / 2),
        y: hw.point.y - ghostBreakdown.unitVec.y * (previewWidthPx / 2),
      };
      const ghostP2 = {
        x: hw.point.x + ghostBreakdown.unitVec.x * (previewWidthPx / 2),
        y: hw.point.y + ghostBreakdown.unitVec.y * (previewWidthPx / 2),
      };

      // Ghost Cut highlight
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = wallThicknessPx;
      ctx.setLineDash([3 / zoom, 3 / zoom]);
      ctx.beginPath();
      ctx.moveTo(ghostP1.x, ghostP1.y);
      ctx.lineTo(ghostP2.x, ghostP2.y);
      ctx.stroke();
      ctx.setLineDash([]);

      const nx = ghostBreakdown.normal.x;
      const ny = ghostBreakdown.normal.y;
      const ux = ghostBreakdown.unitVec.x;
      const uy = ghostBreakdown.unitVec.y;

      if (hw.type === 'door') {
        // Ghost single door leaf & swing arc
        const hinge = ghostP1;
        const strike = ghostP2;
        const leafEnd = {
          x: hinge.x + nx * previewWidthPx,
          y: hinge.y + ny * previewWidthPx,
        };
        const radius = previewWidthPx;
        const startAngle = Math.atan2(strike.y - hinge.y, strike.x - hinge.x);
        const endAngle = Math.atan2(leafEnd.y - hinge.y, leafEnd.x - hinge.x);

        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 2 / zoom;
        ctx.beginPath();
        ctx.moveTo(hinge.x, hinge.y);
        ctx.lineTo(leafEnd.x, leafEnd.y);
        ctx.stroke();

        ctx.setLineDash([4 / zoom, 3 / zoom]);
        ctx.beginPath();
        ctx.arc(hinge.x, hinge.y, radius, startAngle, endAngle, false);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (hw.type === 'double-door') {
        // Ghost double door dual leaves & opposing arcs
        const halfWidth = previewWidthPx / 2;
        const midPt = hw.point;
        const leftLeafEnd = {
          x: ghostP1.x + nx * halfWidth,
          y: ghostP1.y + ny * halfWidth,
        };
        const rightLeafEnd = {
          x: ghostP2.x + nx * halfWidth,
          y: ghostP2.y + ny * halfWidth,
        };

        const leftStartAngle = Math.atan2(midPt.y - ghostP1.y, midPt.x - ghostP1.x);
        const leftEndAngle = Math.atan2(leftLeafEnd.y - ghostP1.y, leftLeafEnd.x - ghostP1.x);
        const rightStartAngle = Math.atan2(midPt.y - ghostP2.y, midPt.x - ghostP2.x);
        const rightEndAngle = Math.atan2(rightLeafEnd.y - ghostP2.y, rightLeafEnd.x - ghostP2.x);

        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 2 / zoom;
        ctx.beginPath();
        ctx.moveTo(ghostP1.x, ghostP1.y);
        ctx.lineTo(leftLeafEnd.x, leftLeafEnd.y);
        ctx.moveTo(ghostP2.x, ghostP2.y);
        ctx.lineTo(rightLeafEnd.x, rightLeafEnd.y);
        ctx.stroke();

        ctx.setLineDash([4 / zoom, 3 / zoom]);
        ctx.beginPath();
        ctx.arc(ghostP1.x, ghostP1.y, halfWidth, leftStartAngle, leftEndAngle, false);
        ctx.arc(ghostP2.x, ghostP2.y, halfWidth, rightStartAngle, rightEndAngle, true);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (hw.type === 'sliding-door') {
        // Ghost sliding door overlapping sashes
        const overlapPx = Math.max(8 / zoom, previewWidthPx * 0.15);
        const sashOffset = 3.5 / zoom;

        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([3 / zoom, 2 / zoom]);

        // Panel 1
        ctx.beginPath();
        ctx.moveTo(ghostP1.x + nx * sashOffset, ghostP1.y + ny * sashOffset);
        ctx.lineTo(hw.point.x + ux * (overlapPx / 2) + nx * sashOffset, hw.point.y + uy * (overlapPx / 2) + ny * sashOffset);
        ctx.stroke();

        // Panel 2
        ctx.beginPath();
        ctx.moveTo(hw.point.x - ux * (overlapPx / 2) - nx * sashOffset, hw.point.y - uy * (overlapPx / 2) - ny * sashOffset);
        ctx.lineTo(ghostP2.x - nx * sashOffset, ghostP2.y - ny * sashOffset);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // Ghost window double glass line
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 2 / zoom;
        ctx.beginPath();
        ctx.moveTo(ghostP1.x + nx * (2 / zoom), ghostP1.y + ny * (2 / zoom));
        ctx.lineTo(ghostP2.x + nx * (2 / zoom), ghostP2.y + ny * (2 / zoom));
        ctx.moveTo(ghostP1.x - nx * (2 / zoom), ghostP1.y - ny * (2 / zoom));
        ctx.lineTo(ghostP2.x - nx * (2 / zoom), ghostP2.y - ny * (2 / zoom));
        ctx.stroke();
      }

      // Live Snap Center crosshair ring
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2 / zoom;
      ctx.beginPath();
      ctx.arc(hw.point.x, hw.point.y, 7 / zoom, 0, Math.PI * 2);
      ctx.stroke();

      // Ghost Breakdown Remaining Margins Pill Tags
      const offsetDist = 26 / zoom;
      ghostBreakdown.marginDimensions.forEach((m) => {
        const dimMid = {
          x: m.midPt.x + ghostBreakdown.normal.x * offsetDist,
          y: m.midPt.y + ghostBreakdown.normal.y * offsetDist,
        };
        const text = m.subLabel ? `${m.label} [${m.subLabel}]` : m.label;
        ctx.font = `700 ${Math.max(9, 10 / zoom)}px "Fira Code", monospace`;
        const metrics = ctx.measureText(text);
        const padX = 6 / zoom;
        const badgeW = metrics.width + padX * 2;
        const badgeH = 16 / zoom;

        ctx.fillStyle = m.type === 'opening' ? '#0284c7' : '#0f172a';
        ctx.beginPath();
        ctx.roundRect(dimMid.x - badgeW / 2, dimMid.y - badgeH / 2, badgeW, badgeH, 3 / zoom);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, dimMid.x, dimMid.y);
      });
    }

    // 2F: Cursor Snapping Crosshairs
    if (
      activeTool === 'wall' ||
      activeTool === 'measure' ||
      activeTool === 'calibrate' ||
      activeTool === 'door' ||
      activeTool === 'window'
    ) {
      const processed = getProcessedPoint(cursorWorldPos, activeDrawingNode);
      if (processed.snappedNode) {
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1.5 / zoom;
        ctx.beginPath();
        ctx.arc(
          processed.point.x,
          processed.point.y,
          6 / zoom,
          0,
          Math.PI * 2
        );
        ctx.stroke();
      } else if (settings.snapToGrid) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1 / zoom;
        const sz = 4 / zoom;
        ctx.beginPath();
        ctx.moveTo(processed.point.x - sz, processed.point.y);
        ctx.lineTo(processed.point.x + sz, processed.point.y);
        ctx.moveTo(processed.point.x, processed.point.y - sz);
        ctx.lineTo(processed.point.x, processed.point.y + sz);
        ctx.stroke();
      }
    }

    // 2G: Marquee Drag Selection Box (Select Tool)
    if (isMarqueeDragging && marqueeStart && marqueeCurrent) {
      const minX = Math.min(marqueeStart.x, marqueeCurrent.x);
      const maxX = Math.max(marqueeStart.x, marqueeCurrent.x);
      const minY = Math.min(marqueeStart.y, marqueeCurrent.y);
      const maxY = Math.max(marqueeStart.y, marqueeCurrent.y);
      const boxW = maxX - minX;
      const boxH = maxY - minY;

      ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
      ctx.fillRect(minX, minY, boxW, boxH);

      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([4 / zoom, 3 / zoom]);
      ctx.strokeRect(minX, minY, boxW, boxH);
      ctx.setLineDash([]);
    }

    ctx.restore();
    ctx.restore();
  }, [
    currentLevel,
    nodes,
    walls,
    openings,
    activeTool,
    settings,
    selectedWallId,
    selectedWallIds,
    selectedOpeningId,
    selectedOpeningIds,
    selectedFurnitureIndices,
    isMarqueeDragging,
    marqueeStart,
    marqueeCurrent,
    hoveredWall,
    hoveredNode,
    hoveredOpening,
    hoveredOpeningWall,
    activeDrawingNode,
    cursorWorldPos,
    measureStartPoint,
    calibratePointA,
    customFloorPlan,
    closedRooms,
    hoveredRoomId,
    selectedRoomId,
    zoom,
    pan,
    getProcessedPoint,
    screenToWorld,
  ]);

  // Keyboard Event Handlers (Space for panning, Shift for ortho, Esc to cancel)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Direct Type-to-Change Line Length:
      // When any wall/line is selected, typing numbers ('0'-'9', '.', ',') immediately opens
      // the dimension editor pre-filled with that keystroke without requiring a click on the badge.
      if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        (/^[\d.]$/.test(e.key) || e.key === ',')
      ) {
        const targetWallId =
          selectedWallId || (selectedWallIds.length === 1 ? selectedWallIds[0] : null);
        if (targetWallId) {
          const targetWall = walls.find((w) => w.id === targetWallId);
          if (targetWall) {
            e.preventDefault();
            const charToUse = e.key === ',' ? '.' : e.key;
            openDimensionInputForWall(targetWall, charToUse);
            return;
          }
        }
      }

      if (e.code === 'Space') {
        setIsSpacePressed(true);
      }
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
      if (e.key === 'Enter') {
        if (activeDrawingNode) {
          e.preventDefault();
          setActiveDrawingNode(null);
          soundEngine.playWallComplete();
          return;
        }
      }
      if (e.key === 'Escape') {
        if (activeEditingDimension) {
          isCancellingRef.current = true;
          setActiveEditingDimension(null);
          return;
        }
        if (activeDrawingNode) {
          setActiveDrawingNode(null);
          soundEngine.playPencilClick();
        }
        if (measureStartPoint) {
          setMeasureStartPoint(null);
        }
        if (calibratePointA) {
          setCalibratePointA(null);
        }
        if (isMarqueeDragging) {
          setIsMarqueeDragging(false);
          setMarqueeStart(null);
          setMarqueeCurrent(null);
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedWallIds.length > 0) {
          selectedWallIds.forEach((wid) => onDeleteWall(wid));
          setSelectedWallIds([]);
          onSelectWall(null);
        } else if (selectedWallId) {
          onDeleteWall(selectedWallId);
          onSelectWall(null);
        }
        if (selectedOpeningIds.length > 0 && onDeleteOpening) {
          selectedOpeningIds.forEach((oid) => onDeleteOpening(oid));
          setSelectedOpeningIds([]);
          if (onSelectOpening) onSelectOpening(null);
        } else if (selectedOpeningId && onDeleteOpening) {
          onDeleteOpening(selectedOpeningId);
          if (onSelectOpening) onSelectOpening(null);
        }
      }
      if (e.key === 'f' || e.key === 'F') {
        if (selectedOpeningId && onUpdateOpening) {
          const currentOp = openings.find((o) => o.id === selectedOpeningId);
          if (currentOp) {
            onUpdateOpening(selectedOpeningId, { swingFlip: !currentOp.swingFlip });
            soundEngine.playPencilClick();
          }
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        setIsDraggingCanvas(false);
      }
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    activeDrawingNode,
    measureStartPoint,
    calibratePointA,
    selectedWallId,
    selectedWallIds,
    walls,
    openDimensionInputForWall,
    activeEditingDimension,
    isMarqueeDragging,
    selectedOpeningId,
    selectedOpeningIds,
    openings,
    onDeleteWall,
    onSelectWall,
    onDeleteOpening,
    onUpdateOpening,
    onSelectOpening,
  ]);

  // Mouse Wheel Zoom
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseScreenX = e.clientX - rect.left;
    const mouseScreenY = e.clientY - rect.top;

    // Zoom factor: 1.1x per scroll notch
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.909;
    const newZoom = Math.max(0.3, Math.min(4.0, zoom * zoomFactor));

    // Keep world coordinate under mouse cursor stationary
    const mouseWorldX = (mouseScreenX - pan.x) / zoom;
    const mouseWorldY = (mouseScreenY - pan.y) / zoom;

    const newPanX = mouseScreenX - mouseWorldX * newZoom;
    const newPanY = mouseScreenY - mouseWorldY * newZoom;

    onPanZoomChange({ x: newPanX, y: newPanY }, newZoom);
  };

  // Mouse Move
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseScreenX = e.clientX - rect.left;
    const mouseScreenY = e.clientY - rect.top;

    // Handle Pan Dragging (Middle mouse, Right mouse, Space + Left drag, or Pan Tool)
    if (isDraggingCanvas) {
      const dx = mouseScreenX - dragStartScreen.x;
      const dy = mouseScreenY - dragStartScreen.y;
      if (Math.hypot(dx, dy) > 3) {
        didPanWithRightClickRef.current = true;
      }
      onPanZoomChange({ x: dragStartPan.x + dx, y: dragStartPan.y + dy }, zoom);
      return;
    }

    const world = screenToWorld(mouseScreenX, mouseScreenY);
    setCursorWorldPos(world);

    // Handle Marquee Box dragging in Select Tool
    if (isMarqueeDragging && marqueeStart) {
      setMarqueeCurrent(world);
      return;
    }

    // Handle Node dragging in select tool
    if (activeTool === 'select' && draggingNodeId) {
      const processed = getProcessedPoint(world);
      onUpdateNodePosition(draggingNodeId, processed.point);
      return;
    }

    // Hover detection for nodes
    const screenThreshold = 14 / zoom;
    let foundNode: Node | null = null;
    for (const n of nodes) {
      if (getDistance(world, n) < screenThreshold) {
        foundNode = n;
        break;
      }
    }
    setHoveredNode(foundNode);

    const nodeMap = new Map<string, Node>();
    nodes.forEach((n) => nodeMap.set(n.id, n));

    // Hover detection for existing openings
    let foundOpening: WallOpening | null = null;
    for (const op of openings) {
      const parentWall = walls.find((w) => w.id === op.wallId);
      if (parentWall) {
        const n1 = nodeMap.get(parentWall.startNodeId);
        const n2 = nodeMap.get(parentWall.endNodeId);
        if (n1 && n2) {
          const opCenter = {
            x: n1.x + op.positionRatio * (n2.x - n1.x),
            y: n1.y + op.positionRatio * (n2.y - n1.y),
          };
          if (getDistance(world, opCenter) < 16 / zoom) {
            foundOpening = op;
            break;
          }
        }
      }
    }
    setHoveredOpening(foundOpening);

    // Opening Tools (Single Door, Double Door, Sliding Door, Window): Snap opening onto hovered wall
    if (isOpeningTool(activeTool)) {
      let bestWall: Wall | null = null;
      let bestDist = 24 / zoom;
      let bestT = 0.5;
      let bestPt = world;
      let bestN1: Node | null = null;
      let bestN2: Node | null = null;

      for (const w of walls) {
        const n1 = nodeMap.get(w.startNodeId);
        const n2 = nodeMap.get(w.endNodeId);
        if (n1 && n2) {
          const proj = projectPointOntoSegment(world, n1, n2);
          if (proj.distance < bestDist) {
            bestDist = proj.distance;
            bestWall = w;
            bestN1 = n1;
            bestN2 = n2;

            const wallLenPx = getDistance(n1, n2);
            const openWidthM = getDefaultOpeningWidthMeters(activeTool);
            const openWidthPx = metersToPixels(openWidthM, settings.scaleFactor);
            const halfRatio = (openWidthPx / 2) / wallLenPx;

            const minT = Math.min(0.5, halfRatio + 0.02);
            const maxT = Math.max(0.5, 1.0 - halfRatio - 0.02);
            bestT = Math.max(minT, Math.min(maxT, proj.ratio));
            bestPt = {
              x: n1.x + bestT * (n2.x - n1.x),
              y: n1.y + bestT * (n2.y - n1.y),
            };
          }
        }
      }

      if (bestWall && bestN1 && bestN2) {
        setHoveredOpeningWall({
          wall: bestWall,
          t: bestT,
          point: bestPt,
          n1: bestN1,
          n2: bestN2,
          type: activeTool,
        });
        setHoveredWall(bestWall);
      } else {
        setHoveredOpeningWall(null);
        setHoveredWall(null);
      }
      return;
    } else {
      setHoveredOpeningWall(null);
    }

    // Hover detection for walls and closed room polygons
    if (!foundNode && !foundOpening) {
      let foundWall: Wall | null = null;

      for (const w of walls) {
        const n1 = nodeMap.get(w.startNodeId);
        const n2 = nodeMap.get(w.endNodeId);
        if (n1 && n2) {
          const distToSeg = distanceToSegment(world, n1, n2);
          if (distToSeg < 10 / zoom) {
            foundWall = w;
            break;
          }
        }
      }
      setHoveredWall(foundWall);

      if (!foundWall) {
        const room = closedRooms.find((r) => isPointInPolygon(world, r.points));
        setHoveredRoomId(room ? room.id : null);
      } else {
        setHoveredRoomId(null);
      }
    } else {
      setHoveredWall(null);
      setHoveredRoomId(null);
    }

    // Hover detection for wall dimension badges
    const badgeHit = checkDimensionBadgeClick(mouseScreenX, mouseScreenY);
    setHoveredDimensionWallId(badgeHit ? badgeHit.wall.id : null);
  };

  // Mouse Down
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseScreenX = e.clientX - rect.left;
    const mouseScreenY = e.clientY - rect.top;

    // Pan Initiation: Middle click (1), Right click (2), Spacebar is pressed + Left click, or Pan Tool
    if (e.button === 1 || e.button === 2 || isSpacePressed || activeTool === 'pan') {
      e.preventDefault();
      setIsDraggingCanvas(true);
      setDragStartScreen({ x: mouseScreenX, y: mouseScreenY });
      setDragStartPan({ ...pan });
      if (e.button === 2) {
        didPanWithRightClickRef.current = false;
      }
      return;
    }

    if (e.button !== 0) return; // Only primary left clicks below

    // Check if user clicked directly on a dimension label
    const hitBadge = checkDimensionBadgeClick(mouseScreenX, mouseScreenY);
    if (hitBadge && !activeDrawingNode) {
      openDimensionInputForWall(hitBadge.wall);
      return;
    }

    const world = screenToWorld(mouseScreenX, mouseScreenY);

    // OPENING TOOLS (Single Door, Double Door, Sliding Door, Window)
    if (isOpeningTool(activeTool)) {
      if (hoveredOpeningWall && onAddOpening) {
        onAddOpening(
          hoveredOpeningWall.wall.id,
          hoveredOpeningWall.type,
          hoveredOpeningWall.t
        );
      }
      return;
    }

    // 1. SELECT TOOL
    if (activeTool === 'select') {
      if (hoveredOpening) {
        if (onSelectOpening) onSelectOpening(hoveredOpening.id);
        setSelectedOpeningIds([hoveredOpening.id]);
        onSelectWall(null);
        setSelectedWallIds([]);
        setSelectedFurnitureIndices([]);
        if (onSelectRoom) onSelectRoom(null);
        soundEngine.playPencilClick();
      } else if (hoveredNode) {
        setDraggingNodeId(hoveredNode.id);
        if (onSelectOpening) onSelectOpening(null);
        soundEngine.playPencilClick();
      } else if (hoveredWall) {
        onSelectWall(hoveredWall.id);
        setSelectedWallIds([hoveredWall.id]);
        setSelectedOpeningIds([]);
        setSelectedFurnitureIndices([]);
        if (onSelectOpening) onSelectOpening(null);
        if (onSelectRoom) onSelectRoom(null);
        soundEngine.playPencilClick();
      } else if (hoveredRoomId) {
        if (onSelectRoom) onSelectRoom(hoveredRoomId);
        if (onCycleRoomType) onCycleRoomType(hoveredRoomId);
        onSelectWall(null);
        setSelectedWallIds([]);
        setSelectedOpeningIds([]);
        setSelectedFurnitureIndices([]);
        if (onSelectOpening) onSelectOpening(null);
        soundEngine.playWallComplete();
      } else {
        // Clicked on empty canvas space: initiate marquee / box drag selection
        setIsMarqueeDragging(true);
        setMarqueeStart(world);
        setMarqueeCurrent(world);
        onSelectWall(null);
        setSelectedWallIds([]);
        setSelectedOpeningIds([]);
        setSelectedFurnitureIndices([]);
        if (onSelectOpening) onSelectOpening(null);
        if (onSelectRoom) onSelectRoom(null);
      }
      return;
    }

    // 2. WALL DRAFTING TOOL
    if (activeTool === 'wall') {
      const processed = getProcessedPoint(world, activeDrawingNode);
      const clickedPoint = processed.point;

      if (!activeDrawingNode) {
        // Start a new wall chain
        if (processed.snappedNode) {
          setActiveDrawingNode(processed.snappedNode);
          soundEngine.playSnapSound();
        } else {
          // Create new starting node
          const newNode: Node = {
            id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            x: clickedPoint.x,
            y: clickedPoint.y,
          };
          setActiveDrawingNode(newNode);
          soundEngine.playPencilClick();
        }
      } else {
        // Extend wall to clicked point or finish chain
        let endNode: Node;
        const isClosingLoop =
          processed.snappedNode &&
          processed.snappedNode.id === activeDrawingNode.id;

        if (isClosingLoop) {
          // Double clicked or clicked same node -> finish chain
          setActiveDrawingNode(null);
          soundEngine.playWallComplete();
          return;
        }

        if (processed.snappedNode) {
          endNode = processed.snappedNode;
          soundEngine.playSnapSound();
        } else {
          endNode = {
            id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            x: clickedPoint.x,
            y: clickedPoint.y,
          };
          soundEngine.playPencilClick();
        }

        // Add the wall segment!
        onAddWall(activeDrawingNode, endNode);

        // Check if we just closed a loop by connecting to an existing node
        if (processed.snappedNode) {
          soundEngine.playWallComplete();
        }

        // Continue chain from the newly placed/connected node
        setActiveDrawingNode(endNode);
      }
      return;
    }

    // 3. TAPE MEASURE TOOL
    if (activeTool === 'measure') {
      const processed = getProcessedPoint(world);
      if (!measureStartPoint) {
        setMeasureStartPoint(processed.point);
        soundEngine.playPencilClick();
      } else {
        const distPx = getDistance(measureStartPoint, processed.point);
        const distM = pixelsToMeters(distPx, settings.scaleFactor);
        if (onMeasuredDistance) {
          onMeasuredDistance(distM, distPx);
        }
        setMeasureStartPoint(null);
        soundEngine.playWallComplete();
      }
      return;
    }

    // 4. CALIBRATE SCALE TOOL
    if (activeTool === 'calibrate') {
      const processed = getProcessedPoint(world);
      if (!calibratePointA) {
        setCalibratePointA(processed.point);
        soundEngine.playPencilClick();
      } else {
        const distPx = getDistance(calibratePointA, processed.point);
        const distM = pixelsToMeters(distPx, settings.scaleFactor);
        setCalibratePointA(null);
        soundEngine.playWallComplete();
        if (onMeasuredDistance) {
          onMeasuredDistance(distM, distPx);
        }
      }
      return;
    }

    // 5. ERASE TOOL
    if (activeTool === 'erase') {
      if (hoveredOpening && onDeleteOpening) {
        onDeleteOpening(hoveredOpening.id);
        soundEngine.playDeleteSound();
      } else if (hoveredWall) {
        onDeleteWall(hoveredWall.id);
        soundEngine.playDeleteSound();
      } else if (hoveredNode) {
        onDeleteNode(hoveredNode.id);
        soundEngine.playDeleteSound();
      }
      return;
    }
  };

  // Mouse Up
  const handleMouseUp = () => {
    if (isDraggingCanvas) {
      setIsDraggingCanvas(false);
    }
    if (draggingNodeId) {
      setDraggingNodeId(null);
      soundEngine.playPencilClick();
    }

    // Finish Marquee Box Drag Selection (Select Tool)
    if (isMarqueeDragging && marqueeStart && marqueeCurrent) {
      const minX = Math.min(marqueeStart.x, marqueeCurrent.x);
      const maxX = Math.max(marqueeStart.x, marqueeCurrent.x);
      const minY = Math.min(marqueeStart.y, marqueeCurrent.y);
      const maxY = Math.max(marqueeStart.y, marqueeCurrent.y);
      const boxW = maxX - minX;
      const boxH = maxY - minY;

      if (boxW > 3 / zoom || boxH > 3 / zoom) {
        const nodeMap = new Map<string, Node>();
        nodes.forEach((n) => nodeMap.set(n.id, n));

        // 1. Find all walls inside or intersecting the marquee box
        const matchedWallIds: string[] = [];
        walls.forEach((w) => {
          const n1 = nodeMap.get(w.startNodeId);
          const n2 = nodeMap.get(w.endNodeId);
          if (n1 && n2 && doesSegmentIntersectBox(n1, n2, minX, maxX, minY, maxY)) {
            matchedWallIds.push(w.id);
          }
        });

        // 2. Find all openings (doors, windows) inside or intersecting marquee box
        const matchedOpeningIds: string[] = [];
        openings.forEach((op) => {
          const parentWall = walls.find((w) => w.id === op.wallId);
          if (parentWall) {
            const n1 = nodeMap.get(parentWall.startNodeId);
            const n2 = nodeMap.get(parentWall.endNodeId);
            if (n1 && n2) {
              const opCenterX = n1.x + op.positionRatio * (n2.x - n1.x);
              const opCenterY = n1.y + op.positionRatio * (n2.y - n1.y);
              const opW = metersToPixels(op.widthMeters, settings.scaleFactor);
              if (
                doBoxesOverlap(
                  opCenterX - opW / 2,
                  opCenterX + opW / 2,
                  opCenterY - opW / 2,
                  opCenterY + opW / 2,
                  minX,
                  maxX,
                  minY,
                  maxY
                )
              ) {
                matchedOpeningIds.push(op.id);
              }
            }
          }
        });

        // 3. Find all furniture items inside or intersecting marquee box
        const matchedFurniture: number[] = [];
        if (currentLevel?.ghostSvgElements?.furniture) {
          currentLevel.ghostSvgElements.furniture.forEach((f, idx) => {
            if (
              doBoxesOverlap(
                f.x - f.width / 2,
                f.x + f.width / 2,
                f.y - f.height / 2,
                f.y + f.height / 2,
                minX,
                maxX,
                minY,
                maxY
              )
            ) {
              matchedFurniture.push(idx);
            }
          });
        }

        setSelectedWallIds(matchedWallIds);
        setSelectedOpeningIds(matchedOpeningIds);
        setSelectedFurnitureIndices(matchedFurniture);

        // Set primary selection for inspector
        if (matchedWallIds.length > 0) {
          onSelectWall(matchedWallIds[0]);
          if (onSelectOpening) onSelectOpening(null);
          if (onSelectRoom) onSelectRoom(null);
        } else if (matchedOpeningIds.length > 0) {
          onSelectWall(null);
          if (onSelectOpening) onSelectOpening(matchedOpeningIds[0]);
          if (onSelectRoom) onSelectRoom(null);
        } else {
          onSelectWall(null);
          if (onSelectOpening) onSelectOpening(null);
          if (onSelectRoom) onSelectRoom(null);
        }

        if (
          matchedWallIds.length > 0 ||
          matchedOpeningIds.length > 0 ||
          matchedFurniture.length > 0
        ) {
          soundEngine.playPencilClick();
        }
      }

      setIsMarqueeDragging(false);
      setMarqueeStart(null);
      setMarqueeCurrent(null);
    }
  };

  // Double Click finishes active wall chain
  const handleDoubleClick = () => {
    if (activeDrawingNode) {
      setActiveDrawingNode(null);
      soundEngine.playWallComplete();
    }
  };

  // Right click cancels active wall or measurement (or ignores if used for panning)
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (didPanWithRightClickRef.current) {
      didPanWithRightClickRef.current = false;
      return;
    }
    if (activeDrawingNode) {
      setActiveDrawingNode(null);
      soundEngine.playPencilClick();
    }
    if (measureStartPoint) {
      setMeasureStartPoint(null);
    }
    if (calibratePointA) {
      setCalibratePointA(null);
    }
    if (isMarqueeDragging) {
      setIsMarqueeDragging(false);
      setMarqueeStart(null);
      setMarqueeCurrent(null);
    }
  };

  // Cursor style based on active tool and state
  const getCursorClass = () => {
    if (hoveredDimensionWallId) {
      return 'cursor-pointer';
    }
    if (isDraggingCanvas || isSpacePressed || activeTool === 'pan') {
      return isDraggingCanvas ? 'cursor-grabbing' : 'cursor-grab';
    }
    if (isMarqueeDragging) {
      return 'cursor-crosshair';
    }
    if (activeTool === 'wall' || activeTool === 'measure' || activeTool === 'calibrate') {
      return 'cursor-crosshair';
    }
    if (isOpeningTool(activeTool)) {
      return hoveredOpeningWall ? 'cursor-pointer' : 'cursor-crosshair';
    }
    if (activeTool === 'erase') {
      return 'cursor-no-drop';
    }
    if (hoveredNode) {
      return 'cursor-move';
    }
    if (hoveredOpening || hoveredWall || hoveredRoomId) {
      return 'cursor-pointer';
    }
    return 'cursor-default';
  };

  return (
    <div className={`relative w-full h-full overflow-hidden bg-slate-100 ${getCursorClass()}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        onWheel={handleWheel}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      />

      {/* Floating Inline Editable Dimension Input Overlay */}
      {activeEditingDimension && (
        <div
          className="absolute z-40 -translate-x-1/2 -translate-y-1/2 flex items-center bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border-2 border-sky-500 overflow-hidden ring-4 ring-sky-500/20 animate-in zoom-in-95 duration-100 select-auto"
          style={{
            left: worldToScreen(
              activeEditingDimension.badgeWorldPos.x,
              activeEditingDimension.badgeWorldPos.y
            ).x,
            top: worldToScreen(
              activeEditingDimension.badgeWorldPos.x,
              activeEditingDimension.badgeWorldPos.y
            ).y,
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center pl-2 pr-1.5 py-1 gap-1">
            <Pencil className="w-3 h-3 text-sky-500 shrink-0" />
            <input
              ref={dimensionInputRef}
              type="text"
              value={dimensionInputValue}
              onChange={(e) => setDimensionInputValue(e.target.value)}
              onKeyDown={handleDimensionKeyDown}
              onBlur={handleDimensionSubmit}
              className="w-16 px-1.5 py-0.5 text-xs font-mono font-bold text-sky-950 text-right outline-none bg-sky-50 rounded border border-sky-200 focus:bg-white focus:border-sky-500 transition-colors"
              placeholder="0.00"
            />
            <span className="text-xs font-mono font-bold text-sky-700 select-none">
              m
            </span>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleDimensionSubmit();
              }}
              className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
              title="Apply Dimension (Enter)"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                isCancellingRef.current = true;
                setActiveEditingDimension(null);
              }}
              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
              title="Cancel (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Interactive Calibration Guidance Banner */}
      {activeTool === 'calibrate' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-amber-500 text-slate-950 px-4 py-2 rounded-xl shadow-lg border border-amber-300 font-medium text-xs flex items-center gap-2.5 animate-in fade-in slide-in-from-top-2">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-950 animate-ping shrink-0" />
          <span>
            {calibratePointA
              ? 'Click Point 2 on your blueprint to finish reference measurement'
              : 'Scale Calibration: Click Point 1 of a known dimension (e.g. 1.0m door or wall)'}
          </span>
          {calibratePointA && (
            <button
              onClick={() => setCalibratePointA(null)}
              className="ml-2 text-[10px] bg-slate-900 text-white px-2 py-0.5 rounded-md hover:bg-slate-800 transition-colors font-mono"
            >
              Reset Point 1
            </button>
          )}
        </div>
      )}

      {/* Bottom Status HUD: Scale, Cursor position & CAD hint */}
      <div className="absolute left-4 bottom-3 z-10 flex items-center gap-2 select-none pointer-events-none">
        <div className="bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-200/80 shadow-xs flex items-center gap-3 text-xs text-slate-600 font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">X:</span>
            <span>{pixelsToMeters(cursorWorldPos.x, settings.scaleFactor).toFixed(2)}m</span>
            <span className="text-slate-400 ml-1">Y:</span>
            <span>{pixelsToMeters(cursorWorldPos.y, settings.scaleFactor).toFixed(2)}m</span>
          </div>
          <div className="h-3 w-px bg-slate-200" />
          <div className="text-[11px] text-sky-700 font-sans font-medium">
            {hoveredDimensionWallId
              ? 'Click measurement label to edit dimension inline'
              : activeTool === 'wall'
              ? activeDrawingNode
                ? 'Click to place next corner · Esc to finish'
                : 'Click to start drafting wall'
              : activeTool === 'door'
              ? hoveredOpeningWall
                ? 'Click wall to place Single Door · F to flip swing'
                : 'Hover over any wall segment to snap Single Door'
              : activeTool === 'double-door'
              ? hoveredOpeningWall
                ? 'Click wall to place Double Door · F to flip swing'
                : 'Hover over any wall segment to snap Double Door'
              : activeTool === 'sliding-door'
              ? hoveredOpeningWall
                ? 'Click wall to place Sliding Door'
                : 'Hover over any wall segment to snap Sliding Door'
              : activeTool === 'window'
              ? hoveredOpeningWall
                ? 'Click wall to place Window'
                : 'Hover over any wall segment to snap Window'
              : activeTool === 'measure'
              ? 'Click two points to measure distance'
              : activeTool === 'select'
              ? 'Click element · Drag empty space for Box Select · Type numbers to set length'
              : activeTool === 'erase'
              ? 'Click wall, opening, or node to delete'
              : 'Pan canvas'}
          </div>
        </div>

        {/* Quick hint for Spacebar & Shift & Pan */}
        <div className="hidden lg:flex items-center gap-1 text-[11px] text-slate-400 bg-white/70 backdrop-blur-xs px-2.5 py-1 rounded-md border border-slate-200/50 font-sans">
          <span>Middle/Right/Space+Drag to Pan</span>
          <span>·</span>
          <span>Shift to Clamp</span>
          <span>·</span>
          <span>Type numbers to set length</span>
        </div>
      </div>
    </div>
  );
};

// Helper: Distance from point to line segment
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return getDistance(p, a);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return getDistance(p, {
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y),
  });
}

// Helper: Checks if segment AB intersects axis-aligned bounding box [minX, maxX, minY, maxY]
function doesSegmentIntersectBox(
  p1: Point,
  p2: Point,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number
): boolean {
  // 1. Either endpoint inside
  if (p1.x >= minX && p1.x <= maxX && p1.y >= minY && p1.y <= maxY) return true;
  if (p2.x >= minX && p2.x <= maxX && p2.y >= minY && p2.y <= maxY) return true;

  // 2. Both endpoints on same outer side -> cannot intersect
  if (p1.x < minX && p2.x < minX) return false;
  if (p1.x > maxX && p2.x > maxX) return false;
  if (p1.y < minY && p2.y < minY) return false;
  if (p1.y > maxY && p2.y > maxY) return false;

  // 3. Line-segment intersection with each of the 4 box edges
  const linesIntersect = (a: Point, b: Point, c: Point, d: Point) => {
    const ccw = (p: Point, q: Point, r: Point) =>
      (r.y - p.y) * (q.x - p.x) > (q.y - p.y) * (r.x - p.x);
    return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
  };

  const topLeft = { x: minX, y: minY };
  const topRight = { x: maxX, y: minY };
  const bottomLeft = { x: minX, y: maxY };
  const bottomRight = { x: maxX, y: maxY };

  return (
    linesIntersect(p1, p2, topLeft, topRight) ||
    linesIntersect(p1, p2, topRight, bottomRight) ||
    linesIntersect(p1, p2, bottomRight, bottomLeft) ||
    linesIntersect(p1, p2, bottomLeft, topLeft)
  );
}

// Helper: Checks if two axis-aligned bounding boxes overlap
function doBoxesOverlap(
  b1MinX: number,
  b1MaxX: number,
  b1MinY: number,
  b1MaxY: number,
  b2MinX: number,
  b2MaxX: number,
  b2MinY: number,
  b2MaxY: number
): boolean {
  return (
    b1MinX <= b2MaxX &&
    b1MaxX >= b2MinX &&
    b1MinY <= b2MaxY &&
    b1MaxY >= b2MinY
  );
}

