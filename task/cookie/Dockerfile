FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY cookie/requirements.txt /app/requirements.txt
RUN pip install -r /app/requirements.txt

COPY cookie /app/cookie

EXPOSE 8000


CMD ["uvicorn", "cookie.main:app", "--host", "0.0.0.0", "--port", "8000"]
