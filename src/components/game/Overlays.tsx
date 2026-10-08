import { Play, RotateCcw, Trophy } from "lucide-react";
import type { MatchResult } from "@/game/engine";
import type { GameMode } from "@/game/types";

export function ModeSelect({
  onPick,
  onBack,
}: {
  onPick: (mode: GameMode, extra?: { code?: string }) => void;
  onBack: () => void;
}) {
  const modes: Array<{ id: GameMode; title: string; blurb: string }> = [
    { id: "classic", title: "Classic Arena", blurb: "Free-for-all. Grow, hunt, dominate." },
    { id: "team", title: "Team War", blurb: "Two squads. Combined score wins." },
    { id: "survival", title: "Survival", blurb: "AI pressure ramps until you fall." },
    { id: "practice", title: "Practice", blurb: "Offline training vs AI snakes." },
    { id: "private", title: "Private Room", blurb: "Create a code and invite friends." },
  ];
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/50 p-4 backdrop-blur-[2px]">
      <div className="panel-strong w-full max-w-xl rounded-xl p-6">
        <h2 className="font-display text-2xl tracking-widest">GAME MODES</h2>
        <div className="mt-4 grid gap-2">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              className="menu-btn"
              onClick={() => onPick(m.id)}
            >
              <span className="flex-1 text-left">
                <span className="block">{m.title}</span>
                <span className="block font-sans text-xs tracking-normal text-muted normal-case">
                  {m.blurb}
                </span>
              </span>
            </button>
          ))}
        </div>
        <JoinCode onJoin={(code) => onPick("private", { code })} />
        <button type="button" className="mt-3 text-sm text-muted" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

function JoinCode({ onJoin }: { onJoin: (code: string) => void }) {
  return (
    <form
      className="mt-4 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const code = String(fd.get("code") ?? "").trim();
        if (code) onJoin(code);
      }}
    >
      <input
        name="code"
        placeholder="Room code"
        className="min-h-11 flex-1 rounded-md border border-border bg-surface px-3 text-sm"
        maxLength={8}
      />
      <button type="submit" className="menu-btn w-auto px-4">
        Join
      </button>
    </form>
  );
}

export function MatchmakingPanel({
  found,
  target,
  eta,
  onCancel,
}: {
  found: number;
  target: number;
  eta: number;
  onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-bg/45">
      <div className="panel-strong w-[min(92vw,420px)] rounded-xl p-6 text-center">
        <div className="font-display tracking-[0.2em] text-primary">SEARCHING FOR PLAYERS</div>
        <div className="mt-4 font-display text-3xl">
          {found}/{target}
        </div>
        <div className="mt-1 text-sm text-muted">Estimated wait {eta}s</div>
        <div className="xp-track mx-auto mt-5 w-full">
          <div className="xp-fill" style={{ width: `${Math.min(100, (found / target) * 100)}%` }} />
        </div>
        <button type="button" className="menu-btn mt-5" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function GameOverScreen({
  result,
  onAgain,
  onMenu,
  onBoard,
}: {
  result: MatchResult;
  onAgain: () => void;
  onMenu: () => void;
  onBoard: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-bg/55 p-4">
      <div className="panel-strong w-full max-w-lg rounded-xl p-6">
        <h2 className="neon-title text-center font-display text-4xl text-primary">GAME OVER</h2>
        <div className="mt-5 grid grid-cols-2 gap-3 text-center">
          <Stat label="Final Score" value={result.score} />
          <Stat label="Final Rank" value={`#${result.rank}`} />
          <Stat label="Eliminations" value={result.kills} />
          <Stat label="Snake Length" value={result.length} />
          <Stat label="XP Earned" value={`+${result.xpEarned}`} />
          <Stat
            label="Ranking"
            value={`${result.rankingDelta >= 0 ? "+" : ""}${result.rankingDelta}`}
          />
        </div>
        <div className="mt-5 space-y-2">
          <button type="button" className="menu-btn menu-btn-primary" onClick={onAgain}>
            <Play className="h-4 w-4" /> Play Again
          </button>
          <button type="button" className="menu-btn" onClick={onBoard}>
            <Trophy className="h-4 w-4" /> View Leaderboard
          </button>
          <button type="button" className="menu-btn" onClick={onMenu}>
            <RotateCcw className="h-4 w-4" /> Return to Menu
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-surface/70 px-3 py-2">
      <div className="text-[11px] tracking-widest text-muted uppercase">{label}</div>
      <div className="font-display text-xl tabular-nums">{value}</div>
    </div>
  );
}

export function MatchResults({
  result,
  onDone,
}: {
  result: MatchResult;
  onDone: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-bg/55 p-4">
      <div className="panel-strong w-full max-w-lg rounded-xl p-6">
        <h2 className="font-display text-2xl tracking-widest">MATCH COMPLETE</h2>
        <p className="mt-1 text-sm text-muted">
          Rank #{result.rank} · {result.score} pts · {result.kills} elims
        </p>
        <ol className="mt-4 space-y-1">
          {result.board.map((b, i) => (
            <li
              key={`${b.name}-${i}`}
              className={`flex justify-between text-sm ${b.you ? "text-gold" : ""}`}
            >
              <span>
                {i + 1}. {b.you ? "You" : b.name}
              </span>
              <span className="font-mono">{b.score}</span>
            </li>
          ))}
        </ol>
        <button type="button" className="menu-btn menu-btn-primary mt-5" onClick={onDone}>
          Continue
        </button>
      </div>
    </div>
  );
}
