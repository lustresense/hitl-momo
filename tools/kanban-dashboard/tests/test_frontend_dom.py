import os
import re
import unittest

STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "static")


class TestFrontendDOMSafety(unittest.TestCase):
    def test_html_structure(self):
        html_path = os.path.join(STATIC_DIR, "index.html")
        self.assertTrue(os.path.exists(html_path))
        with open(html_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Check semantic container elements
        self.assertIn('id="board-select"', content)
        self.assertIn('id="assignee-filter"', content)
        self.assertIn('id="search-input"', content)
        self.assertIn('id="board-columns"', content)
        self.assertIn('id="task-drawer"', content)
        # Login shell authentication prompt elements
        self.assertIn('id="auth-modal"', content)
        self.assertIn('id="auth-token-input"', content)
        self.assertIn('id="auth-confirm-input"', content)
        self.assertIn('id="auth-token-submit"', content)
        self.assertIn('id="auth-error-msg"', content)
        self.assertIn('id="auth-logout-btn"', content)
        self.assertIn('type="password"', content)

    def test_js_no_unsafe_innerhtml_assignments(self):
        js_path = os.path.join(STATIC_DIR, "app.js")
        self.assertTrue(os.path.exists(js_path), "app.js must exist")
        with open(js_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Strict safe DOM: Zero occurrences of innerHTML
        self.assertNotIn("innerHTML", content, "innerHTML is strictly forbidden; use textContent and safe DOM APIs")

        # Ensure textContent or createTextNode is used for rendering text
        self.assertIn(".textContent", content)
        self.assertIn("createElement", content)

    def test_css_tokens_and_theme(self):
        css_path = os.path.join(STATIC_DIR, "style.css")
        self.assertTrue(os.path.exists(css_path), "style.css must exist")
        with open(css_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Verify canoPi dark theme tokens are present
        self.assertIn("--bg-app", content)
        self.assertIn("--bg-panel", content)
        self.assertIn("--accent", content)
        self.assertIn("--border", content)
        self.assertIn("--text", content)

    def test_no_browser_storage_or_url_token_in_frontend(self):
        js_path = os.path.join(STATIC_DIR, "app.js")
        with open(js_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Credentials must NEVER be read from URL or persisted in storage/cookies
        self.assertNotIn("sessionStorage", content, "sessionStorage must not be used for credentials")
        self.assertNotIn("localStorage", content, "localStorage must not be used for credentials")
        self.assertNotIn("document.cookie", content, "document.cookie must not be used")
        self.assertNotIn("location.search", content, "location.search must not be parsed for tokens")
        self.assertNotIn("location.hash", content, "location.hash must not be used for tokens")
        self.assertNotIn("URLSearchParams", content, "URL query parameters must not be parsed for tokens")

    def test_in_memory_token_prompt_and_bearer_header(self):
        js_path = os.path.join(STATIC_DIR, "app.js")
        with open(js_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Must send Authorization: Bearer
        self.assertIn("Authorization", content)
        self.assertIn("Bearer", content)

    def test_auth_endpoints_and_csrf_in_frontend(self):
        js_path = os.path.join(STATIC_DIR, "app.js")
        with open(js_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Auth endpoints invoked
        self.assertIn("/api/auth/status", content)
        self.assertIn("/api/auth/setup", content)
        self.assertIn("/api/auth/login", content)
        self.assertIn("/api/auth/logout", content)
        # CSRF token header sent
        self.assertIn("X-CSRF-Token", content)

    def test_token_absent_from_html_dom(self):
        html_path = os.path.join(STATIC_DIR, "index.html")
        with open(html_path, "r", encoding="utf-8") as f:
            content = f.read()

        # HTML must not embed any tokens or storage scripts
        self.assertNotIn("kanban_token", content)
        self.assertNotIn("sessionStorage", content)
        self.assertNotIn("localStorage", content)

    def test_css_hidden_utility_rules(self):
        css_path = os.path.join(STATIC_DIR, "style.css")
        with open(css_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Must have standalone .hidden rule with display: none !important
        self.assertTrue(
            bool(re.search(r"(?m)^\.hidden\s*\{[^}]*display:\s*none\s*!important", content)),
            "style.css must define a standalone .hidden rule with display: none !important",
        )
        # Must have specific rule ensuring #auth-confirm-group is hidden when .hidden
        self.assertTrue(
            bool(re.search(r"(?m)^\.hidden\s*\{[^}]*display:\s*none\s*!important", content) or
                 re.search(r"#auth-confirm-group\.hidden\s*\{[^}]*display:\s*none", content)),
            "style.css must guarantee that #auth-confirm-group is hidden when .hidden is applied",
        )

    def test_versioned_cache_busting_assets(self):
        html_path = os.path.join(STATIC_DIR, "index.html")
        with open(html_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Static assets must carry version/cache-busting query parameters
        self.assertRegex(content, r'href="/static/style\.css\?v=[^"]+"')
        self.assertRegex(content, r'src="/static/app\.js\?v=[^"]+"')

    def test_login_vs_setup_modal_state_in_js(self):
        js_path = os.path.join(STATIC_DIR, "app.js")
        with open(js_path, "r", encoding="utf-8") as f:
            content = f.read()

        # showLoginModal must hide confirm group and label as Sign In
        self.assertIn("function showLoginModal(", content)
        self.assertIn("authConfirmGroup.classList.add('hidden')", content)
        self.assertIn("authModalTitle.textContent = 'Sign In'", content)
        self.assertIn("authTokenSubmit.textContent = 'Sign In'", content)

        # showSetupModal must reveal confirm group and label as Create Admin Password
        self.assertIn("function showSetupModal(", content)
        self.assertIn("authConfirmGroup.classList.remove('hidden')", content)
        self.assertIn("authModalTitle.textContent = 'Create Admin Password'", content)
        self.assertIn("authTokenSubmit.textContent = 'Set Password'", content)

        # checkAuthStatus routes setup_required to showSetupModal and configured to showLoginModal
        self.assertIn("if (data.setup_required) {", content)
        self.assertIn("showSetupModal();", content)
        self.assertIn("showLoginModal();", content)




if __name__ == "__main__":
    unittest.main()
