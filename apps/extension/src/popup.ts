document.addEventListener('DOMContentLoaded', () => {
  const serverUrlInput = document.getElementById('serverUrl') as HTMLInputElement;
  const roomIdInput = document.getElementById('roomId') as HTMLInputElement;
  const usernameInput = document.getElementById('username') as HTMLInputElement;
  const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
  const statusText = document.getElementById('statusText') as HTMLDivElement;
  const manualForm = document.getElementById('manualForm') as HTMLDivElement;
  const autoManaged = document.getElementById('autoManaged') as HTMLDivElement;
  const disconnectBtn = document.getElementById('disconnectBtn') as HTMLButtonElement;

  disconnectBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: "DISCONNECT_SYNC" }, () => { void chrome.runtime.lastError; });
  });

  // Load saved settings
  chrome.storage.local.get(['wp_server_url', 'wp_room_id', 'wp_username'], (res: any) => {
    if (res.wp_server_url) serverUrlInput.value = res.wp_server_url;
    if (res.wp_room_id) roomIdInput.value = res.wp_room_id;
    if (res.wp_username) usernameInput.value = res.wp_username;
  });

  connectBtn.addEventListener('click', () => {
    const serverUrl = serverUrlInput.value;
    const roomId = roomIdInput.value;
    const username = usernameInput.value;

    if (!serverUrl || !roomId || !username) {
      alert("Please fill all fields");
      return;
    }

    // Save to storage
    chrome.storage.local.set({
      wp_server_url: serverUrl,
      wp_room_id: roomId,
      wp_username: username
    });

    // Send message to background script to connect
    chrome.runtime.sendMessage({
      type: "CONNECT_SYNC",
      payload: { serverUrl, roomId, username }
    }, () => { void chrome.runtime.lastError; });

    statusText.innerHTML = 'Status: <span class="status-active">Connecting...</span>';
  });

  // Listen for status updates from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "CONNECTION_STATUS") {
      if (message.payload.connected) {
        statusText.innerHTML = `Status: <span class="status-active">Connected to ${message.payload.roomId}</span>`;
        manualForm.style.display = "none";
        autoManaged.style.display = "block";
      } else {
        statusText.innerHTML = 'Status: <span class="status-inactive">Disconnected</span>';
        manualForm.style.display = "block";
        autoManaged.style.display = "none";
      }
    }
  });

  // Ask for current status on open
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, () => { void chrome.runtime.lastError; });
});
