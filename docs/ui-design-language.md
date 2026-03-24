# Scratch UI Design Language

This is the canonical reference for UI decisions in Scratch.

Use this file when adding or changing any user-facing interface. Keep [ui-audit-2026-03-24.md](/Users/wayne/Source/scratch/docs/ui-audit-2026-03-24.md) as the rationale and backlog snapshot; keep this file as the living source of truth.

## Visual Thesis

Scratch should feel calm, editor-first, dense without clutter, and native rather than ornamental.

The interface should read as:

- one primary canvas for writing
- supporting panes that recede without disappearing
- transient UI that feels deliberate and contained
- polished motion and state feedback without visual noise

## System Priorities

1. Writing comes first.
2. Navigation supports the note instead of competing with it.
3. Shared primitives outrank local one-off styling.
4. Density is good if scanning remains immediate.
5. Motion should explain structure, not decorate it.

## Tokens

### Geometry

| Token | Value | Use |
| --- | --- | --- |
| `--ui-radius-sm` | `6px` | pills, small badges, compact list items |
| `--ui-radius-md` | `8px` | buttons, inputs, menus, popovers |
| `--ui-radius-lg` | `12px` | dialogs, large floating panels |

### Elevation

| Token | Use |
| --- | --- |
| `--ui-shadow-menu` | menus, popovers, toasts |
| `--ui-shadow-dialog` | palettes, dialogs, larger floating panels |

Permanent layout regions should not use decorative shadows.

### Motion

| Token | Target |
| --- | --- |
| `--ui-motion-duration-fast` | `160-200ms` overlay and popover entrances |
| `--ui-motion-duration-fade` | `150-180ms` utility fades |
| `--ui-motion-duration-layout` | `220-240ms` pane/layout transitions |
| `--ui-motion-ease-standard` | standard UI motion |
| `--ui-motion-ease-emphasized` | larger layout movement |

### Sizing and Rhythm

| Token | Value | Use |
| --- | --- | --- |
| `--ui-control-height-compact` | `28px` | icon actions, compact segmented controls |
| `--ui-control-height-standard` | `32px` | inputs, selects, routine buttons |
| `--ui-control-height-prominent` | `40px` | primary CTAs, command inputs |
| `--ui-drag-region-height` | `44px` | title-bar drag regions |
| `--ui-pane-padding-start` | `16px` | left pane/header inset |
| `--ui-pane-padding-end` | `12px` | right pane/header inset |
| `--ui-action-gap` | `2px` | action clusters |

## Hierarchy

Use this visual order consistently:

1. Editor canvas
2. Supporting panes
3. Utility chrome and inline tools
4. Menus, popovers, dialogs, and toasts
5. Error and destructive emphasis

Settings should belong to the same product language as the workspace shell, not a separate one.

## Component Rules

### Buttons and Inputs

- Standalone actionable controls must remain tabbable.
- All focusable primitives should use one focus-visible treatment.
- Compact icon actions are `28px`.
- Standard inputs and routine buttons are `32px`.
- Primary CTAs are `40px`.
- Use a shared destructive tone instead of ad hoc red text styling.

### Menus

- Menus, context menus, and dropdowns share one surface shell.
- Menu items use the same padding, radius, hover state, and destructive treatment.
- Labels and separators should not be hand-styled per menu.

### Popovers

- Search bars, inline editors, suggestion lists, and similar floating tools share one shell.
- Keep them compact and content-driven.
- Use the same border, radius, shadow, and padding unless there is a strong reason not to.

### Dialogs

- Dialogs and command surfaces share one container language.
- They should share backdrop behavior, elevation, corner radius, and content padding.
- Use the folder icon picker as the quality bar for structured transient UI.

### Settings

- Prefer spacing and section rhythm before adding more cards.
- Use boxed containers only when grouping materially improves scanning.
- Avoid stacked segmented controls and repeated dashed separators.

### Editor Modes

- Source mode should feel like a first-class editing surface, not a fallback textarea.
- Editor-adjacent controls should look like one family, including code block tools and inline editors.

## State Language

- `hover`: slight fill or stronger text, never noisy contrast jumps
- `focus-visible`: one shared outline/ring style
- `active/selected`: muted fill with subtle emphasis
- `disabled`: lower opacity plus interaction lock
- `success`: quiet confirmation
- `warning`: tinted container with a clear next step
- `destructive`: tinted emphasis, not plain red text alone

## Motion Rules

- Avoid mixing unrelated durations for nearby interactions.
- Do not use smooth scrolling for dense keyboard stepping in command or note lists.
- Layout transitions should feel crisp, not floaty.
- If motion does not improve orientation, remove it.

## Do / Don't

Do:

- keep the editor as the dominant plane
- reuse shared primitives before adding one-off styles
- normalize radius, shadow, spacing, and motion through tokens
- prefer calm hierarchy over decorative contrast

Don't:

- introduce another parallel design language for one surface
- add new ad hoc radii or shadow styles without updating this file
- remove standalone controls from the tab order
- solve clarity problems by adding more chrome
