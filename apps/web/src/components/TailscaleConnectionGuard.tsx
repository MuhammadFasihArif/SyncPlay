"use client";

import { useEffect, useState } from "react";
import { socketService } from "@/lib/socket";
import { WifiOff } from "lucide-react";

export function TailscaleConnectionGuard({ children }: { children: React.ReactNode }) {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const checkConnection = setInterval(() => {
      const socket = socketService.getSocket();
      if (socket) {
        if (!socket.connected && socket.io.engine && socket.io._callbacks && socket.io._callbacks['$connect_error']) {
           // We'll rely on the event listener instead of polling for immediate feedback
        }
      }
    }, 2000);

    const handleConnectError = () => {
      setIsOffline(true);
    };

    const handleConnect = () => {
      setIsOffline(false);
    };

    // We need to monkey-patch the connect method to add global listeners whenever a new socket is created
    const originalConnect = socketService.connect.bind(socketService);
    socketService.connect = (url?: string) => {
      const socket = originalConnect(url);
      socket.off('connect_error', handleConnectError);
      socket.off('connect', handleConnect);
      socket.on('connect_error', handleConnectError);
      socket.on('connect', handleConnect);
      return socket;
    };

    // Also attach to existing if present
    const existingSocket = socketService.getSocket();
    if (existingSocket) {
      existingSocket.on('connect_error', handleConnectError);
      existingSocket.on('connect', handleConnect);
      if (existingSocket.disconnected) {
        setIsOffline(true);
      }
    }

    return () => {
      clearInterval(checkConnection);
    };
  }, []);

  if (isOffline) {
    return (
      <div className="fixed inset-0 bg-neutral-950 z-[9999] flex flex-col items-center justify-center text-white p-6">
        <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center mb-6 animate-pulse border-2 border-red-500/20">
          <WifiOff className="w-10 h-10 text-red-500" />
        </div>
        <h1 className="text-3xl font-bold mb-4 text-center">Tailscale Disconnected</h1>
        <p className="text-neutral-400 text-center max-w-md text-lg mb-8 leading-relaxed">
          We cannot reach the SyncPlay engine. Please make sure your Tailscale VPN is active and the host server is running.
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="bg-indigo-600 hover:bg-indigo-500 px-8 py-3 rounded-xl font-bold transition-all active:scale-95 shadow-[0_0_20px_rgba(79,70,229,0.3)]"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
