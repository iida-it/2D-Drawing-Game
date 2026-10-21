export interface Point {
  x: number;
  y: number;
}

export interface Node {
  id: string;
  x: number;
  y: number;
}

export interface Wall {
  id: string;
  startNodeId: string;
  endNodeId: string;
  thickness?: number; // In meters, default 0.15m (15cm)
  isArc?: boolean;
  arcMode?: '3pt' | 'ser' | 'radius';
  arcCenter?: Point;
  cx?: number;
  cy?: number;
  arcRadius?: number; // In world coordinate units (pixels)
  radius?: number;
  arcStartAngle?: number; // In radians
  startAngle?: number;
  arcEndAngle?: number; // In radians
  endAngle?: number;
  arcCcw?: boolean; // Counter-clockwise flag
  counterClockwise?: boolean;
  arcMidPoint?: Point; // Intermediate / apex point on curve
  controlPoint?: Point;
}

export type Line = Wall;

export type RoomType = 'living' | 'bedroom' | 'kitchen' | 'bathroom' | 'office' | 'dining';

export interface ClosedRoom {
  id: string;
  name: string;
  roomType: RoomType;
  nodeIds: string[];
  points: Point[];
  areaMetersSq: number;
  perimeterMeters: number;
  centroid: Point;
  fillColor: string;
  borderColor: string;
  tagBgColor: string;
  tagTextColor: string;
}

export type OpeningType = 'door' | 'double-door' | 'sliding-door' | 'window';

export type ToolType =
  | 'select'
  | 'wall'
  | 'arc-3pt'
  | 'arc-ser'
  | 'arc-radius'
  | 'door'
  | 'door-single'
  | 'double-door'
  | 'door-double'
  | 'sliding-door'
  | 'door-sliding'
  | 'window'
  | 'measure'
  | 'calibrate'
  | 'erase'
  | 'pan';

export interface WallOpening {
  id: string;
  wallId: string;
  type: OpeningType;
  positionRatio: number; // 0.0 to 1.0 along the wall line (center of opening)
  widthMeters: number; // default: 0.85m for single door, 1.60m for double door, 1.65m for sliding door, 1.20m for window
  swingDirection?: 'left' | 'right';
  swingFlip?: boolean; // inside/outside swing orientation
}

export interface LevelRoomTarget {
  name: string;
  widthMeters: number;
  lengthMeters: number;
  areaMetersSq: number;
}

export interface ClientProfile {
  name: string;
  role: string;
  company: string;
  avatar: string;
  quote: string;
  brief: string;
  challengeInstructions: string[];
}

export interface TargetWallSpec {
  start: Point;
  end: Point;
  lengthMeters: number;
  label?: string;
}

export interface TargetRoomSpec {
  name: string;
  polygon: Point[];
  areaMetersSq: number;
}

export interface BlueprintLevel {
  id: string;
  levelNumber: number;
  title: string;
  subtitle: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced' | 'Master';
  client: ClientProfile;
  scaleFactor: number; // meters per pixel (default: 0.02 -> 50px = 1m)
  blueprintOffset: Point;
  targetSpecs: {
    totalPerimeterMeters: number;
    totalAreaMetersSq: number;
    roomTargets: LevelRoomTarget[];
    toleranceMeters: number; // e.g. 0.15m
  };
  referenceWalls: TargetWallSpec[];
  referenceRooms: TargetRoomSpec[];
  ghostSvgElements: {
    doors: { x: number; y: number; width: number; height: number; angle: number; swing: 'left' | 'right' }[];
    windows: { x: number; y: number; width: number; height: number; angle: number }[];
    furniture: { type: string; x: number; y: number; width: number; height: number; angle?: number; label: string }[];
    dimensionGuides: { p1: Point; p2: Point; label: string; offset: number }[];
    roomLabels: { x: number; y: number; name: string; targetDim: string }[];
  };
  initialViewport?: {
    pan: Point;
    zoom: number;
  };
}

export interface MeasureLine {
  start: Point;
  end: Point;
}

export interface ValidationResult {
  scorePercent: number;
  stars: number;
  lengthAccuracy: number;
  areaAccuracy: number;
  perimeterAccuracy: number;
  meanDeviationMeters: number;
  totalDrawnPerimeterMeters: number;
  targetPerimeterMeters: number;
  drawnAreaMetersSq: number;
  targetAreaMetersSq: number;
  detectedRoomsCount: number;
  targetRoomsCount: number;
  passed: boolean;
  clientReaction: string;
  checklist: {
    label: string;
    targetValue: string;
    actualValue: string;
    status: 'pass' | 'partial' | 'fail';
  }[];
}

export interface DraftingSettings {
  snapToGrid: boolean;
  snapToNodes: boolean;
  orthoSnapping: boolean; // 0, 45, 90 degrees
  gridSizeMeters: number; // e.g. 0.10m = 10cm
  ghostOpacity: number; // 0.0 to 1.0
  ghostVisible: boolean;
  soundEnabled: boolean;
  scaleFactor: number; // meters per pixel (default 0.02)
  wallThicknessMeters: number; // default 0.15
}

export interface UploadedFloorPlan {
  id: string;
  name: string;
  imageElement: HTMLImageElement;
  dataUrl: string;
  width: number;
  height: number;
  position: Point;
  scale: number;
  fileType: 'image' | 'pdf';
  totalPages?: number;
  currentPage?: number;
}

