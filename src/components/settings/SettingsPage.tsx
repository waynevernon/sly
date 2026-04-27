import { useState, useEffect, useRef } from "react";
import { CheckSquare, Sparkles } from "lucide-react";
import {
  ArrowLeftIcon,
  NoteIcon,
  SwatchIcon,
  KeyboardIcon,
  InfoIcon,
} from "../icons";
import { IconButton } from "../ui";
import { GeneralSettingsSection } from "./GeneralSettingsSection";
import { TasksSettingsSection } from "./TasksSettingsSection";
import { AppearanceSettingsSection } from "./EditorSettingsSection";
import { ExtensionsSettingsSection } from "./ExtensionsSettingsSection";
import { ShortcutsSettingsSection } from "./ShortcutsSettingsSection";
import { AboutSettingsSection } from "./AboutSettingsSection";
import { isMac, mod, shortcut } from "../../lib/platform";
import { SETTINGS_TAB_SHORTCUT_KEYS } from "../../lib/shortcutDefinitions";
import type { AiProvider } from "../../services/ai";

interface SettingsPageProps {
  onBack: () => void;
  initialTab?: SettingsTab;
  availableAiProviders: AiProvider[];
  aiProvidersLoading: boolean;
  onRefreshAiProviders: () => Promise<void>;
}

export type SettingsTab = "notes" | "tasks" | "editor" | "extensions" | "shortcuts" | "about";

const tabs: {
  id: SettingsTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcutLabel: string;
}[] = [
  {
    id: "notes",
    label: "Notes",
    icon: NoteIcon,
    shortcutLabel: shortcut(...SETTINGS_TAB_SHORTCUT_KEYS.notes),
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: CheckSquare,
    shortcutLabel: shortcut(...SETTINGS_TAB_SHORTCUT_KEYS.tasks),
  },
  {
    id: "editor",
    label: "Appearance",
    icon: SwatchIcon,
    shortcutLabel: shortcut(...SETTINGS_TAB_SHORTCUT_KEYS.editor),
  },
  {
    id: "extensions",
    label: "Integrations",
    icon: Sparkles,
    shortcutLabel: shortcut(...SETTINGS_TAB_SHORTCUT_KEYS.extensions),
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    icon: KeyboardIcon,
    shortcutLabel: shortcut(...SETTINGS_TAB_SHORTCUT_KEYS.shortcuts),
  },
  {
    id: "about",
    label: "About",
    icon: InfoIcon,
    shortcutLabel: shortcut(...SETTINGS_TAB_SHORTCUT_KEYS.about),
  },
];

export function SettingsPage({
  onBack,
  initialTab,
  availableAiProviders,
  aiProvidersLoading,
  onRefreshAiProviders,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab ?? "notes");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Reset scroll position when tab changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.altKey) {
        return;
      }

      if (e.code === "Digit1") {
        e.preventDefault();
        setActiveTab("notes");
      } else if (e.code === "Digit2") {
        e.preventDefault();
        setActiveTab("tasks");
      } else if (e.code === "Digit3") {
        e.preventDefault();
        setActiveTab("editor");
      } else if (e.code === "Digit4") {
        e.preventDefault();
        setActiveTab("extensions");
      } else if (e.code === "Digit5") {
        e.preventDefault();
        setActiveTab("shortcuts");
      } else if (e.code === "Digit6") {
        e.preventDefault();
        setActiveTab("about");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="h-full flex bg-bg w-full">
      {/* Sidebar - matches main Notes sidebar */}
      <div className="w-64 h-full bg-bg-secondary border-r border-border flex flex-col select-none">
        {/* Drag region */}
        <div className="ui-pane-drag-region" data-tauri-drag-region></div>

        {/* Header with back button and Settings title */}
        <div className="ui-pane-header">
          <div className="flex items-center gap-1">
            <IconButton
              onClick={onBack}
              title={`Back (${mod}${isMac ? "" : "+"},)`}
            >
              <ArrowLeftIcon className="w-4.5 h-4.5 stroke-[1.5]" />
            </IconButton>
            <div className="font-medium text-base">Settings</div>
          </div>
        </div>

        {/* Navigation tabs */}
        <nav className="flex-1 px-1.5 py-2.5 flex flex-col gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-pressed={isActive}
                className={`ui-focus-ring flex w-full items-center justify-between gap-3 rounded-[var(--ui-radius-md)] pl-3 pr-2 py-2 text-left transition-[background-color,box-shadow] duration-200 ${
                  isActive ? "bg-bg-muted text-text" : "text-text hover:bg-bg-muted/80"
                }`}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <Icon className="h-4.25 w-4.25 shrink-0 text-text-muted/80 stroke-[1.7]" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {tab.label}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-text-muted">
                  {tab.shortcutLabel}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col bg-bg overflow-hidden">
        {/* Drag region */}
        <div className="ui-pane-drag-region" data-tauri-drag-region></div>

        {/* Content - centered with max width */}
        <div
          ref={scrollContainerRef}
          className="ui-scrollbar-overlay flex-1 overflow-auto scrollbar-gutter-stable mr-px"
        >
          <div className="w-full max-w-[56rem] mx-auto px-8 pb-8">
            {activeTab === "notes" && <GeneralSettingsSection />}
            {activeTab === "tasks" && <TasksSettingsSection />}
            {activeTab === "editor" && <AppearanceSettingsSection />}
            {activeTab === "extensions" && (
              <ExtensionsSettingsSection
                aiProviders={availableAiProviders}
                aiProvidersLoading={aiProvidersLoading}
                onRefreshAiProviders={onRefreshAiProviders}
              />
            )}
            {activeTab === "shortcuts" && <ShortcutsSettingsSection />}
            {activeTab === "about" && <AboutSettingsSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
