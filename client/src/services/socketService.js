/**
 * Socket Service
 *
 * Manages WebSocket connection to signaling server.
 * Handles all signaling events for WebRTC connection establishment.
 */

import { io } from "socket.io-client";

class SocketService {
  constructor() {
    this.socket = null;
    this.serverUrl =
      import.meta.env.VITE_SIGNALING_SERVER_URL || "http://localhost:3001";
  }

  connect() {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io(this.serverUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    this.socket.on("connect", () => {
      console.log("[SOCKET] Connected to signaling server:", this.socket.id);
    });

    this.socket.on("disconnect", (reason) => {
      console.log("[SOCKET] Disconnected:", reason);
    });

    this.socket.on("connect_error", (error) => {
      console.error("[SOCKET] Connection error:", error);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Room management
  joinRoom(roomId) {
    console.log("[SOCKET] Joining room:", roomId);
    this.socket.emit("join-room", roomId);
  }

  // WebRTC signaling
  sendOffer(offer, targetSocketId) {
    console.log("[SOCKET] Sending offer to:", targetSocketId);
    this.socket.emit("offer", { offer, targetSocketId });
  }

  sendAnswer(answer, targetSocketId) {
    console.log("[SOCKET] Sending answer to:", targetSocketId);
    this.socket.emit("answer", { answer, targetSocketId });
  }

  sendIceCandidate(candidate, targetSocketId) {
    console.log("[SOCKET] Sending ICE candidate to:", targetSocketId);
    this.socket.emit("ice-candidate", { candidate, targetSocketId });
  }

  // Event listeners
  onWebRTCConfig(callback) {
    this.socket.on("webrtc-config", callback);
  }

  onRoomJoined(callback) {
    this.socket.on("room-joined", callback);
  }

  onPeerJoined(callback) {
    this.socket.on("peer-joined", callback);
  }

  onPeerLeft(callback) {
    this.socket.on("peer-left", callback);
  }

  onOffer(callback) {
    this.socket.on("offer", callback);
  }

  onAnswer(callback) {
    this.socket.on("answer", callback);
  }

  onIceCandidate(callback) {
    this.socket.on("ice-candidate", callback);
  }

  // Cleanup
  removeAllListeners() {
    if (this.socket) {
      this.socket.removeAllListeners();
    }
  }
}

export default new SocketService();
