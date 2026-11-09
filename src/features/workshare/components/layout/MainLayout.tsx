import type { ReactNode } from "react";

export function MainLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-w-0 p-4 pb-20 md:p-8 md:pb-16">
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </main>
  );
}
