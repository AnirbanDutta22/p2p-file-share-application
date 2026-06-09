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

import { APP_LIMITS } from "../config/limits.js";
import twilio from "twilio";

// Google's public fallback STUN servers
const BASE_STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export class SignalingService {
  constructor(io, statsService) {
    this.io = io;
    this.statsService = statsService;

    // Room tracking: { roomId: Set<socketId> }
    this.rooms = new Map();

    // Socket to room mapping: { socketId: roomId }
    this.socketToRoom = new Map();

    /** @type {Map<string, string>} visitorId -> socketId (currently online) */
    this.onlineVisitors = new Map();

    // Initialize Twilio client using environment variables
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (accountSid && authToken) {
      this.twilioClient = twilio(accountSid, authToken);
      console.log(
        "[SIGNALING] Twilio Network Traversal client integrated successfully.",
      );
    } else {
      console.warn(
        "[SIGNALING] Twilio credentials missing in .env. Falling back to default configurations.",
      );
      this.twilioClient = null;
    }
  }

  async getIceServersConfiguration() {
    // If Twilio isn't configured, fall back to basic configuration gracefully
    if (!this.twilioClient) {
      return { iceServers: BASE_STUN_SERVERS, iceTransportPolicy: "all" };
    }

    try {
      // Fetch an ephemeral token array directly from Twilio
      const tokenInstance = await this.twilioClient.tokens.create();

      const cleanTwilioServers = (
        tokenInstance.ice_servers ||
        tokenInstance.iceServers ||
        []
      ).map((server) => ({
        urls: server.urls,
        // Only include username and credential if they exist (STUN doesn't need them, TURN does)
        ...(server.username && { username: server.username }),
        ...(server.credential && { credential: server.credential }),
      }));

      // Combine baseline free STUN servers with the newly generated TURN paths
      const dynamicIceServers = [...BASE_STUN_SERVERS, ...cleanTwilioServers];

      // console.log(
      //   "[SIGNALING] Formatted dynamic ICE Servers successfully:",
      //   dynamicIceServers,
      // );

      return {
        iceServers: dynamicIceServers,

        // ICE transport policy
        // 'all' - try STUN first, fall back to TURN if needed (recommended)
        // 'relay' - force TURN relay (useful for testing, expensive in production)
        iceTransportPolicy: "all",

        // Bundle policy - multiplexes media/data over single connection
        bundlePolicy: "max-bundle",

        // RTCP multiplexing - reduces number of ports needed
        rtcpMuxPolicy: "require",
      };
    } catch (error) {
      console.error(
        "[SIGNALING] Failed to generate dynamic Twilio credentials:",
        error.message,
      );
      return { iceServers: BASE_STUN_SERVERS, iceTransportPolicy: "all" };
    }
  }

  getOnlineCount() {
    return this.onlineVisitors.size;
  }

  broadcastAppStats() {
    const snapshot = this.statsService.getSnapshot(this.getOnlineCount());
    this.io.emit("app-stats", snapshot);
  }

  initialize() {
    this.io.on("connection", async (socket) => {
      console.log(`[SIGNALING] Client connected: ${socket.id}`);

      // Send WebRTC configuration and app limits to client
      const rtcConfig = await this.getIceServersConfiguration();
      socket.emit("webrtc-config", rtcConfig);
      socket.emit("app-config", APP_LIMITS);
      socket.emit(
        "app-stats",
        this.statsService.getSnapshot(this.getOnlineCount()),
      );

      socket.on("register-visitor", (visitorId) => {
        if (!visitorId || typeof visitorId !== "string") return;

        socket.visitorId = visitorId;
        this.statsService.registerVisitor(visitorId);
        this.onlineVisitors.set(visitorId, socket.id);
        this.broadcastAppStats();
      });

      socket.on("request-app-stats", () => {
        socket.emit(
          "app-stats",
          this.statsService.getSnapshot(this.getOnlineCount()),
        );
      });

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
       * LEAVE ROOM EVENT
       *
       * When a user leaves a room:
       * 1. Remove from the room
       * 2. Notify existing peers in the room
       * 3. Send them the list of existing peers
       */
      socket.on("leave-room", (roomId) => {
        this.leaveRoom(socket, roomId);
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
        if (socket.visitorId) {
          const current = this.onlineVisitors.get(socket.visitorId);
          if (current === socket.id) {
            this.onlineVisitors.delete(socket.visitorId);
          }
        }
        this.broadcastAppStats();
        this.handleDisconnect(socket);
      });
    });
  }

  handleJoinRoom(socket, roomId) {
    if (!roomId || typeof roomId !== "string" || !roomId.trim()) {
      socket.emit("join-error", { message: "Invalid room ID" });
      return;
    }

    const normalizedRoomId = roomId.trim().toUpperCase();

    // Leave previous room if any
    const previousRoom = this.socketToRoom.get(socket.id);
    if (previousRoom) {
      this.leaveRoom(socket, previousRoom);
    }

    // Create room if it doesn't exist
    if (!this.rooms.has(normalizedRoomId)) {
      this.rooms.set(normalizedRoomId, new Set());
    }

    // Get existing peers in the room BEFORE adding new socket
    const room = this.rooms.get(normalizedRoomId);
    const existingPeers = Array.from(room);

    if (!room.has(socket.id) && room.size >= APP_LIMITS.maxRoomSize) {
      socket.emit("join-error", {
        message: `Room is full (max ${APP_LIMITS.maxRoomSize} peers)`,
        maxRoomSize: APP_LIMITS.maxRoomSize,
      });
      return;
    }

    // Add socket to room
    room.add(socket.id);
    this.socketToRoom.set(socket.id, normalizedRoomId);
    socket.join(normalizedRoomId);

    console.log(
      `[SIGNALING] ${socket.id} joined room ${normalizedRoomId}. Room size: ${room.size}`,
    );

    // Notify the joining peer about existing peers
    socket.emit("room-joined", {
      roomId: normalizedRoomId,
      peers: existingPeers,
      maxRoomSize: APP_LIMITS.maxRoomSize,
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
