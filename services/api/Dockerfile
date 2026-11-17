# PDF Craft API (FastAPI). Build context: services/api
#
#   docker build -t pdf-craft-api services/api
#   docker build --build-arg WITH_LIBREOFFICE=1 -t pdf-craft-api services/api
#
# WITH_LIBREOFFICE=1 adds LibreOffice for accurate Word and PowerPoint to PDF
# (about 600 MB more). Without it a basic converter is used.
FROM python:3.12-slim

ARG WITH_LIBREOFFICE=0

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN if [ "$WITH_LIBREOFFICE" = "1" ]; then \
      apt-get update \
      && apt-get install -y --no-install-recommends libreoffice-writer libreoffice-impress fonts-liberation fonts-dejavu-core \
      && rm -rf /var/lib/apt/lists/*; \
    fi

# An unprivileged account. LibreOffice needs a writable home for its profile.
RUN useradd --system --uid 10001 --create-home --home-dir /home/app app \
    && mkdir -p /data \
    && chown app:app /data

WORKDIR /app

COPY requirements.txt constraints.txt ./
RUN pip install -r requirements.txt -c constraints.txt

COPY app ./app

USER app

# Data lives in a volume so it survives rebuilds.
ENV PDF_CRAFT_STORAGE_DIR=/data/files \
    PDF_CRAFT_DATABASE_URL=sqlite:////data/pdf_craft.db

VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"

# One worker on purpose: the clean-up timer and the sign-in throttle live in memory.
# Access logging is off so file names never reach the logs.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log", "--proxy-headers", "--forwarded-allow-ips=*"]
