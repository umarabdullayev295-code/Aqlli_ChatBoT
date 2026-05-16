/* ===== AQLLI CHATBOT - Frontend Logic ===== */

// State
const state = {
  currentConvId: null,
  isLoading: false,
  isDarkTheme: true,
  pendingDeleteId: null,
  hasApiKey: false,
  selectedModel: 'meta-llama/llama-3.3-70b-instruct:free',
};

// DOM Elements
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const menuBtn = document.getElementById('menuBtn');
const newChatBtn = document.getElementById('newChatBtn');
const conversationsList = document.getElementById('conversationsList');
const chatArea = document.getElementById('chatArea');
const messagesContainer = document.getElementById('messagesContainer');
const welcomeScreen = document.getElementById('welcomeScreen');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const charCounter = document.getElementById('charCounter');
const currentChatTitle = document.getElementById('currentChatTitle');
const apiStatus = document.getElementById('apiStatus');
const clearBtn = document.getElementById('clearBtn');
const themeToggle = document.getElementById('themeToggle');
const themeIcon = document.getElementById('themeIcon');
const themeLabel = document.getElementById('themeLabel');
const modelSelect = document.getElementById('modelSelect');
const deleteModal = document.getElementById('deleteModal');
const cancelDelete = document.getElementById('cancelDelete');
const confirmDelete = document.getElementById('confirmDelete');

// ===== INIT =====
async function init() {
  await checkSettings();
  await loadConversations();
  setupEventListeners();
  loadTheme();
}

async function checkSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    state.hasApiKey = data.has_api_key;
    if (state.hasApiKey) {
      apiStatus.textContent = 'Jonli rejim';
      apiStatus.className = 'api-badge live';
    } else {
      apiStatus.textContent = 'Demo rejim';
      apiStatus.className = 'api-badge demo';
    }
  } catch (e) {
    console.error('Settings error:', e);
  }
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
  // Sidebar toggle
  sidebarToggle.addEventListener('click', toggleSidebar);
  menuBtn.addEventListener('click', toggleSidebar);

  // New chat
  newChatBtn.addEventListener('click', startNewChat);

  // Send message
  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  messageInput.addEventListener('input', () => {
    autoResize(messageInput);
    const len = messageInput.value.length;
    charCounter.textContent = `${len}/4000`;
    charCounter.style.color = len > 3500 ? 'var(--accent-red)' : 'var(--text-muted)';
  });

  // Clear current chat
  clearBtn.addEventListener('click', () => {
    if (state.currentConvId) showDeleteModal(state.currentConvId);
  });

  // Theme toggle
  themeToggle.addEventListener('click', toggleTheme);

  // Model select
  modelSelect.addEventListener('change', () => {
    state.selectedModel = modelSelect.value;
  });

  // Delete modal
  cancelDelete.addEventListener('click', hideDeleteModal);
  confirmDelete.addEventListener('click', executeDelete);
  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) hideDeleteModal();
  });
}

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
}

// ===== SIDEBAR =====
function toggleSidebar() {
  sidebar.classList.toggle('hidden');
}

// ===== THEME =====
function toggleTheme() {
  state.isDarkTheme = !state.isDarkTheme;
  applyTheme();
  localStorage.setItem('theme', state.isDarkTheme ? 'dark' : 'light');
}

function applyTheme() {
  document.body.classList.toggle('dark-theme', state.isDarkTheme);
  document.body.classList.toggle('light-theme', !state.isDarkTheme);
  themeIcon.textContent = state.isDarkTheme ? '☀️' : '🌙';
  themeLabel.textContent = state.isDarkTheme ? 'Yorug\' tema' : 'Qorong\'u tema';
}

function loadTheme() {
  const saved = localStorage.getItem('theme');
  state.isDarkTheme = saved !== 'light';
  applyTheme();
}

// ===== CONVERSATIONS =====
async function loadConversations() {
  try {
    const res = await fetch('/api/conversations');
    const convs = await res.json();
    renderConversationList(convs);
  } catch (e) {
    console.error('Load conversations error:', e);
  }
}

function renderConversationList(convs) {
  if (!convs || convs.length === 0) {
    conversationsList.innerHTML = `
      <div class="empty-history">
        <div class="empty-icon">💬</div>
        <p>Hali suhbat yo'q</p>
      </div>`;
    return;
  }

  conversationsList.innerHTML = convs.map(conv => {
    const date = formatDate(conv.created_at);
    const isActive = conv.id === state.currentConvId;
    return `
      <div class="conversation-item ${isActive ? 'active' : ''}" 
           data-id="${conv.id}" onclick="loadConversation('${conv.id}')">
        <div class="conv-info">
          <div class="conv-title">${escapeHtml(conv.title)}</div>
          <div class="conv-meta">${date} · ${conv.message_count} xabar</div>
        </div>
        <button class="conv-delete" onclick="event.stopPropagation(); showDeleteModal('${conv.id}')" title="O'chirish">✕</button>
      </div>`;
  }).join('');
}

async function loadConversation(convId) {
  try {
    const res = await fetch(`/api/conversations/${convId}`);
    const conv = await res.json();
    state.currentConvId = convId;
    currentChatTitle.textContent = conv.title || 'Suhbat';

    // Clear and show messages
    messagesContainer.innerHTML = '';
    welcomeScreen.style.display = 'none';
    messagesContainer.style.display = 'flex';

    conv.messages.forEach(msg => {
      appendMessage(msg.role, msg.content, msg.timestamp, false);
    });

    scrollToBottom();
    await loadConversations(); // refresh list to show active
  } catch (e) {
    console.error('Load conversation error:', e);
  }
}

async function startNewChat() {
  try {
    const res = await fetch('/api/conversations/new', { method: 'POST' });
    const conv = await res.json();
    state.currentConvId = conv.id;
    currentChatTitle.textContent = 'Yangi suhbat';
    messagesContainer.innerHTML = '';
    messagesContainer.style.display = 'none';
    welcomeScreen.style.display = 'flex';
    await loadConversations();
  } catch (e) {
    console.error('New chat error:', e);
  }
}

// ===== SEND MESSAGE =====
async function sendMessage() {
  const message = messageInput.value.trim();
  if (!message || state.isLoading) return;

  // If no current conversation, create one
  if (!state.currentConvId) {
    await startNewChat();
  }

  // Show user message
  appendMessage('user', message, new Date().toISOString(), true);
  messageInput.value = '';
  messageInput.style.height = 'auto';
  charCounter.textContent = '0/4000';

  // Hide welcome, show messages
  welcomeScreen.style.display = 'none';
  messagesContainer.style.display = 'flex';

  // Show typing indicator
  const typingEl = showTyping();
  state.isLoading = true;
  sendBtn.disabled = true;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        conversation_id: state.currentConvId,
        model: state.selectedModel,
      }),
    });

    const data = await res.json();

    typingEl.remove();
    state.isLoading = false;
    sendBtn.disabled = false;

    if (data.error) {
      appendError(data.error);
    } else {
      appendMessage('assistant', data.response, new Date().toISOString(), true);
      if (data.title) {
        currentChatTitle.textContent = data.title;
      }
      await loadConversations();
    }
  } catch (e) {
    typingEl.remove();
    state.isLoading = false;
    sendBtn.disabled = false;
    appendError('Ulanishda xatolik. Internet aloqasini tekshiring.');
  }

  scrollToBottom();
}

function sendQuickMessage(text) {
  messageInput.value = text;
  sendMessage();
}

// ===== RENDER MESSAGES =====
function appendMessage(role, content, timestamp, animate) {
  const isUser = role === 'user';
  const time = formatTime(timestamp);
  const rendered = renderMarkdown(content);

  const messageEl = document.createElement('div');
  messageEl.className = `message ${isUser ? 'user' : 'bot'}`;
  messageEl.innerHTML = `
    <div class="avatar ${isUser ? 'user' : 'bot'}">${isUser ? '👤' : '🤖'}</div>
    <div class="message-content">
      <div class="bubble">${rendered}</div>
      <div class="message-time">${time}</div>
      <div class="message-actions">
        <button class="action-btn" onclick="copyMessage(this)" data-text="${escapeAttr(content)}">📋 Nusxa</button>
      </div>
    </div>`;

  messagesContainer.appendChild(messageEl);

  // Syntax highlight code blocks
  messageEl.querySelectorAll('pre code').forEach(block => {
    hljs.highlightElement(block);
    // Add copy button to code blocks
    const pre = block.parentElement;
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-code-btn';
    copyBtn.textContent = 'Nusxa';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(block.innerText).then(() => {
        copyBtn.textContent = '✓ Nusxalandi';
        setTimeout(() => { copyBtn.textContent = 'Nusxa'; }, 2000);
      });
    };
    pre.style.position = 'relative';
    pre.appendChild(copyBtn);
  });

  if (animate) scrollToBottom();
}

function showTyping() {
  const el = document.createElement('div');
  el.className = 'typing-indicator';
  el.innerHTML = `
    <div class="avatar bot">🤖</div>
    <div class="typing-bubble">
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
    </div>`;
  messagesContainer.appendChild(el);
  scrollToBottom();
  return el;
}

function appendError(msg) {
  const el = document.createElement('div');
  el.className = 'error-message';
  el.textContent = '⚠️ ' + msg;
  messagesContainer.appendChild(el);
  scrollToBottom();
}

// ===== DELETE =====
function showDeleteModal(convId) {
  state.pendingDeleteId = convId;
  deleteModal.classList.add('show');
}

function hideDeleteModal() {
  state.pendingDeleteId = null;
  deleteModal.classList.remove('show');
}

async function executeDelete() {
  if (!state.pendingDeleteId) return;
  try {
    await fetch(`/api/conversations/${state.pendingDeleteId}`, { method: 'DELETE' });
    if (state.pendingDeleteId === state.currentConvId) {
      state.currentConvId = null;
      currentChatTitle.textContent = 'Yangi suhbat';
      messagesContainer.innerHTML = '';
      messagesContainer.style.display = 'none';
      welcomeScreen.style.display = 'flex';
    }
    hideDeleteModal();
    await loadConversations();
    showToast('Suhbat o\'chirildi');
  } catch (e) {
    console.error('Delete error:', e);
  }
}

// ===== UTILITIES =====
function renderMarkdown(text) {
  try {
    marked.setOptions({
      breaks: true,
      gfm: true,
      sanitize: false,
    });
    return marked.parse(text);
  } catch (e) {
    return escapeHtml(text).replace(/\n/g, '<br>');
  }
}

function scrollToBottom() {
  setTimeout(() => {
    chatArea.scrollTop = chatArea.scrollHeight;
  }, 50);
}

function formatTime(isoString) {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatDate(isoString) {
  try {
    const d = new Date(isoString);
    const now = new Date();
    const diff = now - d;
    if (diff < 86400000) return 'Bugun';
    if (diff < 172800000) return 'Kecha';
    return d.toLocaleDateString('uz-UZ', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

function escapeAttr(text) {
  return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function copyMessage(btn) {
  const text = btn.dataset.text;
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✓ Nusxalandi';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  });
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// ===== START =====
init();
