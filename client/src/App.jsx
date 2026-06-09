import { useState, useEffect, useCallback, useRef } from "react";
import socketService from "./services/socketService.js";
import webrtcService from "./services/webrtcService.js";
import RoomManager from "./components/RoomManager.jsx";
import PeerStatus from "./components/PeerStatus.jsx";
import FileTransfer from "./components/FileTransfer.jsx";
import TransferReceipt from "./components/TransferReceipt.jsx";
import { downloadFile } from "./utils/fileChunker.js";
import { computeFileSha256 } from "./utils/crypto.js";
import { getRoomIdFromUrl } from "./utils/roomId.js";
import { LIMITS } from "./config/limits.js";
import { useAppStats } from "./hooks/useAppStats.js";
import "./App.css";

let receiptCounter = 0;

export default function App() {
  const [currentRoom, setCurrentRoom] = useState(null);
  const [peers, setPeers] = useState([]);
  const [transfers, setTransfers] = useState({});
  const [receipts, setReceipts] = useState([]);
  const [error, setError] = useState(null);
  const [joinError, setJoinError] = useState(null);
  const [maxRoomSize, setMaxRoomSize] = useState(LIMITS.maxRoomSize);
  const [maxFileSizeBytes, setMaxFileSizeBytes] = useState(
    LIMITS.maxFileSizeBytes,
  );

  const appStats = useAppStats();
  const initializedRef = useRef(false);
  const pendingRoomRef = useRef(getRoomIdFromUrl());

  const addReceipt = useCallback(async (direction, peerId, file) => {
    const sha256 = await computeFileSha256(file);
    setReceipts((prev) => [
      {
        id: `${Date.now()}-${++receiptCounter}`,
        direction,
        peerId,
        fileName: file.name,
        fileSize: file.size,
        sha256,
        at: Date.now(),
      },
      ...prev.slice(0, 9),
    ]);
    return sha256;
  }, []);

  const handleJoinRoom = useCallback((roomId) => {
    setJoinError(null);
    setError(null);
    socketService.joinRoom(roomId);
  }, []);

  const handleLeaveRoom = useCallback(() => {
    if (!currentRoom) return;

    // 1. Clean up active P2P allocations to avoid memory leaks
    webrtcService.cleanup();

    // 2. Inform the server to notify other peers via 'peer-left'
    socketService.leaveRoom(currentRoom);

    // 3. Reset React UI and URL parameters
    setCurrentRoom(null);
    setPeers([]);
    setTransfers({});

    window.history.replaceState({}, document.title, window.location.pathname);
  }, [currentRoom]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    socketService.connect();

    socketService.onAppConfig((config) => {
      if (config.maxRoomSize) setMaxRoomSize(config.maxRoomSize);
      if (config.maxFileSizeBytes) setMaxFileSizeBytes(config.maxFileSizeBytes);
    });

    socketService.onJoinError(({ message }) => {
      setJoinError(message);
    });

    webrtcService.initialize({
      onPeerConnected: (peerId) => {
        setPeers((prev) =>
          prev.map((p) => (p.id === peerId ? { ...p, connected: true } : p)),
        );
      },

      onPeerDisconnected: (peerId) => {
        setPeers((prev) => prev.filter((p) => p.id !== peerId));
        setTransfers((prev) => {
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
      },

      onPeerFingerprint: (peerId, fingerprint) => {
        setPeers((prev) =>
          prev.map((p) => (p.id === peerId ? { ...p, fingerprint } : p)),
        );
      },

      onFileReceiveStart: (peerId, metadata) => {
        setTransfers((prev) => ({
          ...prev,
          [peerId]: {
            type: "receive",
            fileName: metadata.fileName,
            fileSize: metadata.fileSize,
            progress: 0,
          },
        }));
      },

      onFileReceiveProgress: (peerId, progress) => {
        setTransfers((prev) => ({
          ...prev,
          [peerId]: { ...prev[peerId], progress },
        }));
      },

      onFileReceiveComplete: async (peerId, file) => {
        downloadFile(file);
        await addReceipt("receive", peerId, file);
        setTimeout(() => {
          setTransfers((prev) => {
            const next = { ...prev };
            delete next[peerId];
            return next;
          });
        }, 1000);
      },

      onFileSendProgress: (peerId, progress) => {
        setTransfers((prev) => ({
          ...prev,
          [peerId]: { ...prev[peerId], progress },
        }));
      },

      onFileSendComplete: async (peerId, file) => {
        if (file) {
          await addReceipt("send", peerId, file);
        }
        setTimeout(() => {
          setTransfers((prev) => {
            const next = { ...prev };
            delete next[peerId];
            return next;
          });
        }, 1000);
      },

      onError: (err) => {
        setError(typeof err === "string" ? err : err?.message || "Error");
        setTimeout(() => setError(null), 5000);
      },
    });

    socketService.onRoomJoined(({ roomId, peers: existingPeers }) => {
      setCurrentRoom(roomId);
      setPeers(existingPeers.map((id) => ({ id, connected: false })));
      setJoinError(null);

      const url = new URL(window.location.href);
      url.searchParams.set("room", roomId);
      window.history.replaceState({}, "", url);
    });

    socketService.onPeerJoined(({ peerId }) => {
      setPeers((prev) => {
        if (prev.some((p) => p.id === peerId)) return prev;
        return [...prev, { id: peerId, connected: false }];
      });
    });

    socketService.onPeerLeft(({ peerId }) => {
      setPeers((prev) => prev.filter((p) => p.id !== peerId));
    });

    socketService.whenConnected().then(() => {
      if (pendingRoomRef.current) {
        handleJoinRoom(pendingRoomRef.current);
        pendingRoomRef.current = null;
      }
    });
  }, [addReceipt, handleJoinRoom]);

  const handleSendFile = async (peerId, file) => {
    if (file.size > maxFileSizeBytes) {
      setError(
        `File exceeds max size of ${Math.round(maxFileSizeBytes / (1024 * 1024))} MB`,
      );
      return;
    }

    try {
      setTransfers((prev) => ({
        ...prev,
        [peerId]: {
          type: "send",
          fileName: file.name,
          fileSize: file.size,
          progress: 0,
          file,
        },
      }));

      await webrtcService.sendFile(peerId, file);
    } catch (err) {
      setError(err.message);
      setTransfers((prev) => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    }
  };

  const dismissReceipt = (id) => {
    setReceipts((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo-group">
          <div className="logo-mark">
            <img src="/logo1.jpeg" alt="reachpeer_logo" />
          </div>
          <span
            className="logo-wordmark cursor-pointer"
            onClick={handleLeaveRoom}
          >
            reach<em>peer</em>
          </span>
        </div>
        <div className="header-right">
          <span className="tagline">Secure · Direct · Browser-to-Browser</span>
          {appStats.totalUsersEver != null && (
            <div
              className="globe-count"
              title="Unique browsers that have opened the app"
            >
              <span className="globe-num">
                {appStats.totalUsersEver.toLocaleString()}
              </span>
              <span className="globe-label">total users</span>
            </div>
          )}
          {appStats.onlineNow != null && (
            <div className="status-pill" title="Browsers connected right now">
              <span className="dot"></span>
              {appStats.onlineNow} online
            </div>
          )}
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <span>⚠</span> {error}
        </div>
      )}

      <main className="app-main">
        {!currentRoom ? (
          <RoomManager
            onJoinRoom={handleJoinRoom}
            currentRoom={currentRoom}
            joinError={joinError}
          />
        ) : (
          <>
            <RoomManager
              onJoinRoom={handleJoinRoom}
              currentRoom={currentRoom}
              maxRoomSize={maxRoomSize}
              peerCount={peers.length}
            />
            <div className="app-content">
              <PeerStatus peers={peers} />
              <FileTransfer
                peers={peers}
                onSendFile={handleSendFile}
                transfers={transfers}
                maxFileSizeBytes={maxFileSizeBytes}
              />
            </div>
            <button
              className="leave-room-btn"
              onClick={handleLeaveRoom}
              style={{
                padding: "6px 12px",
                backgroundColor: "#e11d48",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "500",
              }}
            >
              Leave Room
            </button>
            <TransferReceipt receipts={receipts} onDismiss={dismissReceipt} />
          </>
        )}
      </main>

      <footer className="app-footer">
        <span className="footer-icon">⬡</span>
        <p className="footer-text">
          <strong>How it works:</strong> Share the Room ID or invite link to
          join. Use the security check code only to confirm everyone is in the
          same room.
        </p>
      </footer>
    </div>
  );
}
