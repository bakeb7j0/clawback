from flask import Blueprint, send_from_directory

views_bp = Blueprint("views", __name__)


@views_bp.route("/")
def index():
    """Serve the single-page application."""
    return send_from_directory("static", "index.html")
