import { useEffect, useMemo, useRef, type KeyboardEvent, type ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { TextAlignJustify, TextCursor, Trash2 } from "lucide-react";
import type {
  AssistantAssistantTurn,
  AssistantProposal,
  AssistantThreadState,
} from "../../types/assistant";
import type { AiProvider } from "../../services/ai";
import { cn } from "../../lib/utils";
import {
  Button,
  IconButton,
  Tooltip,
  menuItemClassName,
  menuSurfaceClassName,
} from "../ui";
import {
  ChevronDownIcon,
  ClaudeIcon,
  CodexIcon,
  NoteIcon,
  OpenCodeIcon,
  OllamaIcon,
  SpinnerIcon,
} from "../icons";

const PROVIDER_LABELS: Record<AiProvider, string> = {
  claude: "Claude",
  codex: "Codex",
  opencode: "OpenCode",
  ollama: "Ollama",
};

const PROVIDER_INSTALL_URLS: Record<AiProvider, string> = {
  claude: "https://code.claude.com/docs/en/quickstart",
  codex: "https://github.com/openai/codex",
  opencode: "https://opencode.ai",
  ollama: "https://ollama.com",
};

const SCOPE_LABELS: Record<AssistantThreadState["scope"], string> = {
  note: "Note",
  section: "Section",
  selection: "Selection",
};

function ProviderIcon({ provider }: { provider: AiProvider }) {
  const Icon =
    provider === "codex"
      ? CodexIcon
      : provider === "opencode"
        ? OpenCodeIcon
        : provider === "ollama"
          ? OllamaIcon
          : ClaudeIcon;
  return <Icon className="h-4 w-4 text-text-muted" />;
}

function AssistantSelectMenu<T extends string>({
  value,
  items,
  ariaLabel,
  onChange,
  triggerClassName,
}: {
  value: T;
  items: Array<{
    value: T;
    label: string;
    leading?: ReactNode;
  }>;
  ariaLabel: string;
  onChange: (value: T) => void;
  triggerClassName?: string;
}) {
  const selectedItem = items.find((item) => item.value === value) ?? items[0];

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            "ui-focus-ring flex h-[var(--ui-control-height-standard)] w-full items-center gap-2 rounded-[var(--ui-radius-md)] border border-border bg-bg px-3 text-left text-sm text-text transition-colors",
            "hover:bg-bg-muted data-[state=open]:bg-bg-muted",
            triggerClassName,
          )}
        >
          <span className="min-w-0 flex-1 truncate">
            <span className="inline-flex min-w-0 items-center gap-2 truncate">
              {selectedItem?.leading ? (
                <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
                  {selectedItem.leading}
                </span>
              ) : null}
              <span className="truncate">{selectedItem?.label ?? value}</span>
            </span>
          </span>
          <ChevronDownIcon className="h-4 w-4 shrink-0 stroke-[1.7] text-text-muted" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="bottom"
          align="start"
          sideOffset={8}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
          className={`${menuSurfaceClassName} min-w-[var(--radix-dropdown-menu-trigger-width)] z-50`}
        >
          <DropdownMenu.RadioGroup
            value={value}
            onValueChange={(nextValue) => onChange(nextValue as T)}
          >
            {items.map((item) => (
              <DropdownMenu.RadioItem
                key={item.value}
                value={item.value}
                className={cn(menuItemClassName, "gap-2")}
              >
                <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-text">
                  {item.value === value ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  ) : null}
                </span>
                {item.leading ? (
                  <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
                    {item.leading}
                  </span>
                ) : null}
                <span className="truncate">{item.label}</span>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ProposalCard({
  beforeText,
  proposal,
  disabled,
  onApply,
}: {
  beforeText: string;
  proposal: AssistantProposal;
  disabled: boolean;
  onApply: (proposal: AssistantProposal) => void;
}) {
  return (
    <div className="rounded-[var(--ui-radius-md)] border border-border bg-bg p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-text">{proposal.title}</div>
          <div className="mt-0.5 text-xs text-text-muted">
            {proposal.summary} · Lines {proposal.startLine}-{proposal.endLine}
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onApply(proposal)}
        >
          Apply
        </Button>
      </div>
      <div className="mt-2 grid gap-2">
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
            Current
          </div>
          <pre className="overflow-x-auto rounded-[var(--ui-radius-sm)] bg-bg-secondary px-2.5 py-2 text-xs text-text-muted whitespace-pre-wrap">
            {beforeText}
          </pre>
        </div>
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
            Replacement
          </div>
          <pre className="overflow-x-auto rounded-[var(--ui-radius-sm)] bg-bg-secondary px-2.5 py-2 text-xs text-text whitespace-pre-wrap">
            {proposal.replacement}
          </pre>
        </div>
      </div>
    </div>
  );
}

function AssistantTurnView({
  turn,
  disabled,
  onApply,
}: {
  turn: AssistantAssistantTurn;
  disabled: boolean;
  onApply: (proposal: AssistantProposal) => void;
}) {
  return (
    <div className="rounded-[var(--ui-radius-md)] bg-bg-muted px-3 py-2.5">
      <div className="text-[13px] font-medium text-text">Assistant</div>
      <div className="mt-1 whitespace-pre-wrap text-sm text-text">{turn.replyText}</div>
      {turn.warning ? (
        <div className="mt-2 rounded-[var(--ui-radius-sm)] border border-[var(--color-warning)]/20 bg-[var(--color-warning-muted)] px-2.5 py-2 text-xs text-orange-700 dark:text-orange-400">
          {turn.warning}
        </div>
      ) : null}
      {turn.stale ? (
        <div className="mt-2 rounded-[var(--ui-radius-sm)] border border-[var(--color-warning)]/20 bg-[var(--color-warning-muted)] px-2.5 py-2 text-xs text-orange-700 dark:text-orange-400">
          This proposal is stale because the note changed. Send a new request before applying edits.
        </div>
      ) : null}
      {turn.invalidReason ? (
        <div className="mt-2 rounded-[var(--ui-radius-sm)] border border-[var(--color-warning)]/20 bg-[var(--color-warning-muted)] px-2.5 py-2 text-xs text-orange-700 dark:text-orange-400">
          {turn.invalidReason}
        </div>
      ) : null}
      {turn.proposals.length > 0 ? (
        <div className="mt-3 space-y-2">
          {turn.proposals.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              beforeText={
                turn.snapshotMarkdown
                  .split(/\r?\n/)
                  .slice(proposal.startLine - 1, proposal.endLine)
                  .join("\n")
              }
              proposal={proposal}
              disabled={
                disabled ||
                turn.stale === true ||
                (turn.invalidProposalIds ?? []).includes(proposal.id)
              }
              onApply={onApply}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export interface RightPanelAssistantProps {
  hasNote: boolean;
  providerCheckComplete: boolean;
  availableProviders: AiProvider[];
  thread: AssistantThreadState | null;
  onProviderChange: (provider: AiProvider) => void;
  onScopeChange: (scope: AssistantThreadState["scope"]) => void;
  onDraftChange: (draft: string) => void;
  onClearThread: () => void;
  onSubmit: () => void;
  onApplyProposal: (
    turn: AssistantAssistantTurn,
    proposal: AssistantProposal,
  ) => void;
}

export function RightPanelAssistant({
  hasNote,
  providerCheckComplete,
  availableProviders,
  thread,
  onProviderChange,
  onScopeChange,
  onDraftChange,
  onClearThread,
  onSubmit,
  onApplyProposal,
}: RightPanelAssistantProps) {
  const transcriptRef = useRef<HTMLDivElement>(null);
  const canClear = Boolean(thread && (thread.turns.length > 0 || thread.draft.trim().length > 0));
  const emptyInstallProviders = useMemo(
    () =>
      (["claude", "codex", "opencode", "ollama"] as const).map((provider) => ({
        provider,
        label: PROVIDER_LABELS[provider],
        url: PROVIDER_INSTALL_URLS[provider],
      })),
    [],
  );
  const providerItems = useMemo(
    () =>
      availableProviders.map((provider) => ({
        value: provider,
        label: PROVIDER_LABELS[provider],
        leading: <ProviderIcon provider={provider} />,
      })),
    [availableProviders],
  );
  const scopeItems = useMemo(
    () => {
      const scopeIcons: Record<AssistantThreadState["scope"], ReactNode> = {
        note: <NoteIcon className="h-4 w-4 text-text-muted" />,
        section: <TextAlignJustify className="h-4 w-4 text-text-muted" />,
        selection: <TextCursor className="h-4 w-4 text-text-muted" />,
      };

      return (Object.entries(SCOPE_LABELS) as Array<
        [AssistantThreadState["scope"], string]
      >).map(([value, label]) => ({
        value,
        label,
        leading: scopeIcons[value],
      }));
    },
    [],
  );

  useEffect(() => {
    if (typeof transcriptRef.current?.scrollTo === "function") {
      transcriptRef.current.scrollTo({
        top: transcriptRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [thread?.turns.length]);

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onSubmit();
    }
  };

  if (!hasNote || !thread) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-6 text-center text-sm text-text-muted">
        Open a note to start a conversation.
      </div>
    );
  }

  if (!providerCheckComplete) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 px-4 py-6 text-sm text-text-muted">
        <SpinnerIcon className="h-4 w-4 animate-spin" />
        Detecting installed providers...
      </div>
    );
  }

  if (availableProviders.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-4 px-4 py-4">
        <div className="rounded-[var(--ui-radius-md)] border border-[var(--color-warning)]/15 bg-[var(--color-warning-muted)] p-3 text-sm text-orange-700 dark:text-orange-400">
          No supported AI CLI was found. Install one of the providers below, then open Settings &gt; Assistant &amp; CLI to refresh detection.
        </div>
        <div className="space-y-2">
          {emptyInstallProviders.map(({ provider, label, url }) => (
            <a
              key={provider}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-[var(--ui-radius-md)] border border-border bg-bg px-3 py-2 text-sm text-text hover:bg-bg-muted"
            >
              <span className="flex items-center gap-2">
                <ProviderIcon provider={provider} />
                {label}
              </span>
              <span className="text-text-muted">Install</span>
            </a>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={transcriptRef}
        className="ui-scrollbar-overlay min-h-0 flex-1 overflow-y-auto px-2 py-2"
      >
        <div className="mb-2 flex justify-end">
          <Tooltip content="Clear this note's assistant thread">
            <span>
              <IconButton
                type="button"
                size="md"
                variant="ghost"
                disabled={!canClear || thread.pending}
                onClick={onClearThread}
                title="Clear thread"
              >
                <Trash2 className="h-4 w-4 stroke-[1.8]" />
              </IconButton>
            </span>
          </Tooltip>
        </div>
        {thread.turns.length === 0 ? null : (
          <div className="space-y-2.5">
            {thread.turns.map((turn) => {
              if (turn.kind === "system") {
                return (
                  <div
                    key={turn.id}
                    className="rounded-[var(--ui-radius-md)] border border-border bg-bg px-3 py-2 text-xs text-text-muted"
                  >
                    {turn.text}
                  </div>
                );
              }

              if (turn.kind === "user") {
                return (
                  <div
                    key={turn.id}
                    className="rounded-[var(--ui-radius-md)] border border-border bg-bg px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[13px] font-medium text-text">You</div>
                      <div className="text-xs text-text-muted">
                        {turn.scopeLabel} · {turn.lineLabel}
                      </div>
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-sm text-text">
                      {turn.text}
                    </div>
                    {turn.notice ? (
                      <div className="mt-2 rounded-[var(--ui-radius-sm)] border border-[var(--color-warning)]/15 bg-[var(--color-warning-muted)] px-2.5 py-2 text-xs text-orange-700 dark:text-orange-400">
                        {turn.notice}
                      </div>
                    ) : null}
                  </div>
                );
              }

              return (
                <AssistantTurnView
                  key={turn.id}
                  turn={turn}
                  disabled={thread.pending}
                  onApply={(proposal) => onApplyProposal(turn, proposal)}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="shrink-0 p-2 pt-0">
        <div
          role="group"
          aria-label="Assistant composer"
          className="overflow-hidden rounded-[var(--ui-radius-lg)] border border-border bg-bg"
        >
          <textarea
            value={thread.draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Ask about the current note, request a rewrite, or focus on the current section or selection."
            disabled={thread.pending}
            className="ui-focus-ring min-h-28 w-full resize-none border-0 bg-transparent px-3 py-3 text-sm text-text outline-none placeholder:text-text-muted disabled:opacity-50"
          />
          <div
            role="group"
            aria-label="Assistant composer footer"
            className="flex items-center gap-2 border-t border-border/80 px-2 py-2"
          >
            <div className="min-w-0 flex-1">
              <AssistantSelectMenu<AiProvider>
                value={thread.provider}
                items={providerItems}
                onChange={onProviderChange}
                ariaLabel="Assistant provider"
                triggerClassName="border-transparent bg-transparent px-2.5 hover:bg-bg-muted data-[state=open]:bg-bg-muted"
              />
            </div>
            <div className="min-w-0 flex-1">
              <AssistantSelectMenu<AssistantThreadState["scope"]>
                value={thread.scope}
                items={scopeItems}
                onChange={onScopeChange}
                ariaLabel="Assistant scope"
                triggerClassName="border-transparent bg-transparent px-2.5 hover:bg-bg-muted data-[state=open]:bg-bg-muted"
              />
            </div>
            <div className="shrink-0">
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={thread.pending || thread.draft.trim().length === 0}
                title="Send (Cmd/Ctrl+Enter)"
                onClick={onSubmit}
              >
                {thread.pending ? "Working..." : "Send"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
