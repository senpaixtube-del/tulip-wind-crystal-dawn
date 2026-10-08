import { Magnet, Shield, Zap } from "lucide-react";
import { Logo } from "./Logo";
import { Minimap } from "./Minimap";
import type { HudState } from "@/game/types";

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const ICONS = {
  boost: Zap,
  shield: Shield,
  magnet: Magnet,
};

export function Hud({
  hud,
  showFps,
  showPing,
  onAbility,
}: {
  hud: HudState;
  showFps: boolean;
  showPing: boolean;
  onAbility: (k: "boost" | "shield" | "magnet") => void;
}) {
  const xpPct = Math.min(100, (hud.xp / Math.max(1, hud.xpNext)) * 100);
  return (
    <div className="pointer-events-none absolute inset-0 z-10 p-3 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <Logo compact />
        <div className="panel hud-chip rounded-md px-3 py-1 text-sm text-gold">
          {fmt(hud.matchTime)}
        </div>
        <div className="panel pointer-events-auto hidden w-64 rounded-xl p-3 md:block">
          <div className="mb-2 font-display text-[11px] tracking-[0.22em] text-muted">
            LEADERBOARD
          </div>
          <ol className="space-y-1">
            {hud.board.map((b, i) => (
              <li
                key={b.id}
                className={`flex items-center justify-between text-sm ${b.you ? "text-gold" : "text-fg"}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-4 font-mono text-faint">{i + 1}</span>
                  <span className="truncate">{b.you ? "You" : b.name}</span>
                </span>
                <span className="font-mono tabular-nums">{b.score}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="absolute top-16 right-4 hidden flex-col gap-2 md:flex">
        {hud.abilities.map((a) => {
          const Icon = ICONS[a.id === "boost" ? "boost" : a.id === "shield" ? "shield" : "magnet"];
          return (
            <button
              key={a.id}
              type="button"
              className="ability-btn pointer-events-auto text-left"
              onClick={() => onAbility(a.id === "boost" ? "boost" : a.id === "shield" ? "shield" : "magnet")}
            >
              <span className="ability-icon relative">
                <Icon className="h-5 w-5 text-cyan" />
                {a.cooldown > 0 && (
                  <span
                    className="absolute inset-0 rounded-[11px] bg-bg/70"
                    style={{ transform: `scaleY(${a.cooldown})`, transformOrigin: "bottom" }}
                  />
                )}
              </span>
              <span>
                <span className="block font-display text-[11px] tracking-widest uppercase">
                  {a.id === "boost" ? "Speed Boost" : a.id === "shield" ? "Shield" : "Magnet"}
                </span>
                <span className="font-mono text-[11px] text-muted">({a.key})</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="absolute right-4 bottom-4 flex flex-col items-end gap-2">
        <Minimap hud={hud} />
        {(showFps || showPing) && (
          <div className="hud-chip text-[11px] text-muted">
            {showPing && <span>PING {hud.ping}ms</span>}
            {showFps && showPing && <span className="px-2">·</span>}
            {showFps && <span>FPS {hud.fps}</span>}
          </div>
        )}
      </div>

      <div className="absolute bottom-4 left-4 flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-primary bg-surface shadow-[0_0_18px_rgb(184_77_255_/_0.45)]">
          <svg viewBox="0 0 64 64" className="h-9 w-9">
            <path d="M32 8c10 2 18 12 16 22-6 4-14 4-20 0 2-8 0-16 4-22z" fill="#b84dff" />
          </svg>
        </div>
        <div className="min-w-[180px]">
          <div className="flex items-end justify-between">
            <span className="font-display text-lg tracking-widest">Lv. {hud.level}</span>
            <span className="font-mono text-xs text-muted">
              {hud.xp} / {hud.xpNext}
            </span>
          </div>
          <div className="xp-track mt-1 w-48 md:w-56">
            <div className="xp-fill" style={{ width: `${xpPct}%` }} />
          </div>
          <div className="mt-1 flex gap-3 font-mono text-xs text-muted">
            <span>SCORE {hud.score}</span>
            <span>LEN {hud.length}</span>
            <span>ELIM {hud.kills}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
