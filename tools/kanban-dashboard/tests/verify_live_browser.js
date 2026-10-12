const fs = require("fs");
const assert = require("assert");

function resolveChromiumPath() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    "/home/agentops/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
    "/home/agentops/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium"
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function loadPlaywright() {
  const candidateModules = ["playwright", "/home/agentops/.hermes/hermes-agent/node_modules/playwright"];
  for (const mod of candidateModules) {
    try { return require(mod); } catch (_) {}
  }
  throw new Error("Playwright not found");
}

async function testPublic() {
  const { chromium } = loadPlaywright();
  const execPath = resolveChromiumPath();
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    executablePath: execPath || undefined
  });
  const page = await browser.newPage();
  console.log("Navigating to https://kanban.momominum.tech...");
  const resp = await page.goto("https://kanban.momominum.tech", { waitUntil: "networkidle" });
  assert.strictEqual(resp.status(), 200, "Expected status 200");
  console.log("Status: 200 OK");
  console.log("Title:", await page.title());

  // Check login modal presence
  const authModal = page.locator("#auth-modal");
  const isAuthModalVisible = await authModal.evaluate(el => !el.classList.contains("hidden"));
  console.log("Auth modal visible (login prompt):", isAuthModalVisible);
  assert.strictEqual(isAuthModalVisible, true, "Auth modal should be open on unauthenticated session");

  // Check confirm password group is hidden
  const confirmGroup = page.locator("#auth-confirm-group");
  const isConfirmHidden = await confirmGroup.evaluate(el => el.classList.contains("hidden"));
  assert.strictEqual(isConfirmHidden, true, "Confirm password group must be hidden for Sign In");

  // Check static assets loaded with v=1.2.1
  const styles = await page.evaluate(() => {
    const link = document.querySelector("link[rel=stylesheet]");
    return link ? link.href : null;
  });
  console.log("Stylesheet href:", styles);
  assert.ok(styles && styles.includes("v=1.2.1"), "Stylesheet must carry v=1.2.1 cache buster");

  const scripts = await page.evaluate(() => {
    const s = document.querySelector("script[src]");
    return s ? s.src : null;
  });
  console.log("Script src:", scripts);
  assert.ok(scripts && scripts.includes("v=1.2.1"), "Script must carry v=1.2.1 cache buster");

  // Check filter button in DOM
  const filterBtn = page.locator("#status-filter-btn");
  assert.strictEqual((await filterBtn.count()), 1, "Status filter button must exist in DOM");
  const filterPopover = page.locator("#status-filter-popover");
  assert.strictEqual((await filterPopover.count()), 1, "Status filter popover must exist in DOM");

  // Check responsive layout at 320, 360, 390 viewports
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 740 });
    const docLayout = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth
      };
    });
    console.log(`Viewport ${width}px: scrollWidth=${docLayout.scrollWidth}px, clientWidth=${docLayout.clientWidth}px`);
    assert.strictEqual(docLayout.clientWidth, width, `clientWidth should equal ${width}`);
    assert.ok(docLayout.scrollWidth <= docLayout.clientWidth, `scrollWidth <= clientWidth at ${width}px`);
  }

  // Desktop viewport check at 1280px
  await page.setViewportSize({ width: 1280, height: 800 });
  const desktopLayout = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth
    };
  });
  console.log(`Desktop 1280px: scrollWidth=${desktopLayout.scrollWidth}px, clientWidth=${desktopLayout.clientWidth}px`);
  assert.ok(desktopLayout.scrollWidth <= desktopLayout.clientWidth, "scrollWidth <= clientWidth at 1280px");

  await browser.close();
  console.log("LIVE PUBLIC BROWSER CHECK SUCCESSFUL!");
}

testPublic().catch(e => {
  console.error("FAIL:", e);
  process.exit(1);
});
