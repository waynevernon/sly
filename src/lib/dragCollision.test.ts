import {
  rectIntersection,
  type Active,
  type ClientRect,
  type DroppableContainer,
} from "@dnd-kit/core";
import { describe, expect, it } from "vitest";
import { workspaceCollisionDetection } from "./dragCollision";

function makeRect(top: number, left = 0, width = 200, height = 40): ClientRect {
  return {
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

function makeActive(type: "note" | "folder"): Active {
  return {
    id: `${type}:active`,
    data: { current: { type } },
    rect: {
      current: {
        initial: null,
        translated: null,
      },
    },
  };
}

function makeDroppable(id: string, rect: ClientRect): DroppableContainer {
  return {
    id,
    key: id,
    data: { current: { path: id } },
    disabled: false,
    node: { current: null },
    rect: { current: rect },
  };
}

function makeRects(entries: Array<[string, ClientRect]>) {
  return new Map(entries);
}

describe("workspaceCollisionDetection", () => {
  it("prefers the pointer hit for note drags when the dragged rect overlaps another folder more", () => {
    const folderAbove = makeRect(0);
    const folderBelow = makeRect(40);
    const args = {
      active: makeActive("note"),
      collisionRect: makeRect(0, 0, 200, 60),
      droppableRects: makeRects([
        ["folder-a", folderAbove],
        ["folder-b", folderBelow],
      ]),
      droppableContainers: [
        makeDroppable("folder-a", folderAbove),
        makeDroppable("folder-b", folderBelow),
      ],
      pointerCoordinates: { x: 24, y: 60 },
    };

    const collisions = workspaceCollisionDetection(args);

    expect(collisions[0]?.id).toBe("folder-b");
    expect(rectIntersection(args)[0]?.id).toBe("folder-a");
  });

  it("returns no collisions for note drags when the pointer is not over any target", () => {
    const folderAbove = makeRect(0);
    const folderBelow = makeRect(40);
    const args = {
      active: makeActive("note"),
      collisionRect: makeRect(0, 0, 200, 60),
      droppableRects: makeRects([
        ["folder-a", folderAbove],
        ["folder-b", folderBelow],
      ]),
      droppableContainers: [
        makeDroppable("folder-a", folderAbove),
        makeDroppable("folder-b", folderBelow),
      ],
      pointerCoordinates: null,
    };

    // Notes must be dragged directly over a target — no rect-intersection fallback.
    expect(workspaceCollisionDetection(args)).toEqual([]);
  });

  it("keeps non-note drags on rectIntersection behavior", () => {
    const folderAbove = makeRect(0);
    const folderBelow = makeRect(40);
    const args = {
      active: makeActive("folder"),
      collisionRect: makeRect(0, 0, 200, 60),
      droppableRects: makeRects([
        ["folder-a", folderAbove],
        ["folder-b", folderBelow],
      ]),
      droppableContainers: [
        makeDroppable("folder-a", folderAbove),
        makeDroppable("folder-b", folderBelow),
      ],
      pointerCoordinates: { x: 24, y: 60 },
    };

    expect(workspaceCollisionDetection(args)).toEqual(rectIntersection(args));
  });
});
