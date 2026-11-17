// Every tunable in one place: the city's size and density, the driving model, the police, and the
// palette the whole game is drawn from. Nothing here draws or simulates; the other modules read it.

export const TILE = 64;            // one city cell in world units (pixels at zoom 1)
export const CITY_COLS = 44;        // cells across
export const CITY_ROWS = 44;        // cells down
export const ROAD_EVERY = 5;        // every fifth row and column is a road
export const WORLD_W = CITY_COLS * TILE;
export const WORLD_H = CITY_ROWS * TILE;

export const VIEW = { width: 1280, height: 720, zoom: 1.06 };

export const PALETTE = {
  asphalt: '#1b2027',
  asphaltLit: '#232b34',
  lane: '#d8c37a',
  sidewalk: '#2c333c',
  sidewalkEdge: '#39424d',
  grass: '#1f2a24',
  building: ['#3a342c', '#2f3a37', '#403a44', '#2b3644', '#3c3a33', '#333b45', '#453a34', '#2e333c'],
  buildingLit: '#3d4652',
  window: '#f2c96b',
  windowDim: '#5a6474',
  water: '#15303c',
  player: '#f2b544',
  police: '#4f8ef7',
  ped: '#8b9aa8',
  civilianCar: ['#586274', '#6b5a4a', '#4a5a63', '#6a4a4a', '#4a4a5e'],
  taxi: '#e0b64a',
  sky: '#0d1116',
};

export const DRIVE = {
  accel: 340,          // units/s^2
  brake: 620,
  reverse: 200,
  maxSpeed: 430,
  maxReverse: 150,
  turnRate: 2.5,       // radians/s at full speed
  grip: 7.5,           // lateral velocity damping
  drag: 0.6,
  handbrakeGrip: 2.2,
};

export const ON_FOOT = { walk: 140, sprint: 235, radius: 12, health: 100 };

export const POLICE = {
  starsDecaySeconds: 22,   // how long a clean run takes to drop one star
  patrolCars: 6,
  chaseSpeed: 470,
  sightRange: 520,
  arrestRange: 40,
  shotsPerStar: 3,
};

export const MISSIONS = [
  {
    id: 'repo',
    name: 'Repo run',
    label: 'REPO',
    brief: 'The lot on 3rd is holding a car that is not theirs. Take it to the lock-up before the stripes log it.',
    reward: 450,
    start: { col: 20, row: 18 },
    target: { col: 36, row: 34 },
    kind: 'deliver-car',
  },
  {
    id: 'shakedown',
    name: 'Shakedown',
    label: 'SHAKEDOWN',
    brief: 'A dealer on the strip is short this week. Collect on foot — he will not open the door for a car.',
    reward: 700,
    start: { col: 22, row: 22 },
    target: { col: 14, row: 30 },
    kind: 'collect-on-foot',
  },
  {
    id: 'heat',
    name: 'Heat run',
    label: 'HEAT RUN',
    brief: 'The package has to reach the marina with three stars on you. Do not stop moving.',
    reward: 900,
    start: { col: 38, row: 20 },
    target: { col: 6, row: 38 },
    kind: 'escape-with-heat',
  },
];

export const STORAGE_KEY = 'vice-meridian-save-v1';
