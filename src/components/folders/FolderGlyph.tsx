import { memo, type CSSProperties } from "react";
import { Folder, FolderOpen } from "lucide-react";
import type { FolderIconSpec } from "../../types/note";
import { getEmojiForShortcode } from "../../lib/emoji";
import { LUCIDE_ICON_MAP } from "../../lib/lucideIcons";
import { cn } from "../../lib/utils";

interface FolderGlyphProps {
  icon?: FolderIconSpec | null;
  className?: string;
  strokeWidth?: number;
  open?: boolean;
  style?: CSSProperties;
}

function resolveFolderIconName(iconName: string, open: boolean): string {
  if (open || !iconName.startsWith("folder-open")) {
    return iconName;
  }

  if (iconName === "folder-open") {
    return "folder";
  }

  if (iconName === "folder-open-dot") {
    return "folder-dot";
  }

  return iconName;
}

export const FolderGlyph = memo(function FolderGlyph({
  icon,
  className = "w-4.5 h-4.5",
  strokeWidth = 1.8,
  open = false,
  style,
}: FolderGlyphProps) {
  if (icon?.kind === "emoji") {
    const emoji = getEmojiForShortcode(icon.shortcode) ?? `:${icon.shortcode}:`;
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center leading-none select-none",
          className,
        )}
        aria-hidden="true"
        style={style}
      >
        {emoji}
      </span>
    );
  }

  const resolvedIconName =
    icon?.kind === "lucide" ? resolveFolderIconName(icon.name, open) : null;
  const IconComponent = resolvedIconName
    ? (LUCIDE_ICON_MAP.get(resolvedIconName) ?? null)
    : null;
  const FallbackIcon = open ? FolderOpen : Folder;

  if (!resolvedIconName || !IconComponent) {
    return (
      <FallbackIcon
        className={className}
        strokeWidth={strokeWidth}
        style={style}
      />
    );
  }

  return (
    <IconComponent
      className={className}
      strokeWidth={strokeWidth}
      style={style}
    />
  );
});
