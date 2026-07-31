export interface PlaybackState {
  isPlaying: boolean;
  timestamp: number;       // Current video time in seconds
  lastUpdated: number;     // Server timestamp when this state was received
  playbackRate: number;
}

export interface User {
  id: string;              // Socket ID
  isHost: boolean;
  username: string;
  avatar: string;
}

export interface Room {
  id: string;
  hostId: string;
  hostUsername: string;
  users: Map<string, User>;
  playbackState: PlaybackState;
  videoUrl?: string;       // Used when in direct control mode or sharing a specific link
}
