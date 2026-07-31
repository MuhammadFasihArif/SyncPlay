import { io, Socket } from "socket.io-client";

// Connect to localhost backend for now. 
// In a VPN environment, clients can overwrite this with the host's VPN IP.
const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001";

class SocketService {
  public socket: Socket | null = null;

  public currentUrl: string | null = null;

  connect(url?: string) {
    const targetUrl = url || SERVER_URL;

    // Check if we are already connected to this URL
    if (this.socket && this.currentUrl === targetUrl) {
      return this.socket;
    }

    if (this.socket) {
      this.socket.disconnect();
    }
    
    this.currentUrl = targetUrl;
    this.socket = io(targetUrl);
    return this.socket;
  }

  getSocket() {
    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = new SocketService();
