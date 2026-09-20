"use client";

import { ErrorView } from "@/components/layout/error-view";

export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <ErrorView digest={error.digest} retry={retry} />
    </main>
  );
}
