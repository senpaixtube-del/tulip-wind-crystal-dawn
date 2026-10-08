import {
  ABILITY_COOLDOWN,
  AI_NAMES,
  ARENA_RADIUS,
  BASE_SPEED,
  BODY_RADIUS,
  BOOST_DRAIN,
  BOOST_SPEED,
  FOOD_COUNT,
  FOOD_SCORE,
  GHOST_DURATION,
  HEAD_RADIUS,
  KILL_SCORE,
  MAGNET_DURATION,
  MAGNET_RADIUS,
  MAX_LENGTH,
  MOUSE_TURN_RATE,
  MULTIPLIER_DURATION,
  PLAYER_COLOR_ID,
  POWERUP_COUNT,
  SEGMENT_SPACING,
  SHIELD_DURATION,
  SNAKE_COLORS,
  SPECIAL_FOOD_COUNT,
  SPECIAL_FOOD_SCORE,
  SPEED_POWER_DURATION,
  START_LENGTH,
  TARGET_SNAKES,
  TURN_RATE,
} from "./constants";
import type {
  GameMode,
  Hazard,
  Orb,
  PowerKind,
  Powerup,
  Snake,
  SnakeInput,
  Vec2,
  WorldEvent,
  WorldState,
} from "./types";

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function dist2(ax: number, az: number, bx: number, bz: number) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function wrapAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function spawnPoint(margin = 14): Vec2 {
  const t = Math.random() * Math.PI * 2;
  const r = rand(8, ARENA_RADIUS - margin);
  return { x: Math.cos(t) * r, z: Math.sin(t) * r };
}

function makeHazards(): Hazard[] {
  const out: Hazard[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.2;
    out.push({
      x: Math.cos(a) * 52,
      z: Math.sin(a) * 52,
      r: 2.4 + (i % 3) * 0.4,
    });
  }
  for (let i = 0; i < 6; i++) {
    const p = spawnPoint(28);
    if (Math.hypot(p.x, p.z) < 18) continue;
    out.push({ x: p.x, z: p.z, r: 1.8 });
  }
  return out;
}

function makeSnake(
  id: string,
  name: string,
  colorId: string,
  human: boolean,
  team: 0 | 1 | 2,
): Snake {
  const p = spawnPoint(22);
  const yaw = Math.atan2(-p.x, -p.z);
  const points: Vec2[] = [];
  for (let i = 0; i < START_LENGTH; i++) {
    points.push({
      x: p.x + Math.sin(yaw) * i * SEGMENT_SPACING,
      z: p.z + Math.cos(yaw) * i * SEGMENT_SPACING,
    });
  }
  return {
    id,
    name,
    colorId,
    human,
    team,
    alive: true,
    x: p.x,
    z: p.z,
    yaw,
    speed: BASE_SPEED,
    length: START_LENGTH,
    score: 0,
    kills: 0,
    deaths: 0,
    points,
    shield: 0,
    magnet: 0,
    ghost: 0,
    multiplier: 1,
    speedBoost: 0,
    shieldCd: 0,
    magnetCd: 0,
    boostDrain: 0,
    aiTarget: null,
    aiTimer: 0,
  };
}

function placeOrb(id: number, special: boolean): Orb {
  const p = spawnPoint(8);
  return {
    id,
    x: p.x,
    z: p.z,
    value: special ? SPECIAL_FOOD_SCORE : FOOD_SCORE + Math.floor(Math.random() * 6),
    special,
    hue: special ? 0 : Math.random(),
    pulse: Math.random() * Math.PI * 2,
  };
}

const POWER_KINDS: PowerKind[] = ["speed", "shield", "magnet", "multiplier", "ghost"];

function placePower(id: number): Powerup {
  const p = spawnPoint(16);
  return {
    id,
    x: p.x,
    z: p.z,
    kind: POWER_KINDS[id % POWER_KINDS.length]!,
    pulse: Math.random() * Math.PI * 2,
  };
}

export function createWorld(
  mode: GameMode,
  player: { id: string; name: string; colorId?: string },
): WorldState {
  const snakes: Snake[] = [
    makeSnake(player.id, player.name, player.colorId ?? PLAYER_COLOR_ID, true, 1),
  ];

  const aiCount =
    mode === "attract"
      ? TARGET_SNAKES
      : mode === "practice"
        ? 6
        : mode === "survival"
          ? 8
          : TARGET_SNAKES - 1;

  for (let i = 0; i < aiCount; i++) {
    const color = SNAKE_COLORS[(i + 1) % SNAKE_COLORS.length]!;
    const team: 0 | 1 | 2 = mode === "team" ? ((i % 2) + 1 as 1 | 2) : 0;
    snakes.push(makeSnake(`ai-${i}`, AI_NAMES[i % AI_NAMES.length]!, color.id, false, team));
  }

  if (mode === "attract") {
    snakes[0]!.human = false;
    snakes[0]!.name = "You";
  }

  const orbs: Orb[] = [];
  for (let i = 0; i < FOOD_COUNT; i++) orbs.push(placeOrb(i, false));
  for (let i = 0; i < SPECIAL_FOOD_COUNT; i++) orbs.push(placeOrb(FOOD_COUNT + i, true));

  const powerups: Powerup[] = [];
  for (let i = 0; i < POWERUP_COUNT; i++) powerups.push(placePower(i));

  return {
    mode,
    time: 0,
    matchTime: 0,
    running: true,
    ended: false,
    snakes,
    orbs,
    powerups,
    hazards: makeHazards(),
    events: [],
    nextOrbId: FOOD_COUNT + SPECIAL_FOOD_COUNT + 1,
    nextPowerId: POWERUP_COUNT + 1,
  };
}

export function addHuman(
  world: WorldState,
  id: string,
  name: string,
  colorId: string,
): Snake {
  const existing = world.snakes.find((s) => s.id === id);
  if (existing) {
    existing.name = name;
    existing.colorId = colorId;
    existing.human = true;
    return existing;
  }
  const team: 0 | 1 | 2 =
    world.mode === "team" ? ((world.snakes.filter((s) => s.human).length % 2) + 1 as 1 | 2) : 0;
  const snake = makeSnake(id, name, colorId, true, team);
  world.snakes.push(snake);
  return snake;
}

function grow(snake: Snake, amount: number) {
  snake.length = clamp(snake.length + amount, 8, MAX_LENGTH);
  const last = snake.points[snake.points.length - 1] ?? { x: snake.x, z: snake.z };
  const needed = Math.ceil(snake.length);
  while (snake.points.length < needed) {
    snake.points.push({ x: last.x, z: last.z });
  }
}

function dropLoot(world: WorldState, snake: Snake) {
  const n = Math.min(40, 6 + Math.floor(snake.length * 0.35));
  for (let i = 0; i < n; i++) {
    const src = snake.points[Math.floor((i / n) * snake.points.length)] ?? snake;
    world.orbs.push({
      id: world.nextOrbId++,
      x: src.x + rand(-1.6, 1.6),
      z: src.z + rand(-1.6, 1.6),
      value: 12,
      special: false,
      hue: Math.random(),
      pulse: 0,
    });
  }
  if (world.orbs.length > 260) world.orbs.splice(0, world.orbs.length - 220);
}

function killSnake(world: WorldState, snake: Snake, killer?: Snake) {
  if (!snake.alive) return;
  if (snake.shield > 0) {
    snake.shield = 0;
    return;
  }
  snake.alive = false;
  snake.deaths += 1;
  dropLoot(world, snake);
  const ev: WorldEvent = killer
    ? { kind: "kill", killerId: killer.id, victimId: snake.id, victimName: snake.name }
    : { kind: "death", playerId: snake.id };
  world.events.push(ev);
  if (killer && killer.id !== snake.id) {
    killer.kills += 1;
    killer.score += KILL_SCORE + Math.floor(snake.length * 4);
    grow(killer, 4);
  }
}

function steerToward(yaw: number, targetYaw: number, rate: number, dt: number) {
  const diff = wrapAngle(targetYaw - yaw);
  const max = rate * dt;
  return yaw + clamp(diff, -max, max);
}

function thinkAI(world: WorldState, snake: Snake, dt: number) {
  snake.aiTimer -= dt;
  if (snake.aiTimer <= 0 || !snake.aiTarget) {
    snake.aiTimer = rand(0.25, 0.8);
    let best: Orb | null = null;
    let bestD = 1e9;
    for (const o of world.orbs) {
      const d = dist2(snake.x, snake.z, o.x, o.z);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (best && (world.mode !== "survival" || Math.random() > 0.35)) {
      snake.aiTarget = { x: best.x, z: best.z };
    } else {
      const hunt = world.snakes.find(
        (o) => o.alive && o.id !== snake.id && (world.mode !== "team" || o.team !== snake.team),
      );
      if (hunt && (world.mode === "survival" || Math.random() > 0.55)) {
        snake.aiTarget = { x: hunt.x, z: hunt.z };
      } else {
        const a = Math.random() * Math.PI * 2;
        const r = rand(10, ARENA_RADIUS - 18);
        snake.aiTarget = { x: Math.cos(a) * r, z: Math.sin(a) * r };
      }
    }
  }

  for (const other of world.snakes) {
    if (!other.alive || other.id === snake.id) continue;
    for (let i = 4; i < other.points.length; i += 3) {
      const p = other.points[i]!;
      if (dist2(snake.x, snake.z, p.x, p.z) < 16) {
        const away = Math.atan2(-(p.x - snake.x), -(p.z - snake.z));
        snake.yaw = steerToward(snake.yaw, away, TURN_RATE * 1.6, dt);
        return;
      }
    }
  }

  const radial = Math.hypot(snake.x, snake.z);
  if (radial > ARENA_RADIUS - 12) {
    snake.yaw = steerToward(snake.yaw, Math.atan2(-snake.x, -snake.z), TURN_RATE * 2, dt);
    return;
  }

  for (const h of world.hazards) {
    if (dist2(snake.x, snake.z, h.x, h.z) < (h.r + 6) ** 2) {
      snake.yaw = steerToward(snake.yaw, Math.atan2(snake.x - h.x, snake.z - h.z), TURN_RATE * 2, dt);
      return;
    }
  }

  if (snake.aiTarget) {
    const ty = Math.atan2(-(snake.aiTarget.x - snake.x), -(snake.aiTarget.z - snake.z));
    snake.yaw = steerToward(snake.yaw, ty, TURN_RATE, dt);
  }

  if (world.mode === "survival" && world.matchTime > 40) {
    snake.speedBoost = Math.max(snake.speedBoost, 0.4);
  }
}

export function applyInput(snake: Snake, input: SnakeInput, dt: number) {
  if (!snake.alive) return;
  snake.yaw = steerToward(snake.yaw, input.heading, MOUSE_TURN_RATE, dt);
  if (input.boost && snake.length > 10) {
    snake.boostDrain = 1;
  }
  if (input.shield && snake.shieldCd <= 0) {
    snake.shield = SHIELD_DURATION;
    snake.shieldCd = ABILITY_COOLDOWN;
  }
  if (input.magnet && snake.magnetCd <= 0) {
    snake.magnet = MAGNET_DURATION;
    snake.magnetCd = ABILITY_COOLDOWN;
  }
}

export function stepWorld(
  world: WorldState,
  dt: number,
  inputs: Map<string, SnakeInput>,
): WorldEvent[] {
  world.events = [];
  if (!world.running || world.ended) return world.events;
  world.time += dt;
  world.matchTime += dt;

  if (world.mode === "survival") {
    const extra = Math.min(6, Math.floor(world.matchTime / 35));
    const ai = world.snakes.filter((s) => !s.human).length;
    if (ai < 8 + extra) {
      const i = ai;
      const color = SNAKE_COLORS[(i + 3) % SNAKE_COLORS.length]!;
      world.snakes.push(
        makeSnake(`ai-s-${i}-${Math.floor(world.time)}`, AI_NAMES[i % AI_NAMES.length]!, color.id, false, 0),
      );
    }
  }

  for (const snake of world.snakes) {
    if (!snake.alive) continue;
    snake.shield = Math.max(0, snake.shield - dt);
    snake.magnet = Math.max(0, snake.magnet - dt);
    snake.ghost = Math.max(0, snake.ghost - dt);
    snake.speedBoost = Math.max(0, snake.speedBoost - dt);
    snake.shieldCd = Math.max(0, snake.shieldCd - dt);
    snake.magnetCd = Math.max(0, snake.magnetCd - dt);
    if (snake.multiplier > 1) {
      snake.multiplier = Math.max(1, snake.multiplier - dt * 0.12);
    }

    const input = inputs.get(snake.id);
    if (snake.human && input) applyInput(snake, input, dt);
    else if (!snake.human) thinkAI(world, snake, dt);

    const boosting = snake.boostDrain > 0 || snake.speedBoost > 0;
    if (snake.boostDrain > 0) {
      snake.length = Math.max(10, snake.length - BOOST_DRAIN * dt);
      snake.boostDrain = 0;
    }
    snake.speed = boosting ? BOOST_SPEED : BASE_SPEED;
    if (snake.speedBoost > 0) snake.speed *= 1.18;

    const fx = -Math.sin(snake.yaw);
    const fz = -Math.cos(snake.yaw);
    snake.x += fx * snake.speed * dt;
    snake.z += fz * snake.speed * dt;

    const pts = snake.points;
    if (pts.length === 0) pts.push({ x: snake.x, z: snake.z });
    const head = pts[0]!;
    const dx = snake.x - head.x;
    const dz = snake.z - head.z;
    if (dx * dx + dz * dz > SEGMENT_SPACING * SEGMENT_SPACING * 0.55) {
      pts.unshift({ x: snake.x, z: snake.z });
    } else {
      head.x = snake.x;
      head.z = snake.z;
    }
    const keep = Math.max(8, Math.ceil(snake.length));
    if (pts.length > keep) pts.length = keep;
  }

  for (const orb of world.orbs) orb.pulse += dt * 3.2;
  for (const p of world.powerups) p.pulse += dt * 2.4;

  for (const snake of world.snakes) {
    if (!snake.alive) continue;

    if (Math.hypot(snake.x, snake.z) > ARENA_RADIUS - 0.8) {
      killSnake(world, snake);
      continue;
    }

    if (snake.ghost <= 0) {
      for (const h of world.hazards) {
        if (dist2(snake.x, snake.z, h.x, h.z) < (h.r + HEAD_RADIUS * 0.7) ** 2) {
          killSnake(world, snake);
          break;
        }
      }
    }
    if (!snake.alive) continue;

    const magR = snake.magnet > 0 ? MAGNET_RADIUS : 0;
    for (let i = world.orbs.length - 1; i >= 0; i--) {
      const o = world.orbs[i]!;
      const d2 = dist2(snake.x, snake.z, o.x, o.z);
      if (magR && d2 < magR * magR) {
        const pull = 22 * dt;
        const d = Math.sqrt(d2) || 1;
        o.x += ((snake.x - o.x) / d) * pull;
        o.z += ((snake.z - o.z) / d) * pull;
      }
      if (d2 < (HEAD_RADIUS + 0.55) ** 2) {
        const mult = snake.multiplier > 1 ? 2 : 1;
        snake.score += o.value * mult;
        grow(snake, o.special ? 3.4 : 1.15);
        world.orbs[i] = placeOrb(world.nextOrbId++, o.special);
      }
    }

    for (let i = world.powerups.length - 1; i >= 0; i--) {
      const p = world.powerups[i]!;
      if (dist2(snake.x, snake.z, p.x, p.z) < (HEAD_RADIUS + 1.1) ** 2) {
        if (p.kind === "speed") snake.speedBoost = SPEED_POWER_DURATION;
        if (p.kind === "shield") snake.shield = SHIELD_DURATION;
        if (p.kind === "magnet") snake.magnet = MAGNET_DURATION;
        if (p.kind === "ghost") snake.ghost = GHOST_DURATION;
        if (p.kind === "multiplier") snake.multiplier = 2;
        world.events.push({ kind: "pickup", playerId: snake.id, power: p.kind });
        world.powerups[i] = placePower(world.nextPowerId++);
      }
    }

    if (snake.ghost > 0) continue;
    for (const other of world.snakes) {
      if (!other.alive || other.id === snake.id) continue;
      if (world.mode === "team" && other.team === snake.team) continue;
      const skip = other.id === snake.id ? 10 : 0;
      for (let i = skip; i < other.points.length; i += 2) {
        const p = other.points[i]!;
        if (dist2(snake.x, snake.z, p.x, p.z) < (HEAD_RADIUS + BODY_RADIUS * 0.72) ** 2) {
          killSnake(world, snake, other);
          break;
        }
      }
      if (!snake.alive) break;
    }
  }

  if (world.mode === "survival") {
    const you = world.snakes.find((s) => s.human);
    if (you && !you.alive) {
      world.ended = true;
      world.running = false;
    }
  } else if (world.mode !== "attract") {
    const humans = world.snakes.filter((s) => s.human);
    if (humans.length > 0 && humans.every((h) => !h.alive)) {
      world.ended = true;
      world.running = false;
    }
  }

  if (world.events.length > 24) world.events.length = 24;
  return world.events;
}

export function localInput(
  yaw: number,
  steer: number,
  pointerYaw: number | null,
  boost: boolean,
  shield: boolean,
  magnet: boolean,
  dt: number,
): SnakeInput {
  let heading = yaw;
  if (pointerYaw != null) heading = pointerYaw;
  heading += steer * TURN_RATE * dt;
  return { heading, boost, shield, magnet };
}

export function resetSnake(world: WorldState, id: string) {
  const s = world.snakes.find((x) => x.id === id);
  if (!s) return;
  const next = makeSnake(s.id, s.name, s.colorId, s.human, s.team);
  next.kills = s.kills;
  next.deaths = s.deaths;
  next.score = Math.floor(s.score * 0.35);
  Object.assign(s, next);
}
