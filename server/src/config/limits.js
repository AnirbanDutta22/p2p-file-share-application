export const MAX_ROOM_SIZE = parseInt(process.env.MAX_ROOM_SIZE || "8", 10);

export const APP_LIMITS = {
  maxRoomSize: MAX_ROOM_SIZE,
  maxFileSizeBytes: parseInt(
    process.env.MAX_FILE_SIZE_BYTES || String(100 * 1024 * 1024),
    10,
  ),
};
