"""Optional real-browser acceptance. Install Playwright and its Chromium to run."""

import json
import os
import socket
import threading
import time
from pathlib import Path

import pytest
import uvicorn

from backend.config import Settings
from backend.db import execute
from backend.main import create_app
from backend.security import hash_password, now

playwright = pytest.importorskip("playwright.sync_api")
PASSWORD = "Library synthetic password 2026!"


@pytest.fixture
def library_server(tmp_path):
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    origin = f"http://127.0.0.1:{port}"
    app = create_app(Settings(app_url=origin, data_dir=tmp_path))
    app.state.db.initialize()
    encoded = hash_password(PASSWORD)
    with app.state.db.transaction() as conn:
        for identifier in ("library-a", "library-b"):
            execute(
                conn,
                """INSERT INTO users(id,email,name,password_hash,updated_at,created_at,role,account_status)
                VALUES(?,?,?,?,?,?,'user','approved')""",
                (identifier, identifier + "@example.test", identifier, encoded, now(), now()),
            )
            execute(conn, "INSERT INTO credit_wallets(user_id,balance) VALUES(?,0)", (identifier,))
        for identifier, name in (
            ("tree", "Lote Árvore"),
            ("center", "Lote Centro"),
            ("legacy", "Estudo antigo"),
        ):
            payload = {
                "lot": {"id": identifier, "name": name, "area": 360, "width": 12, "depth": 30},
                "scenario": {
                    "floors": 6,
                    "to": 50,
                    "efficiency": 76,
                    "unitArea": 70,
                    "use": "H3",
                    "price": 8200,
                    "cost": 2700,
                    "landPrice": 2500000,
                    "indirect": 22,
                    "profit": 18,
                },
            }
            execute(
                conn,
                "INSERT INTO studies(user_id,id,payload,updated_at) VALUES(?,?,?,?)",
                ("library-a", identifier, json.dumps(payload), now()),
            )
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error"))
    thread = threading.Thread(target=server.run)
    thread.start()
    try:
        deadline = time.monotonic() + 10
        while not server.started and thread.is_alive() and time.monotonic() < deadline:
            time.sleep(0.01)
        assert server.started
        yield origin
    finally:
        server.should_exit = True
        thread.join(timeout=10)
        assert not thread.is_alive()
        app.state.db.engine.dispose()


def test_library_acceptance_keyboard_mobile_failures_conflict_and_session(library_server):
    with playwright.sync_playwright() as manager:
        executable = os.getenv("PLAYWRIGHT_CHROMIUM_EXECUTABLE")
        browser = manager.chromium.launch(**({"executable_path": executable} if executable else {}))
        context = browser.new_context(viewport={"width": 390, "height": 844})
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        origin = library_server
        headers = {"Origin": origin, "X-Viabileasy-Request": "1"}

        def login(email="library-a@example.test"):
            page.goto(origin)
            page.locator("[data-public-login]").first.click()
            page.locator("#auth-email").fill(email)
            page.locator("#auth-password").fill(PASSWORD)
            page.locator('#auth-form [type="submit"]').press("Enter")
            page.wait_for_selector('body[data-auth="ready"]')
            page.locator('#mobile-dock [data-mobile-destination="projects"]').click()

        def card(identifier):
            return page.locator(f'[data-study-card="{identifier}"]')

        def save():
            page.get_by_role("button", name="Salvar organização", exact=True).press("Enter")
            playwright.expect(page.locator("#library-announcement")).to_have_text("Organização salva.")

        login()
        playwright.expect(page.locator("[data-study-card]")).to_have_count(3)
        card("tree").get_by_role("button", name="Organizar", exact=True).press("Enter")
        form = page.locator("[data-library-form]")
        form.get_by_label("Etapa de acompanhamento").select_option("in_study")
        form.get_by_label("Etiquetas", exact=True).fill("prospecção")
        form.get_by_label("Nota opcional").fill("Nota persistida")
        save()
        card("center").get_by_role("button", name="Organizar", exact=True).press("Enter")
        form.get_by_label("Etapa de acompanhamento").select_option("waiting_information")
        form.get_by_label("Etiquetas", exact=True).fill("documentação")
        save()
        page.get_by_label("Buscar por nome").fill("arvore")
        page.locator('[data-library-filter="stage"]').select_option("in_study")
        page.locator('[data-library-filter="tag"]').select_option("prospeccao")
        playwright.expect(page.locator("[data-study-card]")).to_have_count(1)
        playwright.expect(card("tree")).to_be_visible()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.get_by_label("Buscar por nome").fill("sem correspondência")
        playwright.expect(page.get_by_role("heading", name="Nenhum estudo encontrado.")).to_be_visible()
        page.locator("[data-library-clear]").first.press("Enter")
        page.reload()
        page.wait_for_selector('body[data-auth="ready"]')
        page.locator('#mobile-dock [data-mobile-destination="projects"]').click()
        playwright.expect(card("tree")).to_contain_text("Nota persistida")
        playwright.expect(card("legacy")).to_contain_text("Em triagem")

        card("tree").get_by_role("button", name="Organizar", exact=True).press("Enter")
        form.get_by_label("Nota opcional").fill("Rascunho preservado")

        def fail_write(route):
            if route.request.method == "PUT":
                route.fulfill(status=503, content_type="application/json", body='{"error":"Falha sintética"}')
            else:
                route.continue_()

        page.route("**/api/studies/tree/metadata", fail_write)
        page.get_by_role("button", name="Salvar organização", exact=True).press("Enter")
        playwright.expect(form.locator(".library-feedback")).to_contain_text("Gravação pendente")
        playwright.expect(form.get_by_label("Nota opcional")).to_have_value("Rascunho preservado")
        page.unroute("**/api/studies/tree/metadata", fail_write)
        page.get_by_role("button", name="Tentar novamente", exact=True).press("Enter")
        playwright.expect(page.locator("#library-announcement")).to_have_text("Organização salva.")

        page.locator('[data-library-filter="stage"]').select_option("in_study")
        card("tree").get_by_role("button", name="Organizar", exact=True).press("Enter")
        form.get_by_label("Nota opcional").fill("Proposta local")
        second = browser.new_context()
        assert second.request.post(
            origin + "/api/auth/login",
            headers=headers,
            data={"email": "library-a@example.test", "password": PASSWORD},
        ).ok
        current = second.request.get(origin + "/api/studies/tree/metadata").json()["metadata"]
        assert second.request.put(
            origin + "/api/studies/tree/metadata",
            headers=headers,
            data={
                "expectedRevision": current["revision"],
                "stage": "waiting_information",
                "tags": ["outra sessão"],
                "note": "Proposta remota",
            },
        ).ok
        page.get_by_role("button", name="Salvar organização", exact=True).press("Enter")
        playwright.expect(form.locator(".library-feedback")).to_contain_text("Outra sessão")
        playwright.expect(form.get_by_label("Nota opcional")).to_have_value("Proposta local")
        page.get_by_role("button", name="Carregar revisão atual", exact=True).press("Enter")
        playwright.expect(form.locator(".library-current")).to_contain_text("Proposta remota")
        playwright.expect(form.get_by_label("Nota opcional")).to_have_value("Proposta local")
        playwright.expect(page.locator('[data-library-filter="stage"]')).to_have_value("waiting_information")
        save()
        page.locator("[data-library-clear]").first.press("Enter")
        output = os.getenv("LIBRARY_QA_OUTPUT")
        if output:
            Path(output).mkdir(parents=True, exist_ok=True)
            card("tree").screenshot(path=str(Path(output) / "cptech7-library-390.png"))
            card("tree").get_by_role("button", name="Organizar", exact=True).press("Enter")
            form.screenshot(path=str(Path(output) / "cptech7-editor-390.png"))
            page.get_by_role("button", name="Fechar edição", exact=True).press("Enter")
            page.set_viewport_size({"width": 1280, "height": 960})
            page.get_by_label("Buscar por nome").scroll_into_view_if_needed()
            page.screenshot(path=str(Path(output) / "cptech7-library-desktop.png"), full_page=True)
            page.set_viewport_size({"width": 390, "height": 844})

        card("tree").get_by_role("button", name="Arquivar", exact=True).press("Enter")
        playwright.expect(card("tree")).to_have_count(0)
        page.locator('[data-library-filter="stage"]').select_option("archived")
        playwright.expect(card("tree")).to_contain_text("Proposta local")
        card("tree").get_by_role("button", name="Abrir estudo", exact=False).press("Enter")
        playwright.expect(page.locator("#breadcrumb-current")).to_have_text("Nova análise")
        page.locator('#mobile-dock [data-mobile-destination="projects"]').click()
        card("tree").get_by_role("button", name="Restaurar para triagem", exact=True).press("Enter")
        playwright.expect(card("tree")).to_have_count(0)
        page.locator("[data-library-clear]").first.press("Enter")
        playwright.expect(card("tree")).to_contain_text("Em triagem")
        assert context.request.get(origin + "/api/usage").json()["usage"] == {
            "unlimited": False,
            "balance": 0,
            "used": 0,
        }

        page.locator(".account-topbar").click()
        page.locator("[data-auth-logout]").click()
        page.wait_for_selector('body[data-auth="guest"]')
        login()
        playwright.expect(card("tree")).to_contain_text("Proposta local")
        playwright.expect(card("tree")).to_contain_text("Em triagem")
        page.get_by_label("Buscar por nome").fill("arvore")
        page.locator('[data-library-filter="stage"]').select_option("triage")
        page.locator('[data-library-filter="tag"]').select_option("prospeccao")

        # A delayed response from the old account must not resurrect its editor.
        card("tree").get_by_role("button", name="Organizar", exact=True).press("Enter")
        form.get_by_label("Nota opcional").fill("Privado da conta A", timeout=2000)
        pending = []
        page.route("**/api/studies/tree/metadata", lambda route: pending.append(route))
        page.get_by_role("button", name="Salvar organização", exact=True).press("Enter")
        page.wait_for_timeout(100)
        assert pending
        page.locator(".account-topbar").click()
        page.locator("[data-auth-logout]").click()
        page.wait_for_selector('body[data-auth="guest"]')
        page.locator("[data-public-login]").first.click()
        page.locator("#auth-email").fill("library-b@example.test")
        page.locator("#auth-password").fill(PASSWORD)
        page.locator('#auth-form [type="submit"]').press("Enter")
        page.wait_for_selector('body[data-auth="ready"]')
        page.locator('#mobile-dock [data-mobile-destination="projects"]').click()
        pending[0].fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"metadata": {**current, "note": "Privado da conta A", "revision": 99}}),
        )
        playwright.expect(
            page.get_by_role("button", name="Criar meu primeiro estudo", exact=True)
        ).to_be_visible()
        playwright.expect(page.locator('[data-library-filter="query"]')).to_have_value("")
        playwright.expect(page.locator('[data-library-filter="stage"]')).to_have_value("")
        assert "Privado da conta A" not in page.locator("#main-content").inner_text()
        assert not errors, errors
        second.close()
        context.close()
        browser.close()


def test_logout_failure_reports_pending_server_session(library_server):
    with playwright.sync_playwright() as manager:
        executable = os.getenv("PLAYWRIGHT_CHROMIUM_EXECUTABLE")
        browser = manager.chromium.launch(**({"executable_path": executable} if executable else {}))
        context = browser.new_context(viewport={"width": 390, "height": 844})
        origin = library_server
        assert context.request.post(
            origin + "/api/auth/login",
            headers={"Origin": origin, "X-Viabileasy-Request": "1"},
            data={"email": "library-a@example.test", "password": PASSWORD},
        ).ok
        page = context.new_page()
        page.goto(origin)
        page.wait_for_selector('body[data-auth="ready"]')
        page.route(
            "**/api/auth/logout",
            lambda route: route.fulfill(
                status=503, content_type="application/json", body='{"error":"Falha sintética"}'
            ),
        )
        page.locator(".account-topbar").click()
        page.locator("[data-auth-logout]").click()
        page.wait_for_selector('body[data-auth="guest"]')
        playwright.expect(page.locator("[data-public-status]")).to_contain_text(
            "A saída no servidor ficou pendente"
        )
        assert page.evaluate("Object.keys(state.savedCustom).length") == 0
        context.close()
        browser.close()


def test_search_blur_preserves_keyboard_activation(library_server):
    with playwright.sync_playwright() as manager:
        executable = os.getenv("PLAYWRIGHT_CHROMIUM_EXECUTABLE")
        browser = manager.chromium.launch(**({"executable_path": executable} if executable else {}))
        context = browser.new_context(viewport={"width": 390, "height": 844})
        origin = library_server
        assert context.request.post(
            origin + "/api/auth/login",
            headers={"Origin": origin, "X-Viabileasy-Request": "1"},
            data={"email": "library-a@example.test", "password": PASSWORD},
        ).ok
        page = context.new_page()
        page.goto(origin)
        page.wait_for_selector('body[data-auth="ready"]')
        page.locator('#mobile-dock [data-mobile-destination="projects"]').click()
        page.get_by_label("Buscar por nome").fill("arvore")
        page.locator('[data-study-card="tree"]').get_by_role("button", name="Organizar", exact=True).press(
            "Enter"
        )
        playwright.expect(page.locator("[data-library-form]")).to_have_count(1, timeout=2000)
        context.close()
        browser.close()
