# 📋 Checklist de Deployment (EasyPanel)

> Esta es la lista maestra de lo que necesitas para desplegar el sistema en EasyPanel y dejarlo funcionando 100%.

## 1. Subir Código a GitHub
- [ ] Crear repositorio en GitHub.
- [ ] Subir todos los archivos del proyecto.
- [ ] Conectar GitHub con EasyPanel.

## 2. Variables de Entorno (Environment Variables)
En la configuración de tu App en EasyPanel, agrega estas variables exactas:

| Clave | Valor (Ejemplo / Instrucción) |
|-------|-------------------------------|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `GMAIL_CLIENT_ID` | `40894475387-15c5fhvdi1gd1q4vmp4k6del891v7gsf.apps.googleusercontent.com` (Ya lo tienes) |
| `GMAIL_CLIENT_SECRET` | **Tu Client Secret** (Cópialo de tu JSON o Google Cloud) |
| `GMAIL_REDIRECT_URI` | `https://TU-DOMINIO.com/oauth/callback` (Reemplaza con tu dominio real) |
| `LANDING_PAGE_URL` | `https://artechnocode.online` (Tu landing page) |
| `OPENAI_API_KEY` | `xxxxxxxxxxx` (Tu llave de AIMLAPI) |
| `OPENAI_BASE_URL` | `https://api.aimlapi.com/v1` |
| `DAILY_LIMIT_PER_ACCOUNT` | `250` (Aumentar a 500 después de 24h) |
| `GMAIL_ACCOUNTS` | Dejar vacío inicialmente. Se llena DESPUÉS del paso 3. |

## 3. Configuración en Google Cloud Console
1. Ir a **APIs & Services** > **Credentials**.
2. Editar tu cliente OAuth 2.0.
3. En **Authorized redirect URIs**, agregar:
   - `https://TU-DOMINIO.com/oauth/callback`

## 4. Activación Post-Deployment (Una sola vez)
Una vez la app esté online en EasyPanel:
1. Visita: `https://TU-DOMINIO.com/oauth`
2. Verás tus 4 cuentas listas para autorizar.
3. Click en "Autorizar" para cada una -> Te dará un token.
4. Vuelve a EasyPanel > Variables de Entorno y agrega los tokens en `GMAIL_ACCOUNTS` así:
   ```
   info@artechnocode.online:TOKEN_1,rafaelmanrique@artechnocode.online:TOKEN_2,...
   ```
5. Reinicia la app ("Deploy" o "Restart").

---

## 🛠 Qué NECESITAS tener a mano ya:
1. **Tu dominio** configurado en EasyPanel (ej: `app.midominio.com`).
2. **Client Secret** de Google (lo borré del código por seguridad).
3. **API Key de OpenAI** (para generar los mensajes de venta).
4. **Acceso a las 4 cuentas Gmail** (para autorizar).
