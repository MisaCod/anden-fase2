# andén — Plataforma interactiva de microaprendizaje (React + FastAPI + SQLite)

Proyecto de **Programación Web (URBE 2026)**. Incluye frontend en React + Vite y backend real en Python (**FastAPI + SQLAlchemy + SQLite**) con autenticación por roles, cursos gratis y restringidos, 5 tipos de preguntas interactivas en video, porcentaje de aciertos, certificados verificables, logros y árbol de habilidades dinámicos.

## Cómo correrlo

### 1. Instalar dependencias (solo la primera vez)

```bash
# Frontend
npm install

# Backend Python
python -m venv backend/.venv
backend/.venv/Scripts/pip install -r backend/requirements.txt
```

### 2. Levantar Backend y Frontend

Opción rápida en Windows PowerShell:

```powershell
.\iniciar.ps1
```

O en dos terminales separadas:

```bash
# Terminal 1 — Backend FastAPI + SQLite (puerto 8000)
cd backend
.venv\Scripts\uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2 — Frontend React + Vite (puerto 5182)
npm run dev
```

* **Aplicación web:** http://localhost:5182
* **Documentación interactiva del API (Swagger):** http://127.0.0.1:8000/docs

## Cuentas de demostración (precargadas automáticamente en `backend/anden.db`)

| Rol | Usuario | Contraseña | Permisos |
| --- | --- | --- | --- |
| **Administrador general** | `admin` | `1234` | Control total: cursos, videos/checkpoints, aprobar accesos y **crear cuentas de Profesor / Admin** |
| **Profesor** | `profe` | `1234` | Gestiona cursos, sube videos con checkpoints y aprueba solicitudes de acceso de estudiantes |
| **Estudiante** | `diego` | `1234` | Cursos gratis + cursos autorizados, progreso inicial, 12 días de racha y certificado de *PHP desde cero* |

> Cualquier estudiante nuevo puede crear su propia cuenta desde la pestaña **Crear cuenta** en el Login (siempre con rol `estudiante`).

## Funcionalidades implementadas

1. **Backend FastAPI + SQLite (`backend/`):** API REST con JWT, PBKDF2, SQLAlchemy, seed automático de los 6 cursos / 39 lecciones / 106 preguntas y streaming HTTP Range para videos subidos (`backend/uploads/videos/`).
2. **Registro propio de estudiantes + 3 roles:** `estudiante` (auto-registro), `profesor` (solo creado por el admin general) y `admin_general`. Progreso aislado por usuario.
3. **Cursos gratis vs. restringidos:** 3 cursos gratis y 3 restringidos; los restringidos ofrecen **ambas opciones**: solicitar acceso al profesor (aprobable desde el panel) o pago simulado con referencia `SIM-...`.
4. **5 tipos de preguntas interactivas:** Opción única, Verdadero/Falso, Múltiple respuesta, Completación y Desarrollo con **auto-evaluación básica inmediata** (palabras clave + mínimo de palabras para no bloquear el aprendizaje).
5. **Porcentaje de aciertos y certificados:** cálculo real de aciertos por curso, modo repaso para mejorar nota y certificado imprimible/verificable (`/certificado/:cursoId`, código `ANDEN-2026-XXXXXX`) al completar con nota ≥ umbral.
6. **Prelación de cursos (opcional):** configurable por curso desde el panel (ej. *Bases de datos SQL* → *Python para análisis*).
7. **Colores y fondo dinámicos por curso/categoría:** el entorno del aula y el reproductor adaptan su paleta al color de cada curso manteniendo contraste legible.
8. **Timeline interactiva de checkpoints (Admin):** vista previa siempre cargada (videos existentes y nuevos) con barra clicable y marcadores arrastrables para ubicar preguntas visualmente.
9. **Favicon propio de andén:** [public/favicon.svg](public/favicon.svg) enlazado en `index.html`.
10. **Logros y árbol de habilidades 100 % dinámicos:** racha de días reales, logros con fechas de desbloqueo y árbol de ramas actualizado según los cursos y lecciones completadas.

## Pruebas automatizadas

```bash
# Pruebas del backend (FastAPI + SQLite temporal)
cd backend
.venv\Scripts\pytest -v

# Linter y build del frontend
npm run lint
npm run build
```
