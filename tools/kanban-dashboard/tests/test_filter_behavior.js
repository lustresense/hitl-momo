const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// Simple DOM element mock
class MockElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.className = '';
    this.classList = {
      _classes: new Set(),
      add: (...cls) => cls.forEach(c => this.classList._classes.add(c)),
      remove: (...cls) => cls.forEach(c => this.classList._classes.delete(c)),
      contains: (c) => this.classList._classes.has(c),
      toggle: (c, force) => {
        if (force === true) {
          this.classList._classes.add(c);
          return true;
        } else if (force === false) {
          this.classList._classes.delete(c);
          return false;
        }
        if (this.classList._classes.has(c)) {
          this.classList._classes.delete(c);
          return false;
        } else {
          this.classList._classes.add(c);
          return true;
        }
      }
    };
    this.children = [];
    this.attributes = {};
    this.textContent = '';
    this.value = '';
    this.checked = false;
    this.type = '';
    this.id = '';
    this.name = '';
    this.eventListeners = {};
  }

  setAttribute(k, v) {
    this.attributes[k] = String(v);
  }

  getAttribute(k) {
    return this.attributes[k] || null;
  }

  removeAttribute(k) {
    delete this.attributes[k];
  }

  appendChild(el) {
    this.children.push(el);
    return el;
  }

  replaceChildren(...els) {
    this.children = els.slice();
  }

  contains(child) {
    if (child === this) return true;
    for (const ch of this.children) {
      if (ch.contains(child)) return true;
    }
    return false;
  }

  addEventListener(event, fn) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(fn);
  }

  dispatchEvent(event) {
    if (!event.stopPropagation) event.stopPropagation = () => {};
    if (!event.preventDefault) event.preventDefault = () => {};
    const fns = this.eventListeners[event.type] || [];
    fns.forEach(fn => fn(event));
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this, stopPropagation: () => {} });
  }

  focus() {}

  querySelector(selector) {
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.className.includes(cls) || this.classList.contains(cls)) return this;
      for (const ch of this.children) {
        const found = ch.querySelector(selector);
        if (found) return found;
      }
    } else if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.id === id) return this;
      for (const ch of this.children) {
        const found = ch.querySelector(selector);
        if (found) return found;
      }
    } else if (selector.startsWith('input[')) {
      if (this.tagName === 'INPUT') return this;
      for (const ch of this.children) {
        const found = ch.querySelector(selector);
        if (found) return found;
      }
    } else {
      if (this.tagName === selector.toUpperCase()) return this;
      for (const ch of this.children) {
        const found = ch.querySelector(selector);
        if (found) return found;
      }
    }
    return null;
  }

  querySelectorAll(selector) {
    const res = [];
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.className.includes(cls) || this.classList.contains(cls)) res.push(this);
    } else if (selector.startsWith('input')) {
      if (this.tagName === 'INPUT') res.push(this);
    } else if (this.tagName === selector.toUpperCase()) {
      res.push(this);
    }
    for (const ch of this.children) {
      res.push(...ch.querySelectorAll(selector));
    }
    return res;
  }
}

const elementsById = {
  'board-select': new MockElement('select'),
  'board-title': new MockElement('h1'),
  'board-subtitle': new MockElement('p'),
  'refresh-btn': new MockElement('button'),
  'assignee-filter': new MockElement('select'),
  'search-input': new MockElement('input'),
  'col-tabs': new MockElement('nav'),
  'board-columns': new MockElement('section'),
  'status-filter-btn': new MockElement('button'),
  'status-filter-popover': new MockElement('div'),
  'status-filter-badge': new MockElement('span'),
  'task-drawer': new MockElement('div'),
  'drawer-overlay': new MockElement('div'),
  'drawer-close': new MockElement('button'),
  'drawer-title': new MockElement('h2'),
  'drawer-body': new MockElement('div'),
  'auth-modal': new MockElement('div'),
  'auth-modal-title': new MockElement('h2'),
  'auth-modal-desc': new MockElement('p'),
  'auth-form': new MockElement('form'),
  'auth-token-input': new MockElement('input'),
  'auth-password-label': new MockElement('label'),
  'auth-confirm-group': new MockElement('div'),
  'auth-confirm-input': new MockElement('input'),
  'auth-token-submit': new MockElement('button'),
  'auth-error-msg': new MockElement('div'),
  'auth-logout-btn': new MockElement('button')
};

// Set IDs
for (const [id, el] of Object.entries(elementsById)) {
  el.id = id;
}
elementsById['status-filter-popover'].classList.add('hidden');
elementsById['task-drawer'].classList.add('hidden');
elementsById['auth-modal'].classList.add('hidden');

const windowListeners = {};
const mockWindow = {
  addEventListener: (ev, fn) => {
    if (!windowListeners[ev]) windowListeners[ev] = [];
    windowListeners[ev].push(fn);
  },
  dispatchEvent: (ev) => {
    const fns = windowListeners[ev.type] || [];
    fns.forEach(f => f(ev));
  }
};

const mockDocument = {
  readyState: 'complete',
  addEventListener: (ev, fn) => {
    mockWindow.addEventListener(ev, fn);
  },
  getElementById: (id) => elementsById[id] || new MockElement('div'),
  createElement: (tag) => new MockElement(tag)
};
mockWindow.document = mockDocument;

const sampleTasks = [
  { id: 't-1', title: 'Task in Todo 1', status: 'todo', assignee: 'dadang' },
  { id: 't-2', title: 'Task in Todo 2', status: 'todo', assignee: 'ujang' },
  { id: 't-3', title: 'Task in Ready', status: 'ready', assignee: 'dadang' },
  { id: 't-4', title: 'Task in Running', status: 'running', assignee: 'udin' },
  { id: 't-5', title: 'Task in Done', status: 'done', assignee: 'dadang' },
  { id: 't-6', title: 'Task in Blocked', status: 'blocked', assignee: 'ujang' }
];

const mockFetch = (url) => {
  if (url.includes('/api/auth/status')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ authenticated: true, setup_required: false, csrf_token: 'test-csrf' })
    });
  }
  if (url.includes('/api/boards') && !url.includes('/tasks') && !url.includes('/assignees')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        boards: [{ slug: 'default', label: 'Default Board', available: true, total: 6 }]
      })
    });
  }
  if (url.includes('/tasks')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        total: sampleTasks.length,
        tasks: sampleTasks
      })
    });
  }
  if (url.includes('/assignees')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ assignees: ['dadang', 'ujang', 'udin'] })
    });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
};

const context = {
  document: mockDocument,
  window: mockWindow,
  fetch: mockFetch,
  console: console,
  Set: Set,
  Promise: Promise,
  Object: Object,
  Array: Array,
  String: String,
  JSON: JSON,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout
};

const appJsPath = path.join(__dirname, '../static/app.js');
const appJsCode = fs.readFileSync(appJsPath, 'utf8');

vm.createContext(context);
try {
  vm.runInContext(appJsCode, context);
} catch (err) {
  console.error('Error executing app.js:', err);
  process.exit(1);
}

// Verification tests after async fetch completion
setTimeout(() => {
  try {
    const filterBtn = elementsById['status-filter-btn'];
    const filterPopover = elementsById['status-filter-popover'];
    const boardColumns = elementsById['board-columns'];
    const filterBadge = elementsById['status-filter-badge'];

    // 1. Accessibility attributes on Filter button
    assert.ok(filterBtn, 'Filter button must exist');
    assert.strictEqual(filterBtn.getAttribute('aria-expanded'), 'false', 'Filter button initial aria-expanded must be false');
    assert.strictEqual(filterBtn.getAttribute('aria-controls'), 'status-filter-popover', 'Filter button must control status-filter-popover');
    assert.strictEqual(filterBtn.getAttribute('aria-haspopup'), 'true', 'Filter button aria-haspopup must be true');

    // 2. Popover initially closed
    assert.ok(filterPopover.classList.contains('hidden'), 'Popover must be initially hidden');

    // 3. Open popover on click
    filterBtn.click();
    assert.strictEqual(filterBtn.getAttribute('aria-expanded'), 'true', 'aria-expanded must be true when opened');
    assert.strictEqual(filterPopover.classList.contains('hidden'), false, 'Popover must not have hidden class when open');

    // 4. Close popover on Escape key
    mockWindow.dispatchEvent({ type: 'keydown', key: 'Escape' });
    assert.strictEqual(filterBtn.getAttribute('aria-expanded'), 'false', 'aria-expanded must be false after Escape');
    assert.strictEqual(filterPopover.classList.contains('hidden'), true, 'Popover must be hidden after Escape');

    // 5. Checkboxes inside popover
    filterBtn.click(); // Re-open
    const checkboxes = filterPopover.querySelectorAll('input');
    assert.ok(checkboxes.length >= 6, `Expected at least 6 status checkboxes, found ${checkboxes.length}`);
    checkboxes.forEach(cb => {
      assert.strictEqual(cb.checked, true, `Status checkbox ${cb.value} must default to checked`);
    });

    // Initial columns rendered (all 6 statuses)
    let renderedCols = boardColumns.querySelectorAll('.kanban-col');
    assert.strictEqual(renderedCols.length, 6, `Expected 6 columns initially, got ${renderedCols.length}`);
    assert.strictEqual(filterBadge.textContent, '6', 'Badge count should show 6 active status filters');

    // 6. Test "To Do only" quick action
    const todoOnlyBtn = filterPopover.querySelector('#status-filter-todo-btn') ||
                        filterPopover.querySelectorAll('button').find(b => b.textContent.includes('To Do'));
    assert.ok(todoOnlyBtn, 'To Do only button must exist in popover');
    todoOnlyBtn.click();

    renderedCols = boardColumns.querySelectorAll('.kanban-col');
    assert.strictEqual(renderedCols.length, 1, `Expected only 1 column (To Do) after clicking To Do only, got ${renderedCols.length}`);
    assert.strictEqual(renderedCols[0].getAttribute('aria-label'), 'To Do', 'Rendered column must be To Do');
    assert.strictEqual(filterBadge.textContent, '1', 'Badge count should show 1 active status filter');

    // Checkbox states after To Do only
    const freshCheckboxes = filterPopover.querySelectorAll('input');
    freshCheckboxes.forEach(cb => {
      if (cb.value === 'todo') {
        assert.strictEqual(cb.checked, true, 'todo checkbox should be checked');
      } else {
        assert.strictEqual(cb.checked, false, `${cb.value} checkbox should be unchecked`);
      }
    });

    // 7. Test multi-selection: re-check "ready"
    const readyCb = freshCheckboxes.find(cb => cb.value === 'ready');
    assert.ok(readyCb, 'Ready checkbox must exist');
    readyCb.checked = true;
    readyCb.dispatchEvent({ type: 'change', target: readyCb });

    renderedCols = boardColumns.querySelectorAll('.kanban-col');
    assert.strictEqual(renderedCols.length, 2, `Expected 2 columns (To Do and Ready), got ${renderedCols.length}`);
    assert.strictEqual(filterBadge.textContent, '2', 'Badge count should show 2 active status filters');

    // 8. Test "Clear" action (zero statuses selected)
    const clearBtn = filterPopover.querySelector('#status-filter-clear-btn') ||
                     filterPopover.querySelectorAll('button').find(b => b.textContent.includes('Clear'));
    assert.ok(clearBtn, 'Clear button must exist');
    clearBtn.click();

    renderedCols = boardColumns.querySelectorAll('.kanban-col');
    assert.strictEqual(renderedCols.length, 0, 'No kanban-col should be rendered when zero statuses are selected');
    const emptyState = boardColumns.querySelector('.empty-filter-state');
    assert.ok(emptyState, 'Zero selected statuses must show a clear empty-filter-state, not silently reset');
    assert.strictEqual(filterBadge.textContent, '0', 'Badge count should show 0');

    // 9. Test "All" action
    const allBtn = filterPopover.querySelector('#status-filter-all-btn') ||
                   filterPopover.querySelectorAll('button').find(b => b.textContent.includes('All'));
    assert.ok(allBtn, 'All button must exist');
    allBtn.click();

    renderedCols = boardColumns.querySelectorAll('.kanban-col');
    assert.strictEqual(renderedCols.length, 6, `Expected all 6 columns restored after All clicked, got ${renderedCols.length}`);
    assert.strictEqual(filterBadge.textContent, '6', 'Badge count should show 6 after All clicked');

    // 10. Mobile column collapse interaction
    const toggleBtns = boardColumns.querySelectorAll('.col-toggle-btn');
    assert.ok(toggleBtns.length >= 6, 'Each column must have a col-toggle-btn');
    const firstCol = renderedCols[0];
    const firstToggle = toggleBtns[0];

    // Collapse first column
    firstToggle.click();
    assert.strictEqual(firstCol.classList.contains('is-collapsed'), true, 'First column should be collapsed');

    // Now filter to To Do only (which is the first column)
    todoOnlyBtn.click();
    renderedCols = boardColumns.querySelectorAll('.kanban-col');
    assert.strictEqual(renderedCols.length, 1);
    assert.strictEqual(renderedCols[0].classList.contains('is-collapsed'), true, 'Collapsed state must be preserved across filter changes');

    // Restore all
    allBtn.click();

    console.log('PASS: All status filter behavior tests passed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('FAIL:', err.message);
    process.exit(1);
  }
}, 50);
