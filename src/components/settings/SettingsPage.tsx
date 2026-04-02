import { useState, useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import {
  ArrowLeftIcon,
  FolderIcon,
  SwatchIcon,
  KeyboardIcon,
  InfoIcon,
} from "../icons";
import { Button, IconButton } from "../ui";
import { GeneralSettingsSection } from "./GeneralSettingsSection";
import { AppearanceSettingsSection } from "./EditorSettingsSection";
import { ExtensionsSettingsSection } from "./ExtensionsSettingsSection";
import { ShortcutsSettingsSection } from "./ShortcutsSettingsSection";
import { AboutSettingsSection } from "./AboutSettingsSection";
import { alt, isMac, mod, shortcut } from "../../lib/platform";
import type { AiProvider } from "../../services/ai";

interface SettingsPageProps {
  onBack: () => void;
  initialTab?: SettingsTab;
  availableAiProviders: AiProvider[];
  aiProvidersLoading: boolean;
  onRefreshAiProviders: () => Promise<void>;
}

export type SettingsTab = "general" | "editor" | "extensions" | "shortcuts" | "about";

const tabs: {
  id: SettingsTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcutLabel: string;
}[] = [
  {
    id: "general",
    label: "General",
    icon: FolderIcon,
    shortcutLabel: shortcut(mod, alt, "1"),
  },
  {
    id: "editor",
    label: "Appearance",
    icon: SwatchIcon,
    shortcutLabel: shortcut(mod, alt, "2"),
  },
  {
    id: "extensions",
    label: "Assistant & CLI",
    icon: Sparkles,
    shortcutLabel: shortcut(mod, alt, "3"),
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    icon: KeyboardIcon,
    shortcutLabel: shortcut(mod, alt, "4"),
  },
  {
    id: "about",
    label: "About",
    icon: InfoIcon,
    shortcutLabel: shortcut(mod, alt, "5"),
  },
];

export function SettingsPage({
  onBack,
  initialTab,
  availableAiProviders,
  aiProvidersLoading,
  onRefreshAiProviders,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab ?? "general");
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
        setActiveTab("general");
      } else if (e.code === "Digit2") {
        e.preventDefault();
        setActiveTab("editor");
      } else if (e.code === "Digit3") {
        e.preventDefault();
        setActiveTab("extensions");
      } else if (e.code === "Digit4") {
        e.preventDefault();
        setActiveTab("shortcuts");
      } else if (e.code === "Digit5") {
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
        <nav className="flex-1 p-2.5 flex flex-col gap-0.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <Button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                variant={isActive ? "secondary" : "ghost"}
                size="sm"
                className="justify-between gap-2.5 h-10 pr-3.5"
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4.5 h-4.5 stroke-[1.5]" />
                  {tab.label}
                </div>
                <div className="text-xs text-text-muted">{tab.shortcutLabel}</div>
              </Button>
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
            {activeTab === "general" && <GeneralSettingsSection />}
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
