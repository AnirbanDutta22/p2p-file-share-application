import { useState, useEffect } from "react";
import socketService from "./services/socketService.js";
import webrtcService from "./services/webrtcService.js";
import RoomManager from "./components/RoomManager.jsx";
import PeerStatus from "./components/PeerStatus.jsx";
import FileTransfer from "./components/FileTransfer.jsx";
import { downloadFile } from "./utils/fileChunker.js";
import "./App.css";

/**
 * Main Application Component
 *
 * Orchestrates:
 * - Socket.IO connection
 * - WebRTC peer connections
 * - Room management
 * - File transfers
 */
export default function App() {
  const [currentRoom, setCurrentRoom] = useState(null);
  const [peers, setPeers] = useState([]);
  const [transfers, setTransfers] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    // Connect to signaling server
    socketService.connect();

    // Initialize WebRTC service with callbacks
    webrtcService.initialize({
      onPeerConnected: (peerId) => {
        console.log("[APP] Peer connected:", peerId);
        setPeers((prev) =>
          prev.map((p) => (p.id === peerId ? { ...p, connected: true } : p)),
        );
      },

      onPeerDisconnected: (peerId) => {
        console.log("[APP] Peer disconnected:", peerId);
        setPeers((prev) => prev.filter((p) => p.id !== peerId));
        setTransfers((prev) => {
          const newTransfers = { ...prev };
          delete newTransfers[peerId];
          return newTransfers;
        });
      },

      onFileReceiveStart: (peerId, metadata) => {
        console.log("[APP] File receive started:", metadata.fileName);
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
          [peerId]: {
            ...prev[peerId],
            progress,
          },
        }));
      },

      onFileReceiveComplete: (peerId, file) => {
        console.log("[APP] File received:", file.name);

        // Auto-download the file
        downloadFile(file);

        // Show completion message
        setTimeout(() => {
          setTransfers((prev) => {
            const newTransfers = { ...prev };
            delete newTransfers[peerId];
            return newTransfers;
          });
          alert(`File received: ${file.name}`);
        }, 1000);
      },

      onFileSendProgress: (peerId, progress) => {
        setTransfers((prev) => ({
          ...prev,
          [peerId]: {
            ...prev[peerId],
            progress,
          },
        }));
      },

      onFileSendComplete: (peerId) => {
        console.log("[APP] File sent successfully");
        setTimeout(() => {
          setTransfers((prev) => {
            const newTransfers = { ...prev };
            delete newTransfers[peerId];
            return newTransfers;
          });
        }, 1000);
      },

      onError: (error) => {
        console.error("[APP] Error:", error);
        setError(error);
        setTimeout(() => setError(null), 5000);
      },
    });

    // Handle room joined event
    socketService.onRoomJoined(({ roomId, peers: existingPeers }) => {
      console.log("[APP] Joined room:", roomId, "with peers:", existingPeers);
      setCurrentRoom(roomId);
      setPeers(existingPeers.map((id) => ({ id, connected: false })));
    });

    // Handle new peer joining
    socketService.onPeerJoined(({ peerId }) => {
      console.log("[APP] New peer joined:", peerId);
      setPeers((prev) => [...prev, { id: peerId, connected: false }]);
    });

    // Handle peer leaving
    socketService.onPeerLeft(({ peerId }) => {
      console.log("[APP] Peer left:", peerId);
      setPeers((prev) => prev.filter((p) => p.id !== peerId));
    });

    // Cleanup on unmount
    return () => {
      webrtcService.cleanup();
      socketService.disconnect();
    };
  }, []);

  const handleJoinRoom = (roomId) => {
    socketService.joinRoom(roomId);
  };

  const handleSendFile = async (peerId, file) => {
    try {
      setTransfers((prev) => ({
        ...prev,
        [peerId]: {
          type: "send",
          fileName: file.name,
          fileSize: file.size,
          progress: 0,
        },
      }));

      await webrtcService.sendFile(peerId, file);
    } catch (error) {
      console.error("[APP] Failed to send file:", error);
      setError(error.message);
      setTransfers((prev) => {
        const newTransfers = { ...prev };
        delete newTransfers[peerId];
        return newTransfers;
      });
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo-group">
          <div className="logo-mark">⬡</div>
          <span className="logo-wordmark">
            reach<em>peer</em>
          </span>
        </div>
        <div className="header-right">
          <span className="tagline">Secure · Direct · Browser-to-Browser</span>
          <div className="status-pill">
            <span className="dot"></span>
            live
          </div>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <span>⚠</span> {error}
        </div>
      )}

      <main className="app-main">
        {!currentRoom ? (
          <RoomManager onJoinRoom={handleJoinRoom} currentRoom={currentRoom} />
        ) : (
          <>
            <RoomManager
              onJoinRoom={handleJoinRoom}
              currentRoom={currentRoom}
            />
            <div className="app-content">
              <PeerStatus peers={peers} />
              <FileTransfer
                peers={peers}
                onSendFile={handleSendFile}
                transfers={transfers}
              />
            </div>
          </>
        )}
      </main>

      <footer className="app-footer">
        <span className="footer-icon">⬡</span>
        <p className="footer-text">
          <strong>How it works:</strong> Files transfer directly between
          browsers using WebRTC. No data passes through any server.
        </p>
      </footer>
    </div>
  );
}
