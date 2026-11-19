FROM python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends nftables \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY relay.py .
# runs as root only because nftables needs CAP_NET_ADMIN; it has no other privileges
CMD ["python", "-u", "relay.py"]
