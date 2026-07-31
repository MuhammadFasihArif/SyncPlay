import { Room, User, PlaybackState } from "./types";

class RoomManager {
  private rooms: Map<string, Room> = new Map();
  // Map of socketId to roomId to quickly find a user's room on disconnect
  private userRooms: Map<string, string> = new Map();

  createRoom(roomId: string, hostId: string, username: string, avatar: string = "🦊"): Room {
    const host: User = { id: hostId, isHost: true, username, avatar };
    const room: Room = {
      id: roomId,
      hostId,
      hostUsername: username,
      users: new Map([[hostId, host]]),
      playbackState: {
        isPlaying: false,
        timestamp: 0,
        lastUpdated: Date.now(),
        playbackRate: 1,
      },
    };
    this.rooms.set(roomId, room);
    this.userRooms.set(hostId, roomId);
    return room;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  joinRoom(roomId: string, userId: string, username: string, avatar: string = "🦊"): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    let isHost = false;
    if (room.users.size === 0) {
      isHost = true;
      room.hostId = userId;
      room.hostUsername = username;
    }

    room.users.set(userId, { id: userId, isHost, username, avatar });
    this.userRooms.set(userId, roomId);
    return room;
  }

  leaveRoomByUserId(userId: string): Room | null {
    const roomId = this.userRooms.get(userId);
    if (!roomId) return null;
    return this.leaveRoom(roomId, userId);
  }

  leaveRoom(roomId: string, userId: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.users.delete(userId);
    this.userRooms.delete(userId);

    if (room.users.size === 0) {
      this.rooms.delete(roomId);
      return null; // Room is completely empty and deleted
    }

    // Reassign host if host left (Authority Model Transfer)
    if (room.hostId === userId) {
      const remainingHost = Array.from(room.users.values()).find(u => u.username === room.hostUsername);
      if (remainingHost) {
        room.hostId = remainingHost.id;
      } else {
        const nextUser = room.users.values().next().value;
        if (nextUser) {
          room.hostId = nextUser.id;
          room.hostUsername = nextUser.username;
          nextUser.isHost = true;
          Array.from(room.users.values()).forEach(u => {
            if (u.username === nextUser.username) u.isHost = true;
          });
        }
      }
    }
    return room;
  }
}

export const roomManager = new RoomManager();
