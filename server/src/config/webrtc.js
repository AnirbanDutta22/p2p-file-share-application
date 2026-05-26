/**
 * WebRTC Configuration
 *
 * This configuration is sent to clients to help them establish P2P connections.
 *
 * STUN servers: Help peers discover their public IP addresses (NAT traversal)
 * TURN servers: Relay traffic when direct P2P connection fails (fallback only)
 *
 */

export const ICE_SERVERS = [
  // Google's public STUN server (free, for discovering public IPs)
  {
    urls: "stun:stun.l.google.com:19302",
  },
  {
    urls: "stun:stun1.l.google.com:19302",
  },

  // TURN server configuration (placeholder - replace with your own)
  // TURN is used ONLY when STUN + direct connection fails
  // This happens when both peers are behind symmetric NATs
  {
    urls: "turn:your-turn-server.com:3478",
    username: "placeholder-username",
    credential: "placeholder-password",
  },

  /**
   * PRODUCTION TURN SETUP:
   *
   * Option 1 - Self-hosted (coturn):
   * {
   *   urls: 'turn:your-domain.com:3478',
   *   username: generateTemporaryUsername(),
   *   credential: generateTemporaryCredential()
   * }
   *
   * Option 2 - Managed service (Twilio TURN):
   * https://www.twilio.com/stun-turn
   *
   * Option 3 - Managed service (Xirsys):
   * https://xirsys.com/
   */
];

/**
 * DataChannel configuration optimized for file transfers
 * NOTE: Inject from frontend
 */
export const DATA_CHANNEL_CONFIG = {
  ordered: true, // Maintain chunk order (critical for file reconstruction)
  maxRetransmits: null, // Unlimited retransmits (we want reliability over speed)
};

/**
 * RTCPeerConnection configuration
 */
export const PEER_CONNECTION_CONFIG = {
  iceServers: ICE_SERVERS,

  // ICE transport policy
  // 'all' - try STUN first, fall back to TURN if needed (recommended)
  // 'relay' - force TURN relay (useful for testing, expensive in production)
  iceTransportPolicy: "all",

  // Bundle policy - multiplexes media/data over single connection
  bundlePolicy: "max-bundle",

  // RTCP multiplexing - reduces number of ports needed
  rtcpMuxPolicy: "require",
};
