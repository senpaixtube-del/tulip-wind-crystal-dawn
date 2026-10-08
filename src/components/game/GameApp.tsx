import { LayoutGrid, Play, Settings, Trophy, User } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  createPrivateRoom,
  getLeaderboard,
  getMyProfile,
  joinQueue,
  lookupRoom,
  submitMatch,
} from "@/lib/game-api";
import { useSettings } from "@/lib/settings";
import type { GameEngine, MatchResult } from "@/game/engine";
import type { GameMode, HudState } from "@/game/types";
import { Logo } from "./Logo";
import { Hud } from "./Hud";
import { TouchControls } from "./TouchControls";
import { GameOverScreen, MatchResults, MatchmakingPanel, ModeSelect } from "./Overlays";
import { AchievementsPanel, AdminPanel, LeaderboardPanel, ProfilePanel, SettingsPanel } from "./Panels";
import { NetBridge } from "./NetBridge";

type Screen =
  | "menu"
  | "modes"
  | "matchmaking"
  | "playing"
  | "gameover"
  | "results"
  | "profile"
  | "leaderboard"
  | "achievements"
  | "settings"
  | "admin";

const emptyHud = (): HudState => ({
  score: 0,
  length: 18,
  kills: 0,
  alive: true,
  matchTime: 0,
  level: 1,
  xp: 0,
  xpNext: 850,
  rank: 1,
  fps: 60,
  ping: 0,
  boost: false,
  abilities: [],
  board: [],
  snakes: [],
  orbs: [],
  powerups: [],
  ended: false,
  finalRank: 1,
  rankingDelta: 0,
  xpEarned: 0,
});

export function GameApp({
  startMode,
  startRoom,
}: {
  startMode?: GameMode;
  startRoom?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const { user, isPending } = useCurrentUserState();
  const settings = useSettings();
  const [screen, setScreen] = useState<Screen>(startMode ? "playing" : "menu");
  const [hud, setHud] = useState<HudState>(emptyHud);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [boardPreview, setBoardPreview] = useState<
    Array<{ rank: number; username: string; score: number }>
  >([]);
  const [profileBits, setProfileBits] = useState({
    level: 1,
    xp: 0,
    xpNext: 850,
    rank: 1,
    name: "You",
  });
  const [roomId, setRoomId] = useState(startRoom ?? "classic-public");
  const [mode, setMode] = useState<GameMode>(startMode ?? "attract");
  const [mm, setMm] = useState({ found: 1, target: 8, eta: 12 });
  const [netOn, setNetOn] = useState(false);
  const matchId = useRef(`m-${Date.now()}`);
  const queueTimers = useRef<number[]>([]);
  const [localId] = useState(() => `p-${Math.random().toString(36).slice(2, 10)}`);
  const playerName = profileBits.name || user?.displayName || "You";
  const netRoom = roomId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "classic";

  useEffect(() => {
    void getLeaderboard({ data: { category: "global" } })
      .then((rows) =>
        setBoardPreview(
          rows.slice(0, 10).map((r) => ({ rank: r.rank, username: r.username, score: r.score })),
        ),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    void getMyProfile()
      .then((p) =>
        setProfileBits({
          level: p.level,
          xp: p.xp,
          xpNext: 650 * p.level + 200,
          rank: p.global_rank,
          name: p.username,
        }),
      )
      .catch(() => {});
  }, [user]);

  const clearQueue = () => {
    for (const id of queueTimers.current) {
      window.clearTimeout(id);
      window.clearInterval(id);
    }
    queueTimers.current = [];
  };

  const boot = useCallback(
    async (m: GameMode, id: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      engineRef.current?.dispose();
      const { GameEngine } = await import("@/game/engine");
      const engine = new GameEngine({
        canvas,
        mode: m,
        playerId: id,
        playerName,
        colorId: "neon-violet",
        quality: settings.quality,
        level: profileBits.level,
        xp: profileBits.xp,
        onHud: setHud,
        onMatchEnd: (res) => {
          setResult(res);
          setScreen("gameover");
          setNetOn(false);
          if (user && m !== "attract") {
            void submitMatch({
              data: {
                matchId: matchId.current,
                mode: m,
                score: res.score,
                eliminations: res.kills,
                deaths: res.deaths,
                length: res.length,
                rank: res.rank,
                durationSeconds: Math.max(5, res.duration),
              },
            }).catch(() => {});
          }
        },
      });
      engineRef.current = engine;
      engine.audio.setVolumes(settings.master, settings.music, settings.sfx);
      engine.start();
    },
    [
      playerName,
      profileBits.level,
      profileBits.xp,
      settings.master,
      settings.music,
      settings.quality,
      settings.sfx,
      user,
    ],
  );

  const bootRef = useRef(boot);
  bootRef.current = boot;

  useEffect(() => {
    if (startMode) return;
    void bootRef.current("attract", "local-you");
  }, [startMode]);

  useEffect(() => () => engineRef.current?.dispose(), []);

  useEffect(() => {
    engineRef.current?.audio.setVolumes(settings.master, settings.music, settings.sfx);
  }, [settings.master, settings.music, settings.sfx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" && screen === "playing") {
        setNetOn(false);
        setScreen("menu");
        void bootRef.current("attract", "local-you");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen]);

  const beginMatch = async (m: GameMode, extra?: { code?: string }) => {
    clearQueue();
    matchId.current = `m-${Date.now()}`;
    setMode(m);
    engineRef.current?.audio.unlock();
    if (m === "practice" || m === "survival") {
      setNetOn(false);
      setScreen("playing");
      await boot(m, localId);
      return;
    }
    if (m === "private") {
      let code = extra?.code;
      if (code) {
        const found = await lookupRoom({ data: { code } }).catch(() => null);
        code = found?.code ?? code;
      } else {
        try {
          const r = await createPrivateRoom({ data: { mode: "classic" } });
          code = r.code;
        } catch {
          code = Math.random().toString(36).slice(2, 8).toUpperCase();
        }
      }
      setRoomId(code);
      setNetOn(true);
      setScreen("playing");
      await boot("private", localId);
      return;
    }
    setScreen("matchmaking");
    setMm({ found: 1, target: 8, eta: 8 });
    let room = `${m}-public`;
    try {
      const q = await joinQueue({ data: { mode: m } });
      room = q.room;
      setMm({ found: q.players, target: q.target, eta: Math.max(3, 14 - q.players) });
    } catch {
      /* guest queue still starts a local arena */
    }
    setRoomId(room);
    const started = Date.now();
    const tick = window.setInterval(() => {
      const elapsed = (Date.now() - started) / 1000;
      setMm((s) => ({
        ...s,
        found: Math.min(s.target, s.found + (Math.random() > 0.4 ? 1 : 0)),
        eta: Math.max(1, Math.round(8 - elapsed)),
      }));
    }, 700);
    const later = window.setTimeout(() => {
      window.clearInterval(tick);
      setNetOn(true);
      setScreen("playing");
      void boot(m, localId);
    }, 2800);
    queueTimers.current.push(tick, later);
  };

  useEffect(() => {
    if (!startMode) return;
    const extra = startRoom ? { code: startRoom } : undefined;
    const tmr = window.setTimeout(() => {
      void beginMatch(startMode, extra);
    }, 80);
    return () => window.clearTimeout(tmr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAbility = (k: "boost" | "shield" | "magnet") => {
    engineRef.current?.input.tapAbility(k);
  };

  const backToMenu = () => {
    setNetOn(false);
    setScreen("menu");
    void boot("attract", "local-you");
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={() => engineRef.current?.audio.unlock()}
      />
      <div className="scanlines" />
      {netOn ? <NetBridge key={netRoom} room={netRoom} name={playerName} engineRef={engineRef} /> : null}

      {screen === "menu" && (
        <MainMenu
          hud={hud}
          board={boardPreview}
          profile={profileBits}
          pending={isPending}
          onPlay={() => setScreen("modes")}
          onProfile={() => setScreen("profile")}
          onBoard={() => setScreen("leaderboard")}
          onModes={() => setScreen("modes")}
          onAchievements={() => setScreen("achievements")}
          onSettings={() => setScreen("settings")}
        />
      )}

      {screen === "modes" && (
        <ModeSelect onPick={(m, extra) => void beginMatch(m, extra)} onBack={() => setScreen("menu")} />
      )}
      {screen === "matchmaking" && (
        <MatchmakingPanel
          found={mm.found}
          target={mm.target}
          eta={mm.eta}
          onCancel={() => {
            clearQueue();
            setScreen("menu");
          }}
        />
      )}
      {screen === "playing" && (
        <>
          <Hud hud={hud} showFps={settings.showFps} showPing={settings.showPing} onAbility={onAbility} />
          <TouchControls
            onStick={(x, y, a) => engineRef.current?.input.setJoystick(x, y, a)}
            onAbility={onAbility}
          />
          {mode === "private" && (
            <div className="pointer-events-none absolute top-16 left-1/2 z-20 -translate-x-1/2 rounded-md border border-border bg-surface/80 px-3 py-1 font-mono text-xs">
              ROOM {roomId}
            </div>
          )}
          <button
            type="button"
            className="pointer-events-auto absolute top-3 left-1/2 z-20 hidden -translate-x-1/2 text-xs text-muted md:block"
            onClick={backToMenu}
          >
            Esc menu
          </button>
        </>
      )}
      {screen === "gameover" && result && (
        <GameOverScreen
          result={result}
          onAgain={() => void beginMatch(mode === "attract" ? "classic" : mode)}
          onMenu={backToMenu}
          onBoard={() => setScreen("leaderboard")}
        />
      )}
      {screen === "results" && result && <MatchResults result={result} onDone={() => setScreen("menu")} />}
      {screen === "profile" && <ProfilePanel onClose={() => setScreen("menu")} />}
      {screen === "leaderboard" && <LeaderboardPanel onClose={() => setScreen("menu")} />}
      {screen === "achievements" && <AchievementsPanel onClose={() => setScreen("menu")} />}
      {screen === "settings" && <SettingsPanel onClose={() => setScreen("menu")} />}
      {screen === "admin" && <AdminPanel onClose={() => setScreen("menu")} />}
    </div>
  );
}

function MainMenu({
  hud,
  board,
  profile,
  pending,
  onPlay,
  onProfile,
  onBoard,
  onModes,
  onAchievements,
  onSettings,
}: {
  hud: HudState;
  board: Array<{ rank: number; username: string; score: number }>;
  profile: { level: number; xp: number; xpNext: number; rank: number; name: string };
  pending: boolean;
  onPlay: () => void;
  onProfile: () => void;
  onBoard: () => void;
  onModes: () => void;
  onAchievements: () => void;
  onSettings: () => void;
}) {
  const xpPct = Math.min(100, (profile.xp / Math.max(1, profile.xpNext)) * 100);
  const list = board.length
    ? board
    : hud.board.map((b, i) => ({ rank: i + 1, username: b.name, score: b.score }));
  return (
    <div className="absolute inset-0 z-10 p-4 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Logo />
          <p className="mt-3 font-display text-[11px] tracking-[0.35em] text-muted">
            EAT · GROW · SURVIVE · DOMINATE
          </p>
        </div>
        <div className="panel hidden w-72 rounded-xl p-3 md:block">
          <div className="mb-2 font-display text-[11px] tracking-[0.22em] text-muted">LEADERBOARD</div>
          <ol className="space-y-1 text-sm">
            {list.slice(0, 10).map((r) => (
              <li key={r.rank + r.username} className="flex justify-between">
                <span className="flex gap-2">
                  <span className="w-4 text-faint">{r.rank}</span>
                  {r.username}
                </span>
                <span className="font-mono">{r.score}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="mt-8 w-full max-w-xs space-y-2">
        <button type="button" className="menu-btn menu-btn-primary" onClick={onPlay}>
          <Play className="h-4 w-4" /> Play
        </button>
        <button type="button" className="menu-btn" onClick={onProfile}>
          <User className="h-4 w-4" /> Profile
        </button>
        <button type="button" className="menu-btn" onClick={onBoard}>
          <Trophy className="h-4 w-4" /> Leaderboard
        </button>
        <button type="button" className="menu-btn" onClick={onModes}>
          <LayoutGrid className="h-4 w-4" /> Game Modes
        </button>
        <button type="button" className="menu-btn" onClick={onAchievements}>
          <Trophy className="h-4 w-4" /> Achievements
        </button>
        <button type="button" className="menu-btn" onClick={onSettings}>
          <Settings className="h-4 w-4" /> Settings
        </button>
        <SignedOut>
          <Link to="/login" className="menu-btn">
            Sign in
          </Link>
        </SignedOut>
        <SignedIn>
          <div className="flex items-center justify-between px-1 pt-2">
            <span className="text-sm text-muted">{profile.name}</span>
            <UserButton />
          </div>
        </SignedIn>
        {pending && <div className="h-8 w-8 animate-pulse rounded-full bg-surface" />}
      </div>

      <div className="absolute bottom-5 left-5 flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-primary bg-surface">
          <span className="font-display text-xs text-primary">WOS</span>
        </div>
        <div>
          <div className="font-display tracking-widest">Lv. {profile.level}</div>
          <div className="xp-track mt-1 w-52">
            <div className="xp-fill" style={{ width: `${xpPct}%` }} />
          </div>
          <div className="mt-1 font-mono text-[11px] text-muted">
            {profile.xp} / {profile.xpNext} · RANK #{profile.rank}
          </div>
        </div>
      </div>
    </div>
  );
}
