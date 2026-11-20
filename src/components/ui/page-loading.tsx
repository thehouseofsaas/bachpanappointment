export function PageLoading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-cream" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-end gap-2" aria-hidden="true">
          {["coral", "tangerine", "sunshine", "leaf", "sky", "grape"].map((c, i) => (
            <span
              key={c}
              className="size-4 rounded-full animate-bounce-dot"
              style={{ background: `var(--${c})`, animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>
        <p className="font-display text-lg font-bold text-muted">Just a moment…</p>
      </div>
    </div>
  );
}
