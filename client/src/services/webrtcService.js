/**
 * WebRTC Service
 *
 * Manages RTCPeerConnection and DataChannel for P2P file transfer.
 *
 * ARCHITECTURE:
 * 1. Each peer connection has one RTCPeerConnection object
 * 2. Each connection has one DataChannel for file transfer
 * 3. Signaling (offer/answer/ICE) happens via Socket.IO
 * 4. Actual file data flows through DataChannel (P2P)
 *
 * NAT TRAVERSAL STRATEGY:
 * 1. Try direct connection first (host candidates)
 * 2. Use STUN to discover public IP (server reflexive candidates)
 * 3. Fall back to TURN relay only if both above fail
 *
 */

import socketService from "./socketService.js";
import { CHUNK_SIZE, calculateTotalChunks } from "../utils/fileChunker.js";

class WebRTCService {
  constructor() {
    // Map of peerId -> RTCPeerConnection
    this.peerConnections = new Map();

    // Map of peerId -> RTCDataChannel
    this.dataChannels = new Map();

    // WebRTC configuration from server
    this.rtcConfig = null;

    // File transfer state
    this.incomingFileData = new Map(); // peerId -> { chunks, metadata }
    this.outgoingFileTransfers = new Map(); // peerId -> transfer state
    this.peerFingerprints = new Map(); // peerId -> fingerprint string
  }

  /**
   * Initialize WebRTC service
   */
  initialize(callbacks = {}) {
    if (this._initialized) {
      this.callbacks = { ...this.callbacks, ...callbacks };
      return;
    }
    this._initialized = true;

    this.callbacks = {
      onPeerConnected: callbacks.onPeerConnected || (() => {}),
      onPeerDisconnected: callbacks.onPeerDisconnected || (() => {}),
      onFileReceiveStart: callbacks.onFileReceiveStart || (() => {}),
      onFileReceiveProgress: callbacks.onFileReceiveProgress || (() => {}),
      onFileReceiveComplete: callbacks.onFileReceiveComplete || (() => {}),
      onFileSendProgress: callbacks.onFileSendProgress || (() => {}),
      onFileSendComplete: callbacks.onFileSendComplete || (() => {}),
      onPeerFingerprint: callbacks.onPeerFingerprint || (() => {}),
      onError: callbacks.onError || ((err) => console.error(err)),
    };

    // Get WebRTC config from server
    socketService.onWebRTCConfig((config) => {
      console.log("[WEBRTC] Received configuration from server");
      this.rtcConfig = config;
    });

    // Handle new peer joining
    socketService.onPeerJoined(({ peerId }) => {
      console.log("[WEBRTC] New peer joined, creating offer:", peerId);
      this.createPeerConnection(peerId, true);
    });

    // Handle peer leaving
    socketService.onPeerLeft(({ peerId }) => {
      console.log("[WEBRTC] Peer left:", peerId);
      this.closePeerConnection(peerId);
    });

    // Handle incoming offer
    socketService.onOffer(async ({ offer, callerSocketId }) => {
      console.log("[WEBRTC] Received offer from:", callerSocketId);
      await this.handleOffer(offer, callerSocketId);
    });

    // Handle incoming answer
    socketService.onAnswer(async ({ answer, answererSocketId }) => {
      console.log("[WEBRTC] Received answer from:", answererSocketId);
      await this.handleAnswer(answer, answererSocketId);
    });

    // Handle incoming ICE candidate
    socketService.onIceCandidate(async ({ candidate, senderSocketId }) => {
      console.log("[WEBRTC] Received ICE candidate from:", senderSocketId);
      await this.handleIceCandidate(candidate, senderSocketId);
    });
  }

  /**
   * Create RTCPeerConnection for a peer
   *
   * @param {string} peerId - Socket ID of the peer
   * @param {boolean} isInitiator - Whether this peer initiates the connection
   */
  createPeerConnection(peerId, isInitiator) {
    if (this.peerConnections.has(peerId)) {
      console.warn("[WEBRTC] Peer connection already exists for:", peerId);
      return;
    }

    if (!this.rtcConfig) {
      console.error("[WEBRTC] RTC config not received from server yet");
      return;
    }

    console.log("[WEBRTC] Creating peer connection for:", peerId);

    const pc = new RTCPeerConnection(this.rtcConfig);
    this.peerConnections.set(peerId, pc);

    /**
     * ICE CANDIDATE EVENT
     *
     * When the browser discovers a new network path (ICE candidate),
     * we send it to the peer via signaling server.
     *
     * Types of candidates:
     * - host: Local network address
     * - srflx: Public IP discovered via STUN (Server Reflexive)
     * - relay: TURN server address (fallback)
     *
     * The browser automatically tries candidates in order of preference.
     */
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(
          "[WEBRTC] New ICE candidate for",
          peerId,
          ":",
          event.candidate.type,
        );
        socketService.sendIceCandidate(event.candidate, peerId);
      }
    };

    /**
     * ICE CONNECTION STATE CHANGES
     *
     * States:
     * - new: ICE agent is gathering candidates
     * - checking: ICE agent is checking candidate pairs
     * - connected: ICE agent found a working connection!
     * - completed: ICE agent finished checking all candidates
     * - failed: ICE agent couldn't find a working connection
     * - disconnected: Connection lost (may recover)
     * - closed: Connection closed
     */
    pc.oniceconnectionstatechange = () => {
      console.log(
        "[WEBRTC] ICE connection state for",
        peerId,
        ":",
        pc.iceConnectionState,
      );

      if (
        pc.iceConnectionState === "connected" ||
        pc.iceConnectionState === "completed"
      ) {
        this.callbacks.onPeerConnected(peerId);
        this.fetchPeerFingerprint(peerId, pc);
      } else if (
        pc.iceConnectionState === "failed" ||
        pc.iceConnectionState === "closed"
      ) {
        this.callbacks.onPeerDisconnected(peerId);
        this.closePeerConnection(peerId);
      }
    };

    /**
     * CONNECTION STATE CHANGES
     */
    pc.onconnectionstatechange = () => {
      console.log(
        "[WEBRTC] Connection state for",
        peerId,
        ":",
        pc.connectionState,
      );
    };

    /**
     * DATA CHANNEL HANDLING
     *
     * If we're the initiator, we create the data channel.
     * If we're not, we wait to receive it via ondatachannel event.
     */
    if (isInitiator) {
      this.createDataChannel(peerId, pc);
      this.createOffer(peerId, pc);
    } else {
      pc.ondatachannel = (event) => {
        console.log("[WEBRTC] Received data channel from:", peerId);
        this.handleDataChannel(peerId, event.channel);
      };
    }
  }

  /**
   * Create DataChannel for file transfer
   *
   * DataChannel configuration:
   * - ordered: true (maintain chunk order for file reconstruction)
   * - maxRetransmits: null (unlimited retries - we want reliability)
   *
   * Binary type is set to 'arraybuffer' for efficient binary data transfer.
   */
  createDataChannel(peerId, pc) {
    const channel = pc.createDataChannel("fileTransfer", {
      ordered: true,
      maxRetransmits: null,
    });

    this.handleDataChannel(peerId, channel);
  }

  /**
   * Setup DataChannel event handlers
   */
  handleDataChannel(peerId, channel) {
    this.dataChannels.set(peerId, channel);

    // Use ArrayBuffer for binary data
    channel.binaryType = "arraybuffer";

    channel.onopen = () => {
      console.log("[WEBRTC] Data channel opened with:", peerId);
      this.callbacks.onPeerConnected(peerId);
      const pc = this.peerConnections.get(peerId);
      if (pc) this.fetchPeerFingerprint(peerId, pc);
    };

    channel.onclose = () => {
      console.log("[WEBRTC] Data channel closed with:", peerId);
      this.dataChannels.delete(peerId);
    };

    channel.onerror = (error) => {
      console.error("[WEBRTC] Data channel error with", peerId, ":", error);
      this.callbacks.onError(`Data channel error: ${error}`);
    };

    /**
     * MESSAGE HANDLER - CRITICAL FOR FILE TRANSFER
     *
     * Messages can be:
     * 1. File metadata (JSON) - tells us what file is coming
     * 2. File chunks (ArrayBuffer) - the actual file data
     * 3. End marker (JSON) - signals transfer complete
     */
    channel.onmessage = async (event) => {
      if (typeof event.data === "string") {
        // JSON message (metadata or end marker)
        const message = JSON.parse(event.data);

        if (message.type === "file-metadata") {
          this.handleFileMetadata(peerId, message);
        } else if (message.type === "file-end") {
          this.handleFileEnd(peerId);
        }
      } else {
        // Binary data (file chunk)
        this.handleFileChunk(peerId, event.data);
      }
    };

    /**
     * BUFFERED AMOUNT LOW EVENT
     *
     * This is critical for backpressure handling.
     * If we send data faster than the network can transmit,
     * the browser buffers it. We pause sending when buffer is full.
     */
    channel.onbufferedamountlow = () => {
      // Resume sending if we were paused
      const transfer = this.outgoingFileTransfers.get(peerId);
      if (transfer && transfer.paused) {
        console.log("[WEBRTC] Buffer drained, resuming send to:", peerId);
        this.resumeSendFile(peerId);
      }
    };
  }

  async fetchPeerFingerprint(peerId, pc) {
    if (this.peerFingerprints.has(peerId)) {
      this.callbacks.onPeerFingerprint(
        peerId,
        this.peerFingerprints.get(peerId),
      );
      return;
    }

    try {
      const stats = await pc.getStats();
      let fingerprint = null;

      stats.forEach((report) => {
        if (
          (report.type === "remote-certificate" ||
            report.type === "certificate") &&
          report.fingerprint
        ) {
          fingerprint = report.fingerprint;
        }
      });

      if (fingerprint) {
        this.peerFingerprints.set(peerId, fingerprint);
        this.callbacks.onPeerFingerprint(peerId, fingerprint);
      }
    } catch (error) {
      console.warn("[WEBRTC] Could not read peer fingerprint:", error);
    }
  }

  getPeerFingerprint(peerId) {
    return this.peerFingerprints.get(peerId) ?? null;
  }

  async createOffer(peerId, pc) {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketService.sendOffer(offer, peerId);
      console.log("[WEBRTC] Offer created and sent to:", peerId);
    } catch (error) {
      console.error("[WEBRTC] Error creating offer:", error);
      this.callbacks.onError(`Failed to create offer: ${error.message}`);
    }
  }

  /**
   * Handle incoming offer and create answer
   */
  async handleOffer(offer, peerId) {
    try {
      // Create peer connection if it doesn't exist
      if (!this.peerConnections.has(peerId)) {
        this.createPeerConnection(peerId, false);
      }

      const pc = this.peerConnections.get(peerId);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socketService.sendAnswer(answer, peerId);
      console.log("[WEBRTC] Answer created and sent to:", peerId);
    } catch (error) {
      console.error("[WEBRTC] Error handling offer:", error);
      this.callbacks.onError(`Failed to handle offer: ${error.message}`);
    }
  }

  /**
   * Handle incoming answer
   */
  async handleAnswer(answer, peerId) {
    try {
      const pc = this.peerConnections.get(peerId);
      if (!pc) {
        console.error("[WEBRTC] No peer connection for answer from:", peerId);
        return;
      }

      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log("[WEBRTC] Answer applied from:", peerId);
    } catch (error) {
      console.error("[WEBRTC] Error handling answer:", error);
      this.callbacks.onError(`Failed to handle answer: ${error.message}`);
    }
  }

  /**
   * Handle incoming ICE candidate
   *
   * CRITICAL: We must add ALL ICE candidates received from the peer.
   * The browser will test them all and pick the best path.
   */
  async handleIceCandidate(candidate, peerId) {
    try {
      const pc = this.peerConnections.get(peerId);
      if (!pc) {
        console.error(
          "[WEBRTC] No peer connection for ICE candidate from:",
          peerId,
        );
        return;
      }
      console.log(candidate);
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log("[WEBRTC] ICE candidate added from:", peerId);
    } catch (error) {
      console.error("[WEBRTC] Error adding ICE candidate:", error);
      // Don't throw - some candidates may fail, that's normal
    }
  }

  /**
   * SEND FILE TO PEER
   *
   * Strategy:
   * 1. Send metadata first (filename, size, type)
   * 2. Split file into chunks
   * 3. Send chunks with backpressure handling
   * 4. Send end marker when complete
   *
   * BACKPRESSURE HANDLING:
   * We monitor channel.bufferedAmount. If it exceeds threshold,
   * we pause sending until buffer drains (bufferedamountlow event).
   */
  async sendFile(peerId, file) {
    const channel = this.dataChannels.get(peerId);

    if (!channel || channel.readyState !== "open") {
      throw new Error("Data channel not ready");
    }

    console.log("[WEBRTC] Starting file send to", peerId, ":", file.name);

    // Send metadata
    const metadata = {
      type: "file-metadata",
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      totalChunks: calculateTotalChunks(file.size),
    };

    channel.send(JSON.stringify(metadata));

    // Initialize transfer state
    const transfer = {
      file,
      currentChunk: 0,
      totalChunks: metadata.totalChunks,
      paused: false,
    };

    this.outgoingFileTransfers.set(peerId, transfer);

    // Start sending chunks
    await this.sendNextChunk(peerId);
  }

  /**
   * Send next chunk of file
   *
   * BACKPRESSURE STRATEGY:
   * - If bufferedAmount > 16MB, pause and wait for drain
   * - Set bufferedAmountLowThreshold to 8MB
   * - Resume when buffer drops below 8MB
   */
  async sendNextChunk(peerId) {
    const channel = this.dataChannels.get(peerId);
    const transfer = this.outgoingFileTransfers.get(peerId);

    if (!channel || !transfer || transfer.paused) {
      return;
    }

    const BUFFER_THRESHOLD = 16 * 1024 * 1024; // 16MB
    const BUFFER_LOW_THRESHOLD = 8 * 1024 * 1024; // 8MB

    // Check if we need to pause due to backpressure
    if (channel.bufferedAmount > BUFFER_THRESHOLD) {
      console.log("[WEBRTC] Buffer full, pausing send to:", peerId);
      transfer.paused = true;
      channel.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;
      return;
    }

    // Read and send next chunk
    const start = transfer.currentChunk * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, transfer.file.size);
    const chunk = transfer.file.slice(start, end);

    const arrayBuffer = await chunk.arrayBuffer();
    channel.send(arrayBuffer);

    transfer.currentChunk++;

    // Report progress
    const progress = (transfer.currentChunk / transfer.totalChunks) * 100;
    this.callbacks.onFileSendProgress(peerId, progress);

    // Check if complete
    if (transfer.currentChunk >= transfer.totalChunks) {
      channel.send(JSON.stringify({ type: "file-end" }));
      console.log("[WEBRTC] File send complete to:", peerId);
      this.callbacks.onFileSendComplete(peerId, transfer.file);
      this.outgoingFileTransfers.delete(peerId);
    } else {
      // Send next chunk
      setTimeout(() => this.sendNextChunk(peerId), 0);
    }
  }

  /**
   * Resume sending after buffer drains
   */
  resumeSendFile(peerId) {
    const transfer = this.outgoingFileTransfers.get(peerId);
    if (transfer) {
      transfer.paused = false;
      this.sendNextChunk(peerId);
    }
  }

  /**
   * Handle incoming file metadata
   */
  handleFileMetadata(peerId, metadata) {
    console.log("[WEBRTC] Receiving file from", peerId, ":", metadata.fileName);

    this.incomingFileData.set(peerId, {
      metadata,
      chunks: [],
      receivedChunks: 0,
    });

    this.callbacks.onFileReceiveStart(peerId, metadata);
  }

  /**
   * Handle incoming file chunk
   */
  handleFileChunk(peerId, arrayBuffer) {
    const fileData = this.incomingFileData.get(peerId);

    if (!fileData) {
      console.warn("[WEBRTC] Received chunk without metadata from:", peerId);
      return;
    }

    fileData.chunks.push(arrayBuffer);
    fileData.receivedChunks++;

    const progress =
      (fileData.receivedChunks / fileData.metadata.totalChunks) * 100;
    this.callbacks.onFileReceiveProgress(peerId, progress);
  }

  /**
   * Handle file transfer completion
   */
  handleFileEnd(peerId) {
    const fileData = this.incomingFileData.get(peerId);

    if (!fileData) {
      console.error("[WEBRTC] File end marker without data from:", peerId);
      return;
    }

    console.log("[WEBRTC] File receive complete from:", peerId);

    // Reconstruct file
    const blob = new Blob(fileData.chunks, {
      type: fileData.metadata.fileType,
    });
    const file = new File([blob], fileData.metadata.fileName, {
      type: fileData.metadata.fileType,
    });

    this.callbacks.onFileReceiveComplete(peerId, file);
    this.incomingFileData.delete(peerId);
  }

  /**
   * Close peer connection
   */
  closePeerConnection(peerId) {
    const channel = this.dataChannels.get(peerId);
    if (channel) {
      channel.close();
      this.dataChannels.delete(peerId);
    }

    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }

    this.incomingFileData.delete(peerId);
    this.outgoingFileTransfers.delete(peerId);
    this.peerFingerprints.delete(peerId);

    console.log("[WEBRTC] Closed connection with:", peerId);
  }

  /**
   * Cleanup all connections
   */
  cleanup() {
    for (const peerId of this.peerConnections.keys()) {
      this.closePeerConnection(peerId);
    }
    this._initialized = false;
  }

  /**
   * Get connection status
   */
  isConnected(peerId) {
    const channel = this.dataChannels.get(peerId);
    return channel && channel.readyState === "open";
  }
}

export default new WebRTCService();
