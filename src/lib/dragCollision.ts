import {
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
} from "@dnd-kit/core";

export const workspaceCollisionDetection: CollisionDetection = (args) => {
  // Notes and tasks must be dragged directly over a target — no rect-intersection
  // fallback, which would match targets purely based on vertical overlap.
  if (
    args.active.data.current?.type === "note" ||
    args.active.data.current?.type === "task"
  ) {
    return pointerWithin(args);
  }

  return rectIntersection(args);
};
