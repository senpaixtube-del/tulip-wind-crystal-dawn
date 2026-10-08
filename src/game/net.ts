import { MAX_SNAPSHOT_POINTS } from "./constants";
import type { NetSnapshot, Snake, WorldState } from "./types";

export function serializeWorld(world: WorldState): NetSnapshot {
  return {
    t: world.time,
    matchTime: world.matchTime,
    running: world.running,
    ended: world.ended,
    snakes: world.snakes.map((s) => {
      const step = Math.max(1, Math.ceil(s.points.length / MAX_SNAPSHOT_POINTS));
      const pts: number[] = [];
      for (let i = 0; i < s.points.length; i += step) {
        const p = s.points[i]!;
        pts.push(Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100);
      }
      return {
        id: s.id,
        name: s.name,
        colorId: s.colorId,
        human: s.human,
        team: s.team,
        alive: s.alive,
        x: s.x,
        z: s.z,
        yaw: s.yaw,
        length: s.length,
        score: s.score,
        kills: s.kills,
        shield: s.shield,
        magnet: s.magnet,
        ghost: s.ghost,
        multiplier: s.multiplier,
        speedBoost: s.speedBoost,
        pts,
      };
    }),
    orbs: world.orbs.slice(0, 120).map((o) => [o.id, o.x, o.z, o.value, o.special ? 1 : 0]),
    powerups: world.powerups.map((p) => [p.id, p.x, p.z, p.kind]),
  };
}

export function applySnapshot(world: WorldState, snap: NetSnapshot, localId: string) {
  world.time = snap.t;
  world.matchTime = snap.matchTime;
  world.running = snap.running;
  world.ended = snap.ended;

  const byId = new Map(world.snakes.map((s) => [s.id, s]));
  const keep = new Set<string>();
  for (const ns of snap.snakes) {
    keep.add(ns.id);
    let s = byId.get(ns.id);
    if (!s) {
      s = {
        id: ns.id,
        name: ns.name,
        colorId: ns.colorId,
        human: ns.human,
        team: ns.team,
        alive: ns.alive,
        x: ns.x,
        z: ns.z,
        yaw: ns.yaw,
        speed: 0,
        length: ns.length,
        score: ns.score,
        kills: ns.kills,
        deaths: 0,
        points: [],
        shield: ns.shield,
        magnet: ns.magnet,
        ghost: ns.ghost,
        multiplier: ns.multiplier,
        speedBoost: ns.speedBoost,
        shieldCd: 0,
        magnetCd: 0,
        boostDrain: 0,
        aiTarget: null,
        aiTimer: 0,
      };
      world.snakes.push(s);
    }
    if (s.id === localId && s.alive && ns.alive) {
      s.x = s.x * 0.65 + ns.x * 0.35;
      s.z = s.z * 0.65 + ns.z * 0.35;
      s.yaw = ns.yaw;
    } else {
      s.x = ns.x;
      s.z = ns.z;
      s.yaw = ns.yaw;
    }
    s.name = ns.name;
    s.colorId = ns.colorId;
    s.human = ns.human;
    s.team = ns.team;
    s.alive = ns.alive;
    s.length = ns.length;
    s.score = ns.score;
    s.kills = ns.kills;
    s.shield = ns.shield;
    s.magnet = ns.magnet;
    s.ghost = ns.ghost;
    s.multiplier = ns.multiplier;
    s.speedBoost = ns.speedBoost;
    s.points = [];
    for (let i = 0; i < ns.pts.length; i += 2) {
      s.points.push({ x: ns.pts[i]!, z: ns.pts[i + 1]! });
    }
    if (s.points.length === 0) s.points.push({ x: s.x, z: s.z });
  }
  world.snakes = world.snakes.filter((s) => keep.has(s.id));

  world.orbs = snap.orbs.map((o) => ({
    id: o[0],
    x: o[1],
    z: o[2],
    value: o[3],
    special: o[4] === 1,
    hue: (o[0] % 17) / 17,
    pulse: world.time,
  }));
  world.powerups = snap.powerups.map((p) => ({
    id: p[0],
    x: p[1],
    z: p[2],
    kind: p[3],
    pulse: world.time,
  }));
}

export function pickHost(selfId: string, peerIds: string[]) {
  const all = [selfId, ...peerIds].sort();
  return all[0]!;
}

export function lerpSnake(s: Snake, nx: number, nz: number, nyaw: number, a: number) {
  s.x += (nx - s.x) * a;
  s.z += (nz - s.z) * a;
  let d = nyaw - s.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  s.yaw += d * a;
}
