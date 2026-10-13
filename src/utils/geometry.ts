import { Point, Node, Wall, WallOpening, ClosedRoom, RoomType, BlueprintLevel, ValidationResult } from '../types';

/** Distance between two points in coordinate units */
export function getDistance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.hypot(dx, dy);
}

/** Angle in degrees from p1 to p2 (-180 to 180) */
export function getAngleDegrees(p1: Point, p2: Point): number {
  const radians = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  let degrees = radians * (180 / Math.PI);
  if (degrees < 0) degrees += 360;
  return degrees;
}

/** Converts pixel distance to meters based on scale factor */
export function pixelsToMeters(pxDistance: number, scaleFactor: number): number {
  return pxDistance * scaleFactor;
}

/** Converts meters to pixel distance */
export function metersToPixels(meters: number, scaleFactor: number): number {
  return meters / scaleFactor;
}

/** Format meters to clean architectural string e.g. "4.20 m" */
export function formatMeters(meters: number): string {
  return `${meters.toFixed(2)} m`;
}

/** Format square meters e.g. "24.50 m²" */
export function formatArea(areaM2: number): string {
  return `${areaM2.toFixed(2)} m²`;
}

/**
 * Snap point to 0°, 45°, 90°, 135°, 180°, etc. relative to start point
 */
export function clampOrthoAngle(start: Point, current: Point): Point {
  const dist = getDistance(start, current);
  if (dist < 1e-4) return current;

  const rawRad = Math.atan2(current.y - start.y, current.x - start.x);
  let rawDeg = rawRad * (180 / Math.PI);
  if (rawDeg < 0) rawDeg += 360;

  // Allowed snaps: 0, 45, 90, 135, 180, 225, 270, 315, 360
  const step = 45;
  const snappedDeg = Math.round(rawDeg / step) * step;
  const snappedRad = (snappedDeg * Math.PI) / 180;

  return {
    x: start.x + dist * Math.cos(snappedRad),
    y: start.y + dist * Math.sin(snappedRad),
  };
}

/**
 * Snap point to grid (e.g., 0.10m = 5px when scale is 0.02)
 */
export function snapToGrid(point: Point, gridPixels: number): Point {
  return {
    x: Math.round(point.x / gridPixels) * gridPixels,
    y: Math.round(point.y / gridPixels) * gridPixels,
  };
}

/**
 * Check for alignment with existing nodes (Horizontal or Vertical alignment)
 */
export interface AlignmentGuide {
  type: 'x' | 'y';
  value: number;
  fromNode: Node;
}

export function findAxialAlignments(
  point: Point,
  nodes: Node[],
  threshold: number,
  excludeNodeIds: string[] = []
): { snappedPoint: Point; guides: AlignmentGuide[] } {
  let bestX = point.x;
  let bestY = point.y;
  let minDiffX = threshold;
  let minDiffY = threshold;
  const guides: AlignmentGuide[] = [];

  for (const n of nodes) {
    if (excludeNodeIds.includes(n.id)) continue;

    // Check vertical alignment (matching X)
    const diffX = Math.abs(point.x - n.x);
    if (diffX < minDiffX) {
      minDiffX = diffX;
      bestX = n.x;
      guides.push({ type: 'x', value: n.x, fromNode: n });
    }

    // Check horizontal alignment (matching Y)
    const diffY = Math.abs(point.y - n.y);
    if (diffY < minDiffY) {
      minDiffY = diffY;
      bestY = n.y;
      guides.push({ type: 'y', value: n.y, fromNode: n });
    }
  }

  return {
    snappedPoint: { x: bestX, y: bestY },
    guides,
  };
}

/**
 * Calculate polygon area using Shoelace formula (signed area)
 */
export function calculatePolygonArea(points: Point[], scaleFactor: number): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  const pixelArea = Math.abs(area) / 2;
  // Convert square pixels to square meters: scaleFactor^2
  return pixelArea * (scaleFactor * scaleFactor);
}

export const ROOM_THEMES: Record<
  RoomType,
  {
    name: string;
    fillColor: string;
    borderColor: string;
    tagBgColor: string;
    tagTextColor: string;
  }
> = {
  living: {
    name: 'Living Room',
    fillColor: 'rgba(186, 230, 253, 0.40)', // Pastel Light Blue
    borderColor: '#0284c7',
    tagBgColor: '#e0f2fe',
    tagTextColor: '#0369a1',
  },
  bedroom: {
    name: 'Bedroom',
    fillColor: 'rgba(187, 247, 208, 0.40)', // Pastel Light Green
    borderColor: '#16a34a',
    tagBgColor: '#dcfce7',
    tagTextColor: '#15803d',
  },
  kitchen: {
    name: 'Kitchen',
    fillColor: 'rgba(254, 240, 138, 0.40)', // Pastel Warm Yellow / Peach
    borderColor: '#d97706',
    tagBgColor: '#fef9c3',
    tagTextColor: '#b45309',
  },
  bathroom: {
    name: 'Bathroom',
    fillColor: 'rgba(204, 251, 241, 0.40)', // Pastel Mint / Teal
    borderColor: '#0d9488',
    tagBgColor: '#ccfbf1',
    tagTextColor: '#0f766e',
  },
  office: {
    name: 'Office',
    fillColor: 'rgba(233, 213, 255, 0.40)', // Pastel Lavender / Purple
    borderColor: '#9333ea',
    tagBgColor: '#f3e8ff',
    tagTextColor: '#7e22ce',
  },
  dining: {
    name: 'Dining Room',
    fillColor: 'rgba(254, 215, 170, 0.40)', // Pastel Apricot
    borderColor: '#ea580c',
    tagBgColor: '#ffedd5',
    tagTextColor: '#c2410c',
  },
};

/**
 * Check if a 2D point is inside an arbitrary polygon (Ray-casting test)
 */
export function isPointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function calculateCentroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  return { x: cx / points.length, y: cy / points.length };
}

/**
 * True geometric centroid of arbitrary 2D polygon using Green's Theorem
 */
export function calculatePolygonCentroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  if (points.length === 2)
    return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };

  let signedArea = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const factor = points[i].x * points[j].y - points[j].x * points[i].y;
    signedArea += factor;
    cx += (points[i].x + points[j].x) * factor;
    cy += (points[i].y + points[j].y) * factor;
  }

  signedArea *= 0.5;
  if (Math.abs(signedArea) < 1e-4) {
    return calculateCentroid(points);
  }

  cx = cx / (6 * signedArea);
  cy = cy / (6 * signedArea);
  return { x: cx, y: cy };
}

/**
 * Canonical minimum string of a cycle to avoid duplicate cycles from different start nodes or directions
 */
function getCanonicalCycleKey(cycle: string[]): string {
  const n = cycle.length;
  let minStr = '';

  for (let i = 0; i < n; i++) {
    const rot: string[] = [];
    for (let j = 0; j < n; j++) {
      rot.push(cycle[(i + j) % n]);
    }
    const str = rot.join('|');
    if (!minStr || str < minStr) minStr = str;
  }

  const rev = [...cycle].reverse();
  for (let i = 0; i < n; i++) {
    const rot: string[] = [];
    for (let j = 0; j < n; j++) {
      rot.push(rev[(i + j) % n]);
    }
    const str = rot.join('|');
    if (str < minStr) minStr = str;
  }

  return minStr;
}

/**
 * Automatically determine room type and pastel theme based on area and sequence
 */
export function getRoomTypeFromArea(
  areaM2: number,
  index: number,
  totalRooms: number
): RoomType {
  if (areaM2 >= 18) {
    return 'living';
  } else if (areaM2 >= 9.5) {
    return index % 2 === 0 ? 'bedroom' : 'office';
  } else if (areaM2 >= 5.0) {
    return index % 2 === 0 ? 'kitchen' : 'dining';
  } else {
    return 'bathroom';
  }
}

/**
 * Detect closed loops/cycles in the wall graph to identify rooms
 */
export function detectClosedRooms(
  nodes: Node[],
  walls: Wall[],
  scaleFactor: number,
  customRoomTypes: Record<string, RoomType> = {}
): ClosedRoom[] {
  if (walls.length < 3) return [];

  const nodeMap = new Map<string, Node>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  // Build adjacency graph with ordered neighbor lists
  const adj = new Map<string, string[]>();
  walls.forEach((w) => {
    if (!adj.has(w.startNodeId)) adj.set(w.startNodeId, []);
    if (!adj.has(w.endNodeId)) adj.set(w.endNodeId, []);
    adj.get(w.startNodeId)!.push(w.endNodeId);
    adj.get(w.endNodeId)!.push(w.startNodeId);
  });

  const rooms: ClosedRoom[] = [];
  const visitedCycles = new Set<string>();

  // Find simple cycles using DFS (cycles of length 3..14)
  function findCycles(
    currentNodeId: string,
    startNodeId: string,
    path: string[],
    visited: Set<string>
  ) {
    if (path.length > 14) return;

    const neighbors = adj.get(currentNodeId) || [];
    for (const nextId of neighbors) {
      if (path.length >= 2 && nextId === path[path.length - 2]) {
        continue;
      }

      if (nextId === startNodeId && path.length >= 3) {
        const cycleIds = [...path];
        const canonicalKey = getCanonicalCycleKey(cycleIds);

        if (!visitedCycles.has(canonicalKey)) {
          visitedCycles.add(canonicalKey);

          const points = cycleIds
            .map((id) => nodeMap.get(id))
            .filter((n): n is Node => Boolean(n))
            .map((n) => ({ x: n.x, y: n.y }));

          const areaM2 = calculatePolygonArea(points, scaleFactor);

          // Calculate perimeter
          let perimeterM = 0;
          for (let pIdx = 0; pIdx < points.length; pIdx++) {
            const nextP = points[(pIdx + 1) % points.length];
            perimeterM += pixelsToMeters(getDistance(points[pIdx], nextP), scaleFactor);
          }

          // Filter out tiny sliver polygons (< 0.2 m²)
          if (areaM2 >= 0.25) {
            const roomId = `room-${rooms.length + 1}`;
            const centroid = calculatePolygonCentroid(points);

            rooms.push({
              id: roomId,
              name: '',
              roomType: 'living', // Will be classified after sorting
              nodeIds: cycleIds,
              points,
              areaMetersSq: Math.round(areaM2 * 100) / 100,
              perimeterMeters: Math.round(perimeterM * 100) / 100,
              centroid,
              fillColor: '',
              borderColor: '',
              tagBgColor: '',
              tagTextColor: '',
            });
          }
        }
        continue;
      }

      if (!visited.has(nextId)) {
        visited.add(nextId);
        path.push(nextId);
        findCycles(nextId, startNodeId, path, visited);
        path.pop();
        visited.delete(nextId);
      }
    }
  }

  const allNodeIds = Array.from(adj.keys());
  for (const startId of allNodeIds) {
    const visited = new Set<string>([startId]);
    findCycles(startId, startId, [startId], visited);
  }

  // Sort rooms by area ascending (inner partitions first)
  rooms.sort((a, b) => a.areaMetersSq - b.areaMetersSq);

  // If there are multiple rooms, filter out outer envelop union cycle if composite
  // (e.g. if room A + room B = room C envelope, drop room C so only individual rooms are shaded)
  const filteredRooms: ClosedRoom[] = [];
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    // Check if this larger room completely covers the union of smaller rooms
    let isCompositeUnion = false;
    if (i > 0 && r.areaMetersSq > 2.0) {
      const sumSmaller = filteredRooms.reduce((sum, fr) => sum + fr.areaMetersSq, 0);
      if (filteredRooms.length >= 2 && Math.abs(r.areaMetersSq - sumSmaller) < 0.5) {
        isCompositeUnion = true;
      }
    }
    if (!isCompositeUnion) {
      filteredRooms.push(r);
    }
  }

  // Assign Room Types & Pastel Color Themes
  const typeCount: Record<string, number> = {};

  filteredRooms.forEach((r, idx) => {
    const roomType =
      customRoomTypes[r.id] ||
      getRoomTypeFromArea(r.areaMetersSq, idx, filteredRooms.length);
    const theme = ROOM_THEMES[roomType];

    typeCount[roomType] = (typeCount[roomType] || 0) + 1;
    const count = typeCount[roomType];
    const roomDisplayName = count > 1 ? `${theme.name} ${count}` : theme.name;

    r.roomType = roomType;
    r.name = roomDisplayName;
    r.fillColor = theme.fillColor;
    r.borderColor = theme.borderColor;
    r.tagBgColor = theme.tagBgColor;
    r.tagTextColor = theme.tagTextColor;
  });

  return filteredRooms;
}

/**
 * Validate player's draft against level requirements
 */
export function validateDraft(
  nodes: Node[],
  walls: Wall[],
  level: BlueprintLevel,
  scaleFactor: number
): ValidationResult {
  const nodeMap = new Map<string, Node>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  // Compute total drawn perimeter/wall length in meters
  let totalDrawnPerimeterMeters = 0;
  const drawnLengths: number[] = [];

  walls.forEach((w) => {
    const n1 = nodeMap.get(w.startNodeId);
    const n2 = nodeMap.get(w.endNodeId);
    if (n1 && n2) {
      const lenMeters = pixelsToMeters(getDistance(n1, n2), scaleFactor);
      totalDrawnPerimeterMeters += lenMeters;
      drawnLengths.push(lenMeters);
    }
  });

  const rooms = detectClosedRooms(nodes, walls, scaleFactor);
  const totalDrawnAreaMetersSq = rooms.reduce((sum, r) => sum + r.areaMetersSq, 0);

  const targetPerimeter = level.targetSpecs.totalPerimeterMeters;
  const targetArea = level.targetSpecs.totalAreaMetersSq;
  const tolerance = level.targetSpecs.toleranceMeters;

  // Perimeter accuracy
  const perimeterDelta = Math.abs(totalDrawnPerimeterMeters - targetPerimeter);
  const perimeterAccuracy = Math.max(
    0,
    Math.min(100, (1 - perimeterDelta / Math.max(targetPerimeter, 1)) * 100)
  );

  // Area accuracy
  const areaDelta = Math.abs(totalDrawnAreaMetersSq - targetArea);
  const areaAccuracy =
    targetArea > 0
      ? Math.max(0, Math.min(100, (1 - areaDelta / targetArea) * 100))
      : 100;

  // Wall segment matching accuracy
  // Match each reference wall to the closest drawn wall
  let totalLengthError = 0;
  const targetWalls = level.referenceWalls;

  targetWalls.forEach((ref) => {
    let closestDiff = 999;
    drawnLengths.forEach((dLen) => {
      const diff = Math.abs(dLen - ref.lengthMeters);
      if (diff < closestDiff) {
        closestDiff = diff;
      }
    });
    totalLengthError += closestDiff < 999 ? closestDiff : ref.lengthMeters;
  });

  const avgLengthError = targetWalls.length > 0 ? totalLengthError / targetWalls.length : 0;
  const lengthAccuracy = Math.max(
    0,
    Math.min(100, (1 - avgLengthError / 2.0) * 100)
  );

  // Blended overall score
  let weightedScore = 0;
  if (targetArea > 0) {
    weightedScore = perimeterAccuracy * 0.35 + areaAccuracy * 0.45 + lengthAccuracy * 0.20;
  } else {
    weightedScore = perimeterAccuracy * 0.6 + lengthAccuracy * 0.4;
  }

  // Bonus/penalty for closed rooms
  const targetRoomCount = level.targetSpecs.roomTargets.length;
  if (targetRoomCount > 0 && rooms.length === 0) {
    weightedScore = Math.min(weightedScore, 58); // Cap if room perimeter is unclosed
  }

  const scorePercent = Math.round(Math.max(0, Math.min(100, weightedScore)) * 10) / 10;

  // Determine Stars (1 to 3)
  let stars = 0;
  if (scorePercent >= 94) {
    stars = 3;
  } else if (scorePercent >= 84) {
    stars = 2;
  } else if (scorePercent >= 68) {
    stars = 1;
  }

  const passed = scorePercent >= 70;

  // Client reaction remarks
  let clientReaction = '';
  if (stars === 3) {
    clientReaction = `“Flawless execution! Every wall is millimeter-precise. The construction crew can break ground immediately!” — ${level.client.name}`;
  } else if (stars === 2) {
    clientReaction = `“Very impressive drafting! Minor deviation around the corners, but well within our framing tolerances.” — ${level.client.name}`;
  } else if (stars === 1) {
    clientReaction = `“Good preliminary draft! A few wall lengths and area dimensions need tighter adjustment to hit spec.” — ${level.client.name}`;
  } else {
    clientReaction = `“The layout is incomplete or drifted beyond our tolerance (${tolerance}m). Trace along the blueprint lines to refine!” — ${level.client.name}`;
  }

  // Checklist
  const checklist = [
    {
      label: 'Perimeter Wall Length',
      targetValue: `${targetPerimeter.toFixed(2)} m`,
      actualValue: `${totalDrawnPerimeterMeters.toFixed(2)} m`,
      status: (perimeterDelta <= tolerance ? 'pass' : perimeterDelta <= tolerance * 2.5 ? 'partial' : 'fail') as 'pass' | 'partial' | 'fail',
    },
    {
      label: 'Enclosed Room Area',
      targetValue: `${targetArea.toFixed(2)} m²`,
      actualValue: `${totalDrawnAreaMetersSq.toFixed(2)} m²`,
      status: (areaDelta <= 1.2 ? 'pass' : areaDelta <= 3.5 ? 'partial' : 'fail') as 'pass' | 'partial' | 'fail',
    },
    {
      label: 'Room Enclosure Status',
      targetValue: `${targetRoomCount} Room${targetRoomCount > 1 ? 's' : ''}`,
      actualValue: `${rooms.length} Closed`,
      status: (rooms.length >= targetRoomCount ? 'pass' : rooms.length > 0 ? 'partial' : 'fail') as 'pass' | 'partial' | 'fail',
    },
    {
      label: 'Dimensional Deviation',
      targetValue: `< ${tolerance} m`,
      actualValue: `±${avgLengthError.toFixed(2)} m`,
      status: (avgLengthError <= tolerance ? 'pass' : avgLengthError <= tolerance * 2 ? 'partial' : 'fail') as 'pass' | 'partial' | 'fail',
    },
  ];

  return {
    scorePercent,
    stars,
    lengthAccuracy: Math.round(lengthAccuracy),
    areaAccuracy: Math.round(areaAccuracy),
    perimeterAccuracy: Math.round(perimeterAccuracy),
    meanDeviationMeters: Math.round(avgLengthError * 100) / 100,
    totalDrawnPerimeterMeters,
    targetPerimeterMeters: targetPerimeter,
    drawnAreaMetersSq: totalDrawnAreaMetersSq,
    targetAreaMetersSq: targetArea,
    detectedRoomsCount: rooms.length,
    targetRoomsCount: targetRoomCount,
    passed,
    clientReaction,
    checklist,
  };
}

/**
 * Project a point onto a line segment and return the projection point, ratio t, and distance
 */
export function projectPointOntoSegment(
  p: Point,
  a: Point,
  b: Point
): { projected: Point; ratio: number; distance: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;

  if (l2 === 0) {
    return {
      projected: { x: a.x, y: a.y },
      ratio: 0,
      distance: getDistance(p, a),
    };
  }

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));

  const proj = {
    x: a.x + t * dx,
    y: a.y + t * dy,
  };

  return {
    projected: proj,
    ratio: t,
    distance: getDistance(p, proj),
  };
}

export interface WallOpeningInterval {
  opening: WallOpening;
  tStart: number;
  tEnd: number;
  startPt: Point;
  endPt: Point;
  centerPt: Point;
  widthMeters: number;
  widthPx: number;
}

export interface WallSolidSegment {
  startPt: Point;
  endPt: Point;
  lengthMeters: number;
  lengthPx: number;
  tStart: number;
  tEnd: number;
}

export interface WallMarginDimension {
  type: 'margin' | 'opening';
  label: string;
  subLabel?: string;
  p1: Point;
  p2: Point;
  midPt: Point;
  lengthMeters: number;
  opening?: WallOpening;
}

export interface WallBreakdownResult {
  wallLengthPx: number;
  wallLengthMeters: number;
  normal: Point;
  unitVec: Point;
  openings: WallOpeningInterval[];
  solidSegments: WallSolidSegment[];
  marginDimensions: WallMarginDimension[];
}

/**
 * Computes architectural wall breaks, openings, and margin dimension segments along a wall
 */
export function getWallOpeningsBreakdown(
  n1: Point,
  n2: Point,
  wallOpenings: WallOpening[],
  scaleFactor: number
): WallBreakdownResult {
  const dx = n2.x - n1.x;
  const dy = n2.y - n1.y;
  const wallLengthPx = Math.hypot(dx, dy);
  const wallLengthMeters = pixelsToMeters(wallLengthPx, scaleFactor);

  if (wallLengthPx < 1e-4) {
    return {
      wallLengthPx: 0,
      wallLengthMeters: 0,
      normal: { x: 0, y: -1 },
      unitVec: { x: 1, y: 0 },
      openings: [],
      solidSegments: [],
      marginDimensions: [],
    };
  }

  const ux = dx / wallLengthPx;
  const uy = dy / wallLengthPx;
  const nx = -uy;
  const ny = ux;

  // Compute opening intervals along the wall
  const validOpenings: WallOpeningInterval[] = [];
  for (const op of wallOpenings) {
    const widthM = op.widthMeters || (op.type === 'door' ? 0.9 : 1.2);
    const widthPx = metersToPixels(widthM, scaleFactor);
    const halfRatio = (widthPx / 2) / wallLengthPx;

    // Clamp center position so opening stays reasonably on the wall line
    const minCenter = Math.min(0.5, halfRatio + 0.02);
    const maxCenter = Math.max(0.5, 1.0 - halfRatio - 0.02);
    const centerT = Math.max(minCenter, Math.min(maxCenter, op.positionRatio));

    const tStart = Math.max(0, centerT - halfRatio);
    const tEnd = Math.min(1, centerT + halfRatio);

    const startPt = { x: n1.x + tStart * dx, y: n1.y + tStart * dy };
    const endPt = { x: n1.x + tEnd * dx, y: n1.y + tEnd * dy };
    const centerPt = { x: n1.x + centerT * dx, y: n1.y + centerT * dy };

    validOpenings.push({
      opening: op,
      tStart,
      tEnd,
      startPt,
      endPt,
      centerPt,
      widthMeters: widthM,
      widthPx,
    });
  }

  // Sort openings along wall by start ratio
  validOpenings.sort((a, b) => a.tStart - b.tStart);

  // Build solid unbroken wall segments
  const solidSegments: WallSolidSegment[] = [];
  let currentT = 0;

  for (const op of validOpenings) {
    if (op.tStart > currentT + 0.005) {
      const segStart = { x: n1.x + currentT * dx, y: n1.y + currentT * dy };
      const segEnd = { x: n1.x + op.tStart * dx, y: n1.y + op.tStart * dy };
      const segLengthPx = (op.tStart - currentT) * wallLengthPx;
      const segLengthM = pixelsToMeters(segLengthPx, scaleFactor);

      solidSegments.push({
        startPt: segStart,
        endPt: segEnd,
        lengthMeters: segLengthM,
        lengthPx: segLengthPx,
        tStart: currentT,
        tEnd: op.tStart,
      });
    }
    currentT = Math.max(currentT, op.tEnd);
  }

  if (currentT < 0.995) {
    const segStart = { x: n1.x + currentT * dx, y: n1.y + currentT * dy };
    const segEnd = { x: n2.x, y: n2.y };
    const segLengthPx = (1 - currentT) * wallLengthPx;
    const segLengthM = pixelsToMeters(segLengthPx, scaleFactor);

    solidSegments.push({
      startPt: segStart,
      endPt: segEnd,
      lengthMeters: segLengthM,
      lengthPx: segLengthPx,
      tStart: currentT,
      tEnd: 1,
    });
  }

  // Build Chain Dimension breakdown for margins and openings
  const marginDimensions: WallMarginDimension[] = [];
  let chainT = 0;

  for (const op of validOpenings) {
    // Margin before opening
    if (op.tStart > chainT) {
      const p1 = { x: n1.x + chainT * dx, y: n1.y + chainT * dy };
      const p2 = { x: n1.x + op.tStart * dx, y: n1.y + op.tStart * dy };
      const distM = pixelsToMeters((op.tStart - chainT) * wallLengthPx, scaleFactor);
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

      marginDimensions.push({
        type: 'margin',
        label: formatMeters(distM),
        p1,
        p2,
        midPt: mid,
        lengthMeters: distM,
      });
    }

    // The opening itself
    const pOpen1 = { x: n1.x + op.tStart * dx, y: n1.y + op.tStart * dy };
    const pOpen2 = { x: n1.x + op.tEnd * dx, y: n1.y + op.tEnd * dy };
    const openDistM = pixelsToMeters((op.tEnd - op.tStart) * wallLengthPx, scaleFactor);
    const openMid = { x: (pOpen1.x + pOpen2.x) / 2, y: (pOpen1.y + pOpen2.y) / 2 };

    marginDimensions.push({
      type: 'opening',
      label: formatMeters(openDistM),
      subLabel: op.opening.type === 'door' ? 'Door' : 'Window',
      p1: pOpen1,
      p2: pOpen2,
      midPt: openMid,
      lengthMeters: openDistM,
      opening: op.opening,
    });

    chainT = op.tEnd;
  }

  // Final margin after last opening
  if (chainT < 1) {
    const p1 = { x: n1.x + chainT * dx, y: n1.y + chainT * dy };
    const p2 = { x: n2.x, y: n2.y };
    const distM = pixelsToMeters((1 - chainT) * wallLengthPx, scaleFactor);
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

    marginDimensions.push({
      type: 'margin',
      label: formatMeters(distM),
      p1,
      p2,
      midPt: mid,
      lengthMeters: distM,
    });
  }

  return {
    wallLengthPx,
    wallLengthMeters,
    normal: { x: nx, y: ny },
    unitVec: { x: ux, y: uy },
    openings: validOpenings,
    solidSegments,
    marginDimensions,
  };
}

