"""Owner-only cached, rate-limited branch address autocomplete & geocoding proxy (PRD AB-09, Section 5.6)."""

from collections import OrderedDict
import math
import os
import re
import threading
import time
from typing import Any, Literal
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from onboarding import _database, _owner_organization, _user

router = APIRouter()

ProviderName = Literal["photon", "locationiq", "geoapify", "nominatim"]

DEFAULT_PROVIDER_URLS: dict[str, str] = {
    "photon": "https://photon.komoot.io/api/",
    "locationiq": "https://api.locationiq.com/v1/autocomplete",
    "geoapify": "https://api.geoapify.com/v1/geocode/autocomplete",
    "nominatim": "https://nominatim.openstreetmap.org/search",
}
PROVIDER_ATTRIBUTIONS: dict[str, str] = {
    "photon": "Address suggestions (c) OpenStreetMap contributors via Photon",
    "locationiq": "Address suggestions (c) LocationIQ & OpenStreetMap contributors",
    "geoapify": "Address suggestions (c) Geoapify & OpenStreetMap contributors",
    "nominatim": "Search data (c) OpenStreetMap contributors (Nominatim)",
}
DEFAULT_USER_AGENT = "SpinSense/1.1 (+https://spinsense.app; operator-branch-geocoding)"
COUNTRY_CODE_RE = re.compile(r"^[a-zA-Z]{2}$")

_CACHE_MAX_ENTRIES = 256
_CACHE_TTL_SECONDS = 3600.0
_MIN_AUTOCOMPLETE_INTERVAL_SECONDS = 0.25
_MIN_NOMINATIM_INTERVAL_SECONDS = 1.0

_DEFAULT_HTTPX_GET = httpx.get
_HTTP_CLIENT = httpx.Client(
    timeout=5.0,
    limits=httpx.Limits(max_keepalive_connections=10, max_connections=20),
)

_CACHE_LOCK = threading.Lock()
_GEOCODE_CACHE: OrderedDict[tuple[str, str, str, int], tuple[float, list[dict[str, Any]]]] = OrderedDict()

_RATE_LOCK = threading.Lock()
_LAST_UPSTREAM_AT: float | None = None


class GeocodeResultItem(BaseModel):
    display_name: str
    latitude: float
    longitude: float
    address_line: str | None = None
    city: str | None = None
    region: str | None = None
    postal_code: str | None = None


class GeocodeResponse(BaseModel):
    query: str
    cached: bool
    provider: ProviderName
    attribution: str
    results: list[GeocodeResultItem]


def reset_geocoding_state() -> None:
    """Clear in-memory cache and rate-limit state (used in tests)."""
    global _LAST_UPSTREAM_AT
    with _CACHE_LOCK:
        _GEOCODE_CACHE.clear()
    with _RATE_LOCK:
        _LAST_UPSTREAM_AT = None


def _http_get(url: str, **kwargs):
    if httpx.get is not _DEFAULT_HTTPX_GET:
        return httpx.get(url, **kwargs)
    return _HTTP_CLIENT.get(url, **kwargs)


def _resolve_provider() -> ProviderName:
    configured = os.getenv("GEOCODING_PROVIDER", "").strip().lower()
    if configured:
        if configured not in DEFAULT_PROVIDER_URLS:
            raise HTTPException(503, "Geocoding provider is misconfigured")
        return configured  # type: ignore[return-value]
    if os.getenv("LOCATIONIQ_API_KEY", "").strip():
        return "locationiq"
    if os.getenv("GEOAPIFY_API_KEY", "").strip():
        return "geoapify"
    return "photon"


def _provider_config(provider: ProviderName) -> tuple[str, str, str | None, str | None]:
    raw_url = os.getenv("GEOCODING_PROVIDER_URL", DEFAULT_PROVIDER_URLS[provider]).strip()
    parsed = urlparse(raw_url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise HTTPException(503, "Geocoding provider is misconfigured")
    user_agent = os.getenv("GEOCODING_USER_AGENT", DEFAULT_USER_AGENT).strip() or DEFAULT_USER_AGENT
    contact_email = os.getenv("GEOCODING_CONTACT_EMAIL", "").strip() or None
    api_key: str | None = None
    if provider == "locationiq":
        api_key = os.getenv("LOCATIONIQ_API_KEY", "").strip()
        if not api_key:
            raise HTTPException(503, "LocationIQ geocoding key is not configured")
    elif provider == "geoapify":
        api_key = os.getenv("GEOAPIFY_API_KEY", "").strip()
        if not api_key:
            raise HTTPException(503, "Geoapify geocoding key is not configured")
    return raw_url, user_agent, contact_email, api_key


def _normalize_query(raw: str) -> str:
    cleaned = " ".join(raw.strip().split())
    if len(cleaned) < 3 or len(cleaned) > 200:
        raise HTTPException(422, "Enter 3 to 200 characters of a public branch address, street, or city")
    if "@" in cleaned:
        raise HTTPException(422, "Do not enter email addresses or personal identifiers in map search")
    return cleaned


def _normalize_country_code(raw: str | None) -> str:
    if raw is None:
        return ""
    cleaned = raw.strip().lower()
    if not cleaned:
        return ""
    if not COUNTRY_CODE_RE.fullmatch(cleaned):
        raise HTTPException(422, "Country code must be a two-letter ISO code")
    return cleaned


def _cache_get(key: tuple[str, str, str, int]) -> list[dict[str, Any]] | None:
    now = time.monotonic()
    with _CACHE_LOCK:
        entry = _GEOCODE_CACHE.get(key)
        if not entry:
            return None
        expires_at, items = entry
        if expires_at <= now:
            _GEOCODE_CACHE.pop(key, None)
            return None
        _GEOCODE_CACHE.move_to_end(key)
        return [dict(item) for item in items]


def _cache_put(key: tuple[str, str, str, int], items: list[dict[str, Any]]) -> None:
    expires_at = time.monotonic() + _CACHE_TTL_SECONDS
    with _CACHE_LOCK:
        _GEOCODE_CACHE[key] = (expires_at, [dict(item) for item in items])
        _GEOCODE_CACHE.move_to_end(key)
        while len(_GEOCODE_CACHE) > _CACHE_MAX_ENTRIES:
            _GEOCODE_CACHE.popitem(last=False)


def _acquire_upstream_slot(provider: ProviderName) -> None:
    """Enforce global outbound rate limits across the FastAPI process."""
    global _LAST_UPSTREAM_AT
    min_interval = (
        _MIN_NOMINATIM_INTERVAL_SECONDS
        if provider == "nominatim"
        else _MIN_AUTOCOMPLETE_INTERVAL_SECONDS
    )
    now = time.monotonic()
    with _RATE_LOCK:
        if _LAST_UPSTREAM_AT is not None and (now - _LAST_UPSTREAM_AT) < min_interval:
            detail = (
                "Address search is limited to one request per second. Wait a moment or place the map pin manually."
                if provider == "nominatim"
                else "Address suggestions are momentarily rate-limited. Wait a moment or edit fields manually."
            )
            raise HTTPException(
                status_code=429,
                detail=detail,
                headers={"Retry-After": "1"},
            )
        _LAST_UPSTREAM_AT = now


def _clean_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = " ".join(value.strip().split())
    return cleaned or None


def _valid_lat_lon(lat_raw: Any, lon_raw: Any) -> tuple[float, float] | None:
    try:
        lat = float(lat_raw)
        lon = float(lon_raw)
    except (TypeError, ValueError):
        return None
    if not (math.isfinite(lat) and math.isfinite(lon) and -90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        return None
    return round(lat, 6), round(lon, 6)


def _join_unique_parts(parts: list[str | None]) -> str:
    seen: set[str] = set()
    ordered: list[str] = []
    for part in parts:
        cleaned = _clean_text(part)
        if not cleaned:
            continue
        key = cleaned.casefold()
        if key in seen:
            continue
        seen.add(key)
        ordered.append(cleaned)
    return ", ".join(ordered)


def _extract_address_fields(address: Any) -> tuple[str | None, str | None, str | None, str | None]:
    if not isinstance(address, dict):
        return None, None, None, None
    house = _clean_text(address.get("house_number"))
    road = _clean_text(address.get("road") or address.get("pedestrian") or address.get("suburb"))
    address_line = " ".join(part for part in (house, road) if part).strip() or None
    city = _clean_text(
        address.get("city")
        or address.get("town")
        or address.get("village")
        or address.get("municipality")
        or address.get("county")
    )
    region = _clean_text(address.get("state") or address.get("region"))
    postal_code = _clean_text(address.get("postcode"))
    return address_line, city, region, postal_code


def _parse_nominatim_payload(payload: Any, limit: int) -> list[dict[str, Any]]:
    if not isinstance(payload, list):
        raise HTTPException(503, "Address search returned an unexpected format. Place the map pin manually.")
    parsed: list[dict[str, Any]] = []
    for raw in payload:
        if not isinstance(raw, dict):
            continue
        display_name = _clean_text(raw.get("display_name"))
        coords = _valid_lat_lon(raw.get("lat"), raw.get("lon"))
        if not display_name or coords is None:
            continue
        address_line, city, region, postal_code = _extract_address_fields(raw.get("address"))
        parsed.append({
            "display_name": display_name,
            "latitude": coords[0],
            "longitude": coords[1],
            "address_line": address_line,
            "city": city,
            "region": region,
            "postal_code": postal_code,
        })
        if len(parsed) >= limit:
            break
    return parsed


def _parse_photon_payload(payload: Any, normalized_country: str, limit: int) -> list[dict[str, Any]]:
    if not isinstance(payload, dict) or not isinstance(payload.get("features"), list):
        raise HTTPException(503, "Address search returned an unexpected format. Place the map pin manually.")
    parsed: list[dict[str, Any]] = []
    for feature in payload["features"]:
        if not isinstance(feature, dict):
            continue
        geometry = feature.get("geometry")
        props = feature.get("properties")
        if not isinstance(geometry, dict) or not isinstance(props, dict):
            continue
        raw_coords = geometry.get("coordinates")
        if not isinstance(raw_coords, list) or len(raw_coords) < 2:
            continue
        coords = _valid_lat_lon(raw_coords[1], raw_coords[0])
        if coords is None:
            continue
        feature_country = _clean_text(props.get("countrycode"))
        if normalized_country and feature_country and feature_country.lower() != normalized_country:
            continue

        name = _clean_text(props.get("name"))
        house = _clean_text(props.get("housenumber"))
        street = _clean_text(props.get("street"))
        district = _clean_text(props.get("district") or props.get("locality"))
        city = _clean_text(
            props.get("city")
            or props.get("town")
            or props.get("village")
            or props.get("county")
            or district
        )
        region = _clean_text(props.get("state"))
        postal_code = _clean_text(props.get("postcode"))
        country = _clean_text(props.get("country"))

        street_part = " ".join(p for p in (house, street) if p).strip() or None
        if name and street_part and name.casefold() != street_part.casefold():
            address_line = f"{name}, {street_part}"
        else:
            address_line = street_part or name or district

        display_name = _join_unique_parts(
            [address_line, district if district != city else None, postal_code, city, region, country]
        )
        if not display_name:
            continue
        parsed.append({
            "display_name": display_name,
            "latitude": coords[0],
            "longitude": coords[1],
            "address_line": address_line,
            "city": city,
            "region": region,
            "postal_code": postal_code,
        })
        if len(parsed) >= limit:
            break
    return parsed


def _parse_geoapify_payload(payload: Any, limit: int) -> list[dict[str, Any]]:
    if not isinstance(payload, dict) or not isinstance(payload.get("features"), list):
        raise HTTPException(503, "Address search returned an unexpected format. Place the map pin manually.")
    parsed: list[dict[str, Any]] = []
    for feature in payload["features"]:
        if not isinstance(feature, dict):
            continue
        geometry = feature.get("geometry")
        props = feature.get("properties")
        if not isinstance(geometry, dict) or not isinstance(props, dict):
            continue
        raw_coords = geometry.get("coordinates")
        if not isinstance(raw_coords, list) or len(raw_coords) < 2:
            continue
        coords = _valid_lat_lon(raw_coords[1], raw_coords[0])
        if coords is None:
            continue
        display_name = _clean_text(props.get("formatted") or props.get("address_line1"))
        if not display_name:
            continue
        street_part = " ".join(
            p for p in (_clean_text(props.get("housenumber")), _clean_text(props.get("street"))) if p
        ).strip() or None
        address_line = _clean_text(props.get("address_line1")) or street_part
        city = _clean_text(props.get("city") or props.get("town") or props.get("county"))
        region = _clean_text(props.get("state"))
        postal_code = _clean_text(props.get("postcode"))
        parsed.append({
            "display_name": display_name,
            "latitude": coords[0],
            "longitude": coords[1],
            "address_line": address_line,
            "city": city,
            "region": region,
            "postal_code": postal_code,
        })
        if len(parsed) >= limit:
            break
    return parsed


def _build_upstream_params(
    provider: ProviderName,
    query: str,
    normalized_country: str,
    limit: int,
    contact_email: str | None,
    api_key: str | None,
) -> dict[str, str | int | float]:
    if provider == "photon":
        params: dict[str, str | int | float] = {
            "q": query,
            "limit": min(15, limit * 3) if normalized_country else limit,
            "lang": "en",
        }
        if normalized_country == "my":
            # Bias scoring toward Malaysia while preserving global OpenStreetMap matching.
            params["lat"] = 4.2105
            params["lon"] = 101.9758
        return params
    if provider == "locationiq":
        params = {
            "key": api_key or "",
            "q": query,
            "limit": limit,
            "normalizeaddress": 1,
            "accept-language": "en",
        }
        if normalized_country:
            params["countrycodes"] = normalized_country
        return params
    if provider == "geoapify":
        params = {
            "apiKey": api_key or "",
            "text": query,
            "limit": limit,
            "lang": "en",
        }
        if normalized_country:
            params["filter"] = f"countrycode:{normalized_country}"
        return params

    params = {
        "q": query,
        "format": "jsonv2",
        "addressdetails": 1,
        "limit": limit,
    }
    if normalized_country:
        params["countrycodes"] = normalized_country
    if contact_email:
        params["email"] = contact_email
    return params


def _parse_provider_response(
    provider: ProviderName,
    raw_payload: Any,
    normalized_country: str,
    limit: int,
) -> list[dict[str, Any]]:
    if provider == "photon":
        return _parse_photon_payload(raw_payload, normalized_country, limit)
    if provider == "geoapify":
        return _parse_geoapify_payload(raw_payload, limit)
    return _parse_nominatim_payload(raw_payload, limit)


@router.get("/maps/geocode", response_model=GeocodeResponse)
def geocode_branch_address(
    q: str = Query(..., description="Public branch street, landmark, or city query"),
    country_code: str | None = Query(default="my", description="Optional 2-letter ISO country bias"),
    limit: int = Query(default=5, ge=1, le=5),
    user=Depends(_user),
):
    with _database(read_only=True) as conn:
        _owner_organization(conn, user["id"])

    query = _normalize_query(q)
    normalized_country = _normalize_country_code(country_code)
    provider = _resolve_provider()
    attribution = PROVIDER_ATTRIBUTIONS[provider]
    cache_key = (provider, query.casefold(), normalized_country, limit)

    cached_results = _cache_get(cache_key)
    if cached_results is not None:
        return GeocodeResponse(
            query=query,
            cached=True,
            provider=provider,
            attribution=attribution,
            results=[GeocodeResultItem(**item) for item in cached_results],
        )

    provider_url, user_agent, contact_email, api_key = _provider_config(provider)
    _acquire_upstream_slot(provider)
    params = _build_upstream_params(
        provider=provider,
        query=query,
        normalized_country=normalized_country,
        limit=limit,
        contact_email=contact_email,
        api_key=api_key,
    )

    try:
        response = _http_get(
            provider_url,
            params=params,
            headers={
                "User-Agent": user_agent,
                "Accept": "application/json",
            },
            timeout=5.0,
        )
    except httpx.RequestError as exc:
        raise HTTPException(
            503,
            "Address search is unavailable right now. Enter the address or place the map pin manually.",
        ) from exc

    if response.status_code == 429:
        raise HTTPException(
            status_code=429,
            detail="Address search provider is temporarily throttled. Please wait a moment or place the map pin manually.",
            headers={"Retry-After": "1"},
        )
    if response.status_code != 200:
        raise HTTPException(
            503,
            "Address search is unavailable right now. Enter the address or place the map pin manually.",
        )

    try:
        raw_payload = response.json()
    except ValueError as exc:
        raise HTTPException(
            503,
            "Address search returned an invalid response. Enter the address or place the map pin manually.",
        ) from exc

    results = _parse_provider_response(provider, raw_payload, normalized_country, limit)
    _cache_put(cache_key, results)
    return GeocodeResponse(
        query=query,
        cached=False,
        provider=provider,
        attribution=attribution,
        results=[GeocodeResultItem(**item) for item in results],
    )
