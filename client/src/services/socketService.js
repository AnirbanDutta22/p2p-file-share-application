/**
 * Socket Service
 *
 * Manages WebSocket connection to signaling server.
 */

import { io } from "socket.io-client";
import { getVisitorId } from "../utils/visitorId.js";

class SocketService {
  constructor() {
    this.socket = null;
    this.serverUrl =
      import.meta.env.VITE_SIGNALING_SERVER_URL || "http://localhost:3001";
    this.listenersBound = false;
  }

  connect() {
    if (this.socket?.connected) {
      return this.socket;
    }

    if (this.socket && !this.socket.connected) {
      this.socket.connect();
      return this.socket;
    }

    this.socket = io(this.serverUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });

    if (!this.listenersBound) {
      this.listenersBound = true;

      this.socket.on("connect", () => {
        console.log("[SOCKET] Connected:", this.socket.id);
        this.socket.emit("register-visitor", getVisitorId());
      });

      this.socket.on("disconnect", (reason) => {
        console.log("[SOCKET] Disconnected:", reason);
      });

      this.socket.on("connect_error", (error) => {
        console.error("[SOCKET] Connection error:", error);
      });
    }

    if (this.socket.connected) {
      this.socket.emit("register-visitor", getVisitorId());
    }

    return this.socket;
  }

  whenConnected() {
    return new Promise((resolve) => {
      const socket = this.connect();
      if (socket.connected) {
        resolve(socket);
        return;
      }
      socket.once("connect", () => resolve(socket));
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      // this.socket = null;
    }
  }

  async joinRoom(roomId) {
    const socket = await this.whenConnected();
    console.log("[SOCKET] Joining room:", roomId);
    socket.emit("join-room", roomId);
  }

  async leaveRoom(roomId) {
    if (this.socket?.connected) {
      console.log("[SOCKET] Explicitly leaving room:", roomId);
      this.socket.emit("leave-room", roomId);
    }
  }

  sendOffer(offer, targetSocketId) {
    this.socket?.emit("offer", { offer, targetSocketId });
  }

  sendAnswer(answer, targetSocketId) {
    this.socket?.emit("answer", { answer, targetSocketId });
  }

  sendIceCandidate(candidate, targetSocketId) {
    this.socket?.emit("ice-candidate", { candidate, targetSocketId });
  }

  onWebRTCConfig(callback) {
    this.socket?.on("webrtc-config", callback);
  }

  onRoomJoined(callback) {
    this.socket?.on("room-joined", callback);
  }

  onPeerJoined(callback) {
    this.socket?.on("peer-joined", callback);
  }

  onPeerLeft(callback) {
    this.socket?.on("peer-left", callback);
  }

  onOffer(callback) {
    this.socket?.on("offer", callback);
  }

  onAnswer(callback) {
    this.socket?.on("answer", callback);
  }

  onIceCandidate(callback) {
    this.socket?.on("ice-candidate", callback);
  }

  onAppStats(callback) {
    this.socket?.on("app-stats", callback);
  }

  offAppStats(callback) {
    this.socket?.off("app-stats", callback);
  }

  requestAppStats() {
    this.socket?.emit("request-app-stats");
  }

  onAppConfig(callback) {
    this.socket?.on("app-config", callback);
  }

  onJoinError(callback) {
    this.socket?.on("join-error", callback);
  }

  getSocket() {
    return this.socket;
  }
}

export default new SocketService();
