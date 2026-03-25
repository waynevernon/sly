import { memo } from "react";
import { Folder, FolderOpen } from "lucide-react";
import { LUCIDE_ICON_MAP } from "../../lib/lucideIcons";

interface FolderGlyphProps {
  iconName?: string | null;
  className?: string;
  strokeWidth?: number;
  open?: boolean;
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
  iconName,
  className = "w-4.5 h-4.5",
  strokeWidth = 1.8,
  open = false,
}: FolderGlyphProps) {
  const resolvedIconName = iconName ? resolveFolderIconName(iconName, open) : null;
  const IconComponent = resolvedIconName
    ? (LUCIDE_ICON_MAP.get(resolvedIconName) ?? null)
    : null;
  const FallbackIcon = open ? FolderOpen : Folder;

  if (!resolvedIconName || !IconComponent) {
    return <FallbackIcon className={className} strokeWidth={strokeWidth} />;
  }

  return <IconComponent className={className} strokeWidth={strokeWidth} />;
});
