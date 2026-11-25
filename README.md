# AI Engineer

Лабораторная работа №4 по дисциплине «Программно-аппаратные средства защиты информации» (ПАСЗИ),
вариант 3 — ролевая модель доступа.

Полный стек: React-интерфейс, FastAPI, PostgreSQL и Docker Compose. Frontend умеет работать
автономно на моках, а в контейнере и в режиме `VITE_API_MODE=http` использует реальный backend:
регистрацию, серверные сессии, проверку ролей и протоколы испытаний.

## Быстрый запуск

```sh
cp .env.example .env
```

В `.env` замените `POSTGRES_PASSWORD` и `SECRET_KEY`. Пароль должен совпадать в
`POSTGRES_PASSWORD` и `DATABASE_URL`; секрет удобно получить командой `openssl rand -hex 32`.

```sh
docker compose up --build
```

- Frontend: http://localhost:8080
- Backend и Swagger: http://localhost:8000/docs
- PostgreSQL: `127.0.0.1:5433` (внутри сети контейнеров — порт 5432)

Backend при старте применяет миграции Alembic и загружает справочник ролей, демо-аккаунты и три
протокола. Остановка — `docker compose down`, полная очистка данных — `docker compose down -v`.

## Демо-профили

На странице `/demo` доступен вход без пароля. Демовход включается переменными
`APP_ENV=development|test` и `DEMO_AUTH_ENABLED=true`; в `.env.example` он включён.

| Профиль | Начальная роль | Права |
|---|---|---|
| `operator_01` | Оператор | чтение протоколов |
| `diagnostics_01` | Диагност | чтение и проверка протоколов |
| `architect_01` | Архитектор | чтение, проверка и назначение ролей |
| `student` | Оператор | чтение протоколов |

Демо-аккаунты не имеют пароля для обычного входа — они открываются только через `/api/auth/demo`.
Роли демопрофилей можно менять, и повторный демовход вернёт уже сохранённый набор.

Восстановление исходного стенда (удаляет пользователей, сессии и протоколы):

```sh
docker compose exec backend python -m app.seed --reset
```

## Локальный запуск

Только frontend на моках — backend и БД не нужны:

```sh
cd frontend
npm ci
npm run dev -- --host 127.0.0.1
```

Frontend откроется на http://127.0.0.1:5173.

Backend локально (Windows: `.venv\Scripts\activate`):

```sh
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt

export APP_ENV=development
export DATABASE_URL=sqlite+pysqlite:///./ai_engineer.db
export DEMO_AUTH_ENABLED=true
export SECRET_KEY=local-development-secret
export ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000

alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload
```

Схему создаёт Alembic: без `alembic upgrade head` приложение не запустится. После миграции
`python -m app.seed` загружает справочник и демо-данные.

Для работы frontend с этим backend:

```sh
cd frontend
VITE_API_MODE=http npm run dev -- --host 127.0.0.1
```

Vite проксирует `/api` на `http://127.0.0.1:8000`. Origin `http://127.0.0.1:5173` должен быть
в `ALLOWED_ORIGINS` — он указан выше и в `.env.example`.

## Роли

| Код | Роль | Права |
|---|---|---|
| `operator` | Оператор | `runs:read` |
| `diagnostician` | Диагност | `runs:read`, `runs:review` |
| `architect` | Архитектор | `runs:read`, `runs:review`, `roles:manage` |

Права нескольких ролей объединяются без повторов. Новый аккаунт получает `operator`. Архитектор
может полностью заменить роли любого участника, включая себя; проверка `roles:manage` выполняется
по состоянию до изменения. Backend проверяет права при каждом запросе, поэтому изменения действуют
в уже открытой сессии. Если Архитектор снимает роль с себя, интерфейс перечитывает `/api/me` и
убирает управление участниками.

## API

Все маршруты начинаются с `/api`. Контракт подробно описан в [Docs/API.md](Docs/API.md) и
[Docs/openapi.yaml](Docs/openapi.yaml).

| Метод и адрес | Действие | Доступ |
|---|---|---|
| `POST /api/register` | Создать аккаунт | публичный |
| `POST /api/auth/login` | Войти по паролю | публичный |
| `POST /api/auth/demo` | Войти в демопрофиль | учебный режим |
| `POST /api/auth/logout` | Выйти | текущая сессия, если есть |
| `GET /api/me` | Текущий профиль | сессия |
| `GET /api/roles` | Матрица ролей | публичный |
| `GET /api/runs` | Список протоколов | `runs:read` |
| `GET /api/runs/{runId}` | Полный протокол | `runs:read` |
| `PATCH /api/runs/{runId}/review` | Принять или вернуть протокол | `runs:review` |
| `GET /api/users` | Участники | `roles:manage` |
| `PUT /api/users/{userId}/roles` | Заменить роли участника | `roles:manage` |

Ошибки приходят в виде `{"code": "...", "message": "...", "fields": {...}}`. Для `POST`, `PATCH`
и `PUT` проверяется заголовок `Origin`; ответы API отдаются с `Cache-Control: no-store`.

## База данных и миграции

Таблицы: `users`, `roles`, `role_permissions`, `user_roles`, `user_sessions`, `runs`. Логин
уникален без учёта регистра через индекс `login_lower`; пароль хранится только в виде хэша.
Сессии лежат на сервере, в БД хранится HMAC от токена из cookie.

```sh
cd backend
alembic upgrade head
alembic revision --autogenerate -m "describe change"
```

В Docker миграцию выполняет `backend/entrypoint.sh` перед запуском uvicorn.

## Тесты

```sh
cd backend
pytest              # 24 проверки API на SQLite в памяти

cd ../frontend
npm test            # 76 проверок интерфейса и HTTP-адаптеров
npm run lint
npm run build
```

Backend-тесты покрывают регистрацию, дублирующий логин, слабые пароли, вход/выход, отзыв старой
сессии, Origin, демовход, чтение и проверку протоколов, назначение ролей и снятие роли
Архитектора с себя.

## Безопасность: что сделано

- Argon2id с настраиваемыми `ARGON2_TIME_COST`, `ARGON2_MEMORY_COST`, `ARGON2_PARALLELISM`;
  поддерживается `HASH_SCHEME=bcrypt`.
- Пароль не пишется в логи и не возвращается в ответах; для неизвестного логина всё равно
  выполняется проверка хэша, чтобы вход не отличался по времени.
- Уникальный индекс логина без учёта регистра; пользователь и роль создаются в одной транзакции.
- Cookie `ai_engineer_session`: `HttpOnly`, `SameSite=Lax`, `Path=/api`, конечный `Max-Age`,
  `Secure` при HTTPS. Серверный токен хранится как HMAC-SHA256; вход и демовход отзывают
  предыдущую сессию клиента.
- Проверка `Origin` для изменяющих запросов, `Cache-Control: no-store`, единый формат ошибок.
- RBAC проверяется на backend; скрытие кнопок во frontend не заменяет серверную проверку.
- Структурированные JSON-логи INFO/ERROR без сырых паролей и тел запросов.

## Структура

```text
frontend/       React, TypeScript, Vite, 3D-робот, моки и HTTP-клиент
backend/
  app/
    api/        маршруты и проверка прав
    core/       настройки, роли, безопасность, логи, ошибки
    db/         SQLAlchemy engine и сессии
    models/     пользователи, роли, сессии, протоколы
    schemas/    Pydantic-схемы
    services/   регистрация, RBAC, протоколы, сиды
    main.py     app.main:app
    seed.py     python -m app.seed [--reset]
  migrations/   Alembic
  tests/        pytest
Docs/           контракт API, спецификация и материалы
compose.yaml    PostgreSQL, backend и frontend
```

Схема frontend: [Docs/assets/frontend-architecture.png](Docs/assets/frontend-architecture.png).

## Скриншоты

- [Регистрация](Docs/screenshots/01-register.png)
- [Вход](Docs/screenshots/02-login.png)
- [Журнал протоколов](Docs/screenshots/03-protocols.png)
- [Проверка протокола Диагностом](Docs/screenshots/04-protocol-review.png)
- [Матрица ролей](Docs/screenshots/05-role-matrix.png)
- [Назначение ролей участнику](Docs/screenshots/06-participants.png)

## Работа команды

| Зона | Что сделано |
|---|---|
| Frontend | React-приложение: регистрация, вход, демо-профили, журнал, проверка протоколов, матрица ролей, 3D-робот |
| Backend | FastAPI: сессии, Argon2id, RBAC, протоколы, структурированные логи |
| Database | PostgreSQL, модели SQLAlchemy, миграция Alembic, сиды и восстановление стенда |
| Тесты и документация | pytest и frontend-тесты, README, `.env.example`, контракт API |
