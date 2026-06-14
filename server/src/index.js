/**
 * P2P File Sharing - Signaling Server
 *
 * PURPOSE:
 * This server exists ONLY for WebRTC signaling. It helps peers:
 * 1. Discover each other (room management)
 * 2. Exchange connection metadata (SDP offers/answers)
 * 3. Exchange network paths (ICE candidates)
 *
 * WHAT THIS SERVER DOES NOT DO:
 * Store files
 * Transfer files
 * Process file data
 * See file contents
 *
 * WHY:
 * WebRTC DataChannels provide direct peer-to-peer transfer.
 * Using the server for file transfer would be slower, more expensive,
 * and defeat the purpose of P2P architecture.
 *
 */

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { SignalingService } from "./services/signalingService.js";
import { StatsService } from "./services/statsService.js";
import { APP_LIMITS } from "./config/limits.js";

dotenv.config();

const app = express();
const httpServer = createServer(app);

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [
  "http://localhost:5173",
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

app.use(express.json());

const statsService = new StatsService();

app.head("/head", (req, res) => {
  res.sendStatus(200);
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "p2p-file-share-signaling-server",
    timestamp: new Date().toISOString(),
  });
});

// Initialize Socket.IO with CORS
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  // Transports - use websocket primarily
  transports: ["websocket", "polling"],
  // Ping settings
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Initialize signaling service
const signalingService = new SignalingService(io, statsService);
signalingService.initialize();

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log("========================================");
  console.log("P2P File Share - Signaling Server");
  console.log("========================================");
  process.env.NODE_ENV === "development" &&
    console.log(`Signaling Server: http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`Allowed Origins: ${allowedOrigins.join(", ")}`);
  console.log(`Max room size: ${APP_LIMITS.maxRoomSize} peers`);
  console.log(
    `Max file size (client): ${Math.round(APP_LIMITS.maxFileSizeBytes / (1024 * 1024))} MB`,
  );
  console.log("Online users: ", signalingService.getOnlineCount());
  console.log("========================================");
  console.log("");
  console.log("This server handles ONLY WebRTC signaling");
  console.log("Files are transferred P2P via WebRTC DataChannels");
  console.log("No file data passes through this server");
  console.log("");
  console.log("========================================");
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, closing server...");
  httpServer.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
