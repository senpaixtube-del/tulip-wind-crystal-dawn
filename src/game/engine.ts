import {
  ABILITY_COOLDOWN,
  ARENA_RADIUS,
  FIXED_DT,
  MAX_DT,
  NET_HZ,
  PLAYER_COLOR_ID,
  xpToNext,
} from "./constants";
import { GameAudio } from "./audio";
import { GameInput } from "./input";
import { applySnapshot, pickHost, serializeWorld } from "./net";
import { ArenaRenderer, type Quality } from "./renderer";
import { addHuman, createWorld, localInput, stepWorld } from "./sim";
import type {
  GameMode,
  HudState,
  NetMessage,
  SnakeInput,
  WorldEvent,
  WorldState,
} from "./types";

export type EngineConfig = {
  canvas: HTMLCanvasElement;
  mode: GameMode;
  playerId: string;
  playerName: string;
  colorId?: string;
  quality: Quality;
  level?: number;
  xp?: number;
  onHud?: (hud: HudState) => void;
  onEvent?: (e: WorldEvent) => void;
  onMatchEnd?: (result: MatchResult) => void;
  send?: (msg: NetMessage, peerId?: string) => void;
  broadcast?: (msg: NetMessage) => void;
};

export type MatchResult = {
  score: number;
  kills: number;
  deaths: number;
  length: number;
  rank: number;
  duration: number;
  xpEarned: number;
  rankingDelta: number;
  board: Array<{ name: string; score: number; kills: number; you: boolean }>;
};

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setSteer?: (v: number) => void;
      setKeys?: (codes: string[]) => void;
    };
  }
}

export class GameEngine {
  world: WorldState;
  renderer: ArenaRenderer;
  input = new GameInput();
  audio = new GameAudio();
  playerId: string;
  mode: GameMode;
  quality: Quality;
  host = true;
  peers: string[] = [];
  ping = 0;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  private netAcc = 0;
  private fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private cfg: EngineConfig;
  private inputs = new Map<string, SnakeInput>();
  private endedSent = false;
  private injectSteer: number | null = null;
  private level: number;
  private xp: number;

  constructor(cfg: EngineConfig) {
    this.cfg = cfg;
    this.mode = cfg.mode;
    this.playerId = cfg.playerId;
    this.quality = cfg.quality;
    this.level = cfg.level ?? 1;
    this.xp = cfg.xp ?? 0;
    this.world = createWorld(cfg.mode, {
      id: cfg.playerId,
      name: cfg.playerName,
      colorId: cfg.colorId ?? PLAYER_COLOR_ID,
    });
    this.renderer = new ArenaRenderer(cfg.canvas, cfg.quality);
    this.input.attach(cfg.canvas);
    this.resize();
    window.addEventListener("resize", this.resize);
    this.installControlsTest();
  }

  private resize = () => {
    const c = this.cfg.canvas;
    const parent = c.parentElement ?? c;
    const w = parent.clientWidth || window.innerWidth;
    const h = parent.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
  };

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.audio.unlock();
    if (this.mode !== "attract") this.audio.startMatch();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  setHost(v: boolean) {
    this.host = v;
  }

  cfgPatch(
    broadcast?: (msg: NetMessage) => void,
    send?: (msg: NetMessage, peerId?: string) => void,
  ) {
    this.cfg.broadcast = broadcast;
    this.cfg.send = send;
  }

  setPeers(ids: string[]) {
    this.peers = ids;
    const hostId = pickHost(this.playerId, ids);
    this.host = hostId === this.playerId;
  }

  onNet(from: string, data: unknown) {
    const msg = data as NetMessage;
    if (!msg || typeof msg !== "object" || !("type" in msg)) return;
    if (msg.type === "hello") {
      addHuman(this.world, msg.id, msg.name, msg.colorId);
      if (this.host) this.flushSnapshot(from);
    } else if (msg.type === "input") {
      this.inputs.set(msg.id, {
        heading: msg.heading,
        boost: msg.boost,
        shield: msg.shield,
        magnet: msg.magnet,
      });
    } else if (msg.type === "snapshot" && !this.host) {
      applySnapshot(this.world, msg.snap, this.playerId);
    } else if (msg.type === "event") {
      this.handleEvent(msg.event);
    } else if (msg.type === "ping") {
      this.cfg.send?.({ type: "pong", t: msg.t }, from);
    } else if (msg.type === "pong") {
      this.ping = Math.max(0, Math.round(performance.now() - msg.t));
    }
  }

  private flushSnapshot(to?: string) {
    const snap = serializeWorld(this.world);
    const msg: NetMessage = { type: "snapshot", snap };
    if (to) this.cfg.send?.(msg, to);
    else this.cfg.broadcast?.(msg);
  }

  private loop = (now: number) => {
    if (!this.running) return;
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = Math.min(dt, MAX_DT);
    this.acc += dt;
    this.fpsAcc += dt;
    this.fpsFrames += 1;
    if (this.fpsFrames === 1) this.resize();
    if (this.fpsAcc >= 0.4) {
      this.fps = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }

    const frame = this.input.sample();
    const you = this.world.snakes.find((s) => s.id === this.playerId);
    let pointerYaw: number | null = null;
    if (you && frame.pointerActive && frame.pointerNdc) {
      pointerYaw = this.renderer.pointerToHeading(
        frame.pointerNdc.x,
        frame.pointerNdc.y,
        you.x,
        you.z,
      );
    }
    if (this.injectSteer != null && you) {
      frame.steer = this.injectSteer;
    }

    while (this.acc >= FIXED_DT) {
      if (you && this.mode !== "attract") {
        const input = localInput(
          you.yaw,
          frame.steer,
          pointerYaw,
          frame.boost,
          frame.shield,
          frame.magnet,
          FIXED_DT,
        );
        this.inputs.set(this.playerId, input);
        if (!this.host) {
          this.cfg.broadcast?.({
            type: "input",
            id: this.playerId,
            heading: input.heading,
            boost: input.boost,
            shield: input.shield,
            magnet: input.magnet,
          });
        }
      }
      if (this.host || this.mode === "attract" || this.mode === "practice" || this.mode === "survival") {
        const ev = stepWorld(this.world, FIXED_DT, this.inputs);
        for (const e of ev) this.handleEvent(e);
      }
      this.acc -= FIXED_DT;
    }

    this.netAcc += dt;
    if (this.host && this.netAcc >= 1 / NET_HZ) {
      this.netAcc = 0;
      if (this.peers.length) this.flushSnapshot();
    }

    this.audio.tickMusic(dt, (you?.length ?? 0) > 40);
    this.renderer.render(this.world, dt, this.playerId, this.mode);
    this.emitHud(frame.boost);
    this.maybeEnd();
    this.raf = requestAnimationFrame(this.loop);
  };

  private handleEvent(e: WorldEvent) {
    this.cfg.onEvent?.(e);
    if (e.kind === "kill") {
      this.audio.kill();
      const v = this.world.snakes.find((s) => s.id === e.victimId);
      if (v) this.renderer.burst(v.x, v.z, 0xb84dff);
      this.renderer.addTrauma(0.5);
    } else if (e.kind === "death") {
      this.audio.death();
      this.renderer.addTrauma(0.7);
    } else if (e.kind === "pickup") {
      if (e.power === "speed") this.audio.boost();
      else if (e.power === "shield") this.audio.shield();
      else if (e.power === "magnet") this.audio.magnet();
      else this.audio.pickup();
    }
  }

  private emitHud(boost: boolean) {
    const you = this.world.snakes.find((s) => s.id === this.playerId);
    const board = [...this.world.snakes]
      .filter((s) => s.alive || s.human)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((s, i) => ({ id: s.id, name: s.name, score: Math.floor(s.score), you: s.id === this.playerId, rank: i + 1 }));
    const rank = board.find((b) => b.you)?.rank ?? board.length + 1;
    const hud: HudState = {
      score: Math.floor(you?.score ?? 0),
      length: Math.floor(you?.length ?? 0),
      kills: you?.kills ?? 0,
      alive: you?.alive ?? false,
      matchTime: this.world.matchTime,
      level: this.level,
      xp: this.xp,
      xpNext: xpToNext(this.level),
      rank,
      fps: this.fps,
      ping: this.ping,
      boost,
      abilities: [
        {
          id: "boost",
          ready: (you?.length ?? 0) > 10,
          active: boost ? 1 : 0,
          cooldown: 0,
          key: "SPACE",
        },
        {
          id: "shield",
          ready: (you?.shieldCd ?? 0) <= 0,
          active: you?.shield ?? 0,
          cooldown: (you?.shieldCd ?? 0) / ABILITY_COOLDOWN,
          key: "Q",
        },
        {
          id: "magnet",
          ready: (you?.magnetCd ?? 0) <= 0,
          active: you?.magnet ?? 0,
          cooldown: (you?.magnetCd ?? 0) / ABILITY_COOLDOWN,
          key: "E",
        },
      ],
      board: board.map(({ id, name, score, you }) => ({ id, name, score, you })),
      snakes: this.world.snakes.map((s) => ({
        id: s.id,
        name: s.name,
        x: s.x,
        z: s.z,
        colorId: s.colorId,
        you: s.id === this.playerId,
        alive: s.alive,
      })),
      orbs: this.world.orbs.filter((_, i) => i % 4 === 0).map((o) => ({ x: o.x, z: o.z, special: o.special })),
      powerups: this.world.powerups.map((p) => ({ x: p.x, z: p.z, kind: p.kind })),
      ended: this.world.ended || !(you?.alive ?? true),
      finalRank: rank,
      rankingDelta: 0,
      xpEarned: 0,
    };
    this.cfg.onHud?.(hud);
  }

  private maybeEnd() {
    const you = this.world.snakes.find((s) => s.id === this.playerId);
    if (!you || this.endedSent || this.mode === "attract") return;
    if (you.alive && !this.world.ended) return;
    this.endedSent = true;
    const board = [...this.world.snakes].sort((a, b) => b.score - a.score);
    const rank = board.findIndex((s) => s.id === this.playerId) + 1;
    const duration = Math.floor(this.world.matchTime);
    const xpEarned = Math.max(
      8,
      Math.floor(you.score * 0.12 + you.kills * 40 + duration * 0.4 + (rank === 1 ? 180 : 0)),
    );
    const rankingDelta = Math.round((board.length + 1 - rank) * 12 + you.kills * 8 - you.deaths * 6);
    if (rank === 1) this.audio.victory();
    else this.audio.death();
    this.cfg.onMatchEnd?.({
      score: Math.floor(you.score),
      kills: you.kills,
      deaths: you.deaths,
      length: Math.floor(you.length),
      rank,
      duration,
      xpEarned,
      rankingDelta,
      board: board.slice(0, 10).map((s) => ({
        name: s.name,
        score: Math.floor(s.score),
        kills: s.kills,
        you: s.id === this.playerId,
      })),
    });
  }

  hello() {
    const you = this.world.snakes.find((s) => s.id === this.playerId);
    this.cfg.broadcast?.({
      type: "hello",
      id: this.playerId,
      name: you?.name ?? "Player",
      colorId: you?.colorId ?? PLAYER_COLOR_ID,
    });
  }

  private installControlsTest() {
    window.__controlsTest = {
      getYaw: () => this.world.snakes.find((s) => s.id === this.playerId)?.yaw ?? 0,
      getSpeed: () => this.world.snakes.find((s) => s.id === this.playerId)?.speed ?? 0,
      setSteer: (v) => {
        this.injectSteer = v;
      },
      setKeys: (codes) => this.input.setKeys(codes),
    };
  }

  arenaRadius() {
    return ARENA_RADIUS;
  }

  dispose() {
    this.stop();
    this.input.detach();
    this.audio.dispose();
    this.renderer.dispose();
    window.removeEventListener("resize", this.resize);
    if (window.__controlsTest) delete window.__controlsTest;
  }
}
