/**
 * Room Manager Component
 *
 * Handles room creation and joining
 */
import { useState } from "react";

export default function RoomManager({ onJoinRoom, currentRoom }) {
  const [roomInput, setRoomInput] = useState("");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentRoom);
      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const handleCreateRoom = () => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    onJoinRoom(roomId);
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (roomInput.trim()) {
      onJoinRoom(roomInput.trim());
    }
  };

  if (currentRoom) {
    return (
      <div className="room-info panel">
        <div>
          <div className="panel-label">Current room</div>
          <div
            className={`room-badge ${copied ? "copied" : ""}`}
            onClick={handleCopy}
            title="Click to copy room id"
          >
            {copied ? "Copied!" : currentRoom}
          </div>
        </div>
        <p className="room-hint">Share this ID with others to connect</p>
      </div>
    );
  }

  return (
    <div className="room-manager">
      <h2>P2P File Share</h2>
      <p className="subtitle">
        End-to-end encrypted, peer-to-peer file transfer
      </p>

      <div className="room-actions">
        <button onClick={handleCreateRoom} className="btn btn-primary">
          Create New Room
        </button>

        <div className="divider">OR</div>

        <form onSubmit={handleJoinRoom}>
          <input
            type="text"
            placeholder="Enter room ID"
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
            className="room-input"
          />
          <button
            type="submit"
            className="btn btn-secondary"
            disabled={roomInput === "" ? true : false}
          >
            Join Room
          </button>
        </form>
      </div>

      <div className="info-box">
        <h3>🔒 Privacy First</h3>
        <ul>
          <li>Files transfer directly between browsers (P2P)</li>
          <li>No server storage or processing</li>
          <li>End-to-end encrypted via WebRTC</li>
          <li>Works across NAT/firewalls using STUN/TURN</li>
        </ul>
      </div>
    </div>
  );
}
