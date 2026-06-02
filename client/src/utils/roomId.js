/**
 * Validate and normalize room ID input for joining.
 * Room IDs are short alphanumeric codes — NOT the dashed security check code.
 */
export function parseRoomIdInput(input) {
  const trimmed = input.trim().toUpperCase();

  if (!trimmed) {
    return { error: "Enter a room ID" };
  }

  if (trimmed.includes("-")) {
    return {
      error:
        "That looks like a security check code (with dashes). To join, use the short Room ID instead — e.g. ABC123.",
    };
  }

  const roomId = trimmed.replace(/[^A-Z0-9]/g, "");

  if (roomId.length < 4 || roomId.length > 8) {
    return {
      error: "Room ID should be 4–8 letters and numbers (e.g. ABC123).",
    };
  }

  return { roomId };
}

export function buildRoomInviteUrl(roomId) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  return url.toString();
}

export function getRoomIdFromUrl() {
  const param = new URLSearchParams(window.location.search).get("room");
  if (!param) return null;
  const { roomId, error } = parseRoomIdInput(param);
  return error ? null : roomId;
}
