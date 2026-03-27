import { useMemo, useState, type CSSProperties } from "react";
import { useTheme } from "../../context/ThemeContext";
import {
  CODE_FONT_PRESET_IDS,
  DEFAULT_APPEARANCE_SETTINGS,
  DARK_THEME_PRESETS,
  FONT_PRESETS,
  LIGHT_THEME_PRESETS,
  NOTE_FONT_PRESET_IDS,
  resolveFontFamily,
  resolveThemeTokens,
  themeColorsToCSSVariables,
  UI_FONT_PRESET_IDS,
} from "../../lib/appearance";
import { Button, IconButton, Input, Select } from "../ui";
import type {
  EditorWidth,
  FontChoice,
  FontPresetId,
  PaneMode,
  TextDirection,
  ThemeMode,
} from "../../types/note";
import { ColumnsIcon, EyeIcon, MinusIcon, PlusIcon } from "../icons";

const textDirectionOptions: { value: TextDirection; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "ltr", label: "LTR" },
  { value: "rtl", label: "RTL" },
];

const editorWidthOptions: { value: EditorWidth; label: string }[] = [
  { value: "narrow", label: "Narrow" },
  { value: "normal", label: "Normal" },
  { value: "wide", label: "Wide" },
  { value: "full", label: "Full" },
  { value: "custom", label: "Custom" },
];

const paneModeOptions: { value: PaneMode; label: string }[] = [
  { value: 1, label: "1 Pane" },
  { value: 2, label: "2 Panes" },
  { value: 3, label: "3 Panes" },
];

const boldWeightOptions = [
  { value: 500, label: "Medium" },
  { value: 600, label: "Semibold" },
  { value: 700, label: "Bold" },
  { value: 800, label: "Extra Bold" },
];

function fontChoiceEquals(a: FontChoice, b: FontChoice) {
  return a.kind === b.kind && a.value === b.value;
}

interface FontChoiceControlProps {
  label: string;
  value: FontChoice;
  presetIds: FontPresetId[];
  customPlaceholder: string;
  onChange: (value: FontChoice) => void;
}

function FontChoiceControl({
  label,
  value,
  presetIds,
  customPlaceholder,
  onChange,
}: FontChoiceControlProps) {
  const selectValue =
    value.kind === "preset" && presetIds.includes(value.value as FontPresetId)
      ? value.value
      : "custom";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <label className="text-sm text-text font-medium">{label}</label>
        <Select
          value={selectValue}
          onChange={(e) => {
            const nextValue = e.target.value;
            if (nextValue === "custom") {
              onChange(value.kind === "custom" ? value : { kind: "custom", value: "" });
              return;
            }
            onChange({ kind: "preset", value: nextValue });
          }}
          className="w-56"
        >
          {presetIds.map((presetId) => (
            <option key={presetId} value={presetId}>
              {FONT_PRESETS[presetId].label}
            </option>
          ))}
          <option value="custom">Custom</option>
        </Select>
      </div>

      {selectValue === "custom" && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-text-muted">Font stack</span>
          <Input
            value={value.value}
            placeholder={customPlaceholder}
            onChange={(e) =>
              onChange({
                kind: "custom",
                value: e.target.value,
              })
            }
            className="w-56"
          />
        </div>
      )}
    </div>
  );
}

export function AppearanceSettingsSection() {
  const {
    appearanceSettings,
    theme,
    resolvedTheme,
    setTheme,
    lightPresetId,
    darkPresetId,
    setLightPresetId,
    setDarkPresetId,
    uiFont,
    noteFont,
    codeFont,
    setUiFont,
    setNoteFont,
    setCodeFont,
    noteTypography,
    setNoteTypographySetting,
    resetTypographyAndLayoutSettings,
    textDirection,
    setTextDirection,
    editorWidth,
    setEditorWidth,
    paneMode,
    setPaneMode,
    interfaceZoom,
    setInterfaceZoom,
    customEditorWidthPx,
    setCustomEditorWidthPx,
  } = useTheme();
  const [previewMode, setPreviewMode] = useState<"resolved" | "light" | "dark">(
    "resolved",
  );

  const hasCustomizedTypographyOrLayout =
    !fontChoiceEquals(uiFont, DEFAULT_APPEARANCE_SETTINGS.uiFont) ||
    !fontChoiceEquals(noteFont, DEFAULT_APPEARANCE_SETTINGS.noteFont) ||
    !fontChoiceEquals(codeFont, DEFAULT_APPEARANCE_SETTINGS.codeFont) ||
    noteTypography.baseFontSize !==
      DEFAULT_APPEARANCE_SETTINGS.noteTypography.baseFontSize ||
    noteTypography.boldWeight !==
      DEFAULT_APPEARANCE_SETTINGS.noteTypography.boldWeight ||
    noteTypography.lineHeight !==
      DEFAULT_APPEARANCE_SETTINGS.noteTypography.lineHeight ||
    textDirection !== DEFAULT_APPEARANCE_SETTINGS.textDirection ||
    editorWidth !== DEFAULT_APPEARANCE_SETTINGS.editorWidth ||
    paneMode !== DEFAULT_APPEARANCE_SETTINGS.paneMode ||
    Math.round(interfaceZoom * 100) !== 100;

  const previewTheme = previewMode === "resolved" ? resolvedTheme : previewMode;

  const previewVariables = useMemo(() => {
    const themeTokens = resolveThemeTokens(appearanceSettings, previewTheme);
    const noteFontFamily = resolveFontFamily(noteFont, "system-sans");
    const codeFontFamily = resolveFontFamily(codeFont, "system-mono");
    const uiFontFamily = resolveFontFamily(uiFont, "system-sans");

    return {
      ...themeColorsToCSSVariables(themeTokens),
      "--font-sans": uiFontFamily,
      "--font-mono": codeFontFamily,
      "--editor-font-family": noteFontFamily,
      "--editor-base-font-size": `${noteTypography.baseFontSize}px`,
      "--editor-bold-weight": `${noteTypography.boldWeight}`,
      "--editor-line-height": `${noteTypography.lineHeight}`,
      "--editor-h1-size": `${noteTypography.baseFontSize * 2.25}px`,
      "--editor-h2-size": `${noteTypography.baseFontSize * 1.75}px`,
      "--editor-h3-size": `${noteTypography.baseFontSize * 1.5}px`,
      "--editor-h4-size": `${noteTypography.baseFontSize * 1.25}px`,
      "--editor-h5-size": `${noteTypography.baseFontSize}px`,
      "--editor-h6-size": `${noteTypography.baseFontSize}px`,
    } as CSSProperties;
  }, [
    appearanceSettings,
    codeFont,
    noteFont,
    noteTypography,
    previewTheme,
    uiFont,
  ]);

  const previewStyle = useMemo(() => {
    return {
      ...previewVariables,
      colorScheme: previewTheme,
      backgroundColor: "var(--color-bg)",
      color: "var(--color-text)",
      fontFamily: "var(--font-sans)",
    } as CSSProperties;
  }, [
    previewVariables,
    previewTheme,
  ]);

  return (
    <div className="space-y-10 pt-8 pb-10">
      <section className="space-y-4">
        <h2 className="text-xl font-medium mb-3">Theme</h2>
        <div className="ui-settings-toggle-group mb-3">
          {(["light", "dark", "system"] as ThemeMode[]).map((mode) => (
            <Button
              key={mode}
              onClick={() => setTheme(mode)}
              variant={theme === mode ? "primary" : "ghost"}
              size="md"
              className="flex-1"
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Button>
          ))}
        </div>

        <div className="ui-settings-panel px-4 py-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <label className="text-sm text-text font-medium">Light Theme</label>
            <Select
              value={lightPresetId}
              onChange={(e) => setLightPresetId(e.target.value as typeof lightPresetId)}
              className="w-56"
            >
              {LIGHT_THEME_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4">
            <label className="text-sm text-text font-medium">Dark Theme</label>
            <Select
              value={darkPresetId}
              onChange={(e) => setDarkPresetId(e.target.value as typeof darkPresetId)}
              className="w-56"
            >
              {DARK_THEME_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {theme === "system" && (
          <p className="mt-3 text-sm text-text-muted">
            Currently using {resolvedTheme} mode based on system preference
          </p>
        )}
      </section>

      <div className="ui-settings-separator" />

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-xl font-medium">Typography & Layout</h2>
          <Button
            onClick={resetTypographyAndLayoutSettings}
            variant="ghost"
            size="sm"
            className={hasCustomizedTypographyOrLayout ? "" : "invisible"}
          >
            Reset typography & layout
          </Button>
        </div>

        <div className="ui-settings-panel pl-4 py-4 pr-4 space-y-4">
          <FontChoiceControl
            label="UI Font"
            value={uiFont}
            presetIds={UI_FONT_PRESET_IDS}
            customPlaceholder={`system-ui, sans-serif`}
            onChange={setUiFont}
          />

          <FontChoiceControl
            label="Note Font"
            value={noteFont}
            presetIds={NOTE_FONT_PRESET_IDS}
            customPlaceholder={`ui-serif, serif`}
            onChange={setNoteFont}
          />

          <FontChoiceControl
            label="Code Font"
            value={codeFont}
            presetIds={CODE_FONT_PRESET_IDS}
            customPlaceholder={`ui-monospace, monospace`}
            onChange={setCodeFont}
          />

          <div className="flex items-center justify-between">
            <label className="text-sm text-text font-medium">Note Size</label>
            <div className="flex items-center gap-1 w-40">
              <IconButton
                variant="outline"
                size="md"
                onClick={() =>
                  setNoteTypographySetting(
                    "baseFontSize",
                    Math.max(12, noteTypography.baseFontSize - 1),
                  )
                }
                disabled={noteTypography.baseFontSize <= 12}
                title="Decrease font size"
              >
                <MinusIcon className="w-4 h-4" />
              </IconButton>
              <span className="text-sm font-medium tabular-nums flex-1 text-center">
                {noteTypography.baseFontSize}
              </span>
              <IconButton
                variant="outline"
                size="md"
                onClick={() =>
                  setNoteTypographySetting(
                    "baseFontSize",
                    Math.min(24, noteTypography.baseFontSize + 1),
                  )
                }
                disabled={noteTypography.baseFontSize >= 24}
                title="Increase font size"
              >
                <PlusIcon className="w-4 h-4" />
              </IconButton>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm text-text font-medium">Bold Weight</label>
            <Select
              value={noteTypography.boldWeight}
              onChange={(e) =>
                setNoteTypographySetting("boldWeight", Number(e.target.value))
              }
              className="w-40"
            >
              {boldWeightOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm text-text font-medium">Line Height</label>
            <div className="flex items-center gap-1 w-40">
              <IconButton
                variant="outline"
                size="md"
                onClick={() =>
                  setNoteTypographySetting(
                    "lineHeight",
                    Math.round((noteTypography.lineHeight - 0.1) * 10) / 10,
                  )
                }
                disabled={noteTypography.lineHeight <= 1.0}
                title="Decrease line height"
              >
                <MinusIcon className="w-4 h-4" />
              </IconButton>
              <span className="text-sm font-medium tabular-nums flex-1 text-center">
                {noteTypography.lineHeight.toFixed(1)}
              </span>
              <IconButton
                variant="outline"
                size="md"
                onClick={() =>
                  setNoteTypographySetting(
                    "lineHeight",
                    Math.round((noteTypography.lineHeight + 0.1) * 10) / 10,
                  )
                }
                disabled={noteTypography.lineHeight >= 2.5}
                title="Increase line height"
              >
                <PlusIcon className="w-4 h-4" />
              </IconButton>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm text-text font-medium">
              Text Direction
            </label>
            <Select
              value={textDirection}
              onChange={(e) =>
                setTextDirection(e.target.value as TextDirection)
              }
              className="w-40"
            >
              {textDirectionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm text-text font-medium">
              Workspace Layout
            </label>
            <div className="ui-settings-toggle-group">
              {paneModeOptions.map((option) => (
                <Button
                  key={option.value}
                  onClick={() => setPaneMode(option.value)}
                  variant={paneMode === option.value ? "primary" : "ghost"}
                  size="xs"
                  className="gap-1.5 min-w-19"
                >
                  <ColumnsIcon className="w-4 h-4 stroke-[1.6]" />
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm text-text font-medium">Page Width</label>
            <Select
              value={editorWidth}
              onChange={(e) => setEditorWidth(e.target.value as EditorWidth)}
              className="w-40"
            >
              {editorWidthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          {editorWidth === "custom" && (
            <div className="flex items-center justify-between">
              <label className="text-sm text-text font-medium">
                Custom Width
              </label>
              <div className="relative w-40 flex items-center gap-2">
                <Input
                  type="number"
                  min="480"
                  max="3840"
                  step="10"
                  value={customEditorWidthPx}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    if (Number.isFinite(parsed)) {
                      setCustomEditorWidthPx(parsed);
                    }
                  }}
                  className="w-full text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-sm text-text-muted">px</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <label className="text-sm text-text font-medium">
              Interface Zoom
            </label>
            <div className="flex items-center gap-1 w-40">
              <IconButton
                variant="outline"
                size="md"
                onClick={() => setInterfaceZoom((prev) => prev - 0.05)}
                disabled={interfaceZoom <= 0.7}
                title="Zoom out"
              >
                <MinusIcon className="w-4 h-4" />
              </IconButton>
              <span className="text-sm font-medium tabular-nums flex-1 text-center">
                {Math.round(interfaceZoom * 100)}%
              </span>
              <IconButton
                variant="outline"
                size="md"
                onClick={() => setInterfaceZoom((prev) => prev + 0.05)}
                disabled={interfaceZoom >= 1.5}
                title="Zoom in"
              >
                <PlusIcon className="w-4 h-4" />
              </IconButton>
            </div>
          </div>
        </div>

        <div className="mt-3 relative">
          <div className="absolute top-3 left-4 flex items-center text-sm font-medium text-text-muted/70 gap-1 z-10">
            <EyeIcon className="w-4.5 h-4.5 stroke-[1.5]" />
            <span>Preview</span>
          </div>
          <div className="absolute top-3 right-4 z-10">
            <div className="ui-settings-toggle-group bg-bg/80 backdrop-blur">
              {[
                { value: "resolved", label: "Live" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ].map((option) => (
                <Button
                  key={option.value}
                  onClick={() =>
                    setPreviewMode(option.value as "resolved" | "light" | "dark")
                  }
                  variant={previewMode === option.value ? "primary" : "ghost"}
                  size="xs"
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div
            className={`ui-settings-panel p-6 pt-20 max-h-160 overflow-hidden ${
              previewTheme === "dark" ? "dark" : ""
            }`}
            style={previewStyle}
          >
            <div
              className="prose prose-lg dark:prose-invert max-w-xl mx-auto"
              dir={textDirection}
            >
              <h1>Sly&apos;s Border Collie Routine</h1>
              <p>
                A compact daily plan for a border collie who thrives on motion,
                focus, and a clear job. <strong>Simple routines</strong> keep
                Sly sharp and settled.
              </p>

              <h2>Primary Techniques</h2>
              <ul>
                <li>
                  <strong>Morning Walk</strong> - Start the day with a brisk lap
                  around the block
                </li>
                <li>
                  <strong>Recall Reps</strong> - Practice quick training before
                  breakfast
                </li>
                <li>
                  <strong>Frisbee Sets</strong> - Mix short sprints with calm
                  resets
                </li>
                <li>
                  <strong>Evening Cooldown</strong> - Finish with sniffing,
                  puzzles, and rest
                </li>
              </ul>

              <h2>Advanced Protocol</h2>
              <p>
                The best days combine exercise with problem-solving. A walk,
                then a few minutes of focused training, gives Sly both.
              </p>

              <pre>
                <code>
                  {`function buildGreatDay() {
  while (sly.hasEnergy()) {
    walk();
    train();
    if (field.hasDisc()) sprint();
  }
  settle();
}`}
                </code>
              </pre>

              <h2>Common Mistakes to Avoid</h2>
              <ol>
                <li>Skipping the morning walk and expecting calm by noon</li>
                <li>Running endless fetch without pauses to reset focus</li>
                <li>Forgetting that rest is part of the routine too</li>
              </ol>

              <p>
                Remember: <em>border collies need motion and purpose</em>. Give
                Sly both, and the whole house has a better day.
              </p>
            </div>
          </div>
          <div
            className="absolute bottom-0 left-0 right-0 h-40 bg-linear-to-t from-bg to-transparent pointer-events-none"
            style={previewVariables}
          />
        </div>
      </section>
    </div>
  );
}
