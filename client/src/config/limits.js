const maxFileMb = parseInt(import.meta.env.VITE_MAX_FILE_SIZE_MB || "100", 10);

export const MAX_FILE_SIZE_BYTES = maxFileMb * 1024 * 1024;
export const MAX_ROOM_SIZE = parseInt(import.meta.env.VITE_MAX_ROOM_SIZE || "8", 10);

export const LIMITS = {
  maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
  maxRoomSize: MAX_ROOM_SIZE,
};
