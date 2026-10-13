import { BlueprintLevel } from '../types';

/**
 * Standard scale factor: 0.02 meters per pixel.
 * 1 pixel = 0.02 m (2 cm)
 * 50 pixels = 1.00 meter (100 cm)
 */
export const DEFAULT_SCALE_FACTOR = 0.02;

export const LEVELS: BlueprintLevel[] = [
  {
    id: 'level-1',
    levelNumber: 1,
    title: 'Urban Studio Apartment',
    subtitle: 'Client: Architect Elena Rostova',
    difficulty: 'Beginner',
    scaleFactor: DEFAULT_SCALE_FACTOR,
    blueprintOffset: { x: 300, y: 220 },
    client: {
      name: 'Elena Rostova',
      role: 'Principal Architect',
      company: 'Rostova & Partners Studio',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
      quote: '“We are drafting a modern micro-studio in downtown Zurich. The perimeter must be exactly 6.00 m × 4.00 m with an interior 2.00 m bathroom divider.”',
      brief: 'Trace the perimeter walls and bathroom partition with tight precision. The structural concrete core demands strict 90-degree alignment.',
      challengeInstructions: [
        'Draft the 4 outer walls: 6.00 m (North & South) × 4.00 m (East & West).',
        'Add the interior bathroom partition wall (2.00 m).',
        'Ensure all wall intersections snap cleanly to close the room polygon.',
      ],
    },
    targetSpecs: {
      totalPerimeterMeters: 22.0, // 6 + 4 + 6 + 4 + 2m partition
      totalAreaMetersSq: 24.0, // 6m x 4m = 24m²
      toleranceMeters: 0.12, // 12cm tolerance
      roomTargets: [
        { name: 'Studio Living / Bed', widthMeters: 4.0, lengthMeters: 4.0, areaMetersSq: 19.2 },
        { name: 'Ensuite Bathroom', widthMeters: 2.0, lengthMeters: 2.4, areaMetersSq: 4.8 },
      ],
    },
    // Reference walls in world pixel coordinates (50px = 1m)
    // Offset is (300, 220)
    referenceWalls: [
      // Outer North: 6.00m (300px)
      { start: { x: 300, y: 220 }, end: { x: 600, y: 220 }, lengthMeters: 6.0, label: 'North Perimeter (6.00 m)' },
      // Outer East: 4.00m (200px)
      { start: { x: 600, y: 220 }, end: { x: 600, y: 420 }, lengthMeters: 4.0, label: 'East Perimeter (4.00 m)' },
      // Outer South: 6.00m (300px)
      { start: { x: 600, y: 420 }, end: { x: 300, y: 420 }, lengthMeters: 6.0, label: 'South Perimeter (6.00 m)' },
      // Outer West: 4.00m (200px)
      { start: { x: 300, y: 420 }, end: { x: 300, y: 220 }, lengthMeters: 4.0, label: 'West Perimeter (4.00 m)' },
      // Interior Bathroom Wall: 2.00m (100px) at X=420 from Y=320 to Y=420
      { start: { x: 420, y: 320 }, end: { x: 420, y: 420 }, lengthMeters: 2.0, label: 'Bath Partition (2.00 m)' },
    ],
    referenceRooms: [
      {
        name: 'Studio Apartment',
        areaMetersSq: 24.0,
        polygon: [
          { x: 300, y: 220 },
          { x: 600, y: 220 },
          { x: 600, y: 420 },
          { x: 300, y: 420 },
        ],
      },
    ],
    ghostSvgElements: {
      doors: [
        { x: 330, y: 420, width: 45, height: 45, angle: 90, swing: 'left' }, // Entry door
        { x: 420, y: 360, width: 40, height: 40, angle: 0, swing: 'right' }, // Bath door
      ],
      windows: [
        { x: 480, y: 220, width: 60, height: 10, angle: 0 }, // North window
        { x: 600, y: 300, width: 10, height: 50, angle: 90 }, // East balcony window
      ],
      furniture: [
        { type: 'bed', x: 480, y: 340, width: 90, height: 70, angle: 0, label: 'Queen Bed' },
        { type: 'kitchen', x: 320, y: 235, width: 110, height: 35, angle: 0, label: 'Kitchenette' },
        { type: 'bath', x: 340, y: 370, width: 45, height: 35, angle: 0, label: 'Bath & Shower' },
        { type: 'table', x: 500, y: 250, width: 45, height: 35, angle: 0, label: 'Desk' },
      ],
      dimensionGuides: [
        { p1: { x: 300, y: 200 }, p2: { x: 600, y: 200 }, label: '6.00 m', offset: -25 },
        { p1: { x: 625, y: 220 }, p2: { x: 625, y: 420 }, label: '4.00 m', offset: 25 },
        { p1: { x: 300, y: 445 }, p2: { x: 420, y: 445 }, label: '2.40 m', offset: 25 },
        { p1: { x: 420, y: 445 }, p2: { x: 600, y: 445 }, label: '3.60 m', offset: 25 },
      ],
      roomLabels: [
        { x: 510, y: 310, name: 'LIVING / BEDROOM', targetDim: '4.00 m × 4.00 m' },
        { x: 360, y: 375, name: 'BATHROOM', targetDim: '2.40 m × 2.00 m' },
      ],
    },
    initialViewport: {
      pan: { x: 80, y: 50 },
      zoom: 1.0,
    },
  },

  {
    id: 'level-2',
    levelNumber: 2,
    title: 'Primary Bedroom & Dressing Suite',
    subtitle: 'Client: Contractor David Vance',
    difficulty: 'Intermediate',
    scaleFactor: DEFAULT_SCALE_FACTOR,
    blueprintOffset: { x: 260, y: 190 },
    client: {
      name: 'David Vance',
      role: 'General Contractor',
      company: 'Vance Custom Builders',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      quote: '“Contractor David: The master bedroom must be exactly 5.50 m × 4.20 m with an attached 3.00 m × 2.00 m walk-in closet annex.”',
      brief: 'The homeowner has pre-ordered Italian custom millwork. The walls must adhere to the 5.50m × 4.20m main chamber with zero room for error.',
      challengeInstructions: [
        'Draft the main bedroom rectangle: 5.50 m width × 4.20 m depth.',
        'Extend the walk-in dressing suite annex (3.00 m × 2.00 m) on the south-east wing.',
        'Use Ortho snapping (O) to ensure all corners are crisp 90° right angles.',
      ],
    },
    targetSpecs: {
      totalPerimeterMeters: 23.4, // 5.5 + 4.2 + 2.5 + 2.0 + 3.0 + 6.2
      totalAreaMetersSq: 29.1, // 23.1 + 6.0 m²
      toleranceMeters: 0.10,
      roomTargets: [
        { name: 'Master Bedroom', widthMeters: 5.5, lengthMeters: 4.2, areaMetersSq: 23.1 },
        { name: 'Walk-in Closet', widthMeters: 3.0, lengthMeters: 2.0, areaMetersSq: 6.0 },
      ],
    },
    referenceWalls: [
      // Top wall (5.50m = 275px): (260, 190) -> (535, 190)
      { start: { x: 260, y: 190 }, end: { x: 535, y: 190 }, lengthMeters: 5.5, label: 'North Wall (5.50 m)' },
      // East bedroom upper wall (4.20m = 210px): (535, 190) -> (535, 400)
      { start: { x: 535, y: 190 }, end: { x: 535, y: 400 }, lengthMeters: 4.2, label: 'East Bedroom Wall (4.20 m)' },
      // Closet jog out East (2.00m = 100px): (535, 400) -> (535, 500)
      { start: { x: 535, y: 400 }, end: { x: 535, y: 500 }, lengthMeters: 2.0, label: 'Closet East (2.00 m)' },
      // Closet South wall (3.00m = 150px): (535, 500) -> (385, 500)
      { start: { x: 535, y: 500 }, end: { x: 385, y: 500 }, lengthMeters: 3.0, label: 'Closet South (3.00 m)' },
      // Closet West jog up (2.00m = 100px): (385, 500) -> (385, 400)
      { start: { x: 385, y: 500 }, end: { x: 385, y: 400 }, lengthMeters: 2.0, label: 'Closet West (2.00 m)' },
      // Bedroom South wall (2.50m = 125px): (385, 400) -> (260, 400)
      { start: { x: 385, y: 400 }, end: { x: 260, y: 400 }, lengthMeters: 2.5, label: 'Bedroom South (2.50 m)' },
      // West outer wall (4.20m = 210px): (260, 400) -> (260, 190)
      { start: { x: 260, y: 400 }, end: { x: 260, y: 190 }, lengthMeters: 4.2, label: 'West Wall (4.20 m)' },
    ],
    referenceRooms: [
      {
        name: 'Master Suite & Dressing',
        areaMetersSq: 29.1,
        polygon: [
          { x: 260, y: 190 },
          { x: 535, y: 190 },
          { x: 535, y: 500 },
          { x: 385, y: 500 },
          { x: 385, y: 400 },
          { x: 260, y: 400 },
        ],
      },
    ],
    ghostSvgElements: {
      doors: [
        { x: 280, y: 400, width: 45, height: 45, angle: 90, swing: 'left' },
        { x: 420, y: 400, width: 40, height: 40, angle: 90, swing: 'right' },
      ],
      windows: [
        { x: 340, y: 190, width: 80, height: 10, angle: 0 },
        { x: 260, y: 270, width: 10, height: 70, angle: 90 },
      ],
      furniture: [
        { type: 'bed', x: 370, y: 260, width: 105, height: 95, angle: 0, label: 'King Bed' },
        { type: 'closet', x: 410, y: 450, width: 100, height: 35, angle: 0, label: 'Wardrobe System' },
        { type: 'vanity', x: 485, y: 310, width: 35, height: 60, angle: 0, label: 'Vanity Desk' },
      ],
      dimensionGuides: [
        { p1: { x: 260, y: 170 }, p2: { x: 535, y: 170 }, label: '5.50 m', offset: -25 },
        { p1: { x: 555, y: 190 }, p2: { x: 555, y: 400 }, label: '4.20 m', offset: 25 },
        { p1: { x: 555, y: 400 }, p2: { x: 555, y: 500 }, label: '2.00 m', offset: 25 },
        { p1: { x: 385, y: 525 }, p2: { x: 535, y: 525 }, label: '3.00 m', offset: 25 },
      ],
      roomLabels: [
        { x: 380, y: 330, name: 'MASTER BEDROOM', targetDim: '5.50 m × 4.20 m' },
        { x: 460, y: 460, name: 'WALK-IN CLOSET', targetDim: '3.00 m × 2.00 m' },
      ],
    },
    initialViewport: {
      pan: { x: 70, y: 40 },
      zoom: 1.0,
    },
  },

  {
    id: 'level-3',
    levelNumber: 3,
    title: 'Scandinavian Loft & 45° Glass Pavilion',
    subtitle: 'Client: Interior Designer Maya Lin',
    difficulty: 'Advanced',
    scaleFactor: DEFAULT_SCALE_FACTOR,
    blueprintOffset: { x: 240, y: 180 },
    client: {
      name: 'Maya Lin',
      role: 'Creative Director & Interior Architect',
      company: 'Nordic Space Atelier',
      avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
      quote: '“Maya Lin: ‘An L-shaped executive office with a 45-degree angled glass corner wall (2.83 m at 45°). Accuracy is crucial for the custom steel glazing!’”',
      brief: 'This penthouse features a signature angled conservatory corner that connects to the terrace. Enable Ortho Angle Snapping (O) to lock onto the 45° chamfer.',
      challengeInstructions: [
        'Trace the main top perimeter: 7.00 m (North).',
        'Follow down the East wall (4.00 m).',
        'Draft the 45-degree diagonal glass wall: exactly 2.83 m (2.00 m offset along both X and Y!).',
        'Close back up along the South (5.00 m) and West (2.00 m) walls.',
      ],
    },
    targetSpecs: {
      totalPerimeterMeters: 22.83, // 7.0 + 4.0 + 2.83 + 5.0 + 2.0 + 2.0
      totalAreaMetersSq: 34.0,
      toleranceMeters: 0.12,
      roomTargets: [
        { name: 'Executive Studio & Atrium', widthMeters: 7.0, lengthMeters: 5.0, areaMetersSq: 34.0 },
      ],
    },
    referenceWalls: [
      // Top wall (7.00m = 350px): (240, 180) -> (590, 180)
      { start: { x: 240, y: 180 }, end: { x: 590, y: 180 }, lengthMeters: 7.0, label: 'North Wall (7.00 m)' },
      // East wall (4.00m = 200px): (590, 180) -> (590, 380)
      { start: { x: 590, y: 180 }, end: { x: 590, y: 380 }, lengthMeters: 4.0, label: 'East Wall (4.00 m)' },
      // Diagonal 45 deg wall (2.83m = 141.4px, dx = -100, dy = +100): (590, 380) -> (490, 480)
      { start: { x: 590, y: 380 }, end: { x: 490, y: 480 }, lengthMeters: 2.83, label: '45° Glass Wall (2.83 m)' },
      // South wall (5.00m = 250px): (490, 480) -> (240, 480)
      { start: { x: 490, y: 480 }, end: { x: 240, y: 480 }, lengthMeters: 5.0, label: 'South Wall (5.00 m)' },
      // West wall (6.00m = 300px): (240, 480) -> (240, 180)
      { start: { x: 240, y: 480 }, end: { x: 240, y: 180 }, lengthMeters: 6.0, label: 'West Wall (6.00 m)' },
    ],
    referenceRooms: [
      {
        name: 'Executive Studio & Atrium',
        areaMetersSq: 34.0,
        polygon: [
          { x: 240, y: 180 },
          { x: 590, y: 180 },
          { x: 590, y: 380 },
          { x: 490, y: 480 },
          { x: 240, y: 480 },
        ],
      },
    ],
    ghostSvgElements: {
      doors: [
        { x: 270, y: 480, width: 45, height: 45, angle: 90, swing: 'left' },
      ],
      windows: [
        { x: 380, y: 180, width: 100, height: 10, angle: 0 },
        { x: 520, y: 410, width: 100, height: 10, angle: 45 }, // Angled window
      ],
      furniture: [
        { type: 'desk', x: 420, y: 260, width: 90, height: 50, angle: 0, label: 'Executive Oak Desk' },
        { type: 'sofa', x: 310, y: 360, width: 80, height: 40, angle: 0, label: 'Lounge Sofa' },
        { type: 'planter', x: 520, y: 410, width: 30, height: 30, angle: 0, label: 'Flora Terrarium' },
      ],
      dimensionGuides: [
        { p1: { x: 240, y: 155 }, p2: { x: 590, y: 155 }, label: '7.00 m', offset: -25 },
        { p1: { x: 615, y: 180 }, p2: { x: 615, y: 380 }, label: '4.00 m', offset: 25 },
        { p1: { x: 590, y: 395 }, p2: { x: 490, y: 495 }, label: '2.83 m (45°)', offset: 25 },
        { p1: { x: 240, y: 505 }, p2: { x: 490, y: 505 }, label: '5.00 m', offset: 25 },
        { p1: { x: 215, y: 180 }, p2: { x: 215, y: 480 }, label: '6.00 m', offset: -25 },
      ],
      roomLabels: [
        { x: 380, y: 310, name: 'DESIGN STUDIO', targetDim: '7.00 m × 6.00 m' },
        { x: 535, y: 410, name: 'GLASS ATRIUM', targetDim: '2.83 m Chamfer' },
      ],
    },
    initialViewport: {
      pan: { x: 60, y: 40 },
      zoom: 0.95,
    },
  },
];
