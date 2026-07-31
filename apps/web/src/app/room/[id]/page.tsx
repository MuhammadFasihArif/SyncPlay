"use client";

import { useEffect, useState, use, useRef } from "react";
import { useRouter } from "next/navigation";
import { socketService } from "@/lib/socket";
import { Users, Crown, Settings, LogOut, Copy, Check, PlaySquare, Maximize, PictureInPicture, MessageSquare, Heart, Laugh, Flame, Send, Wand2, Phone, PhoneOff, Mic, MicOff, MonitorUp, Play } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface User {
  id: string;
  isHost: boolean;
  username: string;
  avatar?: string;
}

interface Room {
  id: string;
  hostId: string;
  users: User[];
  playbackState: any;
}

const playNotificationSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) {
    console.error("Audio playback failed", e);
  }
};

const playJoinSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const playTone = (freq: number, startTime: number) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.1, startTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 1.0);
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 1.0);
    };
    const now = ctx.currentTime;
    playTone(523.25, now);       // C5
    playTone(659.25, now + 0.1); // E5
  } catch (e) {}
};

export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: roomId } = use(params);
  
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [copied, setCopied] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [isReceivingStream, setIsReceivingStream] = useState(false);
  
  // New States for Features
  const [activeTab, setActiveTab] = useState<'members' | 'chat'>('members');
  const [messages, setMessages] = useState<{id: string, userId: string, username: string, text: string, timestamp: number}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [reactions, setReactions] = useState<{id: string, reaction: string, left: number}[]>([]);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [enhanceMode, setEnhanceMode] = useState(false);
  const [inVoiceCall, setInVoiceCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [remoteAudioStreams, setRemoteAudioStreams] = useState<{userId: string, stream: MediaStream}[]>([]);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [webrtcError, setWebrtcError] = useState(false);
  const [debugState, setDebugState] = useState<string>("Initializing...");
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
  
  // Fullscreen Overlay Chat States
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [overlayMessages, setOverlayMessages] = useState<{id: string, userId: string, username: string, text: string, timestamp: number}[]>([]);
  const [showOverlayInput, setShowOverlayInput] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef(activeTab);
  const voiceStream = useRef<MediaStream | null>(null);
  const voiceConnections = useRef(new Map<string, RTCPeerConnection>());
  const inVoiceCallRef = useRef(inVoiceCall);
  const overlayInputTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const resetOverlayInputTimer = () => {
    setShowOverlayInput(true);
    if (overlayInputTimeoutRef.current) clearTimeout(overlayInputTimeoutRef.current);
    overlayInputTimeoutRef.current = setTimeout(() => {
      setShowOverlayInput(false);
    }, 10000);
  };

  useEffect(() => {
    if (isFullscreen) {
      resetOverlayInputTimer();
    } else {
      if (overlayInputTimeoutRef.current) clearTimeout(overlayInputTimeoutRef.current);
    }
  }, [isFullscreen]);

  useEffect(() => {
    inVoiceCallRef.current = inVoiceCall;
  }, [inVoiceCall]);

  useEffect(() => {
    activeTabRef.current = activeTab;
    if (activeTab === 'chat') setHasUnreadMessages(false);
  }, [activeTab]);

  // Voice Activity Detection
  useEffect(() => {
    if (!inVoiceCall) {
      setSpeakingUsers(new Set());
      return;
    }

    let audioCtx: AudioContext | null = null;
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.warn("AudioContext not supported", e);
      return;
    }

    const intervals: NodeJS.Timeout[] = [];
    
    const monitorStream = (stream: MediaStream, userId: string) => {
      if (!audioCtx) return;
      try {
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        source.connect(analyser);
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        const checkVolume = setInterval(() => {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const average = sum / dataArray.length;
          
          setSpeakingUsers(prev => {
            const isSpeaking = average > 15;
            if (isSpeaking && !prev.has(userId)) {
              const next = new Set(prev);
              next.add(userId);
              return next;
            } else if (!isSpeaking && prev.has(userId)) {
              const next = new Set(prev);
              next.delete(userId);
              return next;
            }
            return prev;
          });
        }, 100);
        intervals.push(checkVolume);
      } catch (e) {
        console.warn("Could not attach analyser to stream", e);
      }
    };

    // Monitor local mic
    if (voiceStream.current) {
      const socket = socketService.getSocket();
      if (socket) monitorStream(voiceStream.current, socket.id);
    }

    // Monitor remote streams
    remoteAudioStreams.forEach(({ userId, stream }) => {
      monitorStream(stream, userId);
    });

    return () => {
      intervals.forEach(clearInterval);
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(console.error);
      }
    };
  }, [inVoiceCall, remoteAudioStreams]);
  
  const initialized = useRef(false);
  const localStream = useRef<MediaStream | null>(null);
  const peerConnections = useRef(new Map<string, RTCPeerConnection>());
  const pendingCandidates = useRef(new Map<string, RTCIceCandidateInit[]>());
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Remove extension credentials broadcast as we pivot to WebRTC native model
  useEffect(() => {
    // Keep this empty or remove entirely, but for clean diffing we just replace the block.
  }, [roomId]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const username = localStorage.getItem("wp_username");
    const serverUrl = localStorage.getItem("wp_server_url");
    const avatar = localStorage.getItem("wp_avatar") || "👤";

    if (!username || !serverUrl) {
      router.push("/");
      return;
    }

    // Host must ALWAYS bypass their own Windows Firewall by using localhost
    // We can reliably detect the host because they access the app via localhost:3000
    const isLocalhost = typeof window !== 'undefined' && 
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    
    const connectionUrl = isLocalhost ? "http://localhost:3001" : serverUrl;
    const socket = socketService.connect(connectionUrl);

    socket.once("connect_error", () => {
      if (connectionUrl.includes("100.")) {
        setError("Failed to connect to the Host! Please ensure TAILSCALE is connected and the IP address is correct.");
      } else {
        setError("Failed to connect to the server.");
      }
    });

    const handleRoomData = (response: any) => {
      if (response.success) {
        setRoom(response.room);
        const currentUser = response.room.users.find((u: User) => u.id === socket.id);
        const amIHost = currentUser?.isHost || response.room.hostId === socket.id;
        setIsHost(amIHost);
      } else {
        setError(response.error || "Failed to join room");
      }
    };

    socket.emit("join-room", { roomId, username, avatar }, handleRoomData);
  }, [roomId, router]);

  // WebRTC Peer Connection Factory
  const createPeerConnection = (targetId: string, initiator: boolean) => {
    if (peerConnections.current.has(targetId)) {
      try {
        peerConnections.current.get(targetId)?.close();
      } catch (e) {}
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun.services.mozilla.com" }
      ]
    });

    peerConnections.current.set(targetId, pc);
    const socket = socketService.getSocket();

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket?.emit("webrtc-candidate", { candidate: event.candidate, to: targetId });
      }
    };

    pc.oniceconnectionstatechange = () => {
      setDebugState(`ICE State: ${pc.iceConnectionState} | Signalling: ${pc.signalingState}`);
      if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
        console.error("WebRTC connection failed. This is likely caused by browser privacy shields (like Brave Shields) blocking local network IP addresses.");
        setWebrtcError(true);
      }
    };
    
    pc.onsignalingstatechange = () => {
      setDebugState(`ICE State: ${pc.iceConnectionState} | Signalling: ${pc.signalingState}`);
    };

    if (initiator && localStream.current) {
      localStream.current.getTracks().forEach(track => {
        pc.addTrack(track, localStream.current!);
      });
    } else {
      pc.ontrack = (event) => {
        if (videoRef.current) {
          videoRef.current.srcObject = event.streams[0];
          videoRef.current.play().catch(async (err) => {
            console.warn("Video autoplay blocked by browser, falling back to muted playback:", err);
            if (videoRef.current) {
              videoRef.current.muted = true;
              try {
                await videoRef.current.play();
              } catch (e) {
                setAutoplayBlocked(true);
              }
            }
          });
          setIsReceivingStream(true);
        }
      };
    }

    if (initiator) {
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        socket?.emit("webrtc-offer", { offer, to: targetId });
      });
    }

    return pc;
  };

  // Voice WebRTC Peer Connection Factory
  const createVoicePeerConnection = (targetId: string, initiator: boolean) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    voiceConnections.current.set(targetId, pc);
    const socket = socketService.getSocket();

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket?.emit("voice-candidate", { candidate: event.candidate, to: targetId });
      }
    };

    if (voiceStream.current) {
      voiceStream.current.getTracks().forEach(track => {
        pc.addTrack(track, voiceStream.current!);
      });
    }

    pc.ontrack = (event) => {
      setRemoteAudioStreams(prev => {
        if (prev.find(s => s.userId === targetId)) return prev;
        return [...prev, { userId: targetId, stream: event.streams[0] }];
      });
    };

    if (initiator) {
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        socket?.emit("voice-offer", { offer, to: targetId });
      });
    }

    return pc;
  };

  // Socket Event Listeners
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const onUserJoined = (user: User) => {
      setRoom((prev) => {
        if (!prev) return prev;
        return { ...prev, users: [...prev.users, user] };
      });
      // If we are broadcasting, automatically invite the new user
      if (localStream.current && isHost && user.id !== socket.id) {
        createPeerConnection(user.id, true);
      }
    };

    const onUserLeft = ({ id, newHostId }: any) => {
      setRoom((prev) => {
        if (!prev) return prev;
        const updatedUsers = prev.users.filter(u => u.id !== id).map(u => {
          if (u.id === newHostId) return { ...u, isHost: true };
          return u;
        });
        
        if (socket.id === newHostId) setIsHost(true);
        
        return { ...prev, users: updatedUsers, hostId: newHostId };
      });

      // Cleanup peer connection
      const pc = peerConnections.current.get(id);
      if (pc) {
        pc.close();
        peerConnections.current.delete(id);
      }
    };

    const onRoomUpdated = (updatedRoom: Room) => {
      setRoom(updatedRoom);
      const currentUser = updatedRoom.users.find((u: User) => u.id === socket.id);
      setIsHost(currentUser?.isHost || false);
    };

    socket.on("user-joined", onUserJoined);
    socket.on("user-left", onUserLeft);
    socket.on("room-updated", onRoomUpdated);

    socket.on("chat-message", (msg) => {
      setMessages(prev => [...prev, msg]);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      
      const newMsg = { ...msg, id: Date.now().toString() + Math.random().toString() };
      setOverlayMessages(prev => {
        setTimeout(() => {
          setOverlayMessages(curr => curr.filter(m => m.id !== newMsg.id));
        }, 7000);
        return [...prev, newMsg].slice(-5);
      });
      
      const socketInstance = socketService.getSocket();
      if (socketInstance && msg.userId !== socketInstance.id) {
        if (activeTabRef.current !== 'chat') {
          setHasUnreadMessages(true);
        }
        playNotificationSound();
      }
    });

    socket.on("receive-reaction", ({ id, reaction }) => {
      const leftPos = Math.random() * 80 + 10; // Random position between 10% and 90%
      setReactions(prev => [...prev, { id, reaction, left: leftPos }]);
      setTimeout(() => {
        setReactions(prev => prev.filter(r => r.id !== id));
      }, 3000);
    });

    // WebRTC Signaling Listeners
    socket.on("webrtc-offer", async ({ offer, from }) => {
      try {
        const pc = createPeerConnection(from, false);
        await pc.setRemoteDescription(offer);
        
        // Flush any queued ICE candidates for this peer connection
        const queued = pendingCandidates.current.get(from) || [];
        for (const candidate of queued) {
          await pc.addIceCandidate(candidate).catch(e => console.warn("Error adding queued ICE candidate:", e));
        }
        pendingCandidates.current.delete(from);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc-answer", { answer, to: from });
      } catch (err) {
        console.error("Error handling WebRTC offer:", err);
      }
    });

    socket.on("webrtc-answer", async ({ answer, from }) => {
      try {
        const pc = peerConnections.current.get(from);
        if (pc) {
          await pc.setRemoteDescription(answer);
          
          // Flush any queued ICE candidates for this peer connection
          const queued = pendingCandidates.current.get(from) || [];
          for (const candidate of queued) {
            await pc.addIceCandidate(candidate).catch(e => console.warn("Error adding queued ICE candidate:", e));
          }
          pendingCandidates.current.delete(from);
        }
      } catch (err) {
        console.error("Error handling WebRTC answer:", err);
      }
    });

    socket.on("webrtc-candidate", async ({ candidate, from }) => {
      const pc = peerConnections.current.get(from);
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(candidate).catch(e => console.warn("Error adding ICE candidate:", e));
      } else {
        if (!pendingCandidates.current.has(from)) {
          pendingCandidates.current.set(from, []);
        }
        pendingCandidates.current.get(from)!.push(candidate);
      }
    });

    // Voice Signaling Listeners
    socket.on("voice-joined", ({ userId }) => {
      playJoinSound();
      if (inVoiceCallRef.current) {
        createVoicePeerConnection(userId, true);
      }
    });

    socket.on("voice-offer", async ({ offer, from }) => {
      if (!inVoiceCallRef.current) return;
      const pc = createVoicePeerConnection(from, false);
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("voice-answer", { answer, to: from });
    });

    socket.on("voice-answer", async ({ answer, from }) => {
      const pc = voiceConnections.current.get(from);
      if (pc) await pc.setRemoteDescription(answer);
    });

    socket.on("voice-candidate", async ({ candidate, from }) => {
      const pc = voiceConnections.current.get(from);
      if (pc) await pc.addIceCandidate(candidate);
    });

    return () => {
      initialized.current = false;
      socket.off("user-joined", onUserJoined);
      socket.off("user-left", onUserLeft);
      socket.off("room-updated", onRoomUpdated);
      socket.off("chat-message");
      socket.off("receive-reaction");
      socket.off("webrtc-offer");
      socket.off("webrtc-answer");
      socket.off("webrtc-candidate");
      socket.off("voice-joined");
      socket.off("voice-offer");
      socket.off("voice-answer");
      socket.off("voice-candidate");
    };
  }, [roomId, isHost]);

  const copyInviteLink = () => {
    let hostname = window.location.hostname;
    let port = window.location.port ? `:${window.location.port}` : "";
    
    const serverUrl = localStorage.getItem("wp_server_url");
    if (serverUrl) {
      try {
        const parsed = new URL(serverUrl);
        // If the user specified a specific IP for the backend (like a Tailscale IP),
        // we use that IP for the share link so viewers can actually connect.
        if (parsed.hostname !== "localhost") {
          hostname = parsed.hostname;
        }
      } catch (e) {}
    }
    const url = `${window.location.protocol}//${hostname}${port}/?room=${roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeave = () => {
    socketService.disconnect();
    router.push("/");
  };

  const joinVoiceCall = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Browser Security: Microphone access is blocked on non-HTTPS IP addresses. To test over Tailscale in Chrome, go to chrome://flags/#unsafely-treat-insecure-origin-as-secure, enable it, and add this IP address!");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStream.current = stream;
      setInVoiceCall(true);
      const socket = socketService.getSocket();
      if (socket) {
        socket.emit("voice-joined", { roomId });
      }
    } catch (e) {
      console.error("Failed to join voice call", e);
      alert("Microphone permission was denied or an error occurred.");
    }
  };

  const leaveVoiceCall = () => {
    if (voiceStream.current) {
      voiceStream.current.getTracks().forEach(t => t.stop());
      voiceStream.current = null;
    }
    voiceConnections.current.forEach(pc => pc.close());
    voiceConnections.current.clear();
    setRemoteAudioStreams([]);
    setInVoiceCall(false);
    setIsMuted(false);
  };

  const toggleMute = () => {
    if (voiceStream.current) {
      const audioTrack = voiceStream.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const startBroadcast = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        alert("Browser Security: Screen sharing is blocked on non-HTTPS IP addresses. To broadcast, either use http://localhost:3000 or bypass security in Chrome flags via chrome://flags/#unsafely-treat-insecure-origin-as-secure.");
        return;
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({ 
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60 }
        }, 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      });

      localStream.current = stream;
      setBroadcasting(true);

      const socket = socketService.getSocket();
      room?.users.forEach(user => {
        if (user.id !== socket?.id && !user.isHost) {
          createPeerConnection(user.id, true);
        }
      });

      stream.getVideoTracks()[0].onended = () => {
        setBroadcasting(false);
        localStream.current = null;
        peerConnections.current.forEach(pc => pc.close());
        peerConnections.current.clear();
      };
    } catch (e) {
      console.error("Failed to start broadcast", e);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const socket = socketService.getSocket();
    if (socket) {
      socket.emit("chat-message", { roomId, message: chatInput.trim() });
      setChatInput("");
    }
  };

  const sendReaction = (reaction: string) => {
    const socket = socketService.getSocket();
    if (socket) {
      socket.emit("send-reaction", { roomId, reaction });
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      videoRef.current?.parentElement?.requestFullscreen().catch(err => console.error("Error attempting to enable fullscreen:", err));
    } else {
      document.exitFullscreen();
    }
  };

  const togglePiP = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (videoRef.current) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (error) {
      console.error("PiP not supported or failed:", error);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-white">
        <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-2xl text-center">
          <p className="text-red-400 font-semibold mb-4">{error}</p>
          <button onClick={() => router.push("/")} className="px-6 py-2 bg-neutral-900 rounded-xl hover:bg-neutral-800 transition">Go Back</button>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-white">
        <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        <p className="mt-4 text-neutral-400">Connecting to Sync Engine...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-neutral-950 text-white selection:bg-indigo-500/30 font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/10 via-neutral-950 to-neutral-950 pointer-events-none"></div>
      
      <div className="max-w-6xl mx-auto p-3 md:p-6 relative z-10 flex flex-col h-[100dvh]">
        {/* Header */}
        <header className="flex flex-col sm:flex-row items-center justify-between py-3 md:py-4 border-b border-neutral-800/50 mb-4 md:mb-8 gap-4">
          <div className="flex items-center space-x-3 w-full sm:w-auto">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.1)] shrink-0">
              <span className="font-bold text-indigo-400 text-sm md:text-base">SP</span>
            </div>
            <div className="flex-1">
              <h1 className="text-lg md:text-xl font-bold">Room <span className="text-indigo-400">{room.id}</span></h1>
              <p className="text-[10px] md:text-xs text-neutral-400">Secure VPN Tunnel</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
            {!inVoiceCall ? (
              <button onClick={joinVoiceCall} className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all font-medium border border-indigo-500/50 shadow-[0_0_15px_rgba(79,70,229,0.2)]">
                <Phone className="w-4 h-4" />
                <span className="text-sm">Join Voice</span>
              </button>
            ) : (
              <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden shadow-lg">
                <div className="px-4 py-2 flex items-center space-x-2 bg-green-500/10 text-green-400 border-r border-neutral-800">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                  <span className="text-sm font-medium">In Call</span>
                </div>
                <button onClick={toggleMute} className={`p-2 transition-colors ${isMuted ? 'text-red-400 hover:bg-neutral-800' : 'text-neutral-300 hover:bg-neutral-800'}`} title={isMuted ? "Unmute" : "Mute"}>
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <button onClick={leaveVoiceCall} className="p-2 text-red-400 hover:bg-red-500/10 transition-colors border-l border-neutral-800" title="Leave Call">
                  <PhoneOff className="w-5 h-5" />
                </button>
              </div>
            )}
            <button 
              onClick={handleLeave}
              className="flex items-center space-x-2 px-4 py-2 bg-neutral-900 hover:bg-red-500/10 hover:text-red-400 text-neutral-400 rounded-lg transition-all border border-neutral-800 hover:border-red-500/30"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">Leave Room</span>
            </button>
          </div>
        </header>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 flex-1 min-h-0 pb-2">
          
          {/* Main Stage (Instructions / Settings) */}
          <div className="lg:col-span-2 flex flex-col space-y-4 md:space-y-6 min-h-[30vh]">
            
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-3xl p-8 backdrop-blur-xl flex-1 flex flex-col justify-center items-center text-center overflow-hidden relative group">
              {isHost && !broadcasting ? (
                <>
                      <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(239,68,68,0.15)]">
                        <PlaySquare className="w-8 h-8 text-red-400" />
                      </div>
                      <h2 className="text-2xl font-bold mb-3">Host the Watch Party</h2>
                      <p className="text-neutral-400 max-w-md mb-8">
                        Click below to start broadcasting your screen. You can share any movie site or tab with your friends.
                      </p>
                      <button onClick={startBroadcast} className="bg-red-600 hover:bg-red-500 text-white px-8 py-4 rounded-xl font-bold shadow-lg shadow-red-600/30 flex items-center space-x-3 transition hover:scale-105 active:scale-95 text-lg">
                        <PlaySquare className="w-6 h-6" />
                        <span>Start Broadcast</span>
                      </button>
                      
                      <div className="mt-4 md:mt-8 flex items-center space-x-4">
                        <button 
                          onClick={copyInviteLink}
                          className="flex items-center space-x-2 px-4 py-2 md:px-6 md:py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl transition-all shadow-lg active:scale-95"
                        >
                          {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
                          <span className="font-medium">{copied ? "Copied Link!" : "Copy Room Link"}</span>
                        </button>
                      </div>
                </>
              ) : (
                <div className="absolute inset-0 w-full h-full bg-black rounded-3xl overflow-hidden flex flex-col items-center justify-center">
                  <video 
                    ref={(el) => {
                      if (el) {
                        (videoRef as any).current = el;
                        if (isHost && localStream.current && el.srcObject !== localStream.current) {
                          el.srcObject = localStream.current;
                          el.muted = true; // Mute to prevent audio feedback loop
                        }
                      }
                    }}
                    autoPlay 
                    playsInline 
                    className={`w-full h-full object-contain transition-all duration-500 ${enhanceMode ? 'contrast-[1.15] saturate-[1.2] brightness-[1.05]' : ''}`}
                  />
                  {autoplayBlocked && (
                    <div 
                      className="absolute inset-0 bg-black/80 z-[100] flex flex-col items-center justify-center cursor-pointer backdrop-blur-sm"
                      onClick={() => {
                        if (videoRef.current) {
                          videoRef.current.play();
                          setAutoplayBlocked(false);
                        }
                      }}
                    >
                      <div className="bg-indigo-600/20 p-6 rounded-full mb-4 border-2 border-indigo-500/50 animate-pulse">
                        <Play className="w-12 h-12 text-indigo-400 ml-2" />
                      </div>
                      <h3 className="text-2xl font-bold text-white mb-2">Click to Resume Broadcast</h3>
                      <p className="text-neutral-400">Your browser paused the video because you refreshed the page.</p>
                    </div>
                  )}
                  {webrtcError && !isHost && (
                    <div className="absolute inset-0 bg-red-900/90 z-[100] flex flex-col items-center justify-center backdrop-blur-md p-8 text-center">
                      <div className="bg-white/10 p-4 rounded-full mb-4 border-2 border-red-500/50">
                        <MonitorUp className="w-12 h-12 text-white" />
                      </div>
                      <h3 className="text-2xl font-bold text-white mb-2">Connection Blocked by Browser</h3>
                      <p className="text-white/80 max-w-lg mb-6">
                        Your browser (like Brave or Safari) is aggressively blocking local network connections for privacy. Because we are using Tailscale, it's blocking the video stream.
                      </p>
                      <div className="bg-black/40 p-4 rounded-xl text-left border border-white/10 w-full max-w-lg">
                        <p className="text-white font-bold mb-2">How to fix this in Brave:</p>
                        <ol className="list-decimal pl-5 text-neutral-300 space-y-1 text-sm">
                          <li>Click the Brave Shields icon in the address bar and turn it OFF for this site.</li>
                          <li>Go to <code className="bg-black/50 px-1 rounded text-indigo-300">brave://settings/webrtc</code></li>
                          <li>Change WebRTC IP Handling Policy to <strong>"Default public and private interfaces"</strong>.</li>
                          <li>Refresh the page.</li>
                        </ol>
                      </div>
                    </div>
                  )}
                  {((isHost && broadcasting) || (!isHost && isReceivingStream)) && (
                    <>
                      <div className="absolute bottom-6 right-6 flex items-center space-x-3 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 z-50">
                        {isHost && (
                          <button onClick={() => {
                            localStream.current?.getTracks().forEach(t => t.stop());
                            setBroadcasting(false);
                            localStream.current = null;
                            peerConnections.current.forEach(pc => pc.close());
                            peerConnections.current.clear();
                          }} className="p-3 bg-red-600/80 hover:bg-red-500 backdrop-blur-md rounded-xl text-white transition-all shadow-xl border border-red-500/50" title="Stop Broadcast">
                            <LogOut className="w-5 h-5" />
                          </button>
                        )}
                        <button onClick={() => setEnhanceMode(!enhanceMode)} className={`p-3 backdrop-blur-md rounded-xl transition-all shadow-xl border ${enhanceMode ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-neutral-900/80 text-white border-neutral-700/50 hover:bg-indigo-600 hover:border-indigo-500/50'}`} title="Enhance Visuals">
                          <Wand2 className="w-5 h-5" />
                        </button>
                        <button onClick={togglePiP} className="p-3 bg-neutral-900/80 hover:bg-indigo-600 backdrop-blur-md rounded-xl text-white transition-all shadow-xl border border-neutral-700/50 hover:border-indigo-500/50" title="Picture in Picture">
                          <PictureInPicture className="w-5 h-5" />
                        </button>
                        <button onClick={toggleFullscreen} className="p-3 bg-neutral-900/80 hover:bg-indigo-600 backdrop-blur-md rounded-xl text-white transition-all shadow-xl border border-neutral-700/50 hover:border-indigo-500/50" title="Fullscreen">
                          <Maximize className="w-5 h-5" />
                        </button>
                      </div>
                      
                      {/* Voice Activity Overlay */}
                      {inVoiceCall && (
                        <div className="absolute top-6 left-6 flex flex-col space-y-3 z-50 pointer-events-none">
                          <AnimatePresence>
                            {room?.users
                              .filter(u => remoteAudioStreams.some(s => s.userId === u.id) || u.id === socketService.getSocket()?.id)
                              .map(u => {
                                const isSpeaking = speakingUsers.has(u.id);
                                return (
                                  <motion.div
                                    key={u.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    className="flex items-center space-x-3"
                                  >
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all duration-200 ${isSpeaking ? 'bg-indigo-600 shadow-[0_0_20px_rgba(79,70,229,0.8)] scale-110 ring-2 ring-indigo-400' : 'bg-neutral-800 border border-neutral-700'}`}>
                                      {u.avatar || "👤"}
                                    </div>
                                    {isSpeaking && (
                                      <motion.div 
                                        initial={{ opacity: 0 }} 
                                        animate={{ opacity: 1 }} 
                                        className="bg-black/50 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-white border border-white/10"
                                      >
                                        {u.username}
                                      </motion.div>
                                    )}
                                  </motion.div>
                                );
                              })}
                          </AnimatePresence>
                        </div>
                      )}

                      {isFullscreen && (
                        <div 
                          className="absolute inset-0 z-40 flex flex-col justify-end p-4 md:p-8"
                          onClick={resetOverlayInputTimer}
                        >
                          <div className="flex-1 flex flex-col justify-end items-start space-y-2 mb-4 pointer-events-none w-full max-w-md">
                            <AnimatePresence>
                              {overlayMessages.map(msg => (
                                <motion.div 
                                  key={msg.id}
                                  initial={{ opacity: 0, x: -20 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  exit={{ opacity: 0, transition: { duration: 0.5 } }}
                                  className="pointer-events-none"
                                >
                                  <div className="bg-black/40 backdrop-blur-md text-white px-3 py-1.5 rounded-2xl text-sm border border-white/10 shadow-lg inline-block">
                                    <span className="font-bold text-indigo-300 mr-2">{msg.username}</span>
                                    <span>{msg.text}</span>
                                  </div>
                                </motion.div>
                              ))}
                            </AnimatePresence>
                          </div>

                          <AnimatePresence>
                            {showOverlayInput && (
                              <motion.div 
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 20 }}
                                className="w-full max-w-md pointer-events-auto pb-4 md:pb-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <form onSubmit={(e) => { handleSendMessage(e); resetOverlayInputTimer(); }} className="relative flex items-center">
                                  <input 
                                    type="text" 
                                    value={chatInput}
                                    onChange={e => { setChatInput(e.target.value); resetOverlayInputTimer(); }}
                                    placeholder="Add a comment..." 
                                    className="w-full bg-black/50 backdrop-blur-xl border border-white/20 rounded-full pl-5 pr-12 py-3 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder-white/60 shadow-xl"
                                  />
                                  <button type="submit" disabled={!chatInput.trim()} className="absolute right-2 p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-full transition-colors text-white shadow-lg">
                                    <Send className="w-4 h-4" />
                                  </button>
                                </form>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    </>
                  )}
                  {!isHost && (
                    <div className="absolute top-2 right-2 bg-black/80 text-white/50 text-[10px] px-2 py-1 rounded border border-white/10 z-[200]">
                      {debugState}
                    </div>
                  )}
                  {!isHost && !isReceivingStream && (
                    <div className="absolute flex flex-col items-center space-y-4 text-neutral-400">
                      <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                      <p className="font-medium animate-pulse">Waiting for host to broadcast screen...</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sync Status Bar */}
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)] animate-pulse" />
                <span className="text-sm font-medium text-neutral-300">WebRTC P2P Active</span>
              </div>
              <div className="text-xs text-neutral-500 flex items-center space-x-2">
                <Settings className="w-3.5 h-3.5" />
                <span>Screen Share Engine</span>
              </div>
            </div>
            
          </div>

          {/* Sidebar (Users List & Chat) */}
          <div className="bg-neutral-900/40 border border-neutral-800 rounded-3xl overflow-hidden flex flex-col relative">
            
            {/* Floating Reactions Overlay */}
            <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
              <AnimatePresence>
                {reactions.map((r) => (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 50, scale: 0.5, x: 0 }}
                    animate={{ 
                      opacity: [0, 1, 1, 0], 
                      y: -300, 
                      scale: [0.5, 1.2, 1, 1],
                      x: [0, Math.random() * 40 - 20, Math.random() * -40 + 20, 0] 
                    }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 2.5, ease: "easeOut" }}
                    className="absolute bottom-20 text-4xl drop-shadow-xl"
                    style={{ left: `${r.left}%` }}
                  >
                    {r.reaction}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="flex border-b border-neutral-800/50 bg-neutral-900/50">
              <button 
                onClick={() => setActiveTab('members')}
                className={`flex-1 p-4 font-semibold text-sm flex items-center justify-center space-x-2 transition-colors ${activeTab === 'members' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                <Users className="w-4 h-4" />
                <span>Members ({room.users.length})</span>
              </button>
              <button 
                onClick={() => setActiveTab('chat')}
                className={`flex-1 p-4 font-semibold text-sm flex items-center justify-center space-x-2 transition-colors relative ${activeTab === 'chat' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                <MessageSquare className="w-4 h-4" />
                <span>Live Chat</span>
                {hasUnreadMessages && activeTab !== 'chat' && (
                  <span className="absolute top-3 right-4 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>
                )}
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-2 relative">
              {activeTab === 'members' ? (
                <AnimatePresence>
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex flex-col h-full space-y-3"
                  >
                    {room.users.reduce((acc: User[], current: User) => {
                      const existing = acc.find(item => item.username === current.username);
                      if (!existing) return acc.concat([current]);
                      if (current.isHost) existing.isHost = true;
                      return acc;
                    }, []).map((u: User) => {
                      const isLocal = u.username === localStorage.getItem("wp_username");
                      const isUserInCall = isLocal ? inVoiceCall : remoteAudioStreams.some(s => s.userId === u.id);
                      
                      return (
                      <div key={u.id} className={`flex items-center justify-between p-4 rounded-xl border ${isLocal ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-neutral-950/50 border-neutral-800'}`}>
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-xl relative border border-neutral-700">
                            {u.avatar || "👤"}
                            {speakingUsers.has(u.id) && (
                              <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 border-2 border-neutral-900 rounded-full animate-pulse"></span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <span className="font-semibold text-white truncate">{u.username}</span>
                              {u.isHost && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                            </div>
                            <div className="text-xs text-neutral-500">
                              {u.isHost ? 'Host' : 'Viewer'}
                              {isLocal && ' (You)'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {isUserInCall && <Mic className="w-4 h-4 text-green-400" title="In Voice Call" />}
                        </div>
                      </div>
                      );
                    })}
                  </motion.div>
                </AnimatePresence>
              ) : (
                <AnimatePresence>
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex flex-col h-full"
                  >
                    <div className="flex-1 overflow-y-auto space-y-4 pb-4 pr-2 custom-scrollbar">
                      {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-neutral-500 space-y-3 opacity-50">
                          <MessageSquare className="w-8 h-8" />
                          <p className="text-sm">No messages yet. Say hi!</p>
                        </div>
                      ) : (
                        messages.map(msg => (
                          <div key={msg.id} className={`flex flex-col ${msg.userId === socketService.getSocket()?.id ? 'items-end' : 'items-start'}`}>
                            <span className="text-[10px] text-neutral-500 mb-1 px-1">{msg.username}</span>
                            <div className={`px-4 py-2.5 rounded-2xl max-w-[85%] text-sm ${msg.userId === socketService.getSocket()?.id ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-neutral-800 text-neutral-200 rounded-bl-none'}`}>
                              {msg.text}
                            </div>
                          </div>
                        ))
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                    
                    {/* Chat Input */}
                    <form onSubmit={handleSendMessage} className="mt-auto relative flex items-center pt-2">
                      <input 
                        type="text" 
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        placeholder="Type a message..." 
                        className="w-full bg-neutral-950/80 border border-neutral-800 rounded-xl pl-4 pr-12 py-3 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder-neutral-600 shadow-inner"
                      />
                      <button type="submit" disabled={!chatInput.trim()} className="absolute right-2 p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 rounded-lg transition-colors text-white">
                        <Send className="w-4 h-4" />
                      </button>
                    </form>
                  </motion.div>
                </AnimatePresence>
              )}
            </div>

            {/* Quick Reactions Bar */}
            <div className="bg-neutral-900/80 border-t border-neutral-800 p-3 flex justify-around backdrop-blur-md relative z-10">
              {['❤️', '😂', '😮', '🔥', '👏'].map(emoji => (
                <button 
                  key={emoji} 
                  onClick={() => sendReaction(emoji)}
                  className="w-10 h-10 rounded-full hover:bg-neutral-700 flex items-center justify-center text-xl transition-transform hover:scale-125 active:scale-95"
                >
                  {emoji}
                </button>
              ))}
            </div>

          </div>
          
        </div>
        {/* Hidden Audio Elements for Voice Mesh */}
        {remoteAudioStreams.map(audio => (
          <audio 
            key={audio.userId} 
            autoPlay 
            ref={el => { 
              if (el && el.srcObject !== audio.stream) { 
                el.srcObject = audio.stream; 
                el.play().catch(() => console.warn("Audio autoplay blocked - requires interaction"));
              } 
            }} 
          />
        ))}
      </div>
    </div>
  );
}
