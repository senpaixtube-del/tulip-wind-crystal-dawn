export type GameMode = "practice" | "classic" | "team" | "survival" | "private" | "attract";

export type PowerKind = "speed" | "shield" | "magnet" | "multiplier" | "ghost";

export type Vec2 = { x: number; z: number };

export type SnakeInput = {
  heading: number;
  boost: boolean;
  shield: boolean;
  magnet: boolean;
};

export type Snake = {
  id: string;
  name: string;
  colorId: string;
  human: boolean;
  team: 0 | 1 | 2;
  alive: boolean;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  length: number;
  score: number;
  kills: number;
  deaths: number;
  points: Vec2[];
  shield: number;
  magnet: number;
  ghost: number;
  multiplier: number;
  speedBoost: number;
  shieldCd: number;
  magnetCd: number;
  boostDrain: number;
  aiTarget: Vec2 | null;
  aiTimer: number;
};

export type Orb = {
  id: number;
  x: number;
  z: number;
  value: number;
  special: boolean;
  hue: number;
  pulse: number;
};

export type Powerup = {
  id: number;
  x: number;
  z: number;
  kind: PowerKind;
  pulse: number;
};

export type Hazard = {
  x: number;
  z: number;
  r: number;
};

export type WorldEvent =
  | { kind: "kill"; killerId: string; victimId: string; victimName: string }
  | { kind: "pickup"; playerId: string; power: PowerKind }
  | { kind: "death"; playerId: string }
  | { kind: "win"; playerId: string };

export type WorldState = {
  mode: GameMode;
  time: number;
  matchTime: number;
  running: boolean;
  ended: boolean;
  snakes: Snake[];
  orbs: Orb[];
  powerups: Powerup[];
  hazards: Hazard[];
  events: WorldEvent[];
  nextOrbId: number;
  nextPowerId: number;
};

export type SnapshotSnake = {
  id: string;
  name: string;
  colorId: string;
  human: boolean;
  team: 0 | 1 | 2;
  alive: boolean;
  x: number;
  z: number;
  yaw: number;
  length: number;
  score: number;
  kills: number;
  shield: number;
  magnet: number;
  ghost: number;
  multiplier: number;
  speedBoost: number;
  pts: number[];
};

export type NetSnapshot = {
  t: number;
  matchTime: number;
  running: boolean;
  ended: boolean;
  snakes: SnapshotSnake[];
  orbs: Array<[number, number, number, number, number]>;
  powerups: Array<[number, number, number, PowerKind]>;
};

export type NetMessage =
  | { type: "hello"; id: string; name: string; colorId: string }
  | { type: "input"; id: string; heading: number; boost: boolean; shield: boolean; magnet: boolean }
  | { type: "snapshot"; snap: NetSnapshot }
  | { type: "event"; event: WorldEvent }
  | { type: "host"; hostId: string }
  | { type: "ping"; t: number }
  | { type: "pong"; t: number };

export type HudAbility = {
  id: PowerKind | "boost";
  ready: boolean;
  active: number;
  cooldown: number;
  key: string;
};

export type HudState = {
  score: number;
  length: number;
  kills: number;
  alive: boolean;
  matchTime: number;
  level: number;
  xp: number;
  xpNext: number;
  rank: number;
  fps: number;
  ping: number;
  boost: boolean;
  abilities: HudAbility[];
  board: Array<{ id: string; name: string; score: number; you: boolean }>;
  snakes: Array<{
    id: string;
    name: string;
    x: number;
    z: number;
    colorId: string;
    you: boolean;
    alive: boolean;
  }>;
  orbs: Array<{ x: number; z: number; special: boolean }>;
  powerups: Array<{ x: number; z: number; kind: PowerKind }>;
  ended: boolean;
  finalRank: number;
  rankingDelta: number;
  xpEarned: number;
};
