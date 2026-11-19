FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY --from=ghcr.io/astral-sh/uv:0.8.23 /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY coupured ./coupured
RUN uv sync --frozen --no-dev && useradd -r -u 10001 coupure && mkdir /data && chown coupure /data
USER coupure
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
CMD ["uvicorn", "coupured.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "10.77.0.10", "--no-access-log"]
