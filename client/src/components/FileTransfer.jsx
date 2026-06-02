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
  const [selectedPeer, setSelectedPeer] = useState("");
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

  const handleSend = () => {
    if (selectedFile && selectedPeer) {
      onSendFile(selectedPeer, selectedFile);
      setSelectedFile(null);
      setSelectedPeer("");
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
            <label htmlFor="peer-select">Send to:</label>
            <select
              id="peer-select"
              value={selectedPeer}
              onChange={(e) => setSelectedPeer(e.target.value)}
              className="peer-select"
            >
              <option value="">Select a peer...</option>
              {connectedPeers.map((peer) => (
                <option key={peer.id} value={peer.id}>
                  {peer.id.substring(0, 8)}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleSend}
            disabled={!selectedFile || !selectedPeer}
            className="btn btn-primary"
          >
            Send File
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
