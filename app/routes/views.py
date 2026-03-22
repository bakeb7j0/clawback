import hmac

from flask import (
    Blueprint,
    current_app,
    make_response,
    redirect,
    render_template,
    request,
    send_from_directory,
    url_for,
)

views_bp = Blueprint("views", __name__)


@views_bp.route("/")
def index():
    """Serve the single-page application."""
    return send_from_directory("static", "index.html")


@views_bp.route("/login", methods=["GET", "POST"])
def login():
    """Login form and handler for cookie-based auth."""
    secret = current_app.config.get("CLAWBACK_SECRET")
    if not secret:
        return redirect(url_for("views.index"))

    if request.method == "GET":
        return render_template("login.html", error=None)

    provided = request.form.get("secret", "")
    if not provided or not hmac.compare_digest(provided, secret):
        return render_template("login.html", error="Invalid secret"), 401

    resp = make_response(redirect(url_for("views.index")))
    resp.set_cookie(
        "clawback_secret",
        provided,
        httponly=True,
        samesite="Lax",
        secure=not current_app.debug,
    )
    return resp
