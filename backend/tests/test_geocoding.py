"""Focused boundary, caching, rate-limit, and provider-parsing tests for GET /maps/geocode."""

from contextlib import contextmanager
from unittest.mock import MagicMock
from uuid import UUID

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import geocoding
import main

USER = "11111111-1111-1111-1111-111111111111"
ORG = UUID("33333333-3333-3333-3333-333333333333")


@pytest.fixture(autouse=True)
def _clean_geocode_state(monkeypatch):
    geocoding.reset_geocoding_state()
    monkeypatch.delenv("GEOCODING_PROVIDER", raising=False)
    monkeypatch.delenv("GEOCODING_PROVIDER_URL", raising=False)
    monkeypatch.delenv("LOCATIONIQ_API_KEY", raising=False)
    monkeypatch.delenv("GEOAPIFY_API_KEY", raising=False)
    yield
    geocoding.reset_geocoding_state()


def _mock_owner_db(monkeypatch, *, is_owner: bool = True):
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = {"organization_id": ORG} if is_owner else None

    @contextmanager
    def db(**_kwargs):
        yield conn

    monkeypatch.setattr(geocoding, "_database", db)
    return conn


def test_geocode_route_registered_and_requires_auth():
    client = TestClient(main.app)
    res = client.get("/maps/geocode", params={"q": "Jalan Universiti"})
    assert res.status_code == 401


def test_geocode_rejects_non_owner(monkeypatch):
    _mock_owner_db(monkeypatch, is_owner=False)
    with pytest.raises(HTTPException) as exc:
        geocoding.geocode_branch_address(q="Shah Alam", user={"id": USER})
    assert exc.value.status_code == 403


def test_geocode_rejects_short_and_email_queries(monkeypatch):
    _mock_owner_db(monkeypatch, is_owner=True)

    with pytest.raises(HTTPException) as short_exc:
        geocoding.geocode_branch_address(q="ab", user={"id": USER})
    assert short_exc.value.status_code == 422

    with pytest.raises(HTTPException) as email_exc:
        geocoding.geocode_branch_address(q="manager@spinsense.my", user={"id": USER})
    assert email_exc.value.status_code == 422


def test_geocode_defaults_to_photon_and_parses_geojson_features(monkeypatch):
    _mock_owner_db(monkeypatch, is_owner=True)
    monkeypatch.setenv("GEOCODING_USER_AGENT", "SpinSenseTest/1.0")

    calls = []

    def fake_get(url, *, params=None, headers=None, timeout=None):
        calls.append((url, params, headers, timeout))
        return httpx.Response(
            200,
            json={
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [101.5529456, 3.0789123]},
                        "properties": {
                            "name": "MSU Medical Centre",
                            "street": "Jalan Boling Padang 13/62",
                            "district": "Seksyen 13",
                            "city": "Shah Alam",
                            "state": "Selangor",
                            "postcode": "40100",
                            "country": "Malaysia",
                            "countrycode": "MY",
                        },
                    },
                    {
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [103.8198, 1.3521]},
                        "properties": {
                            "name": "Foreign Match",
                            "countrycode": "SG",
                        },
                    },
                    {
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [101.5, 99.5]},
                        "properties": {"name": "Invalid Coords", "countrycode": "MY"},
                    },
                ],
            },
        )

    monkeypatch.setattr(geocoding, "_http_get", fake_get)

    res = geocoding.geocode_branch_address(q="  Jalan   Boling Padang ", country_code="my", limit=5, user={"id": USER})
    assert res.cached is False
    assert res.provider == "photon"
    assert "Photon" in res.attribution
    assert len(res.results) == 1
    assert res.results[0].latitude == 3.078912
    assert res.results[0].longitude == 101.552946
    assert res.results[0].address_line == "MSU Medical Centre, Jalan Boling Padang 13/62"
    assert res.results[0].city == "Shah Alam"
    assert res.results[0].region == "Selangor"
    assert res.results[0].postal_code == "40100"

    assert len(calls) == 1
    url, params, headers, _timeout = calls[0]
    assert url == geocoding.DEFAULT_PROVIDER_URLS["photon"]
    assert params["lat"] == 4.2105
    assert params["lon"] == 101.9758
    assert headers["User-Agent"] == "SpinSenseTest/1.0"


def test_geocode_supports_locationiq_and_geoapify_when_keys_configured(monkeypatch):
    _mock_owner_db(monkeypatch, is_owner=True)
    now = {"t": 50.0}
    monkeypatch.setattr(geocoding.time, "monotonic", lambda: now["t"])

    monkeypatch.setenv("LOCATIONIQ_API_KEY", "liq-secret-key")
    monkeypatch.setattr(
        geocoding,
        "_http_get",
        lambda *_a, **_k: httpx.Response(
            200,
            json=[
                {
                    "display_name": "Jalan Ampang, Kuala Lumpur",
                    "lat": "3.159",
                    "lon": "101.718",
                    "address": {"road": "Jalan Ampang", "city": "Kuala Lumpur", "postcode": "50450"},
                }
            ],
        ),
    )
    liq = geocoding.geocode_branch_address(q="Jalan Ampang", country_code="my", limit=5, user={"id": USER})
    assert liq.provider == "locationiq"
    assert liq.results[0].postal_code == "50450"

    monkeypatch.delenv("LOCATIONIQ_API_KEY")
    monkeypatch.setenv("GEOAPIFY_API_KEY", "geo-secret-key")
    now["t"] = 51.0
    monkeypatch.setattr(
        geocoding,
        "_http_get",
        lambda *_a, **_k: httpx.Response(
            200,
            json={
                "features": [
                    {
                        "geometry": {"coordinates": [100.3288, 5.4141]},
                        "properties": {
                            "formatted": "Lebuh Chulia, George Town, 10200 Pulau Pinang",
                            "address_line1": "Lebuh Chulia",
                            "city": "George Town",
                            "state": "Pulau Pinang",
                            "postcode": "10200",
                        },
                    }
                ]
            },
        ),
    )
    geo = geocoding.geocode_branch_address(q="Lebuh Chulia", country_code="my", limit=5, user={"id": USER})
    assert geo.provider == "geoapify"
    assert geo.results[0].city == "George Town"
    assert geo.results[0].postal_code == "10200"


def test_geocode_caches_repeat_queries_without_hitting_upstream(monkeypatch):
    _mock_owner_db(monkeypatch, is_owner=True)
    calls = 0

    def fake_get(*_args, **_kwargs):
        nonlocal calls
        calls += 1
        return httpx.Response(
            200,
            json={
                "features": [
                    {
                        "geometry": {"coordinates": [101.585, 3.049]},
                        "properties": {"name": "Subang Jaya", "state": "Selangor", "countrycode": "MY"},
                    }
                ]
            },
        )

    monkeypatch.setattr(geocoding, "_http_get", fake_get)

    first = geocoding.geocode_branch_address(q="Subang Jaya", country_code="my", limit=5, user={"id": USER})
    second = geocoding.geocode_branch_address(q="subang   jaya", country_code="MY", limit=5, user={"id": USER})

    assert calls == 1
    assert first.cached is False
    assert second.cached is True
    assert second.results[0].address_line == "Subang Jaya"


def test_geocode_enforces_global_rate_limit_by_provider(monkeypatch):
    _mock_owner_db(monkeypatch, is_owner=True)
    monkeypatch.setenv("GEOCODING_PROVIDER", "nominatim")
    now = {"t": 100.0}
    monkeypatch.setattr(geocoding.time, "monotonic", lambda: now["t"])

    calls = 0

    def fake_get(*_args, **_kwargs):
        nonlocal calls
        calls += 1
        return httpx.Response(200, json=[])

    monkeypatch.setattr(geocoding, "_http_get", fake_get)

    first = geocoding.geocode_branch_address(q="Klang Valley", country_code="my", limit=5, user={"id": USER})
    assert first.provider == "nominatim"

    now["t"] = 100.4
    with pytest.raises(HTTPException) as throttled:
        geocoding.geocode_branch_address(q="Penang Island", country_code="my", limit=5, user={"id": USER})
    assert throttled.value.status_code == 429
    assert throttled.value.headers["Retry-After"] == "1"
    assert calls == 1

    now["t"] = 101.1
    later = geocoding.geocode_branch_address(q="Penang Island", country_code="my", limit=5, user={"id": USER})
    assert later.cached is False
    assert calls == 2


def test_geocode_maps_upstream_failures_to_fallback_errors(monkeypatch):
    _mock_owner_db(monkeypatch, is_owner=True)
    now = {"t": 10.0}
    monkeypatch.setattr(geocoding.time, "monotonic", lambda: now["t"])

    def fail_network(*_args, **_kwargs):
        raise httpx.ConnectTimeout("timeout")

    monkeypatch.setattr(geocoding, "_http_get", fail_network)
    with pytest.raises(HTTPException) as exc_net:
        geocoding.geocode_branch_address(q="Cyberjaya", country_code="my", limit=5, user={"id": USER})
    assert exc_net.value.status_code == 503

    now["t"] = 12.0
    monkeypatch.setattr(geocoding, "_http_get", lambda *_a, **_k: httpx.Response(429))
    with pytest.raises(HTTPException) as exc_rate:
        geocoding.geocode_branch_address(q="Putrajaya", country_code="my", limit=5, user={"id": USER})
    assert exc_rate.value.status_code == 429
