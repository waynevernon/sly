# Sly UI Design Language

This is the canonical reference for UI decisions in Sly.

Use this file when adding or changing any user-facing interface. Keep this file as the living source of truth for durable UI guidance.

## Visual Thesis

Sly should feel calm, editor-first, dense without clutter, and native rather than ornamental.

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

## Core Principles

- Beauty through restraint: use spacing, typography, rhythm, and alignment before adding more chrome.
- Calm hierarchy: each screen should have one dominant working plane and clearly subordinate secondary surfaces.
- Dense, not cluttered: fit useful information in view, but remove decorative noise and duplicate controls.
- Native-feeling interaction: respect platform conventions, especially title bar behavior, keyboard shortcuts, and pane affordances.
- Scrollbars are the one deliberate exception: Sly uses a shared cross-platform overlay scrollbar treatment for app-owned panes and scroll surfaces.
- Consistency over cleverness: repeated UI patterns should behave the same way everywhere.
- Progressive disclosure: keep the default surface simple and reveal advanced controls only when they are relevant.
- Navigation should recede: folders and note lists are supporting panes; the editor is the primary canvas.

## Tokens

### Geometry

| Token | Value | Use |
| --- | --- | --- |
| `--ui-radius-sm` | `6px` | pills, small badges, compact list items |
| `--ui-radius-md` | `8px` | buttons, inputs, menus, popovers |
| `--ui-radius-lg` | `12px` | dialogs, large floating panels |

Do not introduce ad hoc radii such as `10px` or `18px` unless a surface has a singular, documented reason to break the system.

### Borders and Separators

- Use one quiet `1px` border model for controls and transient surfaces.
- Use solid separators by default.
- Use dashed separators only for secondary subsections or warning-state internals, not as a general layout motif.

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

Use a `4px` spacing grid for layout rhythm. Shared pane headers should align to one row model:

- header content row: `36px` to `40px`
- title/action gap: `6px`
- action cluster gap: `2px`

### Typography

- app and pane titles: `16px`, medium
- settings section titles: `20px`, medium
- primary body copy: `14px`
- supporting copy: `12px` to `13px`
- utility counters, pills, and keycaps: `11px` to `12px`

Large `17px` inputs are reserved for command-style surfaces such as the command palette or AI prompt, not routine settings or small inline tools.

### Icons

- standard action icon size: `17px` to `19px`
- compact inline icon size: `14px` to `16px`
- default stroke weight: `1.5` to `1.6`
- use heavier strokes only for very small glyphs

Icons should sharpen affordance and scanning, not decorate space.

## Hierarchy

Use this visual order consistently:

1. Editor canvas
2. Supporting panes
3. Utility chrome and inline tools
4. Menus, popovers, dialogs, and toasts
5. Error and destructive emphasis

Settings should belong to the same product language as the workspace shell, not a separate one.

Permanent layout should stay flat and restrained. Elevated surfaces are for transient, interruptive, or selection-driven UI.

## Component Rules

### Buttons and Inputs

- Standalone actionable controls must remain tabbable.
- All focusable primitives should use one focus-visible treatment.
- Compact icon actions are `28px`.
- Standard inputs and routine buttons are `32px`.
- Primary CTAs are `40px`.
- Use a shared destructive tone instead of ad hoc red text styling.
- Shared control primitives own size and variant recipes. Do not maintain separate local style maps for buttons, icon buttons, or similar controls when they are meant to be one family.
- Composite widgets may use roving tabindex, but isolated buttons and icon buttons should not be removed from the tab order.

### Badges and Counts

- Count badges use the shared compact badge treatment, not ad hoc pills.
- Use `radius-sm` geometry for note counts and similar metadata chips.
- Default note counts to a quiet plain treatment: muted text, compact height, and no accent color unless the count itself represents alert-level state.
- Preserve a filled compact badge treatment as an available shared variant for cases where a surfaced chip reads better than plain metadata.
- In list and tree rows, right-justify count badges in a consistent trailing column so nested items still share one visual edge.

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
- Dialog shells should share `Escape` behavior, outside-click behavior, focus trapping, and a consistent title/input/body/footer structure.

### Overlay Families

All transient surfaces should derive from one of three shells:

- menu shell: menus, context menus, dropdowns
- popover shell: search toolbar, inline editors, suggestion lists
- dialog shell: command palette, AI modal, picker flows, destructive confirmation

### Settings

- Prefer spacing and section rhythm before adding more cards.
- Use boxed containers only when grouping materially improves scanning.
- Avoid stacked segmented controls and repeated dashed separators.
- Settings widths and padding should follow shared panel and layout conventions. Introduce one-off spacing or max-width values only when a surface has a documented reason to diverge.

### Navigation Collections

- Note rows, folder rows, and other primary navigation collections must define keyboard behavior alongside pointer behavior.
- Use real buttons where possible. If custom row semantics are required, implement a documented roving-tabindex or listbox/tree pattern with arrow-key movement and Enter/Space activation.
- Do not ship core interactions or primary collection rows as non-tabbable `div`s with `role="button"`.

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

Use the same state grammar across editor save state, Git state, AI state, settings errors, and toasts.

All warning, error, and success messaging should use shared status-panel primitives. Do not hand-build tinted message boxes with raw palette utilities.

When semantic tokens exist, use them. Avoid raw palette classes such as `text-orange-700`, `text-white`, or one-off surface colors in product UI.

## Empty, Loading, Error, and Success States

- `empty`: one visual, one headline, one supporting sentence, one action
- `loading`: inline when possible; block only for app initialization or destructive waits
- `error`: tinted container with an explicit next step
- `success`: quiet confirmation, not celebratory UI

## Copy and Launch Surfaces

- Product-facing copy should be calm, concrete, and specific about what Sly does: local markdown notes, editor-first workflow, keyboard-friendly interaction, optional AI, optional Git.
- About screens, readmes, release copy, and menu labels should reuse the same core phrasing instead of drifting into separate tones.
- Credit upstream work plainly and professionally. Attribution should be visible, but it should not overpower Sly's own product identity.
- Empty-state illustrations can add warmth, but the message and action must still work without mascot-specific jokes or lore.

## App Icon Guidance

- Treat the dog and its background tile as one locked composition. Do not rebalance the dog's position, scale, or spacing inside the dark tile when adjusting the macOS icon fit.
- The only safe fit adjustment is transparent margin around the fully composed rounded tile.
- Start from a clean square source image at `1024x1024`. Do not start from a screenshot, fake transparency, or artwork that already bakes in outer padding from a previous export.
- Apply the rounded-corner mask to the full icon tile first, then add transparent outer margin as a separate step.
- Tauri does not solve the macOS optical fit for us. `tauri icon` only repackages the supplied transparent source into `icns`, `ico`, and PNG sizes. The whitespace has to be correct in the source artwork.
- For Sly's current icon, the correct outer fit target is an Apple-style visible footprint of about `224x224` on a `256x256` canvas. Scaled to the source asset, that means the rounded tile should occupy `896x896` inside the `1024x1024` PNG, leaving `64px` of transparent margin on each side.
- Re-rounding is fine when regenerating the source, but it should preserve the same overall Apple-style rounded-square silhouette rather than switching to a plain rounded rectangle.
- When validating the icon, compare it against current macOS app icons in the Dock. The target is optical parity with native icons, not maximum fill.
- Keep a repo-side preview image in `docs/assets/app-icon.png` aligned with the current generated source so release documentation and launch materials reflect the shipped icon.

### Icon Refresh Workflow

When replacing the app icon, follow this process exactly:

1. Start from a fresh square source image, typically `1024x1024`, such as `~/Downloads/assets/icon.png`.
2. If needed, generate a new macOS-ready source by:
   - applying the rounded-corner mask to the full tile
   - adding transparent outer margin around the rounded tile
   - leaving the dog-to-background composition unchanged
3. Save that final source as a standalone PNG. Example working file:
   - `~/Downloads/assets/icon-macos-fit-source.png`
4. Copy the final source to the repo preview image:
   - `cp ~/Downloads/assets/icon-macos-fit-source.png /Users/wayne/Source/sly/docs/assets/app-icon.png`
5. Regenerate the Tauri icon bundle:

```bash
npx tauri icon ~/Downloads/assets/icon-macos-fit-source.png --output /Users/wayne/Source/sly/src-tauri/icons
```

6. Remove the extra mobile icon folders if they were generated and you do not want them in the repo:

```bash
rm -rf /Users/wayne/Source/sly/src-tauri/icons/android /Users/wayne/Source/sly/src-tauri/icons/ios
```

7. Clear local build output and macOS icon caches before checking the result:

```bash
rm -rf /Users/wayne/Source/sly/dist
rm -rf /Users/wayne/Source/sly/node_modules/.vite
rm -rf /Users/wayne/Source/sly/src-tauri/target
rm -rf ~/Library/Caches/com.waynevernon.sly
rm -rf ~/Library/Saved\ Application\ State/com.waynevernon.sly.savedState
rm -rf ~/Library/Caches/com.apple.iconservices*
rm -rf ~/Library/Caches/com.apple.dock.iconcache*
killall Dock || true
killall Finder || true
```

8. Fully quit Sly and relaunch with:

```bash
npm run tauri dev
```

9. Validate the icon in the Dock, not just in Finder previews or the generated PNGs.
10. If the Dock fit is wrong, adjust only the outer transparent margin and repeat the process. Do not shrink or enlarge the dog relative to its background tile.

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
