/**
 * Persistent browser visitor ID — one per browser, survives reloads.
 */
const STORAGE_KEY = "reachpeer-visitor-id";

export function getVisitorId() {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}
