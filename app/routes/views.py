import hmac

from flask import (
    Blueprint,
    current_app,
    make_response,
    redirect,
    render_template_string,
    request,
    send_from_directory,
    url_for,
)

views_bp = Blueprint("views", __name__)

_LOGIN_TEMPLATE = """\
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Clawback — Login</title>
<link rel="stylesheet" href="/static/css/style.css">
<style>
.login {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    gap: 24px;
}
.login__title {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--color-accent);
}
.login__form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 320px;
}
.login__input {
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid var(--color-border);
    background-color: var(--color-surface);
    color: var(--color-text);
    font-size: 1rem;
    font-family: var(--font-sans);
    outline: none;
    transition: border-color 0.2s;
}
.login__input:focus {
    border-color: var(--color-accent);
}
.login__btn {
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid var(--color-accent);
    background-color: rgba(233, 69, 96, 0.1);
    color: var(--color-accent);
    font-size: 1rem;
    font-family: var(--font-sans);
    cursor: pointer;
    transition: background-color 0.2s;
}
.login__btn:hover {
    background-color: rgba(233, 69, 96, 0.2);
}
.login__error {
    color: var(--color-accent);
    font-size: 0.875rem;
    text-align: center;
}
</style>
</head>
<body>
<div class="login">
    <div class="login__title">Clawback</div>
    <form class="login__form" method="post" action="/login">
        <input class="login__input" type="password" name="secret"
               placeholder="Enter secret" autofocus required>
        <button class="login__btn" type="submit">Log in</button>
        {% if error %}
        <div class="login__error">{{ error }}</div>
        {% endif %}
    </form>
</div>
</body>
</html>
"""


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
        return render_template_string(_LOGIN_TEMPLATE, error=None)

    provided = request.form.get("secret", "")
    if not provided or not hmac.compare_digest(provided, secret):
        return render_template_string(_LOGIN_TEMPLATE, error="Invalid secret"), 401

    resp = make_response(redirect(url_for("views.index")))
    resp.set_cookie(
        "clawback_secret",
        provided,
        httponly=True,
        samesite="Lax",
    )
    return resp
