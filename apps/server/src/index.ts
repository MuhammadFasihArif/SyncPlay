import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { setupSockets } from "./socket";

const app = express();
const server = http.createServer(app);

// Enable CORS for the web app and extension
app.use(cors({
  origin: "*", // In a real production VPN setup, you might restrict this to known Tailscale/ZeroTier IP ranges
  methods: ["GET", "POST"]
}));

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  }
});

// Setup Socket.IO Event Handlers
setupSockets(io);

app.get("/", (req, res) => {
  // Dynamically determine the frontend URL based on how the user accessed the backend
  const host = req.headers.host || "localhost:3001";
  const frontendUrl = `http://${host.replace(":3001", ":3000")}`;

  res.send(`
    <html>
      <body style="background:#0a0a0a; color:#fff; font-family:sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh;">
        <h2>SyncPlay Backend Server</h2>
        <p>The SyncPlay Sync Engine is running successfully on this port.</p>
        <p>However, this is just the backend. To use the application, please go to the web app frontend:</p>
        <a href="${frontendUrl}" style="color:#6366f1; font-size: 20px; font-weight:bold;">Go to ${frontendUrl}</a>
      </body>
    </html>
  `);
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: Date.now() });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`[Server] Real-Time Watch Party Sync Engine running on port ${PORT}`);
  console.log(`[Server] Connect to this machine's VPN IP (e.g., http://100.x.x.x:${PORT}) for syncing.`);
});
