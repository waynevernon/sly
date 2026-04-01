const NOTE_OPEN_TIMING_ENABLED = import.meta.env.DEV;

interface NoteOpenSample {
  noteId: string;
  startedAt: number;
  lastMarkAt: number;
}

const noteOpenSamples = new Map<string, NoteOpenSample>();

function formatDuration(durationMs: number): string {
  return `${durationMs.toFixed(1)}ms`;
}

function getNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

export function startNoteOpenTiming(noteId: string) {
  if (!NOTE_OPEN_TIMING_ENABLED || !noteId) {
    return;
  }

  const now = getNow();
  noteOpenSamples.set(noteId, {
    noteId,
    startedAt: now,
    lastMarkAt: now,
  });
  console.debug(`[Perf][note-open] ${noteId} start`);
}

export function markNoteOpenTiming(noteId: string, stage: string) {
  if (!NOTE_OPEN_TIMING_ENABLED || !noteId) {
    return;
  }

  const sample = noteOpenSamples.get(noteId);
  if (!sample) {
    return;
  }

  const now = getNow();
  const totalMs = now - sample.startedAt;
  const deltaMs = now - sample.lastMarkAt;
  sample.lastMarkAt = now;

  console.debug(
    `[Perf][note-open] ${noteId} ${stage} +${formatDuration(deltaMs)} total=${formatDuration(totalMs)}`,
  );
}

export function finishNoteOpenTiming(noteId: string, stage: string) {
  if (!NOTE_OPEN_TIMING_ENABLED || !noteId) {
    return;
  }

  markNoteOpenTiming(noteId, stage);
  noteOpenSamples.delete(noteId);
}
