export const ARENA_RADIUS = 88;
export const HEX_SIZE = 3.4;
export const FIXED_DT = 1 / 60;
export const MAX_DT = 0.1;

export const BASE_SPEED = 12.4;
export const BOOST_SPEED = 21.5;
export const TURN_RATE = 3.85;
export const MOUSE_TURN_RATE = 7.2;
export const SEGMENT_SPACING = 0.52;
export const START_LENGTH = 18;
export const MAX_LENGTH = 220;
export const HEAD_RADIUS = 0.95;
export const BODY_RADIUS = 0.78;

export const FOOD_COUNT = 170;
export const SPECIAL_FOOD_COUNT = 8;
export const POWERUP_COUNT = 6;
export const TARGET_SNAKES = 11;
export const MAX_HUMANS = 8;

export const BOOST_DRAIN = 7.2;
export const MAGNET_RADIUS = 14;
export const SHIELD_DURATION = 6;
export const MAGNET_DURATION = 7;
export const GHOST_DURATION = 5;
export const MULTIPLIER_DURATION = 8;
export const SPEED_POWER_DURATION = 5;
export const ABILITY_COOLDOWN = 9;

export const KILL_SCORE = 180;
export const FOOD_SCORE = 8;
export const SPECIAL_FOOD_SCORE = 42;

export const NET_HZ = 18;
export const MAX_SNAPSHOT_POINTS = 48;

export const SNAKE_COLORS = [
  { id: "neon-violet", name: "Neon Violet", hex: 0xb84dff, emissive: 0x7a1cff },
  { id: "neon-blue", name: "Neon Blue", hex: 0x3aa0ff, emissive: 0x1b6cff },
  { id: "neon-red", name: "Crimson", hex: 0xff3b4e, emissive: 0xff1a33 },
  { id: "neon-green", name: "Toxic", hex: 0x3dff6a, emissive: 0x12c94a },
  { id: "neon-gold", name: "Legend", hex: 0xffd166, emissive: 0xffb703 },
  { id: "neon-cyan", name: "Cyan", hex: 0x22d3ee, emissive: 0x06b6d4 },
  { id: "neon-pink", name: "Pulse", hex: 0xff3cac, emissive: 0xff1e8a },
  { id: "neon-orange", name: "Forge", hex: 0xff7a18, emissive: 0xff5400 },
] as const;

export const PLAYER_COLOR_ID = "neon-violet";

export const AI_NAMES = [
  "Shadow",
  "RivalX",
  "Toxic",
  "Legend",
  "KingSlither",
  "FireSnake",
  "DarkSoul",
  "Pixel",
  "Ghost",
  "Venom",
  "Apex",
  "Viper",
  "Cobalt",
  "Hydra",
  "Neon",
];

export const SKINS = [
  { id: "neon-violet", name: "Neon Violet", minLevel: 1 },
  { id: "neon-blue", name: "Ion Blue", minLevel: 3 },
  { id: "neon-cyan", name: "Plasma", minLevel: 5 },
  { id: "neon-green", name: "Toxic Core", minLevel: 7 },
  { id: "neon-pink", name: "Pulse", minLevel: 9 },
  { id: "neon-gold", name: "Arena Gold", minLevel: 12 },
  { id: "neon-red", name: "Crimson Fang", minLevel: 15 },
  { id: "neon-orange", name: "Forge", minLevel: 18 },
] as const;

export const TITLES = [
  { id: "Rookie", minLevel: 1 },
  { id: "Slither", minLevel: 4 },
  { id: "Hunter", minLevel: 8 },
  { id: "Apex", minLevel: 12 },
  { id: "Warlord", minLevel: 16 },
  { id: "Mythic", minLevel: 20 },
] as const;

export const ACHIEVEMENT_DEFS = [
  { id: "first_blood", name: "First Blood", desc: "Eliminate your first rival" },
  { id: "survivor", name: "Survivor", desc: "Survive 3 minutes in a match" },
  { id: "snake_master", name: "Snake Master", desc: "Reach length 80" },
  { id: "hundred_kills", name: "100 Eliminations", desc: "Record 100 career eliminations" },
  { id: "millionaire", name: "Millionaire", desc: "Score 10,000 in a single match" },
  { id: "untouchable", name: "Untouchable", desc: "Win a match with zero deaths" },
  { id: "longest_snake", name: "Longest Snake", desc: "Reach length 120" },
  { id: "arena_champion", name: "Arena Champion", desc: "Win 10 matches" },
  { id: "weekly_champion", name: "Weekly Champion", desc: "Hold weekly rank 1" },
] as const;

export function xpToNext(level: number): number {
  return 650 * level + 200;
}

export function colorById(id: string) {
  return SNAKE_COLORS.find((c) => c.id === id) ?? SNAKE_COLORS[0];
}
