FROM python:3.12-slim

RUN groupadd -r clawback && useradd -r -g clawback -d /app clawback

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ app/
COPY sessions/ sessions/

RUN chown -R clawback:clawback /app
USER clawback

ENV PORT=8080
EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT}/health')"

CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT} --workers 2 'app:create_app()'"]
