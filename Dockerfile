FROM python:3.14-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 PORT=4173 APP_ENV=production DATA_DIR=/app/.data
WORKDIR /app
COPY requirements.txt requirements.lock ./
RUN pip install --no-cache-dir -r requirements.txt \
    && groupadd --gid 10001 viabileasy \
    && useradd --uid 10001 --gid 10001 --create-home viabileasy \
    && mkdir /app/.data && chown 10001:10001 /app/.data
COPY --chown=10001:10001 backend ./backend
COPY --chown=10001:10001 dist ./dist
USER 10001:10001
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.getenv('PORT','4173')+'/api/ready',timeout=4)"
CMD ["python", "-m", "backend"]
