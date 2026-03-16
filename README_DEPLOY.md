# Despliegue en GitHub Pages

Este proyecto ha sido configurado para ser desplegado fácilmente en GitHub Pages.

## Pasos para desplegar:

1. **Crear un repositorio en GitHub**: Crea un nuevo repositorio (público o privado).
2. **Subir el código**: Sube todos los archivos de esta carpeta a tu repositorio.
3. **Configurar GitHub Actions**:
   - Ve a la pestaña **Settings** de tu repositorio.
   - En el menú lateral, selecciona **Pages**.
   - En **Build and deployment** > **Source**, selecciona **GitHub Actions**.
4. **Crear el flujo de trabajo**:
   - GitHub te sugerirá usar un template de "Static HTML" o similar, pero he incluido la configuración necesaria para que funcione con Vite.
   - Crea un archivo en `.github/workflows/deploy.yml` con el contenido que se encuentra abajo.

## Archivo de Workflow (`.github/workflows/deploy.yml`):

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: ["main"]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10
      - name: Set up Node
        uses: actions/node-setup@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install
      - name: Build
        run: pnpm build
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

## Notas sobre la API Key:
- He integrado la API key que proporcionaste directamente en el código como fallback y en el archivo `.env`.
- Para mayor seguridad en el futuro, puedes configurar `VITE_GEMINI_API_KEY` como un **Secret** en GitHub Actions y pasarla al comando de build.
