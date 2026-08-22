"use client";

import type { ReactNode } from "react";
import { useModules } from "../context/modules-context";
import type { ModuleKey } from "../lib/api-client";
import { EmptyState } from "./empty-state";

/**
 * Wraps a page whose nav entry the sidebar already hides for a tenant not
 * entitled to it — this is the backstop for someone reaching it by typed URL
 * or a stale bookmark, not the primary defence (the server's `ModuleGuard`
 * is). Renders normally while entitlements haven't loaded yet or the module
 * is on; otherwise a plain, honest explanation instead of a page that would
 * fail every request it makes.
 */
export function ModuleGate({
  module,
  label,
  children,
}: {
  module: ModuleKey;
  label: string;
  children: ReactNode;
}) {
  const { modules } = useModules();
  if (modules && !modules[module]) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState title={`${label} isn't included in this salon's plan. Ask your account manager to upgrade.`} />
      </div>
    );
  }
  return <>{children}</>;
}
