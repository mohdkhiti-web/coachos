"use client";

import { ErrorView } from "@/components/layout/error-view";

// Renders inside the app shell, so navigation stays usable when a page fails.
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <ErrorView digest={error.digest} retry={retry} />;
}
