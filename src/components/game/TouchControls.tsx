import { Magnet, Shield, Zap } from "lucide-react";
import { useRef } from "react";

export function TouchControls({
  onStick,
  onAbility,
}: {
  onStick: (x: number, y: number, active: boolean) => void;
  onAbility: (k: "boost" | "shield" | "magnet") => void;
}) {
  const origin = useRef<{ x: number; y: number } | null>(null);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 md:hidden">
      <div
        className="pointer-events-auto absolute bottom-24 left-4 h-36 w-36 rounded-full border border-primary/40 bg-surface/40"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          origin.current = { x: e.clientX, y: e.clientY };
          onStick(0, 0, true);
        }}
        onPointerMove={(e) => {
          if (!origin.current) return;
          const dx = (e.clientX - origin.current.x) / 56;
          const dy = (e.clientY - origin.current.y) / 56;
          const m = Math.hypot(dx, dy) || 1;
          const s = Math.min(1, m);
          onStick((dx / m) * s, (dy / m) * s, true);
        }}
        onPointerUp={() => {
          origin.current = null;
          onStick(0, 0, false);
        }}
      />
      <div className="pointer-events-auto absolute right-3 bottom-24 flex flex-col gap-2">
        <button
          type="button"
          className="ability-btn min-h-12"
          onPointerDown={() => onAbility("boost")}
        >
          <span className="ability-icon">
            <Zap className="h-5 w-5" />
          </span>
        </button>
        <button type="button" className="ability-btn min-h-12" onClick={() => onAbility("shield")}>
          <span className="ability-icon">
            <Shield className="h-5 w-5" />
          </span>
        </button>
        <button type="button" className="ability-btn min-h-12" onClick={() => onAbility("magnet")}>
          <span className="ability-icon">
            <Magnet className="h-5 w-5" />
          </span>
        </button>
      </div>
    </div>
  );
}
