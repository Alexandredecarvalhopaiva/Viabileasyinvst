from contextlib import contextmanager

import pytest

from backend import territory

QUERY = "?west=-34.861&south=-7.111&east=-34.8608&north=-7.1108"


@pytest.mark.parametrize("query", ["", "?west=&south=-7.1&east=-34.8&north=-7.09",
                                    "?west=nan&south=0&east=0&north=0",
                                    "?west=-35&south=-7.3&east=-34.75&north=-7"])
def test_invalid_territory_does_not_contact_provider(system, monkeypatch, query):
    def forbidden(*args, **kwargs):
        pytest.fail("Provider should not be called")
    monkeypatch.setattr(territory.httpx, "stream", forbidden)
    assert system["client"].get("/api/territory" + query).status_code == 400


def test_territory_source_is_bounded_and_has_provenance(system, monkeypatch):
    @contextmanager
    def stream(method, url, **kwargs):
        assert method == "GET"
        assert url.startswith(territory.SOURCE)
        assert "digeoc%3Azoneamento2024" in url
        assert kwargs["headers"] == {"Accept": "application/json"}
        assert kwargs["follow_redirects"] is False
        yield territory.httpx.Response(200, json={"type": "FeatureCollection", "features": [], "numberMatched": 0},
                                      request=territory.httpx.Request("GET", url))
    monkeypatch.setattr(territory.httpx, "stream", stream)
    r = system["client"].get("/api/territory" + QUERY)
    assert r.status_code == 200
    assert r.json()["source"]["legalValidation"] is False
    assert r.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("payload", [b"blocked", b'{"type":"FeatureCollection","features":[],"numberMatched":1}',
                                     b" " * 4_000_001])
def test_upstream_error_or_incomplete_result_remains_unavailable(system, monkeypatch, payload):
    @contextmanager
    def stream(method, url, **kwargs):
        yield territory.httpx.Response(200, content=payload, headers={"Content-Type": "application/json"},
                                      request=territory.httpx.Request("GET", url))
    monkeypatch.setattr(territory.httpx, "stream", stream)
    r = system["client"].get("/api/territory" + QUERY)
    assert r.status_code == 503
    assert "Consulta territorial indisponível" in r.json()["error"]
