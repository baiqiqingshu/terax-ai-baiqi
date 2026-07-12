import { cn } from "@/lib/utils";
import { PlusSignIcon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { SpaceAvatar } from "../SpaceAvatar";
import type { SpaceMeta } from "../lib/store";

type Props = {
  spaces: SpaceMeta[];
  onSelect: (space: SpaceMeta) => void;
  onOpenWithout: () => void;
};

/**
 * ProjectSelector — Displayed at launch when no previous session exists
 * or when the user explicitly invokes the project chooser.
 *
 * Behaviour C: Restore last session → show selector on first launch.
 */
export function ProjectSelector({
  spaces,
  onSelect,
  onOpenWithout,
}: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--color-bg-base)]">
      <div className="flex w-full max-w-lg flex-col gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 shadow-xl">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
            项目中心
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            选择一个项目开始工作，或打开新目录
          </p>
        </div>

        {/* Project List */}
        {spaces.length > 0 && (
          <div className="flex max-h-[300px] flex-col gap-1 overflow-y-auto">
            {spaces.map((space) => (
              <button
                key={space.id}
                type="button"
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                  "hover:bg-[var(--color-bg-hover)]",
                  hoveredId === space.id && "bg-[var(--color-bg-hover)]",
                )}
                onMouseEnter={() => setHoveredId(space.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => onSelect(space)}
              >
                <SpaceAvatar
                  space={space}
                  size="md"
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                    {space.name}
                  </span>
                  {space.root && (
                    <span className="truncate text-xs text-[var(--color-text-tertiary)]">
                      {space.root}
                    </span>
                  )}
                </div>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  className="h-4 w-4 text-[var(--color-text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100"
                />
              </button>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-3">
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)]"
            onClick={onOpenWithout}
          >
            <HugeiconsIcon
              icon={PlusSignIcon}
              className="h-4 w-4 text-[var(--color-text-tertiary)]"
            />
            无项目打开终端
          </button>
        </div>
      </div>
    </div>
  );
}
