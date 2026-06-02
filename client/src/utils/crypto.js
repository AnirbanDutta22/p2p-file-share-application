/**
 * Cryptographic helpers for room verification and transfer receipts.
 */

export async function sha256Hex(input) {
  const data =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input instanceof ArrayBuffer
        ? input
        : await input.arrayBuffer();

  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeFileSha256(file) {
  return sha256Hex(file);
}

/** Short code derived from room ID — same for everyone in the room. */
export async function computeRoomVerifyCode(roomId) {
  const hash = await sha256Hex(`reachpeer-room:${roomId}`);
  return formatVerifyCode(hash);
}

/** Display fingerprint as grouped uppercase hex (e.g. A3F2-B91C-7E4D). */
export function formatVerifyCode(hex, groups = 3, groupLen = 4) {
  const upper = hex.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  const parts = [];
  for (let i = 0; i < groups; i++) {
    parts.push(upper.slice(i * groupLen, (i + 1) * groupLen));
  }
  return parts.filter(Boolean).join("-");
}

export function formatHashShort(hex, head = 12, tail = 8) {
  if (hex.length <= head + tail + 3) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}
