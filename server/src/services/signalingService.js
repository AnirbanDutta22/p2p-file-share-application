/**
 * Signaling Service
 *
 * This service handles WebRTC signaling using Socket.IO.
 *
 * WHY SIGNALING IS REQUIRED:
 * WebRTC is peer-to-peer, but peers need a way to FIND each other first.
 * The signaling server acts as a "matchmaker" that:
 * 1. Helps peers exchange network information (ICE candidates)
 * 2. Helps peers exchange session descriptions (SDP offer/answer)
 * 3. Manages room membership
 *
 * CRITICAL: The signaling server NEVER sees or touches file data.
 * Once WebRTC connection is established, all data flows peer-to-peer.
 *
 */

import { PEER_CONNECTION_CONFIG } from "../config/webrtc.js";

export class SignalingService {
  constructor(io) {
    this.io = io;

    // Room tracking: { roomId: Set<socketId> }
    this.rooms = new Map();

    // Socket to room mapping: { socketId: roomId }
    this.socketToRoom = new Map();
  }

  initialize() {
    this.io.on("connection", (socket) => {
      console.log(`[SIGNALING] Client connected: ${socket.id}`);

      // Send WebRTC configuration to client
      socket.emit("webrtc-config", PEER_CONNECTION_CONFIG);

      /**
       * JOIN ROOM EVENT
       *
       * When a user joins a room:
       * 1. Add them to the room
       * 2. Notify existing peers in the room
       * 3. Send them the list of existing peers
       */
      socket.on("join-room", (roomId) => {
        this.handleJoinRoom(socket, roomId);
      });

      /**
       * WebRTC OFFER EVENT
       *
       * Peer A creates an RTCPeerConnection and generates an SDP offer.
       * This offer describes Peer A's capabilities (codecs, network info, etc.)
       * We forward this offer to Peer B so they can create a matching answer.
       */
      socket.on("offer", ({ offer, targetSocketId }) => {
        console.log(
          `[SIGNALING] Forwarding offer from ${socket.id} to ${targetSocketId}`,
        );

        this.io.to(targetSocketId).emit("offer", {
          offer,
          callerSocketId: socket.id,
        });
      });

      /**
       * WebRTC ANSWER EVENT
       *
       * Peer B receives the offer, creates their own RTCPeerConnection,
       * and generates an SDP answer. This answer describes Peer B's capabilities.
       * We forward this answer back to Peer A to complete the negotiation.
       */
      socket.on("answer", ({ answer, targetSocketId }) => {
        console.log(
          `[SIGNALING] Forwarding answer from ${socket.id} to ${targetSocketId}`,
        );

        this.io.to(targetSocketId).emit("answer", {
          answer,
          answererSocketId: socket.id,
        });
      });

      /**
       * ICE CANDIDATE EVENT
       *
       * CRITICAL FOR NAT TRAVERSAL:
       *
       * After creating an RTCPeerConnection, each peer's browser discovers
       * multiple network paths (ICE candidates) it could use to connect:
       * - Host candidate: Local IP address (works only on same network)
       * - Server reflexive candidate: Public IP discovered via STUN
       * - Relay candidate: TURN server address (fallback)
       *
       * Peers exchange ALL candidates so they can try multiple paths
       * and choose the best one (usually STUN-discovered direct path).
       *
       * WHY THIS MATTERS:
       * Most users are behind routers (NAT). Without STUN/candidate exchange,
       * peers wouldn't know each other's public IPs and couldn't connect.
       */
      socket.on("ice-candidate", ({ candidate, targetSocketId }) => {
        console.log(
          `[SIGNALING] Forwarding ICE candidate from ${socket.id} to ${targetSocketId}`,
        );

        this.io.to(targetSocketId).emit("ice-candidate", {
          candidate,
          senderSocketId: socket.id,
        });
      });

      /**
       * DISCONNECT EVENT
       *
       * Clean up when a peer disconnects
       */
      socket.on("disconnect", () => {
        this.handleDisconnect(socket);
      });
    });
  }

  handleJoinRoom(socket, roomId) {
    // Leave previous room if any
    const previousRoom = this.socketToRoom.get(socket.id);
    if (previousRoom) {
      this.leaveRoom(socket, previousRoom);
    }

    // Create room if it doesn't exist
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }

    // Get existing peers in the room BEFORE adding new socket
    const room = this.rooms.get(roomId);
    const existingPeers = Array.from(room);

    // Add socket to room
    room.add(socket.id);
    this.socketToRoom.set(socket.id, roomId);
    socket.join(roomId);

    console.log(
      `[SIGNALING] ${socket.id} joined room ${roomId}. Room size: ${room.size}`,
    );

    // Notify the joining peer about existing peers
    socket.emit("room-joined", {
      roomId,
      peers: existingPeers,
    });

    // Notify existing peers about the new peer
    existingPeers.forEach((peerId) => {
      this.io.to(peerId).emit("peer-joined", {
        peerId: socket.id,
      });
    });
  }

  leaveRoom(socket, roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.delete(socket.id);
    this.socketToRoom.delete(socket.id);

    // Notify other peers in the room
    socket.to(roomId).emit("peer-left", {
      peerId: socket.id,
    });

    // Delete room if empty
    if (room.size === 0) {
      this.rooms.delete(roomId);
      console.log(`[SIGNALING] Room ${roomId} deleted (empty)`);
    }

    socket.leave(roomId);
    console.log(`[SIGNALING] ${socket.id} left room ${roomId}`);
  }

  handleDisconnect(socket) {
    const roomId = this.socketToRoom.get(socket.id);

    if (roomId) {
      this.leaveRoom(socket, roomId);
    }

    console.log(`[SIGNALING] Client disconnected: ${socket.id}`);
  }
}
