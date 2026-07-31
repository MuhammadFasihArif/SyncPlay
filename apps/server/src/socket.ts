import { Server, Socket } from "socket.io";
import { roomManager } from "./roomManager";

export function setupSockets(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log(`[Socket] User connected: ${socket.id}`);

    // Heartbeat System: Used for drift correction and latency checks
    socket.on("ping", (callback) => {
      // Respond immediately with the server's authoritative timestamp
      callback(Date.now());
    });

    socket.on("create-room", ({ roomId, username, avatar }, callback) => {
      const room = roomManager.createRoom(roomId, socket.id, username, avatar);
      socket.join(roomId);
      console.log(`[Socket] Room created: ${roomId} by ${username} (${avatar})`);
      callback({ success: true, room: serializeRoom(room) });
    });

    socket.on("join-room", ({ roomId, username, avatar }, callback) => {
      const room = roomManager.joinRoom(roomId, socket.id, username, avatar);
      if (!room) {
        console.log(`[Socket] Join failed. Room not found: ${roomId}`);
        return callback({ success: false, error: "Room not found" });
      }
      socket.join(roomId);
      
      console.log(`[Socket] ${username} (${avatar}) joined room ${roomId}`);
      
      // Notify others in the room
      socket.to(roomId).emit("user-joined", { id: socket.id, username, isHost: false, avatar });
      
      callback({ success: true, room: serializeRoom(room) });
    });

    // AUTHORITY MODEL: Only the host can dictate state changes
    socket.on("sync-state", ({ roomId, state }) => {
      const room = roomManager.getRoom(roomId);
      const user = room?.users.get(socket.id);
      
      // Ensure only the host can send state updates
      if (room && user && user.isHost) {
        room.playbackState = {
          ...state,
          lastUpdated: Date.now() // Set to server's authoritative time
        };
        // Broadcast the authoritative state to everyone else
        socket.to(roomId).emit("state-update", room.playbackState);
      } else if (room) {
        console.log(`[Socket] Security warning: Non-host ${socket.id} attempted to sync state in room ${roomId}`);
      }
    });

    // Handle buffer awareness: client is buffering
    socket.on("client-buffering", ({ roomId, isBuffering }) => {
      const room = roomManager.getRoom(roomId);
      if (room) {
         // Notify the host that someone is buffering (so host can optionally pause)
         // In strict passive mode, server could force pause, but we let host decide or UI show it
         socket.to(room.hostId).emit("peer-buffering", { userId: socket.id, isBuffering });
      }
    });
    
    // Video URL change (only host)
    socket.on("change-video", ({ roomId, videoUrl }) => {
      const room = roomManager.getRoom(roomId);
      const user = room?.users.get(socket.id);
      if (room && user && user.isHost) {
        room.videoUrl = videoUrl;
        io.to(roomId).emit("video-changed", videoUrl);
      }
    });

    socket.on("host-scrolled", ({ roomId, scrollPos }) => {
      const room = roomManager.getRoom(roomId);
      const user = room?.users.get(socket.id);
      if (room && user && user.isHost) {
        socket.to(roomId).emit("host-scrolled", scrollPos);
      }
    });

    // WebRTC Signaling
    socket.on("webrtc-offer", ({ offer, to }) => {
      socket.to(to).emit("webrtc-offer", { offer, from: socket.id });
    });

    socket.on("webrtc-answer", ({ answer, to }) => {
      socket.to(to).emit("webrtc-answer", { answer, from: socket.id });
    });

    socket.on("webrtc-candidate", ({ candidate, to }) => {
      socket.to(to).emit("webrtc-candidate", { candidate, from: socket.id });
    });

    // Voice Calling Signaling
    socket.on("voice-joined", ({ roomId }) => {
      socket.to(roomId).emit("voice-joined", { userId: socket.id });
    });

    socket.on("voice-offer", ({ offer, to }) => {
      socket.to(to).emit("voice-offer", { offer, from: socket.id });
    });

    socket.on("voice-answer", ({ answer, to }) => {
      socket.to(to).emit("voice-answer", { answer, from: socket.id });
    });

    socket.on("voice-candidate", ({ candidate, to }) => {
      socket.to(to).emit("voice-candidate", { candidate, from: socket.id });
    });

    // Chat & Reactions
    socket.on("chat-message", ({ roomId, message }) => {
      const room = roomManager.getRoom(roomId);
      const user = room?.users.get(socket.id);
      if (room && user) {
        io.to(roomId).emit("chat-message", {
          id: Date.now().toString() + Math.random().toString(),
          userId: socket.id,
          username: user.username,
          avatar: user.avatar,
          text: message,
          timestamp: Date.now()
        });
      }
    });

    socket.on("send-reaction", ({ roomId, reaction }) => {
      io.to(roomId).emit("receive-reaction", {
        id: Date.now().toString() + Math.random().toString(),
        reaction,
        userId: socket.id
      });
    });

    socket.on("disconnect", () => {
      console.log(`[Socket] User disconnected: ${socket.id}`);
      const room = roomManager.leaveRoomByUserId(socket.id);
      if (room) {
        // If room still exists, notify others
        io.to(room.id).emit("user-left", { id: socket.id, newHostId: room.hostId });
        // Emit updated room state (in case host changed)
        io.to(room.id).emit("room-updated", serializeRoom(room));
      }
    });
  });
}

// Helper to convert Map to Array for JSON serialization
function serializeRoom(room: any) {
  return {
    ...room,
    users: Array.from(room.users.values())
  };
}
