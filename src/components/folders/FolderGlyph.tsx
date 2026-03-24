import { memo } from "react";
import { FolderIcon } from "../icons";
import { LUCIDE_ICON_MAP } from "../../lib/lucideIcons";

interface FolderGlyphProps {
  iconName?: string | null;
  className?: string;
  strokeWidth?: number;
}

export const FolderGlyph = memo(function FolderGlyph({
  iconName,
  className = "w-4.5 h-4.5",
  strokeWidth = 1.8,
}: FolderGlyphProps) {
  const IconComponent = iconName ? (LUCIDE_ICON_MAP.get(iconName) ?? null) : null;

  if (!iconName || !IconComponent) {
    return <FolderIcon className={className} />;
  }

  return <IconComponent className={className} strokeWidth={strokeWidth} />;
});
