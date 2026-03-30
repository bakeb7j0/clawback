from app import create_app


def test_read_only_defaults_false():
    """CLAWBACK_READ_ONLY defaults to False when env var is not set."""
    app = create_app({"TESTING": True})
    # Config.CLAWBACK_READ_ONLY reads from env; factory override not set.
    # Default env value (empty string) is not in the truthy set.
    assert app.config["CLAWBACK_READ_ONLY"] is False


def test_read_only_true_via_factory():
    """CLAWBACK_READ_ONLY=True is respected via config override."""
    app = create_app({"TESTING": True, "CLAWBACK_READ_ONLY": True})
    assert app.config["CLAWBACK_READ_ONLY"] is True


def test_read_only_false_via_factory():
    """CLAWBACK_READ_ONLY=False is respected via config override."""
    app = create_app({"TESTING": True, "CLAWBACK_READ_ONLY": False})
    assert app.config["CLAWBACK_READ_ONLY"] is False


def test_ephemeral_ttl_config_default():
    """CLAWBACK_EPHEMERAL_TTL defaults to 14400 seconds."""
    app = create_app({"TESTING": True})
    assert app.config["CLAWBACK_EPHEMERAL_TTL"] == 14400


def test_ephemeral_ttl_config_custom():
    """CLAWBACK_EPHEMERAL_TTL is configurable via config override."""
    app = create_app({"TESTING": True, "CLAWBACK_EPHEMERAL_TTL": 3600})
    assert app.config["CLAWBACK_EPHEMERAL_TTL"] == 3600
