/**
 * Persist "this tour was dismissed" so auto-start does not fire again until the operator clicks
 * Show tour. localStorage is per origin and survives reloads; each tour has its own key so skipping
 * the home tour does not silence the job console tour.
 */

function key(tourId: string): string {
  return `walkthrough:dismissed:${tourId}`;
}

export function wasTourDismissed(tourId: string): boolean {
  try {
    return window.localStorage.getItem(key(tourId)) === "1";
  } catch {
    return false;
  }
}

export function setTourDismissed(tourId: string, dismissed: boolean): void {
  try {
    if (dismissed) window.localStorage.setItem(key(tourId), "1");
    else window.localStorage.removeItem(key(tourId));
  } catch {
    // private mode / blocked storage: auto-start will keep using in-memory state only
  }
}
