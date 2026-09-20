"use client";

import "@/styles/globals.css";

// Replaces the root layout when it fails, so it brings its own <html>/<body> and (English-only, no
// provider available here) copy. The OS colour scheme decides light/dark.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-4 text-center">
          <h1 className="display text-5xl text-ink">Something went wrong</h1>
          <p className="max-w-md text-base text-ink-muted">
            CoachOS hit an unexpected error. It has been logged. Please try again.
          </p>
          {error.digest ? (
            <p className="numeral text-sm text-ink-faint">Error ID: {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex h-11 items-center rounded-md bg-accent px-5 text-sm font-medium text-accent-ink hover:bg-accent-strong"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
