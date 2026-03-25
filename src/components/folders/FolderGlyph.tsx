import { memo } from "react";
import { Folder, FolderOpen } from "lucide-react";
import { LUCIDE_ICON_MAP } from "../../lib/lucideIcons";

interface FolderGlyphProps {
  iconName?: string | null;
  className?: string;
  strokeWidth?: number;
  open?: boolean;
}

export const FolderGlyph = memo(function FolderGlyph({
  iconName,
  className = "w-4.5 h-4.5",
  strokeWidth = 1.8,
  open = false,
}: FolderGlyphProps) {
  const IconComponent = iconName ? (LUCIDE_ICON_MAP.get(iconName) ?? null) : null;
  const FallbackIcon = open ? FolderOpen : Folder;

  if (!iconName || !IconComponent) {
    return <FallbackIcon className={className} strokeWidth={strokeWidth} />;
  }

  return <IconComponent className={className} strokeWidth={strokeWidth} />;
});
