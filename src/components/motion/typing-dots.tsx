/** Three dots, staggered opacity/lift — "something is happening" for the AI Coach's thinking/working state. */
export function TypingDots({ className }: { className?: string }) {
  return (
    <span className={className} aria-hidden>
      <span className="inline-flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 rounded-full bg-current"
            style={{ animation: `cos-typing 1.1s ease-in-out ${i * 0.15}s infinite` }}
          />
        ))}
      </span>
    </span>
  );
}
