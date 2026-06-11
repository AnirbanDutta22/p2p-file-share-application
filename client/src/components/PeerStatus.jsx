/**
 * Peer Status Component
 *
 * Displays connection status and DTLS fingerprint for peer verification.
 */
import { useState, useEffect } from "react";
import { generateNickname } from "../utils/nickname.js";
import { formatVerifyCode } from "../utils/crypto.js";

function usePeerNicknames(peers) {
  const [nicknames, setNicknames] = useState({});

  useEffect(() => {
    setNicknames((prev) => {
      const next = { ...prev };
      for (const peer of peers) {
        if (!next[peer.id]) {
          next[peer.id] = generateNickname();
        }
      }
      return next;
    });
  }, [peers]);

  const setNickname = (id, name) =>
    setNicknames((prev) => ({ ...prev, [id]: name }));

  return { nicknames, setNickname };
}

function EditableNickname({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    const trimmed = draft.trim() || value;
    onChange(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        className="nickname-input"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    );
  }
  return (
    <span
      className="nickname"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      {value}
    </span>
  );
}

function PeerFingerprint({ fingerprint }) {
  const [copied, setCopied] = useState(false);
  if (!fingerprint) return null;

  const short = formatVerifyCode(
    fingerprint.replace(/[^a-fA-F0-9]/g, ""),
    3,
    4,
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fingerprint);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  return (
    <div className="peer-fingerprint">
      <span className="fingerprint-label">Peer verify</span>
      <button type="button" className="fingerprint-code" onClick={copy}>
        {copied ? "Copied!" : short}
      </button>
    </div>
  );
}

export default function PeerStatus({ peers, myId }) {
  const { nicknames, setNickname } = usePeerNicknames(peers);

  const myShortId = myId ? myId.substring(0, 8) : "Connecting...";

  if (peers.length === 0) {
    return (
      <div className="peer-status panel">
        <p className="waiting">Waiting for peers to join...</p>
        <p className="hint">
          Share the room ID with someone to start transferring files
        </p>
      </div>
    );
  }

  return (
    <div className="peer-status panel">
      <div className="local-user-badge">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div className="peer-id" style={{ fontWeight: "bold" }}>
            Your ID: {myShortId}
          </div>
        </div>
        <span
          className="peer-connection-status connected"
          style={{ fontSize: "0.8rem" }}
        >
          Active
        </span>
      </div>
      <h3>Connected Peers ({peers.length})</h3>
      <div className="peer-list">
        {peers.map((peer) => {
          const nick = nicknames[peer.id] || peer.id.substring(0, 8);
          return (
            <div key={peer.id} className="peer-item">
              <div className="peer-icon">
                {peer.id.substring(0, 2).toUpperCase()}
              </div>
              <div className="peer-info">
                <div className="nickname-row">
                  <EditableNickname
                    value={nick}
                    onChange={(name) => setNickname(peer.id, name)}
                  />
                </div>
                <div className="peer-id">{peer.id.substring(0, 8)}</div>
                <div
                  className={`peer-connection-status ${peer.connected ? "connected" : "connecting"}`}
                >
                  {peer.connected ? "Connected" : "Connecting…"}
                </div>
                {peer.connected && (
                  <PeerFingerprint fingerprint={peer.fingerprint} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
