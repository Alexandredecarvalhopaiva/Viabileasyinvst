import json
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from conftest import ORIGIN, call, grant, login, study
from fastapi.testclient import TestClient
from test_studies_documents import document as document_payload

from backend.db import execute, one


def test_metadata_defaults_persist_without_credits_and_preserve_legacy_saves(system, accounts):
    client = system["client"]
    assert grant(system, accounts["user"], 1).status_code == 200
    login(system, accounts["user"]["email"])
    original = study("tree", name="Lote Árvore")
    original["context"] = {"source": "synthetic", "results": {"area": 360}}
    saved = call(client, "/api/studies/tree", "PUT", original).json()["study"]
    assert saved["metadata"] == {
        "schemaVersion": 1,
        "stage": "triage",
        "tags": [],
        "note": "",
        "revision": 0,
        "updatedAt": None,
    }
    usage = client.get("/api/usage").json()
    assert usage["usage"]["balance"] == 0
    data = {
        "expectedRevision": 0,
        "stage": "waiting_information",
        "tags": [" Prospecção ", "PROSPECCAO"],
        "note": "",
    }
    result = call(client, "/api/studies/tree/metadata", "PUT", data)
    assert result.status_code == 200, result.text
    metadata = result.json()["metadata"]
    assert metadata["revision"] == 1 and metadata["updatedAt"] > 0
    assert metadata["tags"] == ["Prospecção"] and metadata["note"] == ""
    assert client.get("/api/usage").json() == usage
    stored = client.get("/api/studies/tree").json()["study"]
    assert {key: value for key, value in stored.items() if key != "metadata"} == {
        key: value for key, value in saved.items() if key != "metadata"
    }
    # Older clients omit metadata, or send the stale copy in an old snapshot.
    for supplied in (None, saved["metadata"]):
        legacy = {**original, "scenario": {**original["scenario"], "floors": 7}}
        if supplied:
            legacy["metadata"] = supplied
        assert call(client, "/api/studies/tree", "PUT", legacy).json()["study"]["metadata"] == metadata
    call(client, "/api/auth/logout", "POST", {})
    login(system, accounts["user"]["email"])
    assert client.get("/api/studies/tree/metadata").json() == {"metadata": metadata}
    assert client.get("/api/studies").json()["studies"][0]["metadata"] == metadata


def test_metadata_archive_restore_preserves_documents_and_account_isolation(system, accounts):
    client = system["client"]
    call(client, "/api/studies/tree", "PUT", study("tree"))
    document = call(client, "/api/documents", "POST", document_payload("lot", lotId="tree"))
    assert document.status_code == 201, document.text
    for revision, stage in enumerate(("archived", "triage")):
        response = call(
            client,
            "/api/studies/tree/metadata",
            "PUT",
            {"expectedRevision": revision, "stage": stage, "tags": ["documentação"], "note": " Pendente "},
        )
        assert response.status_code == 200
        assert response.json()["metadata"]["stage"] == stage
        assert client.get("/api/studies/tree").status_code == 200
        assert client.get("/api/documents").json()["total"] == 1
    login(system, accounts["other"]["email"])
    assert client.get("/api/studies/tree/metadata").status_code == 404
    denied = call(
        client,
        "/api/studies/tree/metadata",
        "PUT",
        {"expectedRevision": 2, "stage": "archived", "tags": [], "note": "overwritten"},
    )
    assert denied.status_code == 404
    login(system, accounts["admin"]["email"])
    assert client.get("/api/studies/tree/metadata").json()["metadata"]["note"] == "Pendente"


@pytest.mark.parametrize("revision", [0, 1])
def test_two_sessions_race_from_legacy_and_existing_revision(system, accounts, revision):
    client = system["client"]
    # An actual legacy row has no serialized metadata at all.
    with system["app"].state.db.transaction() as conn:
        execute(
            conn,
            "INSERT INTO studies(user_id,id,payload,updated_at) VALUES(?,?,?,?)",
            (accounts["admin"]["id"], "legacy", json.dumps(study("legacy")), 123),
        )
    if revision:
        assert (
            call(
                client,
                "/api/studies/legacy/metadata",
                "PUT",
                {"expectedRevision": 0, "stage": "triage", "tags": [], "note": "initial"},
            ).status_code
            == 200
        )
    barrier = Barrier(2)
    with (
        TestClient(system["app"], base_url=ORIGIN) as first,
        TestClient(system["app"], base_url=ORIGIN) as second,
    ):
        for session in (first, second):
            assert login(system, accounts["admin"]["email"], client=session).status_code == 200
            assert session.get("/api/studies/legacy/metadata").json()["metadata"]["revision"] == revision

        def save(pair):
            session, label = pair
            barrier.wait()
            return call(
                session,
                "/api/studies/legacy/metadata",
                "PUT",
                {"expectedRevision": revision, "stage": "in_study", "tags": [label], "note": label},
            )

        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(save, ((first, "one"), (second, "two"))))
    assert sorted(response.status_code for response in responses) == [200, 409]
    winner = next(response.json()["metadata"] for response in responses if response.status_code == 200)
    assert winner["revision"] == revision + 1
    assert (
        next(response.json()["code"] for response in responses if response.status_code == 409)
        == "METADATA_CONFLICT"
    )
    assert client.get("/api/studies/legacy/metadata").json()["metadata"] == winner
    with system["app"].state.db.engine.connect() as conn:
        assert json.loads(one(conn, "SELECT payload FROM studies WHERE id='legacy'")["payload"]) == study(
            "legacy"
        )


@pytest.mark.parametrize(
    "changes",
    [
        {"stage": "invalid"},
        {"stage": []},
        {"expectedRevision": True},
        {"expectedRevision": -1},
        {"expectedRevision": 1.1},
        {"expectedRevision": "0"},
        {"expectedRevision": 9007199254740991},
        {"tags": [""]},
        {"tags": [" "]},
        {"tags": [1]},
        {"tags": ["a" * 33]},
        {"tags": ["a"] * 11},
        {"tags": None},
        {"note": None},
        {"note": "a" * 1001},
    ],
)
def test_metadata_validation_is_transactional(system, accounts, changes):
    client = system["client"]
    call(client, "/api/studies/tree", "PUT", study("tree"))
    result = call(
        client,
        "/api/studies/tree/metadata",
        "PUT",
        {"expectedRevision": 0, "stage": "triage", "tags": [], "note": "", **changes},
    )
    assert result.status_code == 400, result.text
    assert result.json()["code"] == "INVALID_METADATA"
    assert client.get("/api/studies/tree/metadata").json()["metadata"]["revision"] == 0
