import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Point,
  Node,
  Wall,
  WallOpening,
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
    type: 'door' | 'window',
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
    type: 'door' | 'window';
  } | null>(null);

  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStartScreen, setDragStartScreen] = useState<Point>({ x: 0, y: 0 });
  const [dragStartPan, setDragStartPan] = useState<Point>({ x: 0, y: 0 });

  // Moving node in select mode
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);

  // Tape Measure & Calibration tool state
  const [measureStartPoint, setMeasureStartPoint] = useState<Point | null>(null);
  const [calibratePointA, setCalibratePointA] = useState<Point | null>(null);

  // Closed rooms for visual fills
  const [closedRooms, setClosedRooms] = useState<ClosedRoom[]>([]);

  // Update closed rooms whenever geometry changes
  useEffect(() => {
    const rooms = detectClosedRooms(nodes, walls, settings.scaleFactor, customRoomTypes);
    setClosedRooms(rooms);
  }, [nodes, walls, settings.scaleFactor, customRoomTypes]);

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
      currentLevel.ghostSvgElements.furniture.forEach((f) => {
        ctx.save();
        ctx.translate(f.x, f.y);
        if (f.angle) ctx.rotate((f.angle * Math.PI) / 180);
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 1.2 / zoom;
        ctx.fillStyle = 'rgba(224, 242, 254, 0.4)';
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

      const isSelected = selectedWallId === w.id;
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
          const dimText = formatMeters(wallDistMeters);
          ctx.font = `600 ${Math.max(10, 11 / zoom)}px "Fira Code", monospace`;
          const metrics = ctx.measureText(dimText);
          const padX = 6 / zoom;
          const padY = 3 / zoom;
          const badgeW = metrics.width + padX * 2;
          const badgeH = 16 / zoom;
          const badgeX = midX + nx * offsetDist - badgeW / 2;
          const badgeY = midY + ny * offsetDist - badgeH / 2;

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3 / zoom);
          ctx.fill();
          ctx.strokeStyle = isSelected ? '#0284c7' : '#bae6fd';
          ctx.lineWidth = 1 / zoom;
          ctx.stroke();

          ctx.fillStyle = isSelected ? '#0369a1' : '#0284c7';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(dimText, midX + nx * offsetDist, midY + ny * offsetDist);
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

        // 2. Draw openings: Doors with 2D swing arcs & Windows with glass panes
        breakdown.openings.forEach((op) => {
          const isOpSelected = selectedOpeningId === op.opening.id;
          const isOpHovered = hoveredOpening?.id === op.opening.id;
          const p1 = op.startPt;
          const p2 = op.endPt;
          const nx = breakdown.normal.x;
          const ny = breakdown.normal.y;
          const flip = op.opening.swingFlip ? -1 : 1;

          if (op.opening.type === 'door') {
            // Door jamb boundary ticks
            [p1, p2].forEach((pt) => {
              ctx.beginPath();
              ctx.moveTo(
                pt.x - nx * (wallThicknessPx / 2),
                pt.y - ny * (wallThicknessPx / 2)
              );
              ctx.lineTo(
                pt.x + nx * (wallThicknessPx / 2),
                pt.y + ny * (wallThicknessPx / 2)
              );
              ctx.strokeStyle = isOpSelected ? '#0284c7' : '#0f172a';
              ctx.lineWidth = (isOpSelected ? 2.5 : 1.5) / zoom;
              ctx.stroke();
            });

            // Door Hinge & Strike
            const hinge = op.opening.swingDirection === 'right' ? p2 : p1;
            const strike = op.opening.swingDirection === 'right' ? p1 : p2;
            const leafEnd = {
              x: hinge.x + nx * op.widthPx * flip,
              y: hinge.y + ny * op.widthPx * flip,
            };

            // Translucent swing sweep arc
            const radius = op.widthPx;
            const startAngle = Math.atan2(strike.y - hinge.y, strike.x - hinge.x);
            const endAngle = Math.atan2(leafEnd.y - hinge.y, leafEnd.x - hinge.x);

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

            // Door swing quarter-circle arc line
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

            // Door label tag
            const doorTag = `${op.widthMeters.toFixed(2)}m Door`;
            ctx.font = `600 ${Math.max(9, 10 / zoom)}px "Fira Code", monospace`;
            const dMetrics = ctx.measureText(doorTag);
            const dW = dMetrics.width + 10 / zoom;
            const dH = 15 / zoom;
            ctx.fillStyle = isOpSelected ? '#0284c7' : '#ffffff';
            ctx.beginPath();
            ctx.roundRect(op.centerPt.x - dW / 2, op.centerPt.y - dH / 2, dW, dH, 3 / zoom);
            ctx.fill();
            ctx.strokeStyle = isOpSelected ? '#0284c7' : '#bae6fd';
            ctx.lineWidth = 1 / zoom;
            ctx.stroke();
            ctx.fillStyle = isOpSelected ? '#ffffff' : '#0369a1';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(doorTag, op.centerPt.x, op.centerPt.y);
          } else {
            // Window symbol: jamb ticks, frame, and double cyan glass pane lines
            [p1, p2].forEach((pt) => {
              ctx.beginPath();
              ctx.moveTo(
                pt.x - nx * (wallThicknessPx / 2),
                pt.y - ny * (wallThicknessPx / 2)
              );
              ctx.lineTo(
                pt.x + nx * (wallThicknessPx / 2),
                pt.y + ny * (wallThicknessPx / 2)
              );
              ctx.strokeStyle = isOpSelected ? '#0284c7' : '#0f172a';
              ctx.lineWidth = (isOpSelected ? 2.5 : 1.5) / zoom;
              ctx.stroke();
            });

            // Outer frame/sill lines
            const halfThick = wallThicknessPx / 2;
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

            // Window label tag
            const winTag = `${op.widthMeters.toFixed(2)}m Window`;
            ctx.font = `600 ${Math.max(9, 10 / zoom)}px "Fira Code", monospace`;
            const wMetrics = ctx.measureText(winTag);
            const wW = wMetrics.width + 10 / zoom;
            const wH = 15 / zoom;
            ctx.fillStyle = isOpSelected ? '#0284c7' : '#ffffff';
            ctx.beginPath();
            ctx.roundRect(op.centerPt.x - wW / 2, op.centerPt.y - wH / 2, wW, wH, 3 / zoom);
            ctx.fill();
            ctx.strokeStyle = isOpSelected ? '#0284c7' : '#bae6fd';
            ctx.lineWidth = 1 / zoom;
            ctx.stroke();
            ctx.fillStyle = isOpSelected ? '#ffffff' : '#0369a1';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(winTag, op.centerPt.x, op.centerPt.y);
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

    // 2E.3: Live Hover Ghost Preview for Door and Window Opening Tool
    if ((activeTool === 'door' || activeTool === 'window') && hoveredOpeningWall) {
      const hw = hoveredOpeningWall;
      const previewWidthM = hw.type === 'door' ? 0.9 : 1.2;
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

      if (hw.type === 'door') {
        // Ghost door leaf & swing arc
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
    selectedOpeningId,
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
      if (e.code === 'Space') {
        setIsSpacePressed(true);
      }
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
      if (e.key === 'Escape') {
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
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedWallId) {
          onDeleteWall(selectedWallId);
          onSelectWall(null);
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
  }, [activeDrawingNode, measureStartPoint, selectedWallId, onDeleteWall, onSelectWall]);

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

    // Handle Pan Dragging (Middle mouse or Space + Left drag)
    if (isDraggingCanvas) {
      const dx = mouseScreenX - dragStartScreen.x;
      const dy = mouseScreenY - dragStartScreen.y;
      onPanZoomChange({ x: dragStartPan.x + dx, y: dragStartPan.y + dy }, zoom);
      return;
    }

    const world = screenToWorld(mouseScreenX, mouseScreenY);
    setCursorWorldPos(world);

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

    // Door or Window Tool: Snap opening onto hovered wall
    if (activeTool === 'door' || activeTool === 'window') {
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
            const openWidthM = activeTool === 'door' ? 0.9 : 1.2;
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
  };

  // Mouse Down
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseScreenX = e.clientX - rect.left;
    const mouseScreenY = e.clientY - rect.top;

    // Pan Initiation: Middle click OR Space is held OR Pan Tool is active
    if (e.button === 1 || isSpacePressed || activeTool === 'pan') {
      e.preventDefault();
      setIsDraggingCanvas(true);
      setDragStartScreen({ x: mouseScreenX, y: mouseScreenY });
      setDragStartPan({ ...pan });
      return;
    }

    if (e.button !== 0) return; // Only primary left clicks below

    const world = screenToWorld(mouseScreenX, mouseScreenY);

    // DOOR OR WINDOW TOOL
    if (activeTool === 'door' || activeTool === 'window') {
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
        onSelectWall(null);
        if (onSelectRoom) onSelectRoom(null);
        soundEngine.playPencilClick();
      } else if (hoveredNode) {
        setDraggingNodeId(hoveredNode.id);
        if (onSelectOpening) onSelectOpening(null);
        soundEngine.playPencilClick();
      } else if (hoveredWall) {
        onSelectWall(hoveredWall.id);
        if (onSelectOpening) onSelectOpening(null);
        if (onSelectRoom) onSelectRoom(null);
        soundEngine.playPencilClick();
      } else if (hoveredRoomId) {
        if (onSelectRoom) onSelectRoom(hoveredRoomId);
        if (onCycleRoomType) onCycleRoomType(hoveredRoomId);
        onSelectWall(null);
        if (onSelectOpening) onSelectOpening(null);
        soundEngine.playWallComplete();
      } else {
        onSelectWall(null);
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
  };

  // Double Click finishes active wall chain
  const handleDoubleClick = () => {
    if (activeDrawingNode) {
      setActiveDrawingNode(null);
      soundEngine.playWallComplete();
    }
  };

  // Right click cancels active wall or measurement
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
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
  };

  // Cursor style based on active tool and state
  const getCursorClass = () => {
    if (isDraggingCanvas || isSpacePressed || activeTool === 'pan') {
      return isDraggingCanvas ? 'cursor-grabbing' : 'cursor-grab';
    }
    if (activeTool === 'wall' || activeTool === 'measure' || activeTool === 'calibrate') {
      return 'cursor-crosshair';
    }
    if (activeTool === 'door' || activeTool === 'window') {
      return hoveredOpeningWall ? 'cursor-pointer' : 'cursor-crosshair';
    }
    if (activeTool === 'erase') {
      return 'cursor-no-drop';
    }
    if (hoveredOpening || hoveredNode || hoveredWall || hoveredRoomId) {
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
            {activeTool === 'wall'
              ? activeDrawingNode
                ? 'Click to place next corner · Esc to finish'
                : 'Click to start drafting wall'
              : activeTool === 'door'
              ? hoveredOpeningWall
                ? 'Click wall to place door opening · F to flip swing'
                : 'Hover over any wall segment to snap door opening'
              : activeTool === 'window'
              ? hoveredOpeningWall
                ? 'Click wall to place window opening'
                : 'Hover over any wall segment to snap window opening'
              : activeTool === 'measure'
              ? 'Click two points to measure distance'
              : activeTool === 'select'
              ? 'Click to select element or drag corner node'
              : activeTool === 'erase'
              ? 'Click wall, opening, or node to delete'
              : 'Pan canvas'}
          </div>
        </div>

        {/* Quick hint for Spacebar & Shift */}
        <div className="hidden lg:flex items-center gap-1 text-[11px] text-slate-400 bg-white/70 backdrop-blur-xs px-2.5 py-1 rounded-md border border-slate-200/50 font-sans">
          <span>Space+Drag to Pan</span>
          <span>·</span>
          <span>Shift to Clamp 45°/90°</span>
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
