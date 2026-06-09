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

  // TURN is used ONLY when STUN + direct connection fails
  // This happens when both peers are behind symmetric NATs
  {
    username: process.env.USERNAME1,
    credential: process.env.CREDENTIAL1,
    urls: process.env.TURN_URL1,
  },
  {
    username: process.env.USERNAME1,
    credential: process.env.CREDENTIAL1,
    urls: process.env.TURN_URL2,
  },
  {
    username: process.env.USERNAME1,
    credential: process.env.CREDENTIAL1,
    urls: process.env.TURN_URL3,
  },
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
