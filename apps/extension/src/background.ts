import { io, Socket } from "socket.io-client";

interface TabState {
  socket: Socket | null;
  currentRoomId: string | null;
  isHost: boolean;
}

const tabStates = new Map<number, TabState>();

function getTabState(tabId: number): TabState {
  if (!tabStates.has(tabId)) {
    tabStates.set(tabId, { socket: null, currentRoomId: null, isHost: false });
  }
  return tabStates.get(tabId)!;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (!tabId) return;
  const state = getTabState(tabId);

  if (message.type === "CONNECT_SYNC") {
    const { serverUrl, roomId, username } = message.payload;
    connectSocket(tabId, state, serverUrl, roomId, username);
  } else if (message.type === "GET_STATUS") {
    chrome.tabs.sendMessage(tabId, {
      type: "CONNECTION_STATUS",
      payload: { connected: state.socket?.connected || false, roomId: state.currentRoomId }
    }, () => { void chrome.runtime.lastError; });
  } else if (message.type === "VIDEO_STATE_UPDATE") {
    if (state.socket && state.isHost) {
      state.socket.emit("sync-state", {
        roomId: state.currentRoomId,
        state: message.payload
      });
    }
  } else if (message.type === "CHANGE_VIDEO_URL") {
    if (state.socket && state.isHost) {
      state.socket.emit("change-video", { roomId: state.currentRoomId, videoUrl: message.payload });
    }
  } else if (message.type === "HOST_SCROLLED") {
    if (state.socket && state.isHost) {
      state.socket.emit("host-scrolled", { roomId: state.currentRoomId, scrollPos: message.payload });
    }
  } else if (message.type === "DISCONNECT_SYNC") {
    if (state.socket) {
      state.socket.disconnect();
    }
  }
});

function connectSocket(tabId: number, state: TabState, serverUrl: string, roomId: string, username: string) {
  if (state.socket) {
    state.socket.disconnect();
  }

  state.socket = io(serverUrl, { transports: ["websocket"] });

  state.socket.on("connect", () => {
    state.socket?.emit("join-room", { roomId, username }, (res: any) => {
      if (res.success) {
        state.currentRoomId = roomId;
        const me = res.room.users.find((u: any) => u.id === state.socket?.id);
        state.isHost = me?.isHost || false;

        chrome.tabs.sendMessage(tabId, {
          type: "CONNECTION_STATUS",
          payload: { connected: true, roomId }
        }, () => { void chrome.runtime.lastError; });
        
        notifyTabSyncActive(tabId, state, res.room.playbackState);
      }
    });
  });

  state.socket.on("state-update", (serverState: any) => {
    if (!state.isHost) {
      chrome.tabs.sendMessage(tabId, {
        type: "SYNC_STATE_UPDATE",
        payload: { state: serverState, isHost: false }
      }, () => { void chrome.runtime.lastError; });
    }
  });

  state.socket.on("room-updated", (room: any) => {
    const me = room.users.find((u: any) => u.id === state.socket?.id);
    if (me) {
      state.isHost = me.isHost;
      notifyTabSyncActive(tabId, state, room.playbackState);
    }
  });

  state.socket.on("host-scrolled", (scrollPos: any) => {
    if (!state.isHost) {
      chrome.tabs.sendMessage(tabId, {
        type: "SYNC_SCROLL",
        payload: scrollPos
      }, () => { void chrome.runtime.lastError; });
    }
  });

  state.socket.on("disconnect", () => {
    state.currentRoomId = null;
    chrome.tabs.sendMessage(tabId, {
      type: "CONNECTION_STATUS",
      payload: { connected: false }
    }, () => { void chrome.runtime.lastError; });
    notifyTabSyncInactive(tabId);
  });
}

function notifyTabSyncActive(tabId: number, state: TabState, playbackState: any = null) {
  chrome.tabs.sendMessage(tabId, {
    type: "SYNC_STARTED",
    payload: { isHost: state.isHost, state: playbackState }
  }, () => { void chrome.runtime.lastError; });
}

function notifyTabSyncInactive(tabId: number) {
  chrome.tabs.sendMessage(tabId, {
    type: "SYNC_STOPPED"
  }, () => { void chrome.runtime.lastError; });
}
