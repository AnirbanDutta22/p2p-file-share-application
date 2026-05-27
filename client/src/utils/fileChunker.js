/**
 * File Chunking Utilities
 *
 * WebRTC DataChannels have size limits (typically 16KB per message).
 * We split large files into chunks and reassemble them on the receiver side.
 *
 * CHUNK SIZE STRATEGY:
 * - 16KB (16384 bytes) is safe for all browsers
 * - Smaller chunks = more overhead, slower transfer
 * - Larger chunks = risk of failure on some browsers
 * - 16KB is the sweet spot for reliability and performance
 */

export const CHUNK_SIZE = 16384; // 16KB

/**
 * Split a file into chunks
 */
export function* fileToChunks(file) {
  let offset = 0;

  while (offset < file.size) {
    const chunk = file.slice(offset, offset + CHUNK_SIZE);
    yield chunk;
    offset += CHUNK_SIZE;
  }
}

/**
 * Calculate total number of chunks for a file
 */
export function calculateTotalChunks(fileSize) {
  return Math.ceil(fileSize / CHUNK_SIZE);
}

/**
 * Reconstruct file from chunks
 */
export function chunksToFile(chunks, fileName, fileType) {
  const blob = new Blob(chunks, { type: fileType });
  return new File([blob], fileName, { type: fileType });
}

/**
 * Trigger browser download of a file
 */
export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
