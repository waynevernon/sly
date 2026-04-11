import {
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
} from "@dnd-kit/core";

export const workspaceCollisionDetection: CollisionDetection = (args) => {
  if (
    args.active.data.current?.type === "note" ||
    args.active.data.current?.type === "task"
  ) {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      return pointerCollisions;
    }
  }

  return rectIntersection(args);
};
