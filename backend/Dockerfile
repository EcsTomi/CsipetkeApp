FROM python:3.13-slim

WORKDIR /app

# 1. Rendszerfüggőségek telepítése (libvips + magyar locale támogatás)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    pkg-config \
    libvips42 \
    locales \
    && sed -i -e 's/# hu_HU.UTF-8 UTF-8/hu_HU.UTF-8 UTF-8/' /etc/locale.gen \
    && locale-gen \
    && rm -rf /var/lib/apt/lists/*

# 2. uv telepítése a hivatalos képből (gyorsabb és tisztább, mint a pip)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# 3. Függőségfájlok másolása (ha van uv.lock, azt is mindenképp másold!)
COPY pyproject.toml uv.lock* ./

# 4. Függőségek telepítése az uv.lock alapján
RUN uv sync --no-install-project --frozen

# 5. Alkalmazás többi részének másolása
COPY . .

# Környezeti változók
ENV PYTHONPATH="/app"
ENV UV_LINK_MODE=copy

# Use the generated Hungarian locale
ENV LANG=hu_HU.UTF-8
ENV LANGUAGE=hu_HU:hu
ENV LC_ALL=hu_HU.UTF-8
ENV PYTHONUTF8=1

# Run the application
CMD ["uv", "run", "fastapi", "run", "main.py", "--host", "0.0.0.0", "--port", "8000"]