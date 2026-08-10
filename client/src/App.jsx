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

  useEffect(() => {
    if (receipts.length === 0) return;

    // Grab the absolute newest receipt added to the top of the stack
    const latestReceipt = receipts[0];

    // If the newest entry is a completed download, register the user!
    if (latestReceipt.direction === "receive") {
      console.log(
        "[ANALYTICS] Target completed download receipt. Registering visitor...",
      );
      socketService.registerUser();
    }
  }, [receipts]);

  const handleSendFile = useCallback(
    async (targetPeerIds, file) => {
      if (targetPeerIds.length === 0) return;

      if (file.size > maxFileSizeBytes) {
        setError(
          `File exceeds max size of ${Math.round(maxFileSizeBytes / (1024 * 1024))} MB`,
        );
        return;
      }

      for (const peerId of targetPeerIds) {
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
          socketService.registerUser();
        } catch (err) {
          setError(err.message);
          setTransfers((prev) => {
            const next = { ...prev };
            delete next[peerId];
            return next;
          });
        }
      }
    },
    [maxFileSizeBytes],
  );

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

          <a
            href="https://github.com/AnirbanDutta22/p2p-file-share-application"
            target="_blank"
            rel="noopener noreferrer"
            className="github-link"
            aria-label="View source on GitHub"
            title="View on GitHub"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 .297a12 12 0 0 0-3.79 23.4c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.23 1.84 1.23 1.07 1.83 2.8 1.3 3.48.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.6-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .297" />
            </svg>
          </a>
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
              <PeerStatus peers={peers} myId={socketService.socket?.id} />
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
        <div className="logo-mark">
          <img src="/logo1.jpeg" alt="reachpeer_logo" />
        </div>
        {/* <p className="footer-text">
          <strong>How it works:</strong> Share the Room ID or invite link to
          join. Use the security check code only to confirm everyone is in the
          same room.
        </p> */}
        <p className="footer-text">Copyright © 2026 ReachPeer/Anirban Dutta</p>
      </footer>
    </div>
  );
}
