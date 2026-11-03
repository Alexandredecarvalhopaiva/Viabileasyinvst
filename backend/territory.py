"""Bounded, read-only access to the public municipal zoning service."""

import json
import math
from datetime import UTC, datetime
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api", tags=["Território"])
SOURCE = "https://filipeia.joaopessoa.pb.gov.br/geoserver/ows"
LAYER = "digeoc:zoneamento2024"


def territory_url(search):
    values = [search.get(key, "") for key in ("west", "south", "east", "north")]
    if any(not value.strip() for value in values):
        raise ValueError("bounds")
    w, s, e, n = map(float, values)
    if (
        not all(math.isfinite(v) for v in (w, s, e, n))
        or w < -35 or e > -34.75 or s < -7.3 or n > -7
        or w >= e or s >= n or e - w > 0.05 or n - s > 0.05
    ):
        raise ValueError("bounds")
    return SOURCE + "?" + urlencode({
        "service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": LAYER,
        "outputFormat": "application/json", "srsName": "CRS:84", "count": "50",
        "bbox": ",".join(map(str, (w, s, e, n))) + ",urn:ogc:def:crs:OGC:1.3:CRS84",
    })


@router.get("/territory")
def lookup(request: Request):
    def result(data, status=200):
        return JSONResponse(data, status, headers={"Cache-Control": "no-store"})

    try:
        url = territory_url(request.query_params)
    except (ValueError, TypeError):
        return result({"error": "Informe uma localização ou perímetro válido de João Pessoa."}, 400)
    try:
        with httpx.stream("GET", url, headers={"Accept": "application/json"}, timeout=8,
                          follow_redirects=False) as response:
            response.raise_for_status()
            if "json" not in response.headers.get("content-type", ""):
                raise ValueError("content")
            chunks, size = [], 0
            for chunk in response.iter_bytes():
                size += len(chunk)
                if size > 4_000_000:
                    raise ValueError("large")
                chunks.append(chunk)
        data = json.loads(b"".join(chunks))
        features = data.get("features")
        if data.get("type") != "FeatureCollection" or not isinstance(features, list) or len(features) >= 50:
            raise ValueError("collection")
        matched = data.get("numberMatched")
        if matched is not None and matched != "unknown" and int(matched) > len(features):
            raise ValueError("incomplete")
        return result({"type": data["type"], "features": features, "source": {
            "name": "Filipeia/SEPLAN/PMJP", "layer": LAYER, "url": url,
            "retrievedAt": datetime.now(UTC).isoformat(), "legalValidation": False,
        }})
    except (httpx.HTTPError, ValueError, TypeError, AttributeError):
        return result({"error": "Consulta territorial indisponível. Tente novamente; nenhum enquadramento foi presumido."}, 503)
