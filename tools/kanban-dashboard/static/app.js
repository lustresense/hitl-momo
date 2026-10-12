// Hermes Read-Only Kanban Dashboard (Safe DOM Implementation)
(function () {
  'use strict';

  const KNOWN_STATUSES = ['todo', 'ready', 'running', 'done', 'blocked', 'archived'];

  const STATUS_LABELS = {
    todo: 'To Do',
    ready: 'Ready',
    running: 'In Progress',
    done: 'Done',
    blocked: 'Blocked',
    archived: 'Archived',
    triage: 'Triage'
  };

  const state = {
    boards: [],
    currentBoardSlug: '',
    tasks: [],
    assignees: [],
    filterAssignee: '',
    filterSearch: '',
    selectedTaskId: null,
    activeMobileCol: 'running'
  };

  // DOM elements
  const boardSelect = document.getElementById('board-select');
  const boardTitle = document.getElementById('board-title');
  const boardSubtitle = document.getElementById('board-subtitle');
  const refreshBtn = document.getElementById('refresh-btn');
  const assigneeFilter = document.getElementById('assignee-filter');
  const searchInput = document.getElementById('search-input');
  const colTabs = document.getElementById('col-tabs');
  const boardColumns = document.getElementById('board-columns');
  const taskDrawer = document.getElementById('task-drawer');
  const drawerOverlay = document.getElementById('drawer-overlay');
  const drawerClose = document.getElementById('drawer-close');
  const drawerTitle = document.getElementById('drawer-title');
  const drawerBody = document.getElementById('drawer-body');

  // Authentication dialog elements (Login & Setup Shell)
  const authModal = document.getElementById('auth-modal');
  const authModalTitle = document.getElementById('auth-modal-title');
  const authModalDesc = document.getElementById('auth-modal-desc');
  const authForm = document.getElementById('auth-form');
  const authTokenInput = document.getElementById('auth-token-input');
  const authPasswordLabel = document.getElementById('auth-password-label');
  const authConfirmGroup = document.getElementById('auth-confirm-group');
  const authConfirmInput = document.getElementById('auth-confirm-input');
  const authTokenSubmit = document.getElementById('auth-token-submit');
  const authErrorMsg = document.getElementById('auth-error-msg');
  const authLogoutBtn = document.getElementById('auth-logout-btn');

  let inMemoryToken = null;
  let isSetupMode = false;
  let csrfToken = null;

  async function init() {
    setupEventListeners();
    await checkAuthStatus();
  }

  async function checkAuthStatus() {
    try {
      const res = await fetch('/api/auth/status');
      if (!res.ok) {
        showAuthModal('Unable to connect to authentication gate');
        return;
      }
      const data = await res.json();
      csrfToken = data.csrf_token || null;
      if (data.setup_required) {
        isSetupMode = true;
        showSetupModal();
      } else if (!data.authenticated) {
        isSetupMode = false;
        showLoginModal();
      } else {
        hideAuthModal();
        fetchBoards();
      }
    } catch (err) {
      showAuthModal('Network error: ' + err.message);
    }
  }

  function showSetupModal(errorText) {
    isSetupMode = true;
    if (authModalTitle) authModalTitle.textContent = 'Create Admin Password';
    if (authModalDesc) authModalDesc.textContent = 'Welcome to Hermes Kanban. Set a secure admin password (minimum 8 characters) to initialize this dashboard.';
    if (authPasswordLabel) authPasswordLabel.textContent = 'New Password';
    if (authTokenInput) authTokenInput.placeholder = 'Create admin password...';
    if (authConfirmGroup) authConfirmGroup.classList.remove('hidden');
    if (authConfirmInput) {
      authConfirmInput.required = true;
      authConfirmInput.value = '';
    }
    if (authTokenSubmit) authTokenSubmit.textContent = 'Set Password';
    showAuthModal(errorText);
  }

  function showLoginModal(errorText) {
    isSetupMode = false;
    if (authModalTitle) authModalTitle.textContent = 'Sign In';
    if (authModalDesc) authModalDesc.textContent = 'Enter your admin password to access the Kanban dashboard.';
    if (authPasswordLabel) authPasswordLabel.textContent = 'Admin Password';
    if (authTokenInput) authTokenInput.placeholder = 'Enter password...';
    if (authConfirmGroup) authConfirmGroup.classList.add('hidden');
    if (authConfirmInput) {
      authConfirmInput.required = false;
      authConfirmInput.value = '';
    }
    if (authTokenSubmit) authTokenSubmit.textContent = 'Sign In';
    showAuthModal(errorText);
  }

  function showAuthModal(errorText) {
    if (authModal) {
      authModal.classList.remove('hidden');
    }
    if (authErrorMsg) {
      if (errorText) {
        authErrorMsg.textContent = errorText;
        authErrorMsg.classList.remove('hidden');
      } else {
        authErrorMsg.textContent = '';
        authErrorMsg.classList.add('hidden');
      }
    }
    if (authTokenInput) {
      authTokenInput.value = '';
      authTokenInput.focus();
    }
  }

  function hideAuthModal() {
    if (authModal) {
      authModal.classList.add('hidden');
    }
    if (authErrorMsg) {
      authErrorMsg.textContent = '';
      authErrorMsg.classList.add('hidden');
    }
    if (authTokenInput) {
      authTokenInput.value = '';
    }
    if (authConfirmInput) {
      authConfirmInput.value = '';
    }
  }

  function setupEventListeners() {
    if (authForm) {
      authForm.addEventListener('submit', handleAuthSubmit);
    }

    if (authLogoutBtn) {
      authLogoutBtn.addEventListener('click', handleLogout);
    }

    boardSelect.addEventListener('change', (e) => {
      const slug = e.target.value;
      if (slug) {
        state.currentBoardSlug = slug;
        state.filterAssignee = '';
        state.filterSearch = '';
        searchInput.value = '';
        fetchBoardData(slug);
      }
    });

    refreshBtn.addEventListener('click', () => {
      if (state.currentBoardSlug) {
        fetchBoardData(state.currentBoardSlug);
      } else {
        fetchBoards();
      }
    });

    assigneeFilter.addEventListener('change', (e) => {
      state.filterAssignee = e.target.value;
      renderBoard();
    });

    searchInput.addEventListener('input', (e) => {
      state.filterSearch = e.target.value.trim().toLowerCase();
      renderBoard();
    });

    drawerOverlay.addEventListener('click', closeDrawer);
    drawerClose.addEventListener('click', closeDrawer);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !taskDrawer.classList.contains('hidden')) {
        closeDrawer();
      }
    });
  }

  async function handleAuthSubmit(e) {
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    const password = (authTokenInput ? authTokenInput.value : '').trim();
    if (!password) {
      const msg = isSetupMode ? 'Please enter a password.' : 'Please enter your password.';
      if (authErrorMsg) {
        authErrorMsg.textContent = msg;
        authErrorMsg.classList.remove('hidden');
      }
      return;
    }

    if (isSetupMode) {
      const confirm = (authConfirmInput ? authConfirmInput.value : '').trim();
      if (password.length < 8) {
        if (authErrorMsg) {
          authErrorMsg.textContent = 'Password must be at least 8 characters long.';
          authErrorMsg.classList.remove('hidden');
        }
        return;
      }
      if (password !== confirm) {
        if (authErrorMsg) {
          authErrorMsg.textContent = 'Passwords do not match.';
          authErrorMsg.classList.remove('hidden');
        }
        return;
      }

      if (authTokenSubmit) {
        authTokenSubmit.disabled = true;
        authTokenSubmit.textContent = 'Creating...';
      }

      try {
        const res = await fetch('/api/auth/setup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken || ''
          },
          body: JSON.stringify({ password: password, confirm_password: confirm })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const err = data.error || `Setup failed with status ${res.status}`;
          showSetupModal(err);
          return;
        }

        csrfToken = data.csrf_token || csrfToken;
        isSetupMode = false;
        hideAuthModal();
        fetchBoards();
      } catch (err) {
        showSetupModal('Network error: ' + err.message);
      } finally {
        if (authTokenSubmit) {
          authTokenSubmit.disabled = false;
          authTokenSubmit.textContent = 'Set Password';
        }
      }
    } else {
      if (authTokenSubmit) {
        authTokenSubmit.disabled = true;
        authTokenSubmit.textContent = 'Signing in...';
      }

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken || ''
          },
          body: JSON.stringify({ password: password })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const err = data.error || `Login failed with status ${res.status}`;
          showLoginModal(err);
          return;
        }

        csrfToken = data.csrf_token || csrfToken;
        hideAuthModal();
        fetchBoards();
      } catch (err) {
        showLoginModal('Network error: ' + err.message);
      } finally {
        if (authTokenSubmit) {
          authTokenSubmit.disabled = false;
          authTokenSubmit.textContent = 'Sign In';
        }
      }
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': csrfToken || ''
        }
      });
    } catch (_) {}

    inMemoryToken = null;
    state.boards = [];
    state.tasks = [];
    state.assignees = [];
    state.currentBoardSlug = '';
    boardSelect.replaceChildren();
    boardTitle.textContent = 'Kanban Board';
    boardSubtitle.textContent = 'Authentication required';
    boardColumns.replaceChildren();
    colTabs.replaceChildren();
    checkAuthStatus();
  }

  function getAuthHeaders() {
    const headers = {};
    if (inMemoryToken) {
      headers['Authorization'] = `Bearer ${inMemoryToken}`;
    }
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
    return headers;
  }

  async function fetchWithAuth(url, options) {
    const opts = options || {};
    opts.headers = Object.assign({}, getAuthHeaders(), opts.headers || {});
    const res = await fetch(url, opts);
    if (res.status === 401) {
      inMemoryToken = null;
      let errMsg = 'Authentication required (401).';
      try {
        const d = await res.clone().json();
        if (d && d.error) {
          errMsg = d.error;
        }
      } catch (_) {}
      checkAuthStatus();
      if (authErrorMsg) {
        authErrorMsg.textContent = errMsg;
        authErrorMsg.classList.remove('hidden');
      }
    }
    return res;
  }

  async function fetchBoards() {
    try {
      const res = await fetchWithAuth('/api/boards');
      if (res.status === 401) {
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch boards');
      const data = await res.json();
      state.boards = data.boards || [];
      renderBoardSelector();

      if (state.boards.length > 0) {
        const initial = state.boards.find((b) => b.available) || state.boards[0];
        state.currentBoardSlug = initial.slug;
        boardSelect.value = initial.slug;
        fetchBoardData(initial.slug);
      }
    } catch (err) {
      boardSubtitle.textContent = 'Error loading boards: ' + err.message;
    }
  }

  function renderBoardSelector() {
    boardSelect.replaceChildren();
    state.boards.forEach((board) => {
      const opt = document.createElement('option');
      opt.value = board.slug;
      opt.textContent = `${board.label} (${board.total || 0})`;
      boardSelect.appendChild(opt);
    });
  }

  async function fetchBoardData(slug) {
    try {
      boardSubtitle.textContent = 'Loading tasks...';
      const [tasksRes, assigneesRes] = await Promise.all([
        fetchWithAuth(`/api/boards/${slug}/tasks?limit=100`),
        fetchWithAuth(`/api/boards/${slug}/assignees`)
      ]);

      if (!tasksRes.ok) throw new Error('Failed to load tasks');
      const tasksData = await tasksRes.json();
      const assigneesData = assigneesRes.ok ? await assigneesRes.json() : { assignees: [] };

      state.tasks = tasksData.tasks || [];
      state.assignees = assigneesData.assignees || [];

      const currentBoard = state.boards.find((b) => b.slug === slug);
      boardTitle.textContent = currentBoard ? currentBoard.label : slug;
      boardSubtitle.textContent = `Total: ${tasksData.total} tasks · Live read-only mode`;

      renderAssigneeFilter();
      renderBoard();
    } catch (err) {
      boardSubtitle.textContent = 'Error: ' + err.message;
    }
  }

  function renderAssigneeFilter() {
    assigneeFilter.replaceChildren();
    const allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = 'All Assignees';
    assigneeFilter.appendChild(allOpt);

    state.assignees.forEach((ass) => {
      const opt = document.createElement('option');
      opt.value = ass;
      opt.textContent = ass;
      assigneeFilter.appendChild(opt);
    });
    assigneeFilter.value = state.filterAssignee;
  }

  function getFilteredTasks() {
    return state.tasks.filter((task) => {
      if (state.filterAssignee && task.assignee !== state.filterAssignee) {
        return false;
      }
      if (state.filterSearch) {
        const titleMatch = (task.title || '').toLowerCase().includes(state.filterSearch);
        const idMatch = (task.id || '').toLowerCase().includes(state.filterSearch);
        if (!titleMatch && !idMatch) return false;
      }
      return true;
    });
  }

  function renderBoard() {
    const filteredTasks = getFilteredTasks();

    // Group tasks by status
    const grouped = {};
    KNOWN_STATUSES.forEach((s) => {
      grouped[s] = [];
    });

    filteredTasks.forEach((task) => {
      const st = task.status || 'todo';
      if (!grouped[st]) {
        grouped[st] = [];
      }
      grouped[st].push(task);
    });

    const activeStatuses = Object.keys(grouped);

    renderColTabs(activeStatuses, grouped);
    renderColumns(activeStatuses, grouped);
  }

  function renderColTabs(statuses, grouped) {
    colTabs.replaceChildren();
    statuses.forEach((status) => {
      const count = (grouped[status] || []).length;
      const btn = document.createElement('button');
      btn.className = 'col-tab-btn' + (state.activeMobileCol === status ? ' active' : '');
      btn.textContent = `${STATUS_LABELS[status] || status} (${count})`;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', state.activeMobileCol === status ? 'true' : 'false');
      btn.addEventListener('click', () => {
        state.activeMobileCol = status;
        renderBoard();
      });
      colTabs.appendChild(btn);
    });
  }

  function renderColumns(statuses, grouped) {
    boardColumns.replaceChildren();

    statuses.forEach((status) => {
      const tasks = grouped[status] || [];
      const col = document.createElement('section');
      col.className = 'kanban-col' + (state.activeMobileCol === status ? ' active-mobile' : '');
      col.setAttribute('aria-label', STATUS_LABELS[status] || status);

      // Column Header
      const header = document.createElement('header');
      header.className = 'col-header';

      const titleGroup = document.createElement('div');
      titleGroup.className = 'col-title-group';

      const dot = document.createElement('span');
      dot.className = 'col-dot ' + status;

      const h3 = document.createElement('h3');
      h3.textContent = STATUS_LABELS[status] || status;

      titleGroup.appendChild(dot);
      titleGroup.appendChild(h3);

      const countBadge = document.createElement('span');
      countBadge.className = 'badge-count';
      countBadge.textContent = String(tasks.length);

      header.appendChild(titleGroup);
      header.appendChild(countBadge);
      col.appendChild(header);

      // Tasks List
      const list = document.createElement('div');
      list.className = 'col-tasks-list';

      if (tasks.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'col-empty';
        empty.textContent = 'No tasks in this column';
        list.appendChild(empty);
      } else {
        tasks.forEach((task) => {
          list.appendChild(createTaskCard(task));
        });
      }

      col.appendChild(list);
      boardColumns.appendChild(col);
    });
  }

  function createTaskCard(task) {
    const card = document.createElement('article');
    card.className = 'task-card';
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Task ${task.id}: ${task.title}`);

    // Card Top: ID and Priority
    const top = document.createElement('div');
    top.className = 'card-top';

    const idSpan = document.createElement('span');
    idSpan.className = 'card-id';
    idSpan.textContent = task.id;

    const prioSpan = document.createElement('span');
    prioSpan.className = 'card-priority';
    prioSpan.textContent = `P${task.priority ?? 5}`;

    top.appendChild(idSpan);
    top.appendChild(prioSpan);
    card.appendChild(top);

    // Card Title (SAFE DOM: textContent strictly prevents XSS)
    const titleEl = document.createElement('h4');
    titleEl.className = 'card-title';
    titleEl.textContent = task.title || '(Untitled Task)';
    card.appendChild(titleEl);

    // Card Bottom: Assignee and Block Info
    const bottom = document.createElement('div');
    bottom.className = 'card-bottom';

    const assigneeEl = document.createElement('span');
    assigneeEl.className = 'card-assignee' + (!task.assignee ? ' unassigned' : '');
    assigneeEl.textContent = task.assignee || 'unassigned';
    bottom.appendChild(assigneeEl);

    if (task.status === 'blocked' && task.block_kind) {
      const blockEl = document.createElement('span');
      blockEl.className = 'card-block';
      blockEl.textContent = `Blocked: ${task.block_kind}`;
      bottom.appendChild(blockEl);
    }

    card.appendChild(bottom);

    // Event handlers
    card.addEventListener('click', () => openTaskDetail(task.id));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openTaskDetail(task.id);
      }
    });

    return card;
  }

  async function openTaskDetail(taskId) {
    state.selectedTaskId = taskId;
    taskDrawer.classList.remove('hidden');
    drawerTitle.textContent = `Task ${taskId}`;
    drawerBody.replaceChildren();

    const loading = document.createElement('p');
    loading.textContent = 'Loading task details...';
    drawerBody.appendChild(loading);

    try {
      const res = await fetchWithAuth(`/api/boards/${state.currentBoardSlug}/tasks/${taskId}`);
      if (!res.ok) throw new Error('Failed to load task details');
      const task = await res.json();
      renderDrawerContent(task);
    } catch (err) {
      drawerBody.replaceChildren();
      const errEl = document.createElement('p');
      errEl.className = 'error';
      errEl.textContent = 'Error: ' + err.message;
      drawerBody.appendChild(errEl);
    }
  }

  function renderDrawerContent(task) {
    drawerBody.replaceChildren();

    // Title Section
    const titleSec = document.createElement('div');
    titleSec.className = 'detail-section';
    const h3 = document.createElement('h3');
    h3.textContent = task.title || '(Untitled Task)';
    titleSec.appendChild(h3);
    drawerBody.appendChild(titleSec);

    // Metadata Grid
    const metaGrid = document.createElement('div');
    metaGrid.className = 'detail-meta-grid';

    addMetaItem(metaGrid, 'Status', task.status);
    addMetaItem(metaGrid, 'Assignee', task.assignee || 'None');
    addMetaItem(metaGrid, 'Priority', `P${task.priority ?? 5}`);
    addMetaItem(metaGrid, 'Block Kind', task.block_kind || 'None');
    addMetaItem(metaGrid, 'Created At', formatTimestamp(task.created_at));
    addMetaItem(metaGrid, 'Completed At', formatTimestamp(task.completed_at));

    drawerBody.appendChild(metaGrid);

    // Runs Section
    const runsSec = document.createElement('div');
    runsSec.className = 'detail-section';
    const runsH4 = document.createElement('h4');
    runsH4.textContent = `Runs History (${task.runs ? task.runs.length : 0})`;
    runsSec.appendChild(runsH4);

    if (task.runs && task.runs.length > 0) {
      const table = document.createElement('table');
      table.className = 'table-list';

      const thead = document.createElement('thead');
      const trHead = document.createElement('tr');
      ['Run ID', 'Profile', 'Status', 'Duration'].forEach((label) => {
        const th = document.createElement('th');
        th.textContent = label;
        trHead.appendChild(th);
      });
      thead.appendChild(trHead);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      task.runs.forEach((run) => {
        const tr = document.createElement('tr');

        const tdId = document.createElement('td');
        tdId.textContent = String(run.id);

        const tdProf = document.createElement('td');
        tdProf.textContent = run.profile || '-';

        const tdStatus = document.createElement('td');
        tdStatus.textContent = run.status || '-';

        const tdDur = document.createElement('td');
        tdDur.textContent = run.duration_s != null ? `${run.duration_s}s` : '-';

        tr.appendChild(tdId);
        tr.appendChild(tdProf);
        tr.appendChild(tdStatus);
        tr.appendChild(tdDur);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      runsSec.appendChild(table);
    } else {
      const noneP = document.createElement('p');
      noneP.textContent = 'No runs recorded.';
      runsSec.appendChild(noneP);
    }
    drawerBody.appendChild(runsSec);

    // Timeline / Events Section
    const eventsSec = document.createElement('div');
    eventsSec.className = 'detail-section';
    const eventsH4 = document.createElement('h4');
    eventsH4.textContent = `Event Timeline (${task.events ? task.events.length : 0})`;
    eventsSec.appendChild(eventsH4);

    if (task.events && task.events.length > 0) {
      const tList = document.createElement('div');
      tList.className = 'timeline-list';
      task.events.forEach((ev) => {
        const item = document.createElement('div');
        item.className = 'timeline-item';

        const kind = document.createElement('span');
        kind.textContent = ev.kind;

        const time = document.createElement('span');
        time.textContent = formatTimestamp(ev.created_at);

        item.appendChild(kind);
        item.appendChild(time);
        tList.appendChild(item);
      });
      eventsSec.appendChild(tList);
    } else {
      const noneEv = document.createElement('p');
      noneEv.textContent = 'No events recorded.';
      eventsSec.appendChild(noneEv);
    }
    drawerBody.appendChild(eventsSec);
  }

  function addMetaItem(container, label, value) {
    const item = document.createElement('div');
    item.className = 'meta-item';

    const lbl = document.createElement('span');
    lbl.className = 'meta-label';
    lbl.textContent = label;

    const val = document.createElement('span');
    val.className = 'meta-val';
    val.textContent = String(value);

    item.appendChild(lbl);
    item.appendChild(val);
    container.appendChild(item);
  }

  function formatTimestamp(ts) {
    if (!ts) return '-';
    try {
      const d = new Date(ts > 1e11 ? ts : ts * 1000);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return String(ts);
    }
  }

  function closeDrawer() {
    taskDrawer.classList.add('hidden');
    state.selectedTaskId = null;
  }

  // Initialize once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
