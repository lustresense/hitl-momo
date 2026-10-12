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

  addEventListener(event, fn) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(fn);
  }

  dispatchEvent(event) {
    const fns = this.eventListeners[event.type] || [];
    fns.forEach(fn => fn(event));
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this, stopPropagation: () => {} });
  }

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
    }
    return null;
  }

  querySelectorAll(selector) {
    const res = [];
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.className.includes(cls) || this.classList.contains(cls)) res.push(this);
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

const mockDocument = {
  readyState: 'complete',
  addEventListener: () => {},
  getElementById: (id) => elementsById[id] || new MockElement('div'),
  createElement: (tag) => new MockElement(tag)
};

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
        boards: [{ slug: 'default', label: 'Default Board', available: true, total: 2 }]
      })
    });
  }
  if (url.includes('/tasks')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        total: 2,
        tasks: [
          { id: 't-1', title: 'Task in Todo', status: 'todo' },
          { id: 't-2', title: 'Task in Ready', status: 'ready' }
        ]
      })
    });
  }
  if (url.includes('/assignees')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ assignees: ['dadang'] })
    });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
};

const context = {
  document: mockDocument,
  window: {
    addEventListener: () => {},
    document: mockDocument
  },
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

// Wait for async init / fetch calls to populate board
setTimeout(() => {
  const boardColumns = elementsById['board-columns'];
  const cols = boardColumns.querySelectorAll('.kanban-col');
  const toggleBtns = boardColumns.querySelectorAll('.col-toggle-btn');

  assert.ok(cols.length >= 2, `Must render multiple columns. Found: ${cols.length}`);
  assert.ok(toggleBtns.length >= 2, `Must render column toggle buttons. Found: ${toggleBtns.length}`);

  const todoCol = cols[0];
  const readyCol = cols[1];
  const todoBtn = toggleBtns[0];
  const readyBtn = toggleBtns[1];

  // Default: both expanded
  assert.strictEqual(todoBtn.getAttribute('aria-expanded'), 'true', 'Todo default aria-expanded must be true');
  assert.strictEqual(readyBtn.getAttribute('aria-expanded'), 'true', 'Ready default aria-expanded must be true');
  assert.strictEqual(todoCol.classList.contains('is-collapsed'), false, 'Todo column must not be collapsed initially');
  assert.strictEqual(readyCol.classList.contains('is-collapsed'), false, 'Ready column must not be collapsed initially');

  assert.ok(todoBtn.getAttribute('aria-controls'), 'Must have aria-controls set');
  assert.ok(todoBtn.getAttribute('aria-label').startsWith('Collapse'), 'Initial aria-label must start with Collapse');

  // Simulate click on Todo to collapse it
  todoBtn.dispatchEvent({ type: 'click', stopPropagation: () => {} });
  assert.strictEqual(todoBtn.getAttribute('aria-expanded'), 'false', 'Todo aria-expanded must be false after collapse');
  assert.strictEqual(todoCol.classList.contains('is-collapsed'), true, 'Todo column must have is-collapsed class');
  assert.ok(todoBtn.getAttribute('aria-label').startsWith('Expand'), 'Collapsed aria-label must start with Expand');

  // Ready column should still be expanded!
  assert.strictEqual(readyBtn.getAttribute('aria-expanded'), 'true', 'Ready column must remain expanded when Todo is collapsed');
  assert.strictEqual(readyCol.classList.contains('is-collapsed'), false, 'Ready column must not be collapsed');

  // Simulate click to expand Todo again
  todoBtn.dispatchEvent({ type: 'click', stopPropagation: () => {} });
  assert.strictEqual(todoBtn.getAttribute('aria-expanded'), 'true', 'Todo aria-expanded must be true after second click');
  assert.strictEqual(todoCol.classList.contains('is-collapsed'), false, 'Todo column must not be collapsed after second click');
  assert.ok(todoBtn.getAttribute('aria-label').startsWith('Collapse'), 'Expanded aria-label must start with Collapse');

  console.log('PASS: Toggle behavior test passed successfully.');
}, 50);
