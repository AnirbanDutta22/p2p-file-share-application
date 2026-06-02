import { useState } from "react";
import { formatFileSize } from "../utils/fileChunker.js";
import { formatHashShort } from "../utils/crypto.js";

export default function TransferReceipt({ receipts, onDismiss }) {
  const [copiedId, setCopiedId] = useState(null);

  if (!receipts.length) return null;

  const copyHash = async (id, hash) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  return (
    <div className="transfer-receipts panel">
      <div className="panel-label">Transfer receipts</div>
      <p className="receipt-hint">
        SHA-256 hash — compare with sender to verify file integrity.
      </p>
      <ul className="receipt-list">
        {receipts.map((r) => (
          <li key={r.id} className="receipt-item">
            <div className="receipt-row">
              <span
                className={`transfer-type ${r.direction === "send" ? "send" : "receive"}`}
              >
                {r.direction === "send" ? "Sent" : "Received"}
              </span>
              <span className="transfer-filename">{r.fileName}</span>
              <button
                type="button"
                className="receipt-dismiss"
                onClick={() => onDismiss(r.id)}
                aria-label="Dismiss receipt"
              >
                ×
              </button>
            </div>
            <div className="receipt-meta">
              {formatFileSize(r.fileSize)} · {new Date(r.at).toLocaleTimeString()}
            </div>
            <div className="receipt-hash-row">
              <code className="receipt-hash" title={r.sha256}>
                {formatHashShort(r.sha256)}
              </code>
              <button
                type="button"
                className="btn-copy-hash"
                onClick={() => copyHash(r.id, r.sha256)}
              >
                {copiedId === r.id ? "Copied!" : "Copy hash"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
