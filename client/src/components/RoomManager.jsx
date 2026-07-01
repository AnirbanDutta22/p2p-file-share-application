/* eslint-disable react-hooks/set-state-in-effect */
/**
 * Room Manager Component
 */
import { useState, useEffect } from "react";
import { computeRoomVerifyCode } from "../utils/crypto.js";
import { parseRoomIdInput, buildRoomInviteUrl } from "../utils/roomId.js";
import { LIMITS } from "../config/limits.js";

export default function RoomManager({
  onJoinRoom,
  currentRoom,
  maxRoomSize = LIMITS.maxRoomSize,
  peerCount = 0,
  joinError = null,
}) {
  const [roomInput, setRoomInput] = useState("");
  const [localError, setLocalError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [roomVerifyCode, setRoomVerifyCode] = useState(null);

  // UX Optimization: Tracks async actions
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // If there is no active room configuration, exit early silently
    if (!currentRoom) return;

    let isMounted = true;
    computeRoomVerifyCode(currentRoom).then((code) => {
      if (isMounted) setRoomVerifyCode(code);
    });

    return () => {
      isMounted = false;
    };
  }, [currentRoom]);

  // Turn off processing indicators once currentRoom transitions or errors arrive
  useEffect(() => {
    if (currentRoom || joinError || localError) {
      setIsProcessing(false);
    }
  }, [currentRoom, joinError, localError]);

  const handleCopyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(currentRoom);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const handleCopyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(buildRoomInviteUrl(currentRoom));
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const handleCreateRoom = () => {
    setLocalError(null);
    setIsProcessing(true);
    // fix 1: generate cryptographically secure roomId
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const array = new Uint8Array(6);
    crypto.getRandomValues(array);
    const roomId = Array.from(array, (x) => chars[x % chars.length]).join("");
    onJoinRoom(roomId);
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    setLocalError(null);
    const result = parseRoomIdInput(roomInput);
    if (result.error) {
      setLocalError(result.error);
      return;
    }
    setIsProcessing(true);
    onJoinRoom(result.roomId);
  };

  const displayError = localError || joinError;

  if (currentRoom) {
    return (
      <div className="room-info panel">
        <div className="room-info-top">
          <div className="room-id-block">
            <div className="panel-label">Room ID — share this to join</div>
            <div className="room-id-row">
              <span className="room-badge-static">{currentRoom}</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleCopyRoomId}
              >
                {copied ? "Copied!" : "Copy ID"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleCopyInviteLink}
              >
                {linkCopied ? "Link copied!" : "Copy invite link"}
              </button>
            </div>
            <p className="room-hint">
              Others paste this ID (or the invite link) on the home screen — not
              the security check below.
            </p>
          </div>

          {roomVerifyCode && (
            <div className="room-verify">
              <div className="panel-label">Security check (optional)</div>
              <span className="verify-code-readonly" aria-readonly="true">
                {roomVerifyCode}
              </span>
              <p className="verify-hint">
                After joining, confirm this code matches on every device.{" "}
                <strong>Do not use this to join a room.</strong>
              </p>
            </div>
          )}
        </div>
        <div className="room-meta">
          <span className="room-capacity">
            {peerCount + 1} / {maxRoomSize} peers in room
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="room-manager panel">
      <h2>P2P File Share</h2>
      <p className="subtitle">Direct peer-to-peer file transfer</p>

      {displayError && <div className="room-form-error">{displayError}</div>}

      <div className="room-actions">
        <button
          onClick={handleCreateRoom}
          disabled={isProcessing}
          className="btn btn-primary"
        >
          {isProcessing ? "Creating Room..." : "Create New Room"}
        </button>

        <div className="divider">OR</div>

        <form onSubmit={handleJoinRoom}>
          <input
            type="text"
            placeholder="Room ID e.g. ABC123"
            value={roomInput}
            onChange={(e) => {
              setRoomInput(e.target.value.toUpperCase());
              setLocalError(null);
            }}
            className="room-input"
            autoComplete="off"
            spellCheck={false}
            disabled={isProcessing}
          />
          <button
            type="submit"
            className="btn btn-secondary"
            disabled={!roomInput.trim() || isProcessing}
          >
            {isProcessing ? "Joining..." : "Join Room"}
          </button>
        </form>
      </div>

      <div className="info-box">
        <h3>Getting Started</h3>

        <ul>
          <li>
            <div>
              <strong>To share files:</strong> Click <em>"Create New Room"</em>,
              then copy and share the Room ID or invite link with the other
              devices.
            </div>
          </li>

          <li>
            <div>
              <strong>To receive files:</strong> Paste the 6-character Room ID
              sent to you into the box above and click <em>"Join Room"</em>.
            </div>
          </li>

          <li>
            <div>
              <strong>Verify connection:</strong> The dashed security code
              inside the room is optional—it simply lets you double-check that
              your devices connected to each other safely.
            </div>
          </li>

          <li>
            <div>
              <strong>Room Limits:</strong> Up to {maxRoomSize} devices can join
              a single room at once. You can transfer files up to{" "}
              {Math.round(LIMITS.maxFileSizeBytes / (1024 * 1024))} MB in size.
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
}
