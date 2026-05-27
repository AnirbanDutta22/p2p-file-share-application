/**
 * Peer Status Component
 *
 * Displays connection status for all peers in the room
 */
import { useState } from "react";
import { generateNickname } from "../utils/nickname";

function usePeerNicknames() {
  const [nicknames, setNicknames] = useState({});
  const getNickname = (id) => {
    if (!nicknames[id]) {
      const name = generateNickname();
      setNicknames((prev) => ({ ...prev, [id]: name }));
      return name;
    }
    return nicknames[id];
  };
  const setNickname = (id, name) =>
    setNicknames((prev) => ({ ...prev, [id]: name }));
  return { getNickname, setNickname, nicknames };
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

export default function PeerStatus({ peers }) {
  const { getNickname, setNickname } = usePeerNicknames(peers);

  if (peers.length === 0) {
    return (
      <div className="peer-status">
        <p className="waiting">Waiting for peers to join...</p>
        <p className="hint">
          Share the room ID with someone to start transferring files
        </p>
      </div>
    );
  }

  return (
    <div className="peer-status">
      <h3>Connected Peers ({peers.length})</h3>
      <div className="peer-list">
        {peers.map((peer) => {
          const nick = getNickname(peer.id);
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
                  <span
                    className="edit-btn"
                    onClick={() => {
                      /* triggers via EditableNickname click */
                    }}
                  >
                    edit
                  </span>
                </div>
                <div className="peer-id">{peer.id.substring(0, 8)}</div>
                <div
                  className={`peer-connection-status ${peer.connected ? "connected" : "connecting"}`}
                >
                  {peer.connected ? "🟢 Connected" : "🟡 Connecting..."}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
