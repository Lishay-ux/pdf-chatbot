// ── State ─────────────────────────────────────────────
const SESSION_ID = "session_" + Math.random().toString(36).slice(2, 9);

let chatHistory = [];       // Current conversation [{role, content}]
let allSessions = [];       // All saved chats for history sidebar
let hasPDF = false;

// ── DOM Refs ──────────────────────────────────────────
const messagesArea  = document.getElementById("messagesArea");
const userInput     = document.getElementById("userInput");
const sendBtn       = document.getElementById("sendBtn");
const pdfStatus     = document.getElementById("pdfStatus");
const clearBtn      = document.getElementById("clearBtn");
const historyList   = document.getElementById("historyList");
const welcomeScreen = document.getElementById("welcomeScreen");
const headerTitle   = document.getElementById("headerTitle");

// ── Upload PDF ────────────────────────────────────────
async function uploadPDF(file) {
  if (!file) return;

  const zone = document.getElementById("uploadZone");
  zone.innerHTML = `<div class="upload-icon">⏳</div><p class="upload-hint">Uploading...</p>`;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("session_id", SESSION_ID);

  try {
    const res = await fetch("/upload", { method: "POST", body: formData });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Upload failed");

    hasPDF = true;
    pdfStatus.textContent = `✓ ${data.message}`;
    pdfStatus.classList.remove("hidden");
    clearBtn.classList.remove("hidden");
    headerTitle.textContent = file.name;

    zone.innerHTML = `<div class="upload-icon">✅</div><p class="upload-hint">${file.name}</p>`;

  } catch (err) {
    zone.innerHTML = `<div class="upload-icon">📄</div><p class="upload-hint">Click or drag PDF here</p>`;
    showError("Upload failed: " + err.message);
  }
}

function handleDrop(event) {
  event.preventDefault();
  document.getElementById("uploadZone").classList.remove("drag-over");
  const file = event.dataTransfer.files[0];
  if (file && file.type === "application/pdf") uploadPDF(file);
}

// ── Clear PDF ─────────────────────────────────────────
async function clearPDF() {
  await fetch("/clear", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: SESSION_ID })
  });

  hasPDF = false;
  pdfStatus.classList.add("hidden");
  clearBtn.classList.add("hidden");
  headerTitle.textContent = "Ask anything from your PDF";

  const zone = document.getElementById("uploadZone");
  zone.innerHTML = `<div class="upload-icon">📄</div><p class="upload-hint">Click or drag PDF here</p>`;
  document.getElementById("fileInput").value = "";
}

// ── Send Message ──────────────────────────────────────
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  // Hide welcome screen on first message
  welcomeScreen.style.display = "none";

  // Add user bubble
  appendMessage("user", text);
  chatHistory.push({ role: "user", content: text });

  userInput.value = "";
  autoResize(userInput);
  setSending(true);

  // Show typing indicator
  const typingEl = appendTyping();

  try {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        session_id: SESSION_ID,
        history: chatHistory.slice(-20) // Last 20 messages
      })
    });

    const data = await res.json();
    typingEl.remove();

    if (!res.ok) throw new Error(data.error || "Something went wrong");

    appendMessage("ai", data.reply);
    chatHistory.push({ role: "assistant", content: data.reply });

    // Save to history sidebar
    saveToHistory(text);

  } catch (err) {
    typingEl.remove();
    appendMessage("ai", "⚠️ Error: " + err.message);
  }

  setSending(false);
  scrollBottom();
}

function handleKey(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function sendExample(btn) {
  userInput.value = btn.textContent;
  sendMessage();
}

// ── New Chat ──────────────────────────────────────────
function newChat() {
  chatHistory = [];
  messagesArea.innerHTML = "";
  messagesArea.appendChild(welcomeScreen);
  welcomeScreen.style.display = "";
  headerTitle.textContent = "Ask anything from your PDF";

  // Mark all history items as inactive
  document.querySelectorAll(".history-item").forEach(i => i.classList.remove("active"));
}

// ── History ───────────────────────────────────────────
function saveToHistory(firstMessage) {
  // Only save first message of a session as the title
  if (chatHistory.filter(m => m.role === "user").length !== 1) return;

  const title = firstMessage.length > 36 ? firstMessage.slice(0, 36) + "…" : firstMessage;
  const snapshot = [...chatHistory];

  // Remove "No chats yet" placeholder
  const empty = historyList.querySelector(".history-empty");
  if (empty) empty.remove();

  const item = document.createElement("div");
  item.className = "history-item active";
  item.textContent = "💬 " + title;
  item.onclick = () => loadSession(snapshot, item, title);

  // Deactivate previous
  document.querySelectorAll(".history-item").forEach(i => i.classList.remove("active"));
  historyList.prepend(item);
}

function loadSession(snapshot, el, title) {
  chatHistory = [...snapshot];
  messagesArea.innerHTML = "";
  welcomeScreen.style.display = "none";

  for (const msg of snapshot) {
    appendMessage(msg.role === "assistant" ? "ai" : "user", msg.content);
  }

  document.querySelectorAll(".history-item").forEach(i => i.classList.remove("active"));
  el.classList.add("active");
  headerTitle.textContent = title;
}

// ── DOM Helpers ───────────────────────────────────────
function appendMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.className = "message " + role;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "ai" ? "⬡" : "👤";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  wrapper.appendChild(avatar);
  wrapper.appendChild(bubble);
  messagesArea.appendChild(wrapper);
  scrollBottom();
  return wrapper;
}

function appendTyping() {
  const wrapper = document.createElement("div");
  wrapper.className = "message ai";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = "⬡";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;

  wrapper.appendChild(avatar);
  wrapper.appendChild(bubble);
  messagesArea.appendChild(wrapper);
  scrollBottom();
  return wrapper;
}

function showError(msg) {
  const el = document.createElement("div");
  el.style.cssText = "color:#ff6b6b;font-size:13px;padding:8px;text-align:center;";
  el.textContent = msg;
  messagesArea.appendChild(el);
}

function setSending(state) {
  sendBtn.disabled = state;
  userInput.disabled = state;
}

function scrollBottom() {
  messagesArea.scrollTop = messagesArea.scrollHeight;
}

function autoResize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 160) + "px";
}

function toggleSidebar() {
  document.querySelector(".sidebar").classList.toggle("open");
}
