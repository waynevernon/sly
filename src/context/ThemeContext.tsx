import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_APPEARANCE_SETTINGS,
  isThemePresetId,
  resolveFontFamily,
  resolveThemeTokens,
  themeColorsToCSSVariables,
  normalizeFontChoice,
} from "../lib/appearance";
import {
  getAppearanceSettings,
  updateAppearanceSettings,
} from "../services/notes";
import type {
  AppearanceSettings,
  EditorWidth,
  FontChoice,
  PaneMode,
  TextDirection,
  ThemeMode,
  ThemePresetId,
  NoteTypographySettings,
} from "../types/note";

const editorWidthMap: Record<Exclude<EditorWidth, "custom">, string> = {
  narrow: "36rem",
  normal: "48rem",
  wide: "64rem",
  full: "100%",
};

const DEFAULT_CUSTOM_WIDTH_PX = 768;

interface ThemeContextType {
  appearanceSettings: AppearanceSettings;
  theme: ThemeMode;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemeMode) => void;
  cycleTheme: () => void;
  lightPresetId: ThemePresetId;
  darkPresetId: ThemePresetId;
  setLightPresetId: (presetId: ThemePresetId) => void;
  setDarkPresetId: (presetId: ThemePresetId) => void;
  uiFont: FontChoice;
  noteFont: FontChoice;
  codeFont: FontChoice;
  setUiFont: (font: FontChoice) => void;
  setNoteFont: (font: FontChoice) => void;
  setCodeFont: (font: FontChoice) => void;
  noteTypography: NoteTypographySettings;
  setNoteTypographySetting: <K extends keyof NoteTypographySettings>(
    key: K,
    value: NoteTypographySettings[K],
  ) => void;
  resetTypographyAndLayoutSettings: () => void;
  textDirection: TextDirection;
  setTextDirection: (dir: TextDirection) => void;
  editorWidth: EditorWidth;
  setEditorWidth: (width: EditorWidth) => void;
  paneMode: PaneMode;
  setPaneMode: (mode: PaneMode) => void;
  cyclePaneMode: () => void;
  interfaceZoom: number;
  setInterfaceZoom: (
    zoomOrUpdater: number | ((prev: number) => number),
  ) => void;
  customEditorWidthPx: number;
  setCustomEditorWidthPx: (px: number) => void;
  setEditorMaxWidthLive: (value: string) => void;
  foldersPaneWidth: number;
  notesPaneWidth: number;
  setPaneWidths: (folders: number, notes: number) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

interface ThemeProviderProps {
  children: ReactNode;
}

function isEditorWidth(value: unknown): value is EditorWidth {
  return (
    value === "narrow" ||
    value === "normal" ||
    value === "wide" ||
    value === "full" ||
    value === "custom"
  );
}

function isTextDirection(value: unknown): value is TextDirection {
  return value === "auto" || value === "ltr" || value === "rtl";
}

function isPaneMode(value: unknown): value is PaneMode {
  return value === 1 || value === 2 || value === 3;
}

function clampZoom(zoom: number) {
  return Math.round(Math.min(Math.max(zoom, 0.7), 1.5) * 20) / 20;
}

function normalizeAppearanceSettings(
  appearance: AppearanceSettings | null | undefined,
): AppearanceSettings {
  const next = appearance ?? DEFAULT_APPEARANCE_SETTINGS;
  const defaultAppearance = DEFAULT_APPEARANCE_SETTINGS;

  return {
    mode:
      next.mode === "light" || next.mode === "dark" || next.mode === "system"
        ? next.mode
        : defaultAppearance.mode,
    lightPresetId:
      next.lightPresetId && isThemePresetId(next.lightPresetId)
        ? next.lightPresetId
        : defaultAppearance.lightPresetId,
    darkPresetId:
      next.darkPresetId && isThemePresetId(next.darkPresetId)
        ? next.darkPresetId
        : defaultAppearance.darkPresetId,
    uiFont: normalizeFontChoice(next.uiFont, "system-sans"),
    noteFont: normalizeFontChoice(next.noteFont, "system-sans"),
    codeFont: normalizeFontChoice(next.codeFont, "system-mono"),
    noteTypography: {
      baseFontSize:
        typeof next.noteTypography?.baseFontSize === "number"
          ? next.noteTypography.baseFontSize
          : defaultAppearance.noteTypography.baseFontSize,
      boldWeight:
        typeof next.noteTypography?.boldWeight === "number"
          ? next.noteTypography.boldWeight
          : defaultAppearance.noteTypography.boldWeight,
      lineHeight:
        typeof next.noteTypography?.lineHeight === "number"
          ? next.noteTypography.lineHeight
          : defaultAppearance.noteTypography.lineHeight,
    },
    textDirection: isTextDirection(next.textDirection)
      ? next.textDirection
      : defaultAppearance.textDirection,
    editorWidth: isEditorWidth(next.editorWidth)
      ? next.editorWidth
      : defaultAppearance.editorWidth,
    customEditorWidthPx:
      typeof next.customEditorWidthPx === "number" &&
      next.customEditorWidthPx >= 480
        ? next.customEditorWidthPx
        : undefined,
    interfaceZoom:
      typeof next.interfaceZoom === "number"
        ? clampZoom(next.interfaceZoom)
        : defaultAppearance.interfaceZoom,
    paneMode: isPaneMode(next.paneMode)
      ? next.paneMode
      : defaultAppearance.paneMode,
    foldersPaneWidth:
      typeof next.foldersPaneWidth === "number" && next.foldersPaneWidth >= 140
        ? next.foldersPaneWidth
        : defaultAppearance.foldersPaneWidth,
    notesPaneWidth:
      typeof next.notesPaneWidth === "number" && next.notesPaneWidth >= 180
        ? next.notesPaneWidth
        : defaultAppearance.notesPaneWidth,
    customLightColors: next.customLightColors,
    customDarkColors: next.customDarkColors,
  };
}

function applyAppearanceCSSVariables(
  appearance: AppearanceSettings,
  resolvedTheme: "light" | "dark",
) {
  const root = document.documentElement;
  const noteFontFamily = resolveFontFamily(appearance.noteFont, "system-sans");
  const codeFontFamily = resolveFontFamily(appearance.codeFont, "system-mono");
  const uiFontFamily = resolveFontFamily(appearance.uiFont, "system-sans");
  const baseSize = appearance.noteTypography.baseFontSize;
  const boldWeight = appearance.noteTypography.boldWeight;
  const lineHeight = appearance.noteTypography.lineHeight;
  const themeTokens = resolveThemeTokens(appearance, resolvedTheme);

  for (const [key, value] of Object.entries(themeColorsToCSSVariables(themeTokens))) {
    root.style.setProperty(key, value);
  }

  root.style.setProperty("--font-sans", uiFontFamily);
  root.style.setProperty("--font-mono", codeFontFamily);
  root.style.setProperty("--editor-font-family", noteFontFamily);
  root.style.setProperty("--editor-base-font-size", `${baseSize}px`);
  root.style.setProperty("--editor-bold-weight", String(boldWeight));
  root.style.setProperty("--editor-line-height", String(lineHeight));
  root.style.setProperty("--editor-h1-size", `${baseSize * 2.25}px`);
  root.style.setProperty("--editor-h2-size", `${baseSize * 1.75}px`);
  root.style.setProperty("--editor-h3-size", `${baseSize * 1.5}px`);
  root.style.setProperty("--editor-h4-size", `${baseSize * 1.25}px`);
  root.style.setProperty("--editor-h5-size", `${baseSize}px`);
  root.style.setProperty("--editor-h6-size", `${baseSize}px`);
  if (appearance.editorWidth === "custom") {
    const widthPx = appearance.customEditorWidthPx ?? DEFAULT_CUSTOM_WIDTH_PX;
    root.style.setProperty("--editor-max-width", `${widthPx}px`);
  } else {
    root.style.setProperty(
      "--editor-max-width",
      editorWidthMap[appearance.editorWidth],
    );
  }
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [appearanceSettings, setAppearanceSettingsState] =
    useState<AppearanceSettings>(DEFAULT_APPEARANCE_SETTINGS);
  const [isInitialized, setIsInitialized] = useState(false);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() => {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  const persistAppearance = useCallback(async (next: AppearanceSettings) => {
    try {
      await updateAppearanceSettings(next);
    } catch (error) {
      console.error("Failed to save appearance settings:", error);
    }
  }, []);

  const updateAppearance = useCallback(
    (updater: (prev: AppearanceSettings) => AppearanceSettings) => {
      setAppearanceSettingsState((prev) => {
        const next = normalizeAppearanceSettings(updater(prev));
        void persistAppearance(next);
        return next;
      });
    },
    [persistAppearance],
  );

  const loadSettingsFromBackend = useCallback(async () => {
    try {
      const appearance = await getAppearanceSettings();
      setAppearanceSettingsState(normalizeAppearanceSettings(appearance));
    } catch (error) {
      console.error("Failed to load appearance settings:", error);
      setAppearanceSettingsState(DEFAULT_APPEARANCE_SETTINGS);
    }
  }, []);

  useEffect(() => {
    loadSettingsFromBackend().finally(() => {
      setIsInitialized(true);
    });
  }, [loadSettingsFromBackend]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "dark" : "light");
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  const theme = appearanceSettings.mode;
  const resolvedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [resolvedTheme]);

  useEffect(() => {
    applyAppearanceCSSVariables(appearanceSettings, resolvedTheme);
  }, [appearanceSettings, resolvedTheme]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("zoom-no-transition");
    root.style.zoom = String(appearanceSettings.interfaceZoom);
    const raf = requestAnimationFrame(() => {
      root.classList.remove("zoom-no-transition");
    });
    return () => cancelAnimationFrame(raf);
  }, [appearanceSettings.interfaceZoom]);

  const setTheme = useCallback(
    (nextTheme: ThemeMode) => {
      updateAppearance((prev) => ({ ...prev, mode: nextTheme }));
    },
    [updateAppearance],
  );

  const cycleTheme = useCallback(() => {
    const order: ThemeMode[] = ["light", "dark", "system"];
    const currentIndex = order.indexOf(theme);
    setTheme(order[(currentIndex + 1) % order.length]);
  }, [theme, setTheme]);

  const setLightPresetId = useCallback(
    (presetId: ThemePresetId) => {
      updateAppearance((prev) => ({ ...prev, lightPresetId: presetId }));
    },
    [updateAppearance],
  );

  const setDarkPresetId = useCallback(
    (presetId: ThemePresetId) => {
      updateAppearance((prev) => ({ ...prev, darkPresetId: presetId }));
    },
    [updateAppearance],
  );

  const setUiFont = useCallback(
    (font: FontChoice) => {
      updateAppearance((prev) => ({ ...prev, uiFont: font }));
    },
    [updateAppearance],
  );

  const setNoteFont = useCallback(
    (font: FontChoice) => {
      updateAppearance((prev) => ({ ...prev, noteFont: font }));
    },
    [updateAppearance],
  );

  const setCodeFont = useCallback(
    (font: FontChoice) => {
      updateAppearance((prev) => ({ ...prev, codeFont: font }));
    },
    [updateAppearance],
  );

  const setNoteTypographySetting = useCallback(
    <K extends keyof NoteTypographySettings>(
      key: K,
      value: NoteTypographySettings[K],
    ) => {
      updateAppearance((prev) => ({
        ...prev,
        noteTypography: { ...prev.noteTypography, [key]: value },
      }));
    },
    [updateAppearance],
  );

  const resetTypographyAndLayoutSettings = useCallback(() => {
    updateAppearance((prev) => ({
      ...prev,
      uiFont: DEFAULT_APPEARANCE_SETTINGS.uiFont,
      noteFont: DEFAULT_APPEARANCE_SETTINGS.noteFont,
      codeFont: DEFAULT_APPEARANCE_SETTINGS.codeFont,
      noteTypography: DEFAULT_APPEARANCE_SETTINGS.noteTypography,
      textDirection: DEFAULT_APPEARANCE_SETTINGS.textDirection,
      editorWidth: DEFAULT_APPEARANCE_SETTINGS.editorWidth,
      customEditorWidthPx: undefined,
      interfaceZoom: DEFAULT_APPEARANCE_SETTINGS.interfaceZoom,
      paneMode: DEFAULT_APPEARANCE_SETTINGS.paneMode,
    }));
  }, [updateAppearance]);

  const setTextDirection = useCallback(
    (dir: TextDirection) => {
      updateAppearance((prev) => ({ ...prev, textDirection: dir }));
    },
    [updateAppearance],
  );

  const setEditorWidth = useCallback(
    (width: EditorWidth) => {
      updateAppearance((prev) => ({ ...prev, editorWidth: width }));
    },
    [updateAppearance],
  );

  const setPaneMode = useCallback(
    (mode: PaneMode) => {
      updateAppearance((prev) => ({ ...prev, paneMode: mode }));
    },
    [updateAppearance],
  );

  const cyclePaneMode = useCallback(() => {
    const order: PaneMode[] = [1, 2, 3];
    const currentIndex = order.indexOf(appearanceSettings.paneMode);
    const nextMode = order[(currentIndex - 1 + order.length) % order.length];
    setPaneMode(nextMode);
  }, [appearanceSettings.paneMode, setPaneMode]);

  const setInterfaceZoom = useCallback(
    (zoomOrUpdater: number | ((prev: number) => number)) => {
      updateAppearance((prev) => {
        const raw =
          typeof zoomOrUpdater === "function"
            ? zoomOrUpdater(prev.interfaceZoom)
            : zoomOrUpdater;
        return {
          ...prev,
          interfaceZoom: clampZoom(raw),
        };
      });
    },
    [updateAppearance],
  );

  const setCustomEditorWidthPx = useCallback(
    (px: number) => {
      updateAppearance((prev) => ({
        ...prev,
        editorWidth: "custom",
        customEditorWidthPx: Math.min(Math.max(Math.round(px), 480), 3840),
      }));
    },
    [updateAppearance],
  );

  const setEditorMaxWidthLive = useCallback((value: string) => {
    document.documentElement.style.setProperty("--editor-max-width", value);
  }, []);

  const setPaneWidths = useCallback(
    (folders: number, notes: number) => {
      updateAppearance((prev) => ({
        ...prev,
        foldersPaneWidth: Math.min(Math.max(Math.round(folders), 140), 480),
        notesPaneWidth: Math.min(Math.max(Math.round(notes), 180), 560),
      }));
    },
    [updateAppearance],
  );

  if (!isInitialized) {
    return null;
  }

  return (
    <ThemeContext.Provider
      value={{
        appearanceSettings,
        theme,
        resolvedTheme,
        setTheme,
        cycleTheme,
        lightPresetId: appearanceSettings.lightPresetId,
        darkPresetId: appearanceSettings.darkPresetId,
        setLightPresetId,
        setDarkPresetId,
        uiFont: appearanceSettings.uiFont,
        noteFont: appearanceSettings.noteFont,
        codeFont: appearanceSettings.codeFont,
        setUiFont,
        setNoteFont,
        setCodeFont,
        noteTypography: appearanceSettings.noteTypography,
        setNoteTypographySetting,
        resetTypographyAndLayoutSettings,
        textDirection: appearanceSettings.textDirection,
        setTextDirection,
        editorWidth: appearanceSettings.editorWidth,
        setEditorWidth,
        paneMode: appearanceSettings.paneMode,
        setPaneMode,
        cyclePaneMode,
        interfaceZoom: appearanceSettings.interfaceZoom,
        setInterfaceZoom,
        customEditorWidthPx:
          appearanceSettings.customEditorWidthPx ?? DEFAULT_CUSTOM_WIDTH_PX,
        setCustomEditorWidthPx,
        setEditorMaxWidthLive,
        foldersPaneWidth:
          appearanceSettings.foldersPaneWidth ?? 240,
        notesPaneWidth:
          appearanceSettings.notesPaneWidth ?? 304,
        setPaneWidths,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
