/* ===== AQLLI CHATBOT - Streaming Frontend ===== */

const state = {
  currentConvId: null,
  isLoading: false,
  isDarkTheme: true,
  pendingDeleteId: null,
  selectedModel: 'openai/gpt-oss-20b:free',
};

const $ = id => document.getElementById(id);

const sidebar         = $('sidebar');
const newChatBtn      = $('newChatBtn');
const conversationsList = $('conversationsList');
const chatArea        = $('chatArea');
const messagesContainer = $('messagesContainer');
const welcomeScreen   = $('welcomeScreen');
const messageInput    = $('messageInput');
const sendBtn         = $('sendBtn');
const charCounter     = $('charCounter');
const currentChatTitle = $('currentChatTitle');
const apiStatus       = $('apiStatus');
const clearBtn        = $('clearBtn');
const themeToggle     = $('themeToggle');
const themeIcon       = $('themeIcon');
const themeLabel      = $('themeLabel');
const modelSelect     = $('modelSelect');
const deleteModal     = $('deleteModal');
const cancelDelete    = $('cancelDelete');
const confirmDelete   = $('confirmDelete');

// ===== INIT =====
async function init() {
  await checkSettings();
  await loadConversations();
  setupEvents();
  loadTheme();
}

async function checkSettings() {
  try {
    const r = await fetch('/api/settings');
    const d = await r.json();
    if (d.has_api_key) {
      apiStatus.textContent = 'Jonli rejim';
      apiStatus.className = 'api-badge live';
    } else {
      apiStatus.textContent = 'Demo rejim';
      apiStatus.className = 'api-badge demo';
    }
  } catch {}
}

// ===== EVENTS =====
function setupEvents() {
  $('sidebarToggle').addEventListener('click', toggleSidebar);
  $('menuBtn').addEventListener('click', toggleSidebar);
  newChatBtn.addEventListener('click', startNewChat);
  sendBtn.addEventListener('click', sendMessage);
  clearBtn.addEventListener('click', () => { if (state.currentConvId) showDeleteModal(state.currentConvId); });
  themeToggle.addEventListener('click', toggleTheme);
  cancelDelete.addEventListener('click', hideDeleteModal);
  confirmDelete.addEventListener('click', executeDelete);
  deleteModal.addEventListener('click', e => { if (e.target === deleteModal) hideDeleteModal(); });

  modelSelect.addEventListener('change', () => { state.selectedModel = modelSelect.value; });

  messageInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  messageInput.addEventListener('input', () => {
    autoResize(messageInput);
    const len = messageInput.value.length;
    charCounter.textContent = `${len}/4000`;
    charCounter.style.color = len > 3500 ? 'var(--accent-red)' : 'var(--text-muted)';
  });
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 150) + 'px';
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
  themeLabel.textContent = state.isDarkTheme ? "Yorug' tema" : "Qorong'u tema";
}
function loadTheme() {
  state.isDarkTheme = localStorage.getItem('theme') !== 'light';
  applyTheme();
}

// ===== SIDEBAR =====
function toggleSidebar() { sidebar.classList.toggle('hidden'); }

// ===== CONVERSATIONS =====
async function loadConversations() {
  try {
    const r = await fetch('/api/conversations');
    renderConvList(await r.json());
  } catch {}
}

function renderConvList(convs) {
  if (!convs || !convs.length) {
    conversationsList.innerHTML = `<div class="empty-history"><div class="empty-icon">💬</div><p>Hali suhbat yo'q</p></div>`;
    return;
  }
  conversationsList.innerHTML = convs.map(c => `
    <div class="conversation-item ${c.id === state.currentConvId ? 'active' : ''}"
         data-id="${c.id}" onclick="loadConversation('${c.id}')">
      <div class="conv-info">
        <div class="conv-title">${escHtml(c.title)}</div>
        <div class="conv-meta">${fmtDate(c.created_at)} · ${c.message_count} xabar</div>
      </div>
      <button class="conv-delete" onclick="event.stopPropagation();showDeleteModal('${c.id}')" title="O'chirish">✕</button>
    </div>`).join('');
}

async function loadConversation(convId) {
  try {
    const r = await fetch(`/api/conversations/${convId}`);
    const conv = await r.json();
    state.currentConvId = convId;
    currentChatTitle.textContent = conv.title || 'Suhbat';
    messagesContainer.innerHTML = '';
    welcomeScreen.style.display = 'none';
    messagesContainer.style.display = 'flex';
    conv.messages.forEach(m => appendMessage(m.role, m.content, m.timestamp));
    scrollBottom();
    await loadConversations();
  } catch {}
}

async function startNewChat() {
  try {
    const r = await fetch('/api/conversations/new', { method: 'POST' });
    const conv = await r.json();
    state.currentConvId = conv.id;
    currentChatTitle.textContent = 'Yangi suhbat';
    messagesContainer.innerHTML = '';
    messagesContainer.style.display = 'none';
    welcomeScreen.style.display = 'flex';
    await loadConversations();
  } catch {}
}

// ===== STREAMING SEND =====
async function sendMessage() {
  const msg = messageInput.value.trim();
  if (!msg || state.isLoading) return;

  if (!state.currentConvId) await startNewChat();

  appendMessage('user', msg, new Date().toISOString());
  messageInput.value = '';
  messageInput.style.height = 'auto';
  charCounter.textContent = '0/4000';
  welcomeScreen.style.display = 'none';
  messagesContainer.style.display = 'flex';

  state.isLoading = true;
  sendBtn.disabled = true;

  // Bot bubble - streaming uchun bo'sh yaratamiz
  const botBubble = createStreamingBubble();
  scrollBottom();

  let fullText = '';
  let hasError = false;

  try {
    const resp = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: msg,
        conversation_id: state.currentConvId,
        model: state.selectedModel,
      }),
    });

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;

        try {
          const obj = JSON.parse(raw);

          if (obj.error) {
            botBubble.innerHTML = `<span style="color:var(--accent-red)">⚠️ ${escHtml(obj.error)}</span>`;
            hasError = true;
            break;
          }

          if (obj.token) {
            fullText += obj.token;
            botBubble.innerHTML = renderMarkdown(fullText);
            highlightCode(botBubble);
            scrollBottom();
          }

          if (obj.done) {
            state.currentConvId = obj.conv_id;
            if (obj.title) currentChatTitle.textContent = obj.title;
            await loadConversations();
          }
        } catch {}
      }
      if (hasError) break;
    }
  } catch (e) {
    botBubble.innerHTML = `<span style="color:var(--accent-red)">⚠️ Ulanish xatosi. Qayta urinib ko'ring.</span>`;
  }

  state.isLoading = false;
  sendBtn.disabled = false;
  scrollBottom();
}

function sendQuickMessage(text) {
  messageInput.value = text;
  sendMessage();
}

// ===== DOM HELPERS =====
function createStreamingBubble() {
  const wrap = document.createElement('div');
  wrap.className = 'message bot';
  wrap.innerHTML = `
    <div class="avatar bot">🤖</div>
    <div class="message-content">
      <div class="bubble streaming-bubble">
        <span class="cursor-blink">▋</span>
      </div>
    </div>`;
  messagesContainer.appendChild(wrap);
  const bubble = wrap.querySelector('.bubble');
  return bubble;
}

function appendMessage(role, content, timestamp) {
  const isUser = role === 'user';
  const wrap = document.createElement('div');
  wrap.className = `message ${isUser ? 'user' : 'bot'}`;
  wrap.innerHTML = `
    <div class="avatar ${isUser ? 'user' : 'bot'}">${isUser ? '👤' : '🤖'}</div>
    <div class="message-content">
      <div class="bubble">${isUser ? escHtml(content).replace(/\n/g,'<br>') : renderMarkdown(content)}</div>
      <div class="message-time">${fmtTime(timestamp)}</div>
      <div class="message-actions">
        <button class="action-btn" onclick="copyText(this)" data-text="${escAttr(content)}">📋 Nusxa</button>
      </div>
    </div>`;
  messagesContainer.appendChild(wrap);
  highlightCode(wrap);
}

function highlightCode(el) {
  el.querySelectorAll('pre code').forEach(block => {
    if (window.hljs) {
      hljs.highlightElement(block);
      const pre = block.parentElement;
      if (!pre.querySelector('.copy-code-btn')) {
        const btn = document.createElement('button');
        btn.className = 'copy-code-btn';
        btn.textContent = 'Nusxa';
        btn.onclick = () => {
          navigator.clipboard.writeText(block.innerText).then(() => {
            btn.textContent = '✓';
            setTimeout(() => btn.textContent = 'Nusxa', 2000);
          });
        };
        pre.style.position = 'relative';
        pre.appendChild(btn);
      }
    }
  });
}

function scrollBottom() {
  setTimeout(() => { chatArea.scrollTop = chatArea.scrollHeight; }, 30);
}

// ===== DELETE =====
function showDeleteModal(id) { state.pendingDeleteId = id; deleteModal.classList.add('show'); }
function hideDeleteModal() { state.pendingDeleteId = null; deleteModal.classList.remove('show'); }
async function executeDelete() {
  if (!state.pendingDeleteId) return;
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
  showToast("Suhbat o'chirildi");
}

// ===== UTILS =====
function renderMarkdown(text) {
  try { return marked.parse(text); }
  catch { return escHtml(text).replace(/\n/g, '<br>'); }
}
function escHtml(t) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(t));
  return d.innerHTML;
}
function escAttr(t) { return t.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}
function fmtDate(iso) {
  try {
    const d = new Date(iso), now = new Date(), diff = now - d;
    if (diff < 86400000) return 'Bugun';
    if (diff < 172800000) return 'Kecha';
    return d.toLocaleDateString('uz-UZ', { day: 'numeric', month: 'short' });
  } catch { return ''; }
}
function copyText(btn) {
  navigator.clipboard.writeText(btn.dataset.text).then(() => {
    const o = btn.textContent; btn.textContent = '✓ Nusxalandi';
    setTimeout(() => btn.textContent = o, 2000);
  });
}
function showToast(msg) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

init();
