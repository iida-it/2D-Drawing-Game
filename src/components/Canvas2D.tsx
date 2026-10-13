import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Point,
  Node,
  Wall,
  ToolType,
  BlueprintLevel,
  DraftingSettings,
  ClosedRoom,
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
} from '../utils/geometry';
import { soundEngine } from '../utils/audio';

interface Canvas2DProps {
  currentLevel: BlueprintLevel;
  nodes: Node[];
  walls: Wall[];
  activeTool: ToolType;
  settings: DraftingSettings;
  selectedWallId: string | null;
  onSelectWall: (wallId: string | null) => void;
  onAddWall: (startNode: Node, endNode: Node) => void;
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
  nodes,
  walls,
  activeTool,
  settings,
  selectedWallId,
  onSelectWall,
  onAddWall,
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
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStartScreen, setDragStartScreen] = useState<Point>({ x: 0, y: 0 });
  const [dragStartPan, setDragStartPan] = useState<Point>({ x: 0, y: 0 });

  // Moving node in select mode
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);

  // Tape Measure tool state
  const [measureStartPoint, setMeasureStartPoint] = useState<Point | null>(null);

  // Closed rooms for visual fills
  const [closedRooms, setClosedRooms] = useState<ClosedRoom[]>([]);

  // Update closed rooms whenever geometry changes
  useEffect(() => {
    const rooms = detectClosedRooms(nodes, walls, settings.scaleFactor);
    setClosedRooms(rooms);
  }, [nodes, walls, settings.scaleFactor]);

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

      // Draw Blueprint Reference Rooms / Floor Base
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

      ctx.restore();
    }

    // -------------------------------------------------------------
    // LAYER 2: VECTOR USER DRAFTING LAYER
    // -------------------------------------------------------------

    // 2A: Closed Rooms Polygons Fill & Area Label
    closedRooms.forEach((r) => {
      ctx.beginPath();
      r.points.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.closePath();
      // Subtle architectural room tint
      ctx.fillStyle = 'rgba(2, 132, 199, 0.08)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(2, 132, 199, 0.3)';
      ctx.lineWidth = 1 / zoom;
      ctx.stroke();

      // Room Area Badge
      const text = `${r.areaMetersSq.toFixed(2)} m²`;
      ctx.font = `600 ${Math.max(11, 12 / zoom)}px "Fira Code", monospace`;
      const textMetrics = ctx.measureText(text);
      const badgeW = textMetrics.width + 16 / zoom;
      const badgeH = 22 / zoom;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.beginPath();
      ctx.roundRect(
        r.centroid.x - badgeW / 2,
        r.centroid.y - badgeH / 2,
        badgeW,
        badgeH,
        4 / zoom
      );
      ctx.fill();
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1 / zoom;
      ctx.stroke();

      ctx.fillStyle = '#0369a1';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, r.centroid.x, r.centroid.y);
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

      // Wall Core Segment
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

      // Compute normal vector for dimension line offset
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

    // 2F: Cursor Snapping Crosshairs
    if (activeTool === 'wall' || activeTool === 'measure') {
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
    activeTool,
    settings,
    selectedWallId,
    hoveredWall,
    hoveredNode,
    activeDrawingNode,
    cursorWorldPos,
    measureStartPoint,
    closedRooms,
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

    // Hover detection for walls
    if (!foundNode) {
      const nodeMap = new Map<string, Node>();
      nodes.forEach((n) => nodeMap.set(n.id, n));
      let foundWall: Wall | null = null;

      for (const w of walls) {
        const n1 = nodeMap.get(w.startNodeId);
        const n2 = nodeMap.get(w.endNodeId);
        if (n1 && n2) {
          // Check distance to line segment
          const distToSeg = distanceToSegment(world, n1, n2);
          if (distToSeg < 10 / zoom) {
            foundWall = w;
            break;
          }
        }
      }
      setHoveredWall(foundWall);
    } else {
      setHoveredWall(null);
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

    // 1. SELECT TOOL
    if (activeTool === 'select') {
      if (hoveredNode) {
        setDraggingNodeId(hoveredNode.id);
        soundEngine.playPencilClick();
      } else if (hoveredWall) {
        onSelectWall(hoveredWall.id);
        soundEngine.playPencilClick();
      } else {
        onSelectWall(null);
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
      }
      return;
    }

    // 5. ERASE TOOL
    if (activeTool === 'erase') {
      if (hoveredWall) {
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
  };

  // Cursor style based on active tool and state
  const getCursorClass = () => {
    if (isDraggingCanvas || isSpacePressed || activeTool === 'pan') {
      return isDraggingCanvas ? 'cursor-grabbing' : 'cursor-grab';
    }
    if (activeTool === 'wall' || activeTool === 'measure' || activeTool === 'calibrate') {
      return 'cursor-crosshair';
    }
    if (activeTool === 'erase') {
      return 'cursor-no-drop';
    }
    if (hoveredNode || hoveredWall) {
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
              : activeTool === 'measure'
              ? 'Click two points to measure distance'
              : activeTool === 'select'
              ? 'Click to select or drag node to adjust'
              : activeTool === 'erase'
              ? 'Click segment or node to delete'
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
