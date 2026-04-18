export interface FormatBarSlotWidth {
  key: string;
}

interface ComputeFormatBarLayoutOptions {
  slots: FormatBarSlotWidth[];
  slotWidths: Record<string, number>;
  availableWidth: number;
  overflowTriggerWidth: number;
  gap: number;
}

interface ComputedFormatBarLayout {
  allFit: boolean;
  splitAt: number;
}

const FIT_TOLERANCE = 0.5;

function sumVisibleWidth(widths: number[], gap: number) {
  if (widths.length === 0) return 0;
  return widths.reduce((sum, width) => sum + width, 0) + gap * (widths.length - 1);
}

export function computeFormatBarLayout({
  slots,
  slotWidths,
  availableWidth,
  overflowTriggerWidth,
  gap,
}: ComputeFormatBarLayoutOptions): ComputedFormatBarLayout {
  const safeAvailableWidth = Math.max(0, availableWidth);
  const safeOverflowTriggerWidth = Math.max(0, overflowTriggerWidth);
  const safeGap = Math.max(0, gap);
  const widths = slots.map((slot) => Math.max(0, slotWidths[slot.key] ?? 0));

  if (sumVisibleWidth(widths, safeGap) <= safeAvailableWidth + FIT_TOLERANCE) {
    return { allFit: true, splitAt: slots.length };
  }

  let visibleWidth = 0;
  let splitAt = 0;

  for (let index = 0; index < widths.length; index += 1) {
    const nextVisibleWidth =
      splitAt === 0
        ? widths[index]
        : visibleWidth + safeGap + widths[index];
    const totalWithOverflow =
      nextVisibleWidth + safeGap + safeOverflowTriggerWidth;

    if (totalWithOverflow > safeAvailableWidth + FIT_TOLERANCE) {
      break;
    }

    visibleWidth = nextVisibleWidth;
    splitAt = index + 1;
  }

  return { allFit: false, splitAt };
}
