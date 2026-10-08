export type InputFrame = {
  steer: number;
  boost: boolean;
  shield: boolean;
  magnet: boolean;
  pointerNdc: { x: number; y: number } | null;
  pointerActive: boolean;
};

export class GameInput {
  keys = new Set<string>();
  injected: string[] | null = null;
  pointerNdc: { x: number; y: number } | null = null;
  pointerActive = false;
  joystick: { x: number; y: number } | null = null;
  private shieldQueued = false;
  private magnetQueued = false;
  private canvas: HTMLElement | null = null;

  attach(el: HTMLElement) {
    this.canvas = el;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clear);
    document.addEventListener("visibilitychange", this.onVis);
    el.addEventListener("pointermove", this.onPointer);
    el.addEventListener("pointerdown", this.onPointer);
    el.addEventListener("pointerleave", this.onLeave);
  }

  detach() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clear);
    document.removeEventListener("visibilitychange", this.onVis);
    this.canvas?.removeEventListener("pointermove", this.onPointer);
    this.canvas?.removeEventListener("pointerdown", this.onPointer);
    this.canvas?.removeEventListener("pointerleave", this.onLeave);
    this.canvas = null;
  }

  setJoystick(x: number, y: number, active: boolean) {
    this.joystick = active ? { x, y } : null;
  }

  tapAbility(kind: "shield" | "magnet" | "boost") {
    if (kind === "shield") this.shieldQueued = true;
    if (kind === "magnet") this.magnetQueued = true;
    if (kind === "boost") this.keys.add("Space");
  }

  setKeys(codes: string[]) {
    this.injected = codes;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
      e.preventDefault();
    }
    this.keys.add(e.code);
    if (e.code === "KeyQ") this.shieldQueued = true;
    if (e.code === "KeyE") this.magnetQueued = true;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private clear = () => {
    this.keys.clear();
    this.injected = null;
  };

  private onVis = () => {
    if (document.hidden) this.clear();
  };

  private onPointer = (e: PointerEvent) => {
    const el = this.canvas;
    if (!el) return;
    const r = el.getBoundingClientRect();
    this.pointerNdc = {
      x: ((e.clientX - r.left) / r.width) * 2 - 1,
      y: -(((e.clientY - r.top) / r.height) * 2 - 1),
    };
    this.pointerActive = true;
  };

  private onLeave = () => {
    this.pointerActive = false;
  };

  sample(): InputFrame {
    const src = this.injected ?? [...this.keys];
    const has = (c: string) => (this.injected ? this.injected.includes(c) : this.keys.has(c));
    let steer = 0;
    if (has("KeyA") || has("ArrowLeft")) steer += 1;
    if (has("KeyD") || has("ArrowRight")) steer -= 1;
    if (this.joystick) {
      steer += -this.joystick.x;
      if (this.joystick.y * this.joystick.y + this.joystick.x * this.joystick.x > 0.2) {
        this.pointerActive = true;
      }
    }
    const boost = has("Space") || has("KeyW") || has("ShiftLeft") || has("ShiftRight");
    const shield = this.shieldQueued;
    const magnet = this.magnetQueued;
    this.shieldQueued = false;
    this.magnetQueued = false;
    void src;
    return {
      steer: Math.max(-1, Math.min(1, steer)),
      boost,
      shield,
      magnet,
      pointerNdc: this.joystick
        ? { x: this.joystick.x, y: -this.joystick.y }
        : this.pointerNdc,
      pointerActive: this.joystick != null || this.pointerActive,
    };
  }
}
