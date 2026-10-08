export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${compact ? "" : "drop-shadow-lg"}`}>
      <svg
        viewBox="0 0 72 72"
        className={`logo-mark ${compact ? "h-12 w-12" : "h-16 w-16 md:h-20 md:w-20"}`}
        aria-hidden
      >
        <defs>
          <linearGradient id="sg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#e9b8ff" />
            <stop offset="50%" stopColor="#b84dff" />
            <stop offset="100%" stopColor="#5b16d8" />
          </linearGradient>
        </defs>
        <path
          d="M36 6c12 0 22 8 24 18 2 10-4 16-12 18 8 2 14 8 12 16-3 12-16 20-28 14-8-4-12-12-10-20 2-8 10-12 18-12-10-1-18-8-16-18C26 12 30 6 36 6z"
          fill="url(#sg)"
        />
        <circle cx="28" cy="22" r="3.2" fill="#ecfeff" />
        <circle cx="38" cy="20" r="3.2" fill="#ecfeff" />
        <path d="M18 34c8 8 20 10 32 4" fill="none" stroke="#2a0a55" strokeWidth="3" />
      </svg>
      <div className="leading-none">
        <div
          className={`neon-title font-extrabold text-primary ${compact ? "text-xl" : "text-4xl md:text-5xl"}`}
        >
          WAR OF
        </div>
        <div
          className={`neon-title font-extrabold text-primary ${compact ? "text-2xl" : "text-5xl md:text-6xl"}`}
          style={{ marginTop: compact ? 2 : -4 }}
        >
          SNAKE
        </div>
      </div>
    </div>
  );
}
