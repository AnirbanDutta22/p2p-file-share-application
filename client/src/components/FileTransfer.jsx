/**
 * File Transfer Component
 *
 * Handles file selection and displays transfer progress
 */
import { useState } from "react";
import { formatFileSize } from "../utils/fileChunker.js";

export default function FileTransfer({ peers, onSendFile, transfers }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedPeer, setSelectedPeer] = useState("");

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleSend = () => {
    if (selectedFile && selectedPeer) {
      onSendFile(selectedPeer, selectedFile);
      setSelectedFile(null);
      setSelectedPeer("");
      // Reset file input
      document.getElementById("file-input").value = "";
    }
  };

  const connectedPeers = peers.filter((p) => p.connected);

  return (
    <div className="file-transfer">
      <h3>Send File</h3>

      {connectedPeers.length === 0 ? (
        <p className="no-peers">No connected peers available</p>
      ) : (
        <div className="transfer-form">
          <div className="form-group">
            <label htmlFor="file-input">Select File:</label>
            <input
              id="file-input"
              type="file"
              onChange={handleFileSelect}
              className="file-input"
            />
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
            onClick={handleSend}
            disabled={!selectedFile || !selectedPeer}
            className="btn btn-primary"
          >
            Send File
          </button>
        </div>
      )}

      {/* Transfer Progress */}
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
              {/* {(transfer.status === "success" ||
                transfer.status === "failed") && (
                <div className="stat-strip">
                  <div className="stat-card">
                    <div className="stat-label">
                      {transfer.status === "failed" ? "transferred" : "speed"}
                    </div>
                    <div
                      className={`stat-val ${transfer.status === "success" ? "ok" : "err"}`}
                    >
                      {transfer.status === "success"
                        ? `${transfer.speedMBps.toFixed(1)} MB/s`
                        : formatFileSize(transfer.transferred)}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">duration</div>
                    <div className="stat-val">
                      {transfer.durationSec < 60
                        ? `${transfer.durationSec.toFixed(1)} s`
                        : `${(transfer.durationSec / 60).toFixed(1)} min`}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">status</div>
                    <div
                      className={`stat-val ${transfer.status === "success" ? "ok" : "err"}`}
                    >
                      {transfer.status}
                    </div>
                  </div>
                </div>
              )} */}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
