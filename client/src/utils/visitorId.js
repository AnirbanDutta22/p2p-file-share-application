/**
 * Persistent browser visitor ID — one per browser, survives reloads.
 */
const STORAGE_KEY = "reachpeer-visitor-id";

export function getVisitorId() {
  let id = localStorage.getItem(STORAGE_KEY);
  // console.log("Got VID from localstorage: ", id);
  if (!id) {
    // console.log("New Visitor id generating....");
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }

  // console.log("Visitor key generated : ", id);

  return id;
}
