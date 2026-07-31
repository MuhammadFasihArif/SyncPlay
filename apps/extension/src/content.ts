window.addEventListener("message", (event) => {
  if (event.data?.type === "SYNCPLAY_CREDENTIALS") {
    chrome.runtime.sendMessage({
      type: "CONNECT_SYNC",
      payload: event.data.payload
    });
  }
});

if (window.location.hostname === "localhost" || window.location.hostname.startsWith("100.")) {
  window.postMessage({ type: "REQUEST_SYNCPLAY_CREDENTIALS" }, "*");
}

window.addEventListener("scroll", () => {
  if (syncActive && isHost) {
    chrome.runtime.sendMessage({
      type: "HOST_SCROLLED",
      payload: { x: window.scrollX, y: window.scrollY }
    });
  }
});

let activeVideo: HTMLVideoElement | null = null;
let isHost = false;
let syncActive = false;
let lastServerState: any = null;

const DRIFT_SOFT = 0.25; // 250ms
const DRIFT_HARD = 0.50; // 500ms

function injectStatusBadge() {
  let badge = document.getElementById("syncplay-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "syncplay-badge";
    badge.style.position = "fixed";
    badge.style.top = "20px";
    badge.style.left = "20px";
    badge.style.zIndex = "2147483647"; // Max z-index
    badge.style.padding = "8px 16px";
    badge.style.borderRadius = "20px";
    badge.style.fontFamily = "sans-serif";
    badge.style.fontWeight = "bold";
    badge.style.fontSize = "14px";
    badge.style.color = "white";
    badge.style.boxShadow = "0 4px 12px rgba(0,0,0,0.5)";
    badge.style.pointerEvents = "none";
    document.body.appendChild(badge);
  }
  
  if (!syncActive) {
    badge.style.display = "none";
  } else {
    badge.style.display = "block";
    if (isHost) {
      badge.textContent = "👑 Host (Synced)";
      badge.style.background = "linear-gradient(135deg, #4f46e5, #7c3aed)";
    } else {
      badge.textContent = "👁 Viewer (Locked)";
      badge.style.background = "linear-gradient(135deg, #2563eb, #3b82f6)";
    }
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SYNC_STARTED") {
    syncActive = true;
    isHost = message.payload.isHost;
    lastServerState = message.payload.state;
    console.log("[SyncPlay] Sync started. Host:", isHost);
    injectStatusBadge();
    if (!isHost && activeVideo) {
      activeVideo.controls = false;
      activeVideo.style.pointerEvents = "none";
    }
  } else if (message.type === "SYNC_STOPPED") {
    syncActive = false;
    isHost = false;
    console.log("[SyncPlay] Sync stopped");
    injectStatusBadge();
    if (activeVideo) {
      activeVideo.controls = true;
      activeVideo.style.pointerEvents = "auto";
    }
  } else if (message.type === "SYNC_STATE_UPDATE" && syncActive && !isHost) {
    applyVideoState(message.payload);
  } else if (message.type === "SYNC_SCROLL" && syncActive && !isHost) {
    const { x, y } = message.payload;
    if (Math.abs(window.scrollX - x) > 5 || Math.abs(window.scrollY - y) > 5) {
      window.scrollTo(x, y);
    }
  }
});

// Layer 1: Native & Layer 4: Shadow DOM Recursive Search
function scanForVideo() {
  if (activeVideo) return; // Already found

  const found = document.querySelector('video') || findVideoInShadowRoots(document.body);
  
  if (found) {
    attachToVideo(found);
    return;
  }
  
  // Layer 2: Dynamic DOM Observer
  const observer = new MutationObserver((mutations) => {
    // Throttle shadow dom scanning slightly by just grabbing the first valid one
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        const dynFound = document.querySelector('video') || findVideoInShadowRoots(document.body);
        if (dynFound) {
          attachToVideo(dynFound);
          observer.disconnect();
          break;
        }
      }
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
}

function findVideoInShadowRoots(root: Element): HTMLVideoElement | null {
  if (root.tagName === 'VIDEO') return root as HTMLVideoElement;
  
  // Check children
  for (let i = 0; i < root.children.length; i++) {
    const child = root.children[i];
    if (child.tagName === 'VIDEO') return child as HTMLVideoElement;
    
    if (child.shadowRoot) {
      const found = findVideoInShadowRoots(child.shadowRoot as unknown as Element);
      if (found) return found;
    } else {
      const found = findVideoInShadowRoots(child);
      if (found) return found;
    }
  }
  return null;
}

function attachToVideo(video: HTMLVideoElement) {
  activeVideo = video;
  console.log("[SyncPlay] Attached to video element:", video);
  
  // Attach Event Listeners for Host
    video.addEventListener("play", () => {
      if (syncActive) {
        if (isHost) handleHostAction();
        else if (lastServerState && !lastServerState.isPlaying) video.pause();
      }
    });
    video.addEventListener("pause", () => {
      if (syncActive) {
        if (isHost) handleHostAction();
        else if (lastServerState && lastServerState.isPlaying) video.play();
      }
    });
    video.addEventListener("seeked", () => {
      if (syncActive) {
        if (isHost) handleHostAction();
        else if (lastServerState && Math.abs(video.currentTime - lastServerState.timestamp) > DRIFT_HARD) {
          video.currentTime = lastServerState.timestamp;
        }
      }
    });
    video.addEventListener("ratechange", () => {
      if (syncActive) {
        if (isHost) handleHostAction();
        else if (lastServerState && video.playbackRate !== lastServerState.playbackRate) {
          video.playbackRate = lastServerState.playbackRate;
        }
      }
    });
  video.addEventListener('waiting', () => {
     // Buffer awareness: emit buffering intent (Optional feature to pause sync)
  });
  
  // Periodic sync if host
  setInterval(() => {
    if (isHost && activeVideo && !activeVideo.paused) {
      handleHostAction();
    }
    // Strict Lockout loop for viewers
    if (!isHost && syncActive && activeVideo) {
      activeVideo.controls = false;
    }
  }, 3000);

  if (isHost) {
    chrome.runtime.sendMessage({
      type: "CHANGE_VIDEO_URL",
      payload: window.location.href
    });
  }
}

function handleHostAction() {
  if (!syncActive || !isHost || !activeVideo) return;
  
  chrome.runtime.sendMessage({
    type: "VIDEO_STATE_UPDATE",
    payload: {
      isPlaying: !activeVideo.paused,
      timestamp: activeVideo.currentTime,
      playbackRate: activeVideo.playbackRate
    }
  });
}

function applyVideoState(state: any) {
  if (!activeVideo || isHost) return;
  lastServerState = state;

  if (state.isPlaying && activeVideo.paused) {
    activeVideo.play().catch(e => console.error("[SyncPlay] Play blocked:", e));
  } else if (!state.isPlaying && !activeVideo.paused) {
    activeVideo.pause();
  }
  
  if (activeVideo.playbackRate !== state.playbackRate) {
    activeVideo.playbackRate = state.playbackRate;
  }

  // Drift Correction Logic
  const timeSinceUpdate = (Date.now() - state.lastUpdated) / 1000;
  const expectedTime = state.isPlaying ? state.timestamp + timeSinceUpdate : state.timestamp;
  
  const drift = Math.abs(activeVideo.currentTime - expectedTime);
  
  if (drift > DRIFT_HARD) {
    // Hard correction
    activeVideo.currentTime = expectedTime;
  } else if (drift > DRIFT_SOFT) {
    // Soft correction: speed up or slow down slightly
    if (activeVideo.currentTime < expectedTime) {
      activeVideo.playbackRate = state.playbackRate + 0.1;
    } else {
      activeVideo.playbackRate = state.playbackRate - 0.1;
    }
    
    // Reset to normal after 1 second
    setTimeout(() => {
      if (activeVideo) activeVideo.playbackRate = state.playbackRate;
    }, 1000);
  }
}

function cleanupVideo() {
  if (activeVideo) {
    activeVideo.removeEventListener('play', handleHostAction);
    activeVideo.removeEventListener('pause', handleHostAction);
    activeVideo.removeEventListener('seeked', handleHostAction);
    activeVideo.removeEventListener('ratechange', handleHostAction);
    activeVideo = null;
  }
}
