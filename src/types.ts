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
}

export interface ClosedRoom {
  id: string;
  nodeIds: string[];
  points: Point[];
  areaMetersSq: number;
  centroid: Point;
  label?: string;
}

export type ToolType = 'select' | 'wall' | 'measure' | 'calibrate' | 'erase' | 'pan';

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
