/**
 * File Transfer Component
 *
 * Drag-and-drop, file selection, and transfer progress with size limits.
 */
import { useState, useRef } from "react";
import { formatFileSize } from "../utils/fileChunker.js";
import { LIMITS } from "../config/limits.js";

export default function FileTransfer({
  peers,
  onSendFile,
  transfers,
  maxFileSizeBytes = LIMITS.maxFileSizeBytes,
}) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedPeers, setSelectedPeers] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState(null);
  const fileInputRef = useRef(null);

  const maxFileLabel = formatFileSize(maxFileSizeBytes);

  const validateAndSetFile = (file) => {
    if (!file) return;
    if (file.size > maxFileSizeBytes) {
      setFileError(
        `File exceeds max size of ${maxFileLabel} (${formatFileSize(file.size)} selected)`,
      );
      setSelectedFile(null);
      return;
    }
    setFileError(null);
    setSelectedFile(file);
  };

  const handleFileSelect = (e) => {
    validateAndSetFile(e.target.files[0]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndSetFile(file);
  };

  // Helper toggler function
  const handleTogglePeer = (peerId) => {
    setSelectedPeers(
      (prev) =>
        prev.includes(peerId)
          ? prev.filter((id) => id !== peerId) // Deselect if already present
          : [...prev, peerId], // Add to collection
    );
  };

  const handleSelectAll = () => {
    if (selectedPeers.length === connectedPeers.length) {
      setSelectedPeers([]); // If all are selected, clear selections
    } else {
      setSelectedPeers(connectedPeers.map((p) => p.id)); // Select everyone
    }
  };

  const handleSend = () => {
    if (selectedFile && selectedPeers) {
      onSendFile(selectedPeers, selectedFile);
      setSelectedFile(null);
      setSelectedPeers([]);
      setFileError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const connectedPeers = peers.filter((p) => p.connected);

  return (
    <div className="file-transfer panel">
      <h3>Send File</h3>
      <p className="file-limit-hint">Max file size: {maxFileLabel}</p>

      {connectedPeers.length === 0 ? (
        <p className="no-peers">No connected peers available</p>
      ) : (
        <div className="transfer-form">
          <div className="form-group">
            <label htmlFor="file-input">Select or drop file</label>
            <div
              className={`drop-zone ${dragOver ? "drag-over" : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) =>
                e.key === "Enter" && fileInputRef.current?.click()
              }
            >
              <span className="drop-zone-icon">↓</span>
              <span>Drag & drop a file here, or click to browse</span>
            </div>
            <input
              id="file-input"
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="file-input-hidden"
            />
            {fileError && <p className="file-error">{fileError}</p>}
            {selectedFile && (
              <div className="file-info">
                <strong>{selectedFile.name}</strong> (
                {formatFileSize(selectedFile.size)})
              </div>
            )}
          </div>

          <div className="form-group">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <label>Send Target(s):</label>
              {connectedPeers.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="btn-small"
                  style={{ flexBasis: "30%" }}
                >
                  {selectedPeers.length === connectedPeers.length
                    ? "Clear All"
                    : "Select All"}
                </button>
              )}
            </div>

            {connectedPeers.length === 0 ? (
              <p
                style={{
                  color: "#64748b",
                  fontSize: "0.85rem",
                  italic: "true",
                }}
              >
                No active peers available to receive payloads.
              </p>
            ) : (
              <div
                className="peer-pill-grid"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                  marginTop: "6px",
                }}
              >
                {connectedPeers.map((peer) => {
                  const isSelected = selectedPeers.includes(peer.id);
                  const shortId = peer.id.substring(0, 8);

                  return (
                    <button
                      key={peer.id}
                      type="button"
                      onClick={() => handleTogglePeer(peer.id)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 14px",
                        borderRadius: "6px",
                        border: isSelected
                          ? "2px solid #6ee7b7"
                          : "2px solid #cbd5e1",
                        backgroundColor: "#1f1f23",
                        color: isSelected ? "#6ee7b7" : "#f0f0f0",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                        fontWeight: isSelected ? "600" : "400",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {/* Colored circle status indicators inside the selection pill */}
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          backgroundColor: isSelected ? "#6ee7b7" : "#94a3b8",
                        }}
                      />
                      {shortId}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleSend}
            disabled={!selectedFile || selectedPeers.length === 0}
            className="btn btn-primary"
          >
            Send File
            {selectedPeers.length > 1
              ? ` to ${selectedPeers.length} Peers`
              : " to 1 Peer"}
          </button>
        </div>
      )}

      {Object.keys(transfers).length > 0 && (
        <div className="transfers">
          <h4>Active Transfers</h4>
          {Object.entries(transfers).map(([peerId, transfer]) => (
            <div key={peerId} className="transfer-item">
              <div className="transfer-header">
                <span
                  className={`transfer-type ${transfer.type === "send" ? "send" : "receive"}`}
                >
                  {transfer.type === "send" ? "Sending" : "Receiving"}
                </span>
                <span className="transfer-filename">{transfer.fileName}</span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${transfer.progress}%` }}
                />
              </div>
              <div className="transfer-info">
                <span>{Math.round(transfer.progress)}%</span>
                <span>{formatFileSize(transfer.fileSize)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
