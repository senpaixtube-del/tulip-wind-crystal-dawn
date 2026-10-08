import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Quality = "low" | "medium" | "high";

export type Settings = {
  quality: Quality;
  master: number;
  music: number;
  sfx: number;
  fullscreen: boolean;
  showFps: boolean;
  showPing: boolean;
  shake: boolean;
  language: string;
  set: (p: Partial<Omit<Settings, "set">>) => void;
};

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      quality: "high",
      master: 0.7,
      music: 0.35,
      sfx: 0.8,
      fullscreen: false,
      showFps: true,
      showPing: true,
      shake: true,
      language: "en",
      set: (p) => set(p),
    }),
    { name: "wos-settings" },
  ),
);
