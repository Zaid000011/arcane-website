import { renderJob, type CloseUpJob } from "./jobs";

/** Draws close-ups away from the page, so choosing a fabric or print never makes the page stutter. */
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<{ id: number; job: CloseUpJob }>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

scope.onmessage = (e) => {
  const { id, job } = e.data;
  try {
    const px = renderJob(job);
    scope.postMessage({ id, px }, [px.buffer]);
  } catch {
    scope.postMessage({ id, px: null });
  }
};
