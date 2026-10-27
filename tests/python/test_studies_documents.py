import base64
from concurrent.futures import ThreadPoolExecutor

from conftest import call, grant, login, study

from backend.db import execute, one
from backend.security import compact, now


def test_study_credit_idempotency_and_geometry_changes(system, accounts):
    c = system["client"]
    assert grant(system, accounts["user"]).json()["usage"]["balance"] == 2
    assert grant(system, accounts["user"]).json()["usage"]["duplicate"] is True
    assert grant(system, accounts["user"], 3).status_code == 409
    login(system, accounts["user"]["email"])
    first = call(c, "/api/studies/lot-1", "PUT", study())
    assert first.status_code == 200, first.text
    assert first.json()["charged"] and first.json()["usage"]["balance"] == 1
    changed = study(name="Outro Nome")
    changed["scenario"]["price"] = 9000
    assert call(c, "/api/studies/lot-1", "PUT", changed).json()["charged"] is False
    assert call(c, "/api/studies/lot-1", "PUT", study(area=400, width=20, depth=20)).json()["charged"] is True
    assert call(c, "/api/studies/lot-1", "PUT", study()).json()["charged"] is False
    no_credit = call(
        c, "/api/studies/lot-2", "PUT", {**study("lot-2"), "usage": {"balance": 1000}, "credits": 1000}
    )
    assert no_credit.status_code == 409 and no_credit.json()["code"] == "NO_CREDITS"
    assert len(c.get("/api/studies").json()["studies"]) == 1


def test_credits_enforce_admin_and_pending_targets(system, accounts):
    c = system["client"]
    for amount in (0, -1, 1.5, 1001, True):
        assert grant(system, accounts["user"], amount).status_code == 400
    login(system, accounts["user"]["email"])
    assert grant(system, accounts["other"]).status_code == 403
    assert call(c, "/api/studies/lot-1", "PUT", study()).json()["code"] == "NO_CREDITS"
    login(system, accounts["admin"]["email"])
    assert call(c, "/api/studies/admin-lot", "PUT", study("admin-lot")).json()["charged"] is False
    assert c.get("/api/usage").json()["usage"]["unlimited"] is True


def test_studies_isolation_recents_deletion_and_admin_overview(system, accounts):
    c = system["client"]
    for identifier in ("first", "second"):
        assert call(c, f"/api/studies/{identifier}", "PUT", study(identifier)).status_code == 200
    before = c.get("/api/studies/first").json()["study"]
    assert call(c, "/api/studies/first/open", "POST", {}).status_code == 200
    after = c.get("/api/studies/first").json()["study"]
    assert after["scenario"] == before["scenario"] and after["updatedAt"] == before["updatedAt"]
    assert after["lastOpenedAt"] >= before["updatedAt"]
    assert c.get("/api/studies").json()["studies"][0]["lot"]["id"] == "first"
    overview = c.get("/api/admin/overview").json()
    assert overview["totals"]["studies"] == 2
    assert len(overview["recentStudies"]) == 2
    assert "password_hash" not in compact(overview) and "google_sub" not in compact(overview)
    login(system, accounts["other"]["email"])
    assert c.get("/api/studies/first").status_code == 404
    assert call(c, "/api/studies/first/open", "POST", {}).status_code == 404
    assert call(c, "/api/studies/first", "DELETE").status_code == 404
    assert c.get("/api/studies").json()["studies"] == []
    login(system, accounts["admin"]["email"])
    assert call(c, "/api/studies/first", "DELETE").status_code == 200


def test_concurrent_requests_cannot_spend_last_credit_twice(system, accounts):
    assert grant(system, accounts["user"], 1).status_code == 200
    login(system, accounts["user"]["email"])

    def save(identifier):
        return call(system["client"], f"/api/studies/{identifier}", "PUT", study(identifier))

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(save, ("race-a", "race-b")))
    assert sorted(response.status_code for response in responses) == [200, 409]
    assert system["client"].get("/api/usage").json()["usage"] == {"unlimited": False, "balance": 0, "used": 1}


def test_save_quota_rolls_back_credit_and_ledger(system, accounts):
    assert grant(system, accounts["user"], 1).status_code == 200
    db = system["app"].state.db
    with db.transaction() as conn:
        for i in range(500):
            execute(
                conn,
                "INSERT INTO studies(user_id,id,payload,updated_at) VALUES(?,?,?,?)",
                (accounts["user"]["id"], f"seed-{i}", compact(study(f"seed-{i}")), now()),
            )
    login(system, accounts["user"]["email"])
    assert call(system["client"], "/api/studies/overflow", "PUT", study("overflow")).status_code == 409
    assert system["client"].get("/api/usage").json()["usage"]["balance"] == 1
    with db.engine.connect() as conn:
        assert one(conn, "SELECT COUNT(*) AS count FROM credit_ledger WHERE kind='use'")["count"] == 0


def test_study_validation_does_not_charge(system, accounts):
    grant(system, accounts["user"], 1)
    login(system, accounts["user"]["email"])
    invalid = []
    for value in (0, 81, 1.5, True):
        item = study()
        item["scenario"]["floors"] = value
        invalid.append(item)
    for geometry in ({"vertices": []}, {"vertices": [[0, 0], [0, 1], [1, 1]], "geographic": "wrong"}):
        invalid.append(study(geometry=geometry))
    invalid.extend((study(area=-1), study(width=0), study(lat=100)))
    for item in invalid:
        assert call(system["client"], "/api/studies/lot-1", "PUT", item).status_code == 400
    assert system["client"].get("/api/usage").json()["usage"]["balance"] == 1


PDF = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n"


def document(scope="library", **changes):
    return {
        "title": "Lei de teste",
        "issuer": "Órgão de teste",
        "reference": "Documento sintético",
        "category": "legislacao",
        "filename": "referência.pdf",
        "sourceURL": "https://example.test/lei",
        "notes": "",
        "scope": scope,
        "pdf": base64.b64encode(PDF).decode(),
        **changes,
    }


def test_documents_library_lot_scope_and_authenticated_download(system, accounts):
    c = system["client"]
    library = call(c, "/api/documents", "POST", document())
    assert library.status_code == 201, library.text
    identifier = library.json()["document"]["id"]
    assert c.get(f"/api/documents/{identifier}/file").content == PDF
    assert grant(system, accounts["user"]).status_code == 200
    login(system, accounts["user"]["email"])
    assert call(c, "/api/documents", "POST", document()).status_code == 403
    assert c.get(f"/api/documents/{identifier}/file").status_code == 200
    assert call(c, "/api/documents", "POST", document("lot", lotId="lot-1")).status_code == 404
    assert call(c, "/api/studies/lot-1", "PUT", study()).status_code == 200
    private = call(c, "/api/documents", "POST", document("lot", lotId="lot-1"))
    assert private.status_code == 201
    private_id = private.json()["document"]["id"]
    assert call(c, "/api/documents", "POST", document("lot", lotId="lot-1")).status_code == 409
    assert c.get("/api/documents?lotId=lot-1").json()["total"] == 2
    login(system, accounts["other"]["email"])
    assert c.get("/api/documents").json()["total"] == 1
    assert c.get(f"/api/documents/{private_id}/file").status_code == 404
    assert call(c, f"/api/documents/{private_id}", "DELETE").status_code == 404
    c.cookies.clear()
    assert c.get(f"/api/documents/{identifier}/file").status_code == 401


def test_pdf_validation_pagination_and_headers(system, accounts):
    c = system["client"]
    for changes in (
        {"sourceURL": "javascript:alert(1)"},
        {"sourceURL": "https://user:password@example.test"},
        {"pdf": base64.b64encode(b"bad file").decode()},
        {"pdf": "%%%="},
        {"category": "executable"},
        {"filename": "evil.svg"},
    ):
        assert call(c, "/api/documents", "POST", document(**changes)).status_code == 400
    response = call(c, "/api/documents", "POST", document())
    link = response.json()["document"]["url"]
    assert c.get(link).headers["content-type"] == "application/pdf"
    assert c.get(link).headers["content-disposition"].startswith("attachment;")
    assert "sandbox" in c.get(link).headers["content-security-policy"]
    assert c.get("/api/documents?page=-1").status_code == 400
    assert c.get("/api/documents?page=1").json()["documents"] == []
    assert call(c, "/api/documents/" + response.json()["document"]["id"], "DELETE").status_code == 200


def test_deleting_study_removes_only_its_documents(system, accounts):
    c = system["client"]
    call(c, "/api/studies/lot-1", "PUT", study())
    call(c, "/api/documents", "POST", document("lot", lotId="lot-1"))
    call(c, "/api/documents", "POST", document())
    assert call(c, "/api/studies/lot-1", "DELETE").status_code == 200
    rows = c.get("/api/documents").json()["documents"]
    assert len(rows) == 1 and rows[0]["scope"] == "library"
