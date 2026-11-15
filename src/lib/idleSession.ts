/** Wall-clock idle timer: suspended tabs cannot extend the deadline. */
export const SESSION_IDLE_MS = 180_000;

type Clock = {
  now: () => number;
  schedule: (callback: () => void, delay: number) => number;
  cancel: (id: number) => void;
};

export function createIdleTimer(clock: Clock, initialActivity: number, onExpire: () => void) {
  let lastActivity = Math.min(initialActivity, clock.now());
  let timer: number | undefined;
  let stopped = false;
  function check() {
    if (stopped) return false;
    if (timer !== undefined) clock.cancel(timer);
    const remaining = SESSION_IDLE_MS - (clock.now() - lastActivity);
    if (remaining <= 0) {
      stopped = true;
      onExpire();
      return false;
    }
    timer = clock.schedule(check, remaining);
    return true;
  }
  check();
  return {
    check,
    activity(timestamp = clock.now()) {
      // Check before accepting input: input after a sleeping tab wakes cannot
      // resurrect a session whose deadline has already passed.
      if (!check()) return false;
      lastActivity = Math.max(lastActivity, Math.min(timestamp, clock.now()));
      return check();
    },
    synchronize(timestamp: number) {
      // Another tab may have received genuine input while this tab slept.
      if (stopped) return false;
      lastActivity = Math.max(lastActivity, Math.min(timestamp, clock.now()));
      return check();
    },
    dispose() { stopped = true; if (timer !== undefined) clock.cancel(timer); },
  };
}
