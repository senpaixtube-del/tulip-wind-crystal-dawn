import { useEffect, useRef } from "react";
import { ARENA_RADIUS, colorById } from "@/game/constants";
import type { HudState } from "@/game/types";

export function Minimap({ hud }: { hud: HudState }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = c.width;
    const h = c.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(6,8,22,0.85)";
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(34,211,238,0.45)";
    ctx.lineWidth = 2;
    ctx.stroke();

    const map = (x: number, z: number) => {
      const s = (w / 2 - 8) / ARENA_RADIUS;
      return { x: w / 2 + x * s, y: h / 2 + z * s };
    };

    ctx.globalAlpha = 0.7;
    for (const o of hud.orbs) {
      const p = map(o.x, o.z);
      ctx.fillStyle = o.special ? "#ff4d4d" : "#7cf7ff";
      ctx.fillRect(p.x, p.y, 2, 2);
    }
    ctx.globalAlpha = 1;
    for (const p of hud.powerups) {
      const m = map(p.x, p.z);
      ctx.fillStyle = "#b84dff";
      ctx.beginPath();
      ctx.arc(m.x, m.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const s of hud.snakes) {
      if (!s.alive) continue;
      const m = map(s.x, s.z);
      const col = colorById(s.colorId);
      ctx.fillStyle = `#${col.hex.toString(16).padStart(6, "0")}`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, s.you ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fill();
      if (s.you) {
        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    ctx.strokeStyle = "rgba(244,240,255,0.35)";
    ctx.beginPath();
    ctx.moveTo(w / 2, 10);
    ctx.lineTo(w / 2, 22);
    ctx.moveTo(w / 2, h - 10);
    ctx.lineTo(w / 2, h - 22);
    ctx.moveTo(10, h / 2);
    ctx.lineTo(22, h / 2);
    ctx.moveTo(w - 10, h / 2);
    ctx.lineTo(w - 22, h / 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(244,240,255,0.55)";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("N", w / 2, 12);
  }, [hud]);

  return <canvas ref={ref} width={168} height={168} className="minimap h-[132px] w-[132px] md:h-[168px] md:w-[168px]" />;
}
