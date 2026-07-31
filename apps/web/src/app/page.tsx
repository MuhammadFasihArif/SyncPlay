"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Tv, Link as LinkIcon, User, Server } from "lucide-react";
import { InstallAppButton } from "@/components/InstallAppButton";
import { socketService } from "@/lib/socket";

export default function Home() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"create" | "join">("create");
  
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState("🦊");
  const [roomId, setRoomId] = useState("");
  const [serverUrl, setServerUrl] = useState("http://localhost:3001");
  const [isLoading, setIsLoading] = useState(false);

  const avatars = ["🦊", "🐼", "🦁", "🐸", "🦄", "🐯", "🐰", "🐻", "🐶", "🐱"];

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedAvatar = localStorage.getItem("wp_avatar");
      if (savedAvatar) setAvatar(savedAvatar);

      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room');
      if (roomParam) {
        setRoomId(roomParam);
        setActiveTab("join");
      }
      
      const hostname = window.location.hostname;
      const protocol = window.location.protocol;
      
      if (hostname === "localhost" || hostname === "127.0.0.1") {
        setServerUrl(`http://localhost:3001`);
      } else {
        setServerUrl(`${protocol}//${hostname}:3001`);
      }
    }
  }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) return;
    setIsLoading(true);
    
    // Generate random room ID
    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // As the host, you are running the server on your own machine.
    // If you access via Tailscale IP, Windows Firewall blocks the socket connection.
    // So for the HOST, we ALWAYS forcefully use localhost:3001 to connect!
    const hostServerUrl = "http://localhost:3001";
    
    // Save the PUBLIC/TAILSCALE url to local storage so that when we copy the link,
    // the viewer gets the Tailscale IP, not "localhost"
    const publicServerUrl = window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1" 
      ? `${window.location.protocol}//${window.location.hostname}:3001`
      : "http://100.80.159.75:3001"; // Fallback to your Tailscale IP

    localStorage.setItem("wp_username", username);
    localStorage.setItem("wp_server_url", publicServerUrl);
    localStorage.setItem("wp_is_host", "true");
    localStorage.setItem("wp_avatar", avatar);
    
    const socket = socketService.connect(hostServerUrl);
    
    const onConnectError = (err: any) => {
      setIsLoading(false);
      socket.off("connect_error", onConnectError);
      if (serverUrl.includes("100.")) {
        alert("Failed to connect to the Host! Please ensure that TAILSCALE is connected and running on your device, and that the IP address is correct.");
      } else {
        alert("Failed to connect to the server. Please check the URL.");
      }
    };
    
    socket.once("connect_error", onConnectError);
    
    socket.emit("create-room", { roomId: newRoomId, username, avatar }, (response: any) => {
      socket.off("connect_error", onConnectError);
      if (response.success) {
        router.push(`/room/${newRoomId}`);
      } else {
        setIsLoading(false);
        alert(response.error || "Failed to create room");
      }
    });
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !roomId || !serverUrl) return;
    setIsLoading(true);
    
    localStorage.setItem("wp_username", username);
    localStorage.setItem("wp_server_url", serverUrl);
    localStorage.setItem("wp_is_host", "false");
    localStorage.setItem("wp_avatar", avatar);
    
    const socket = socketService.connect(serverUrl);
    
    const onConnectError = (err: any) => {
      setIsLoading(false);
      socket.off("connect_error", onConnectError);
      if (serverUrl.includes("100.")) {
        alert("Failed to connect to the Host! Please ensure that TAILSCALE is connected and running on your device, and that the IP address is correct.");
      } else {
        alert("Failed to connect to the server. Please check the URL.");
      }
    };
    
    socket.once("connect_error", onConnectError);
    
    socket.emit("join-room", { roomId: roomId.toUpperCase(), username, avatar }, (response: any) => {
      socket.off("connect_error", onConnectError);
      if (response.success) {
        router.push(`/room/${roomId.toUpperCase()}`);
      } else {
        setIsLoading(false);
        alert(response.error || "Failed to join room");
      }
    });
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-4 selection:bg-indigo-500/30 relative">
      <div className="absolute top-4 right-4 z-50">
        <InstallAppButton />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-neutral-950 to-neutral-950 pointer-events-none"></div>
      
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="z-10 w-full max-w-md"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-4 bg-indigo-500/10 rounded-2xl mb-6 shadow-[0_0_40px_rgba(99,102,241,0.2)]">
            <Tv className="w-12 h-12 text-indigo-400" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight mb-3">Sync<span className="text-indigo-400">Play</span></h1>
          <p className="text-neutral-400 text-lg">Real-time local watch parties over VPN</p>
        </div>

        <div className="bg-neutral-900/50 backdrop-blur-xl border border-neutral-800 rounded-3xl p-2 shadow-2xl">
          <div className="flex p-1 mb-6 bg-neutral-950/50 rounded-2xl">
            <button
              onClick={() => setActiveTab("create")}
              className={`flex-1 py-3 text-sm font-semibold rounded-xl transition-all ${
                activeTab === "create" 
                  ? "bg-indigo-500 text-white shadow-lg" 
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              Create Room
            </button>
            <button
              onClick={() => setActiveTab("join")}
              className={`flex-1 py-3 text-sm font-semibold rounded-xl transition-all ${
                activeTab === "join" 
                  ? "bg-indigo-500 text-white shadow-lg" 
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              Join Room
            </button>
          </div>

          <div className="p-4 pt-0">
            <form onSubmit={activeTab === "create" ? handleCreate : handleJoin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider ml-1">Display Name</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-neutral-500" />
                  </div>
                  <input 
                    type="text" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full bg-neutral-950 border border-neutral-800 text-white rounded-xl pl-11 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder:text-neutral-600"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider ml-1 mb-2 block">Select Avatar</label>
                <div className="flex flex-wrap gap-2">
                  {avatars.map(a => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAvatar(a)}
                      className={`text-xl w-10 h-10 rounded-xl flex items-center justify-center transition-all ${avatar === a ? 'bg-indigo-600 shadow-[0_0_15px_rgba(79,70,229,0.5)] scale-110' : 'bg-neutral-800 hover:bg-neutral-700 hover:scale-105'}`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              {activeTab === "join" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider ml-1">Room Code</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <LinkIcon className="h-5 w-5 text-neutral-500" />
                    </div>
                    <input 
                      type="text" 
                      value={roomId}
                      onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                      placeholder="e.g. ABC123"
                      className="w-full bg-neutral-950 border border-neutral-800 text-white rounded-xl pl-11 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder:text-neutral-600 uppercase"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider ml-1">
                  Host Server URL {activeTab === "join" && "(VPN IP)"}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Server className="h-5 w-5 text-neutral-500" />
                  </div>
                  <input 
                    type="text" 
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    placeholder="http://100.x.x.x:3001"
                    className="w-full bg-neutral-950 border border-neutral-800 text-white rounded-xl pl-11 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder:text-neutral-600"
                    required
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isLoading}
                className="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-semibold py-4 rounded-xl mt-6 transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 flex justify-center items-center"
              >
                {isLoading ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  activeTab === "create" ? "Start Watch Party" : "Join Party"
                )}
              </button>
            </form>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
