from app.main import API_PREFIX, app


def test_routers_mounted_under_api_prefix():
    paths = app.openapi()["paths"]
    assert f"{API_PREFIX}/events" in paths
    assert f"{API_PREFIX}/public/events/{{event_id}}/participants" in paths
    assert f"{API_PREFIX}/checkin" in paths
    assert "/events" not in paths
    assert "/public/events/{event_id}/participants" not in paths


def test_health_endpoint_unprefixed():
    paths = app.openapi()["paths"]
    assert "/health" in paths
    assert f"{API_PREFIX}/health" not in paths
