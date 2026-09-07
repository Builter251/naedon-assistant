const API_BASE = (window.APP_CONFIG?.API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
const categories = ["주거", "식비", "카페·간식", "교통", "교육·취업", "통신", "구독", "생활", "의류", "의료", "여가"];
const incomeCategories = ["아르바이트", "용돈"];
const state = { filters: {}, transactions: [], currentConversationId: null, currentMessages: [], theme: localStorage.getItem("naedon-theme") || "light" };

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const won = (value) => `${Number(value || 0).toLocaleString("ko-KR")}원`;
const percent = (value) => `${Number(value || 0).toFixed(1)}%`;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const isoDate = () => new Date().toISOString().slice(0, 10);

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function showNotice(message = "") {
  const notice = $("#notice");
  notice.textContent = message;
  notice.classList.toggle("hidden", !message);
}

async function api(path, options = {}) {
  const coldStartTimer = setTimeout(() => showNotice("무료 서버가 깨어나는 중입니다. 첫 연결은 최대 1분 정도 걸릴 수 있습니다."), 3000);
  try {
    const response = await fetch(`${API_BASE}${path}`, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
    if (!response.ok) {
      let message = `요청을 처리하지 못했습니다. (${response.status})`;
      try { message = (await response.json()).detail || message; } catch (_) { /* response is not JSON */ }
      throw new Error(message);
    }
    if (response.status === 204) return null;
    return response.json();
  } finally {
    clearTimeout(coldStartTimer);
  }
}

function queryString(filters = state.filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
  return params.toString() ? `?${params}` : "";
}

async function checkServer() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) throw new Error();
    $("#statusDot").className = "status-dot online";
    $("#serverStatus").textContent = "서버 연결됨";
    showNotice("");
  } catch (_) {
    $("#statusDot").className = "status-dot offline";
    $("#serverStatus").textContent = "서버 연결 안 됨";
    showNotice("백엔드 서버에 연결할 수 없습니다. API 주소와 서버 상태를 확인해주세요.");
  }
}

function setView(viewName) {
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `${viewName}View`));
  const activeView = $(`#${viewName}View`);
  $("#pageTitle").textContent = activeView.dataset.pageTitle;
  $("#exportButton").classList.toggle("hidden", viewName !== "dashboard");
  $("#addTransactionButton").classList.toggle("hidden", viewName === "chat");
  if (viewName === "transactions") loadTransactions();
  if (viewName === "chat") loadConversations();
}

function renderMetrics(stats) {
  $("#totalIncome").textContent = won(stats.income_total);
  $("#totalExpense").textContent = won(stats.expense_total);
  $("#balance").textContent = won(stats.balance);
  $("#trend").textContent = stats.trend;
  $("#incomeCount").textContent = `수입 거래 ${stats.income_count}건`;
  $("#expenseCount").textContent = `지출 거래 ${stats.expense_count}건`;
  $("#periodLabel").textContent = stats.period.label;
  const metricMap = [
    ["engelIndex", "engelBar", stats.metrics.engel_index],
    ["housingRatio", "housingBar", stats.metrics.housing_ratio],
    ["fixedRatio", "fixedBar", stats.metrics.fixed_cost_ratio],
    ["discretionaryRatio", "discretionaryBar", stats.metrics.discretionary_ratio],
  ];
  metricMap.forEach(([label, bar, value]) => { $(`#${label}`).textContent = percent(value); $(`#${bar}`).style.width = `${Math.min(value, 100)}%`; });
  $("#propensity").textContent = `평균소비성향 ${percent(stats.metrics.average_propensity_to_consume)}`;
  const maximum = stats.category_totals[0]?.value || 1;
  $("#categoryBreakdown").innerHTML = stats.category_totals.slice(0, 5).map((item, index) => `
    <div class="category-item"><span>${index + 1}위 · ${escapeHtml(item.category)}</span><strong>${won(item.value)}</strong><small>최고 항목 대비 ${Math.round(item.value / maximum * 100)}%</small></div>
  `).join("") || '<p class="empty-state">표시할 지출이 없습니다.</p>';
}

function refreshChart() {
  const image = $("#cashflowChart");
  const loader = $("#chartLoader");
  loader.classList.remove("hidden");
  image.classList.add("hidden");
  const params = new URLSearchParams(state.filters);
  params.set("theme", state.theme);
  params.set("v", Date.now());
  image.onload = () => { loader.classList.add("hidden"); image.classList.remove("hidden"); };
  image.onerror = () => { loader.textContent = "그래프를 불러오지 못했습니다."; };
  image.src = `${API_BASE}/api/data/charts/monthly-cashflow.png?${params}`;
}

async function loadDashboard() {
  try {
    const stats = await api(`/api/data/statistics${queryString()}`);
    renderMetrics(stats);
    refreshChart();
  } catch (error) { showNotice(error.message); }
}

async function loadTransactions() {
  try {
    const result = await api(`/api/data${queryString()}`);
    state.transactions = result.items;
    $("#transactionTotal").textContent = result.total;
    $("#transactionTable").innerHTML = result.items.map((row) => `
      <tr>
        <td>${escapeHtml(row.date)}</td><td>${escapeHtml(row.memo)}</td><td>${escapeHtml(row.category)}</td>
        <td><span class="type-badge ${row.type}">${row.type === "income" ? "수입" : "지출"}</span></td>
        <td class="number">${row.type === "income" ? "+" : "−"}${won(row.value)}</td>
        <td><div class="row-actions"><button data-edit="${row.id}" type="button">수정</button><button class="delete" data-delete="${row.id}" type="button">삭제</button></div></td>
      </tr>`).join("") || '<tr><td colspan="6">조건에 맞는 거래가 없습니다.</td></tr>';
  } catch (error) { showNotice(error.message); }
}

function updateCategoryOptions(type, selected = "") {
  const choices = type === "income" ? incomeCategories : categories;
  $("#formCategory").innerHTML = choices.map((category) => `<option value="${category}" ${category === selected ? "selected" : ""}>${category}</option>`).join("");
  const isIncome = type === "income";
  ["is_fixed", "is_essential"].forEach((name) => { const input = $(`#transactionForm [name="${name}"]`); input.checked = false; input.disabled = isIncome; });
}

function openTransactionDialog(transaction = null) {
  const form = $("#transactionForm");
  form.reset();
  form.elements.id.value = transaction?.id || "";
  form.elements.date.value = transaction?.date || isoDate();
  form.elements.value.value = transaction?.value || "";
  form.elements.memo.value = transaction?.memo || "";
  form.elements.type.value = transaction?.type || "expense";
  updateCategoryOptions(form.elements.type.value, transaction?.category);
  form.elements.is_fixed.checked = Boolean(transaction?.is_fixed);
  form.elements.is_essential.checked = Boolean(transaction?.is_essential);
  $("#dialogTitle").textContent = transaction ? "거래 수정" : "거래 추가";
  $("#transactionDialog").showModal();
}

async function saveTransaction(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.elements.id.value;
  const type = form.elements.type.value;
  const payload = {
    date: form.elements.date.value, value: Number(form.elements.value.value), memo: form.elements.memo.value.trim(), type,
    category: form.elements.category.value, is_fixed: type === "expense" && form.elements.is_fixed.checked,
    is_essential: type === "expense" && form.elements.is_essential.checked,
  };
  try {
    await api(id ? `/api/data/${id}` : "/api/data", { method: id ? "PUT" : "POST", body: JSON.stringify(payload) });
    $("#transactionDialog").close();
    showToast(id ? "거래를 수정했습니다." : "거래를 추가했습니다.");
    await Promise.all([loadDashboard(), loadTransactions()]);
  } catch (error) { showToast(error.message); }
}

function tokenMeta(usage, source) {
  if (source === "local") return "직접 계산 · AI 호출 0회 · 0 tokens";
  if (!usage || usage.measurement === "unavailable") return "AI 분석 · 토큰 사용량 확인 불가";
  const prefix = usage.measurement === "estimated" ? "예상 " : "";
  return `AI 분석 · 호출 ${usage.ai_calls}회 · 입력 ${prefix}${Number(usage.prompt_tokens).toLocaleString()} · 출력 ${prefix}${Number(usage.completion_tokens).toLocaleString()} · 총 ${prefix}${Number(usage.total_tokens).toLocaleString()} tokens`;
}

function renderMessages() {
  const container = $("#messages");
  if (!state.currentMessages.length) {
    container.innerHTML = '<div class="empty-chat"><span>✦</span><h3>소비 데이터에 대해 물어보세요</h3><p>“7월 총지출은?”은 직접 계산하고,<br>“소비 습관을 평가해줘”는 AI가 분석합니다.</p></div>';
    $("#conversationTokens").textContent = "0 tokens";
    return;
  }
  container.innerHTML = state.currentMessages.map((message) => `
    <div class="message ${message.role}"><div class="message-bubble">${escapeHtml(message.content)}
      ${message.role === "assistant" ? `<div class="message-meta">${escapeHtml(tokenMeta(message.token_usage, message.source))}</div>` : ""}
    </div></div>`).join("");
  const total = state.currentMessages.reduce((sum, message) => sum + Number(message.token_usage?.total_tokens || 0), 0);
  $("#conversationTokens").textContent = `${total.toLocaleString()} tokens`;
  container.scrollTop = container.scrollHeight;
}

function addTyping() {
  const container = $("#messages");
  container.querySelector(".empty-chat")?.remove();
  container.insertAdjacentHTML("beforeend", '<div class="message assistant" id="typingMessage"><div class="message-bubble typing"><i></i><i></i><i></i></div></div>');
  container.scrollTop = container.scrollHeight;
}

async function sendChat(event) {
  event.preventDefault();
  const input = $("#chatInput");
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  state.currentMessages.push({ role: "user", content: message });
  renderMessages();
  addTyping();
  $("#chatForm button").disabled = true;
  try {
    const result = await api("/api/chat", { method: "POST", body: JSON.stringify({ message, conversation_id: state.currentConversationId }) });
    state.currentConversationId = result.conversation_id;
    state.currentMessages.push({ role: "assistant", content: result.answer, source: result.source, token_usage: result.token_usage });
    renderMessages();
    await loadConversations();
  } catch (error) {
    $("#typingMessage")?.remove();
    state.currentMessages.push({ role: "assistant", content: error.message, source: "local", token_usage: { total_tokens: 0, ai_calls: 0, measurement: "not_used" } });
    renderMessages();
  } finally { $("#chatForm button").disabled = false; input.focus(); }
}

async function loadConversations() {
  try {
    const result = await api("/api/conversations");
    $("#conversationList").innerHTML = result.items.map((conversation) => `
      <div class="conversation-item ${conversation.id === state.currentConversationId ? "active" : ""}">
        <button class="conversation-open" data-conversation="${conversation.id}" type="button"><strong>${escapeHtml(conversation.title)}</strong><small>${escapeHtml(conversation.updated_at.slice(0, 10))} · ${conversation.messages.length}개 메시지</small></button>
        <button class="conversation-delete" data-conversation-delete="${conversation.id}" type="button" aria-label="대화 삭제">×</button>
      </div>`).join("") || '<p class="empty-state">저장된 대화가 없습니다.</p>';
  } catch (error) { showNotice(error.message); }
}

async function openConversation(id) {
  try {
    const conversation = await api(`/api/conversations/${id}`);
    state.currentConversationId = conversation.id;
    state.currentMessages = conversation.messages;
    renderMessages();
    await loadConversations();
  } catch (error) { showToast(error.message); }
}

function resetConversation() {
  state.currentConversationId = null;
  state.currentMessages = [];
  renderMessages();
  loadConversations();
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("naedon-theme", theme);
  if ($("#dashboardView").classList.contains("active")) refreshChart();
}

function init() {
  $("#filterCategory").insertAdjacentHTML("beforeend", categories.map((category) => `<option value="${category}">${category}</option>`).join(""));
  updateCategoryOptions("expense");
  applyTheme(state.theme);
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  $("#themeToggle").addEventListener("click", () => applyTheme(state.theme === "light" ? "dark" : "light"));
  $("#addTransactionButton").addEventListener("click", () => openTransactionDialog());
  $$(".dialog-close").forEach((button) => button.addEventListener("click", () => $("#transactionDialog").close()));
  $("#transactionForm").addEventListener("submit", saveTransaction);
  $("#transactionForm").elements.type.addEventListener("change", (event) => updateCategoryOptions(event.target.value));
  $("#transactionTable").addEventListener("click", async (event) => {
    const editId = event.target.dataset.edit;
    const deleteId = event.target.dataset.delete;
    if (editId) openTransactionDialog(state.transactions.find((row) => row.id === editId));
    if (deleteId && confirm("이 거래를 삭제할까요?")) {
      try { await api(`/api/data/${deleteId}`, { method: "DELETE" }); showToast("거래를 삭제했습니다."); await Promise.all([loadDashboard(), loadTransactions()]); }
      catch (error) { showToast(error.message); }
    }
  });
  $("#filterForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.filters = Object.fromEntries(new FormData(event.currentTarget).entries());
    loadDashboard();
  });
  $("#resetFilter").addEventListener("click", () => { $("#filterForm").reset(); state.filters = {}; loadDashboard(); });
  $("#exportButton").addEventListener("click", () => { window.location.href = `${API_BASE}/api/data/export.csv${queryString()}`; });
  $("#chatForm").addEventListener("submit", sendChat);
  $("#chatInput").addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); $("#chatForm").requestSubmit(); } });
  $("#newConversationButton").addEventListener("click", resetConversation);
  $("#conversationList").addEventListener("click", async (event) => {
    const openId = event.target.closest("[data-conversation]")?.dataset.conversation;
    const deleteId = event.target.dataset.conversationDelete;
    if (openId) openConversation(openId);
    if (deleteId && confirm("이 대화를 삭제할까요?")) {
      try { await api(`/api/conversations/${deleteId}`, { method: "DELETE" }); if (state.currentConversationId === deleteId) resetConversation(); else loadConversations(); showToast("대화를 삭제했습니다."); }
      catch (error) { showToast(error.message); }
    }
  });
  checkServer();
  loadDashboard();
}

document.addEventListener("DOMContentLoaded", init);
