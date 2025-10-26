FROM python:3.13-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/static_files \
    && mkdir -p /app/config \
    && mkdir -p /app/templates \
    && mkdir -p /app/static/css \
    && mkdir -p /app/static/js

EXPOSE 5000

CMD ["python", "app.py"]