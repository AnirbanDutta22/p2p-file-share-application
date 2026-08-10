# ReachPeer - p2p File Sharing Application

> A browser-based peer-to-peer file sharing application built with **React**, **Node.js**, **Express**, **Socket.IO**, and **WebRTC**. Files are transferred **directly between browsers** without passing through the backend server.

---

## 📖 Overview

ReachPeer is designed to demonstrate how modern browsers can establish secure peer-to-peer connections using WebRTC DataChannels for direct file transfers.

Unlike traditional cloud storage services, this application **does not upload files to a server**. Instead, the backend acts only as a **signaling server** to help peers discover each other and exchange connection information. Once the connection is established, all file data travels directly between the sender and receiver.

This architecture reduces server bandwidth usage, improves privacy, and provides faster transfers, especially on local networks.

---

## Features

## Current Features

* Direct browser-to-browser file transfer
* End-to-end encrypted WebRTC DataChannels
* Room-based connection system
* Real-time transfer progress
* Chunked file transfer
* Online user tracking
* Persistent unique visitor counting
* Automatic WebSocket reconnection
* Responsive web interface

---

## Architecture

```text
                    ┌────────────────────────┐
                    │    React Frontend      │
                    └───────────┬────────────┘
                                │
                     Socket.IO (Signaling)
                                │
                                ▼
                 ┌──────────────────────────┐
                 │ Node.js + Express Server │
                 │--------------------------│
                 │ Room Management          │
                 │ Signaling                │
                 │ Visitor Statistics       │
                 │ WebRTC Negotiation       │
                 └───────────┬──────────────┘
                             │
                  Exchanges SDP & ICE only
                             │
        ┌────────────────────┴────────────────────┐
        ▼                                         ▼
 Browser A                               Browser B
        │                                         │
        └────── WebRTC DataChannel (P2P) ─────────┘
                     File Transfer
```

<img width="1070" height="1071" alt="Screenshot 2026-07-02 034745" src="https://github.com/user-attachments/assets/999b16a0-9429-46c4-bf66-322824b49de3" />

---

## Technology Stack

## Frontend

* React
* Vite
* Socket.IO Client
* WebRTC API

## Backend

* Node.js
* Express.js
* Socket.IO

## Storage

* Upstash Redis

  * Persistent visitor statistics
  * Application metadata

## Networking

* WebRTC
* STUN Server
* TURN Server (by Twilio)

---

## 📂 Project Structure

```text
project-root/
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── utils/
│   │   └── config/
│   │
│   └── package.json
│
├── server/
│   ├── src/
│   │   ├── services/
│   │   ├── config/
│   │   └── index.js
│   │
│   └── package.json
│
└── README.md
```

---

## How It Works

## 1. User Opens Application

Both users open the application in their browser.

---

## 2. Signaling Connection

Each browser connects to the signaling server using Socket.IO.

The backend is responsible only for:

* Peer discovery
* Room management
* Offer/Answer exchange
* ICE candidate exchange

No file data is transmitted through the backend.

---

## 3. Room Creation

A user creates or joins a room.

Both peers become aware of each other through the signaling server.

---

## 4. WebRTC Negotiation

The peers exchange:

* SDP Offer
* SDP Answer
* ICE Candidates

using Socket.IO.

---

## 5. Peer Connection

WebRTC attempts to establish the best possible connection.

Priority:

1. Direct connection (STUN)
2. Relay connection (TURN, if required)

---

## 6. File Transfer

Once the DataChannel opens:

* File is read
* Split into binary chunks
* Sent directly over WebRTC
* Reconstructed by receiver
* Download begins

The backend never receives any file data.

---

## Security

All transfers use WebRTC DataChannels which provide:

* DTLS encryption
* Secure key exchange
* Browser-to-browser communication

No transferred files are stored on the backend.

---

## Visitor Statistics

The application tracks lightweight metadata such as:

* Total unique visitors
* Current online users

Visitor statistics are stored using Upstash Redis.

This allows statistics to persist across deployments while keeping the application lightweight.

---

## Networking Concepts

This project demonstrates practical implementation of:

* WebRTC
* Socket.IO Signaling
* ICE Candidate Exchange
* NAT Traversal
* STUN Servers
* TURN Servers
* Peer-to-Peer Networking
* DataChannels

---

## Running the Project

## Clone Repository

```bash
git clone https://github.com/AnirbanDutta22/p2p-file-share-application.git
cd project
```

---

## Install Client

```bash
cd client
npm install
```

---

## Install Server

```bash
cd server
npm install
```

---

## Environment Variables

### Server

```env
PORT=3001

UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
```

### Client

```env
VITE_SIGNALING_SERVER_URL=http://localhost:3001
```

---

## Start Backend

```bash
cd server
npm run dev
```

---

## Start Frontend

```bash
cd client
npm run dev
```

---

## Performance

* Adaptive chunk sizing
* Compression
* Parallel chunk transfer

---

## 🤝 Contributing

Contributions, suggestions, and feedback are welcome.

If you'd like to improve the project, feel free to open an issue or submit a pull request.

---

## 📄 License

This project is licensed under the MIT License.
