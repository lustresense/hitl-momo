const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const STATIC_DIR = path.resolve(__dirname, '../static');

// Mock data
const mockTasks = [
  {
    id: 't_001',
    title: 'Task with very long title that might overflow if text-wrap or word-break is not handled properly on narrow screens',
    status: 'todo',
    priority: 1,
    assignee: 'dadang',
    tags: ['ui', 'frontend', 'mobile-responsive']
  },
  {
    id: 't_002',
    title: 'Second task in ready column with superlongunbrokenstringlikeanextremelylongurlorhashvalue12345678901234567890',
    status: 'ready',
    priority: 2,
    assignee: 'udin',
    tags: ['backend', 'api']
  },
  {
    id: 't_003',
    title: 'Running worker task',
    status: 'running',
    priority: 3,
    assignee: 'ujang',
    tags: ['review']
  },
  {
    id: 't_004',
    title: 'Completed task with normal text',
    status: 'done',
    priority: 0,
    assignee: 'dadang',
    tags: []
  }
];

const mockDetail = {
  id: 't_001',
  title: 'Task with very long title that might overflow if text-wrap or word-break is not handled properly on narrow screens',
  status: 'todo',
  priority: 1,
  assignee: 'dadang',
  created_at: '2026-10-12T10:00:00Z',
  updated_at: '2026-10-12T10:30:00Z',
  body: 'This is a long description with some long word like https://example.com/very/long/url/path/that/could/overflow/if/not/broken',
  runs: [
    { id: 101, profile: 'worker-profile-with-long-name', status: 'completed', duration_s: 125 },
    { id: 102, profile: 'evaluator', status: 'failed', duration_s: 42 }
  ],
  parents: ['t_000_parent_task_with_somewhat_long_id'],
  children: ['t_002_child_task_with_somewhat_long_id']
};

const mockBoards = [
  { slug: 'default', label: 'Default Board With Very Long Name In Selector', available: true, total: 4 }
];

function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;

    if (pathname === '/' || pathname === '/index.html') {
      const content = fs.readFileSync(path.join(STATIC_DIR, 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(content);
    }

    if (pathname.startsWith('/static/')) {
      const rel = pathname.slice('/static/'.length);
      const filePath = path.join(STATIC_DIR, rel);
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath);
        const mime = ext === '.css' ? 'text/css' : ext === '.js' ? 'application/javascript' : 'text/plain';
        res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` });
        return res.end(fs.readFileSync(filePath));
      }
    }

    if (pathname === '/api/auth/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ authenticated: true, setup_required: false, csrf_token: 'dummy-csrf' }));
    }

    if (pathname === '/api/boards') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ boards: mockBoards }));
    }

    if (pathname.startsWith('/api/boards/') && pathname.includes('/tasks/t_001')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ task: mockDetail }));
    }

    if (pathname.startsWith('/api/boards/') && pathname.includes('/tasks')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ tasks: mockTasks, total: mockTasks.length, board: 'default' }));
    }

    if (pathname.startsWith('/api/boards/') && pathname.includes('/assignees')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ assignees: ['dadang', 'udin', 'ujang'] }));
    }

    res.writeHead(404);
    res.end('Not found');
  });
}

function resolveChromiumPath() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    '/home/agentops/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
    '/home/agentops/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function loadPlaywright() {
  const candidateModules = [
    'playwright',
    '/home/agentops/.hermes/hermes-agent/node_modules/playwright'
  ];
  for (const mod of candidateModules) {
    try {
      return require(mod);
    } catch (_) {}
  }
  throw new Error('Playwright not found in available paths');
}

async function runTests() {
  const { chromium } = loadPlaywright();
  const execPath = resolveChromiumPath();
  const launchOpts = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  };
  if (execPath) {
    launchOpts.executablePath = execPath;
  }

  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();

  console.log(`Starting responsive viewport verification on port ${port}...`);

  const viewports = [320, 360, 390];

  for (const width of viewports) {
    console.log(`\n--- Testing viewport width: ${width}px ---`);
    await page.setViewportSize({ width, height: 750 });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.kanban-col');

    // 1. Initial layout overflow check
    const initialLayout = await page.evaluate(() => {
      const docEl = document.documentElement;
      const all = document.querySelectorAll('*');
      const overflowing = [];
      for (const el of all) {
        if (['STYLE', 'SCRIPT', 'HEAD'].includes(el.tagName)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.right > window.innerWidth + 0.5) {
          overflowing.push({
            tag: el.tagName,
            cls: el.className,
            right: Math.round(rect.right),
            windowWidth: window.innerWidth
          });
        }
      }
      return {
        clientWidth: docEl.clientWidth,
        scrollWidth: docEl.scrollWidth,
        overflowing
      };
    });

    assert.strictEqual(
      initialLayout.clientWidth,
      width,
      `clientWidth (${initialLayout.clientWidth}) must match viewport width (${width})`
    );
    assert.ok(
      initialLayout.scrollWidth <= initialLayout.clientWidth,
      `scrollWidth (${initialLayout.scrollWidth}) must be <= clientWidth (${initialLayout.clientWidth}) at ${width}px`
    );
    assert.strictEqual(
      initialLayout.overflowing.length,
      0,
      `No elements should overflow viewport at ${width}px: ${JSON.stringify(initialLayout.overflowing)}`
    );
    console.log(`[PASS] Initial layout: scrollWidth=${initialLayout.scrollWidth}px, clientWidth=${initialLayout.clientWidth}px (no overflow)`);

    // 2. Column collapse and expand verification
    const todoCol = page.locator('.kanban-col').first();
    const todoToggleBtn = todoCol.locator('.col-toggle-btn');
    const todoTasksList = todoCol.locator('.col-tasks-list');

    // Touch target size check
    const btnBox = await todoToggleBtn.boundingBox();
    assert.ok(btnBox, 'Toggle button must have a bounding box');
    assert.ok(btnBox.width >= 30, `Toggle button width (${btnBox.width}px) must be >= 30px for touch comfort`);
    assert.ok(btnBox.height >= 30, `Toggle button height (${btnBox.height}px) must be >= 30px for touch comfort`);
    console.log(`[PASS] Toggle button touch target: ${btnBox.width}x${btnBox.height}px`);

    // Check collapse action
    await todoToggleBtn.click();
    await page.waitForTimeout(50);

    const isCollapsedClass = await todoCol.evaluate((el) => el.classList.contains('is-collapsed'));
    const ariaExpandedCollapsed = await todoToggleBtn.getAttribute('aria-expanded');
    const listDisplayCollapsed = await todoTasksList.evaluate((el) => window.getComputedStyle(el).display);

    assert.strictEqual(isCollapsedClass, true, 'Column must have is-collapsed class after click');
    assert.strictEqual(ariaExpandedCollapsed, 'false', 'aria-expanded must be "false" when collapsed');
    assert.strictEqual(listDisplayCollapsed, 'none', 'col-tasks-list must have display: none when collapsed');

    const collapsedLayout = await page.evaluate(() => {
      const doc = document.documentElement;
      return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
    });
    assert.ok(
      collapsedLayout.scrollWidth <= collapsedLayout.clientWidth,
      `scrollWidth <= clientWidth while column is collapsed at ${width}px`
    );
    console.log(`[PASS] Collapsed state: aria-expanded=false, display=none, scrollWidth=${collapsedLayout.scrollWidth}px`);

    // Check expand action
    await todoToggleBtn.click();
    await page.waitForTimeout(50);

    const isExpandedClass = await todoCol.evaluate((el) => !el.classList.contains('is-collapsed'));
    const ariaExpandedAfter = await todoToggleBtn.getAttribute('aria-expanded');
    const listDisplayExpanded = await todoTasksList.evaluate((el) => window.getComputedStyle(el).display);

    assert.strictEqual(isExpandedClass, true, 'Column must remove is-collapsed class after re-click');
    assert.strictEqual(ariaExpandedAfter, 'true', 'aria-expanded must be "true" when expanded');
    assert.notStrictEqual(listDisplayExpanded, 'none', 'col-tasks-list must be visible when expanded');

    const expandedLayout = await page.evaluate(() => {
      const doc = document.documentElement;
      return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
    });
    assert.ok(
      expandedLayout.scrollWidth <= expandedLayout.clientWidth,
      `scrollWidth <= clientWidth while column is re-expanded at ${width}px`
    );
    console.log(`[PASS] Re-expanded state: aria-expanded=true, display=${listDisplayExpanded}, scrollWidth=${expandedLayout.scrollWidth}px`);

    // 3. Unclipped layout measurement check (proves layout does NOT rely on overflow-x:hidden clipping)
    const unclippedCheck = await page.evaluate(() => {
      const style = document.createElement('style');
      style.id = '__unclipped_test_style__';
      style.textContent = `
        html, body, #app, .board-container, .columns-grid {
          overflow-x: visible !important;
        }
      `;
      document.head.appendChild(style);

      const docEl = document.documentElement;
      const all = document.querySelectorAll('*');
      const overflowing = [];
      for (const el of all) {
        if (['STYLE', 'SCRIPT', 'HEAD'].includes(el.tagName)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.right > window.innerWidth + 0.5) {
          overflowing.push({
            tag: el.tagName,
            cls: el.className,
            right: Math.round(rect.right),
            windowWidth: window.innerWidth
          });
        }
      }
      const res = {
        clientWidth: docEl.clientWidth,
        scrollWidth: docEl.scrollWidth,
        overflowing
      };
      style.remove();
      return res;
    });

    assert.ok(
      unclippedCheck.scrollWidth <= unclippedCheck.clientWidth,
      `Unclipped layout scrollWidth (${unclippedCheck.scrollWidth}) must be <= clientWidth (${unclippedCheck.clientWidth}) at ${width}px`
    );
    assert.strictEqual(
      unclippedCheck.overflowing.length,
      0,
      `Layout elements must fit within ${width}px even with overflow-x: visible forced: ${JSON.stringify(unclippedCheck.overflowing)}`
    );
    console.log(`[PASS] Unclipped layout check: scrollWidth=${unclippedCheck.scrollWidth}px <= clientWidth=${unclippedCheck.clientWidth}px (no clipping reliance)`);

    // 4. Task Drawer Detail layout check
    const taskCard = page.locator('.task-card').first();
    await taskCard.click();
    await page.waitForSelector('.detail-section');

    const drawerLayout = await page.evaluate(() => {
      const drawer = document.getElementById('task-drawer');
      const drawerContent = drawer.querySelector('.drawer-content');
      const docEl = document.documentElement;
      return {
        docScrollWidth: docEl.scrollWidth,
        docClientWidth: docEl.clientWidth,
        drawerScrollWidth: drawerContent.scrollWidth,
        drawerClientWidth: drawerContent.clientWidth
      };
    });

    assert.ok(
      drawerLayout.docScrollWidth <= drawerLayout.docClientWidth,
      `Doc scrollWidth <= clientWidth with drawer open at ${width}px`
    );
    assert.ok(
      drawerLayout.drawerScrollWidth <= drawerLayout.drawerClientWidth,
      `Drawer content scrollWidth <= clientWidth at ${width}px`
    );
    console.log(`[PASS] Task drawer layout: docScrollWidth=${drawerLayout.docScrollWidth}px, drawerContent=${drawerLayout.drawerScrollWidth}px`);

    // Close drawer
    await page.click('#drawer-close');
    await page.waitForSelector('#task-drawer.hidden', { state: 'attached' });

    // 5. Status Filter popover interaction and layout check
    const filterBtn = page.locator('#status-filter-btn');
    const filterPopover = page.locator('#status-filter-popover');
    await filterBtn.click();
    await page.waitForTimeout(50);

    const isPopoverOpen = await filterPopover.evaluate((el) => !el.classList.contains('hidden'));
    assert.strictEqual(isPopoverOpen, true, 'Status filter popover must be visible after click');

    const popoverLayout = await page.evaluate(() => {
      const docEl = document.documentElement;
      const popover = document.getElementById('status-filter-popover');
      const rect = popover.getBoundingClientRect();
      return {
        docScrollWidth: docEl.scrollWidth,
        docClientWidth: docEl.clientWidth,
        popoverRight: Math.round(rect.right),
        popoverLeft: Math.round(rect.left),
        windowWidth: window.innerWidth
      };
    });

    assert.ok(
      popoverLayout.docScrollWidth <= popoverLayout.docClientWidth,
      `Doc scrollWidth <= clientWidth with filter popover open at ${width}px`
    );
    assert.ok(
      popoverLayout.popoverRight <= popoverLayout.windowWidth + 0.5,
      `Filter popover right (${popoverLayout.popoverRight}) must not exceed window width (${popoverLayout.windowWidth})`
    );
    console.log(`[PASS] Status filter popover layout: docScrollWidth=${popoverLayout.docScrollWidth}px, right=${popoverLayout.popoverRight}px`);

    // Test "To Do only" filter button
    await page.click('#status-filter-todo-btn');
    await page.waitForTimeout(50);
    const colsAfterTodo = await page.locator('.kanban-col').count();
    assert.strictEqual(colsAfterTodo, 1, `Expected 1 column (To Do) after clicking To Do only, found ${colsAfterTodo}`);

    // Test "All" filter button
    await page.click('#status-filter-all-btn');
    await page.waitForTimeout(50);
    const colsAfterAll = await page.locator('.kanban-col').count();
    assert.strictEqual(colsAfterAll, 6, `Expected 6 columns restored after clicking All, found ${colsAfterAll}`);

    // Close popover via Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);
    const isPopoverClosed = await filterPopover.evaluate((el) => el.classList.contains('hidden'));
    assert.strictEqual(isPopoverClosed, true, 'Status filter popover must be closed after Escape key');
    console.log(`[PASS] Filter actions (To Do only, All, Escape) verified at ${width}px`);
  }

  // 5. Desktop layout check at 1280px
  console.log(`\n--- Testing desktop viewport width: 1280px ---`);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.kanban-col');

  const desktopLayout = await page.evaluate(() => {
    const grid = document.querySelector('.columns-grid');
    const computed = window.getComputedStyle(grid);
    return {
      display: computed.display,
      gridAutoFlow: computed.gridAutoFlow
    };
  });
  assert.strictEqual(desktopLayout.display, 'grid', 'Columns grid must be display: grid on desktop');
  assert.strictEqual(desktopLayout.gridAutoFlow, 'column', 'Columns grid must be horizontal (grid-auto-flow: column) on desktop');
  console.log(`[PASS] Desktop grid layout confirmed: display=grid, grid-auto-flow=${desktopLayout.gridAutoFlow}`);

  await browser.close();
  server.close();
  console.log('\nAll responsive layout, viewport overflow, and column toggle tests PASSED!');
}

runTests().catch((err) => {
  console.error('\n[FAIL] Test error:', err);
  process.exit(1);
});
