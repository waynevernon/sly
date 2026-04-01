import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { Schema } from "@tiptap/pm/model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RightPanel } from "./RightPanel";
import { extractOutlineItems } from "./rightPanelOutline";
import { TooltipProvider } from "../ui";
import type { AiProvider } from "../../services/ai";
import type { RightPanelAssistantProps } from "./RightPanelAssistant";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    heading: {
      group: "block",
      content: "text*",
      attrs: { level: { default: 1 } },
    },
    paragraph: {
      group: "block",
      content: "text*",
    },
    text: {},
  },
});

class FakeEditor {
  listeners = {
    update: new Set<() => void>(),
    selectionUpdate: new Set<() => void>(),
  };

  state: {
    doc: ReturnType<typeof makeDoc>;
    selection: { from: number };
    tr: {
      setSelection: ReturnType<typeof vi.fn>;
      scrollIntoView: ReturnType<typeof vi.fn>;
    };
  };

  view: {
    nodeDOM: (pos: number) => HTMLElement | null;
    dispatch: ReturnType<typeof vi.fn>;
  };

  commands = {
    focus: vi.fn(),
  };

  constructor(
    doc: ReturnType<typeof makeDoc>,
    private readonly nodeMap: Map<number, HTMLElement>,
  ) {
    const transaction = {
      setSelection: vi.fn().mockReturnThis(),
      scrollIntoView: vi.fn().mockReturnThis(),
    };

    const outlineItems = extractOutlineItems(doc);
    this.state = {
      doc,
      selection: { from: outlineItems[0]?.pos ?? 0 },
      tr: transaction,
    };
    this.view = {
      nodeDOM: (pos) => this.nodeMap.get(pos) ?? null,
      dispatch: vi.fn(),
    };
  }

  on(event: "update" | "selectionUpdate", callback: () => void) {
    this.listeners[event].add(callback);
  }

  off(event: "update" | "selectionUpdate", callback: () => void) {
    this.listeners[event].delete(callback);
  }

  emit(event: "update" | "selectionUpdate") {
    for (const callback of this.listeners[event]) {
      callback();
    }
  }
}

function makeDoc() {
  return schema.node("doc", null, [
    schema.node("heading", { level: 1 }, [schema.text("Title")]),
    schema.node("heading", { level: 2 }, [schema.text("Section")]),
    schema.node("paragraph", null, [schema.text("Body")]),
    schema.node("heading", { level: 3 }, [schema.text("Detail")]),
  ]);
}

function makeAssistantProps(): RightPanelAssistantProps {
  return {
    hasNote: true,
    providerCheckComplete: true,
    availableProviders: ["claude"] as AiProvider[],
    thread: {
      provider: "claude" as const,
      scope: "note" as const,
      scopeManual: false,
      draft: "",
      turns: [],
      pending: false,
      lastSuccessfulSnapshotHash: null,
    },
    onProviderChange: vi.fn(),
    onScopeChange: vi.fn(),
    onDraftChange: vi.fn(),
    onClearThread: vi.fn(),
    onSubmit: vi.fn(),
    onApplyProposal: vi.fn(),
  };
}

function renderRightPanel(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("RightPanel", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("renders outline items with nested indentation", async () => {
    const doc = makeDoc();
    const positions = extractOutlineItems(doc);
    const nodeMap = new Map<number, HTMLElement>();

    positions.forEach((item, index) => {
      const element = document.createElement("h2");
      element.getBoundingClientRect = () =>
        ({
          top: index * 120,
          bottom: index * 120 + 20,
          left: 0,
          right: 100,
          width: 100,
          height: 20,
          x: 0,
          y: index * 120,
          toJSON: () => ({}),
        }) as DOMRect;
      nodeMap.set(item.pos, element);
    });

    const editor = new FakeEditor(doc, nodeMap) as never;
    const scrollContainer = document.createElement("div");
    scrollContainer.getBoundingClientRect = () =>
      ({
        top: 0,
        bottom: 400,
        left: 0,
        right: 300,
        width: 300,
        height: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    renderRightPanel(
      <RightPanel
        editor={editor}
        scrollContainer={scrollContainer}
        hasNote
        visible
        width={260}
        activeTab="outline"
        onTabChange={vi.fn()}
        onWidthChange={vi.fn()}
        assistantProps={makeAssistantProps()}
      />,
    );

    expect(await screen.findByRole("button", { name: "Title" })).toHaveStyle({
      paddingLeft: "10px",
    });
    expect(await screen.findByRole("button", { name: "Section" })).toHaveStyle({
      paddingLeft: "20px",
    });
    expect(screen.getByRole("button", { name: "Detail" })).toHaveStyle({
      paddingLeft: "30px",
    });
  });

  it("clicks outline items to jump the editor", async () => {
    const doc = makeDoc();
    const positions = extractOutlineItems(doc);
    const nodeMap = new Map<number, HTMLElement>();

    positions.forEach((item) => {
      const element = document.createElement("h2");
      element.getBoundingClientRect = () =>
        ({
          top: 0,
          bottom: 20,
          left: 0,
          right: 100,
          width: 100,
          height: 20,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect;
      nodeMap.set(item.pos, element);
    });

    const editor = new FakeEditor(doc, nodeMap);
    const scrollContainer = document.createElement("div");
    scrollContainer.getBoundingClientRect = () =>
      ({
        top: 0,
        bottom: 400,
        left: 0,
        right: 300,
        width: 300,
        height: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    renderRightPanel(
      <RightPanel
        editor={editor as never}
        scrollContainer={scrollContainer}
        hasNote
        visible
        width={260}
        activeTab="outline"
        onTabChange={vi.fn()}
        onWidthChange={vi.fn()}
        assistantProps={makeAssistantProps()}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Detail" }));

    expect(editor.state.tr.setSelection).toHaveBeenCalled();
    expect(editor.view.dispatch).toHaveBeenCalledWith(editor.state.tr);
    expect(editor.commands.focus).toHaveBeenCalled();
  });

  it("updates the active outline item from selection and scroll state", async () => {
    const doc = makeDoc();
    const positions = extractOutlineItems(doc);
    const topByPos = new Map<number, number>([
      [positions[0].pos, 0],
      [positions[1].pos, 180],
    ]);
    const nodeMap = new Map<number, HTMLElement>();

    positions.forEach((item) => {
      const element = document.createElement("h2");
      element.getBoundingClientRect = () =>
        ({
          top: topByPos.get(item.pos) ?? 0,
          bottom: (topByPos.get(item.pos) ?? 0) + 20,
          left: 0,
          right: 100,
          width: 100,
          height: 20,
          x: 0,
          y: topByPos.get(item.pos) ?? 0,
          toJSON: () => ({}),
        }) as DOMRect;
      nodeMap.set(item.pos, element);
    });

    const editor = new FakeEditor(doc, nodeMap);
    const scrollContainer = document.createElement("div");
    scrollContainer.getBoundingClientRect = () =>
      ({
        top: 0,
        bottom: 400,
        left: 0,
        right: 300,
        width: 300,
        height: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    renderRightPanel(
      <RightPanel
        editor={editor as never}
        scrollContainer={scrollContainer}
        hasNote
        visible
        width={260}
        activeTab="outline"
        onTabChange={vi.fn()}
        onWidthChange={vi.fn()}
        assistantProps={makeAssistantProps()}
      />,
    );

    const titleButton = await screen.findByRole("button", { name: "Title" });
    const detailButton = screen.getByRole("button", { name: "Detail" });

    await waitFor(() => {
      expect(titleButton.className).toMatch(/bg-bg-muted/);
    });

    editor.state.selection.from = positions[2].pos + 1;
    editor.emit("selectionUpdate");

    await waitFor(() => {
      expect(detailButton.className).toMatch(/bg-bg-muted/);
    });

    topByPos.set(positions[0].pos, -180);
    topByPos.set(positions[1].pos, -120);
    topByPos.set(positions[2].pos, 40);
    fireEvent.scroll(scrollContainer);

    await waitFor(() => {
      expect(detailButton.className).toMatch(/bg-bg-muted/);
    });
  });

  it("renders assistant tab content inside the same panel shell", () => {
    renderRightPanel(
      <RightPanel
        editor={null}
        scrollContainer={null}
        hasNote
        visible
        width={260}
        activeTab="assistant"
        onTabChange={vi.fn()}
        onWidthChange={vi.fn()}
        assistantProps={makeAssistantProps()}
      />,
    );

    expect(screen.getByRole("button", { name: "Outline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assistant" })).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(
      screen.getByText("Ask about the current note, request a rewrite, or focus on the current section or selection."),
    ).toBeInTheDocument();
  });
});
