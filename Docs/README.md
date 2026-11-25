# AI Engineer

Лабораторная работа №4 по ПАСЗИ, вариант 3. Приложение с регистрацией пользователей и ролевым доступом к протоколам испытаний робота.

Репозиторий объединяет frontend, backend и общий контракт API. Во frontend перенесены авторизация,
демо-профили, кабинет с протоколами, проверкой испытаний и назначением ролей, а также 3D-робот.
Frontend может работать на моках или обращаться к FastAPI в режиме `VITE_API_MODE=http`. Backend
реализован: регистрация, серверные сессии, RBAC, протоколы, миграции Alembic и тесты. Полная
инструкция запуска — в [корневом README](../README.md).

## Структура

```text
Docs/
  README.md            # Описание проекта и запуск
  API.md               # Контракт API для команды
  openapi.yaml         # Машиночитаемая спецификация
  AI-Engineer-API-v0.2.docx # Документ для backend-разработчика
frontend/
  public/              # Статические файлы
    assets/            # Модель робота, шрифты и SVG
  src/
    app/               # Маршруты и запуск React-приложения
    pages/             # Экраны регистрации, входа и кабинета
    components/        # Компоненты интерфейса и робот
    api/               # Клиент API и его демореализация
    types/             # Типы данных
    styles/            # Общие стили
    assets/            # Ресурсы, импортируемые сборщиком
backend/
  app/
    api/               # Маршруты FastAPI
    core/              # Настройки, сессии и проверка прав
    db/                # Подключение к PostgreSQL
    models/            # Модели SQLAlchemy
    schemas/           # Схемы запросов и ответов
    services/          # Регистрация и действия с протоколами
  migrations/versions/ # Миграции Alembic
  tests/               # Проверки API
```

Файлы `.gitkeep` сохраняют пустые каталоги в Git. При добавлении исходников их можно удалить из соответствующих папок.

## Контракт API

- [Описание API](API.md)
- [Спецификация OpenAPI](openapi.yaml)
- [Документ для backend-разработчика](AI-Engineer-API-v0.2.docx)

Оператор читает протоколы, Диагност проверяет их, Архитектор назначает роли. Пользователь может получить несколько ролей и объединение их прав.

## Конфигурация

Frontend использует React, TypeScript и Vite. Vite передаёт `/api` на `http://127.0.0.1:8000`,
Nginx в контейнере делает то же для production-сборки. Backend рассчитан на Python 3.13 и FastAPI,
зависимости перечислены в `backend/requirements.txt`, тестовые — в `backend/requirements-dev.txt`.
Точка входа — `app.main:app`, миграции применяет `backend/entrypoint.sh`.

Compose содержит сервисы `db`, `backend` и `frontend` и запускается без профилей. Для старта:

```sh
cp .env.example .env
# замените POSTGRES_PASSWORD и SECRET_KEY
docker compose up --build
```

Frontend будет доступен на `http://localhost:8080`, backend — на `http://localhost:8000`.
PostgreSQL опубликован на `127.0.0.1:5433` (внутри сети контейнеров — 5432), данные сохраняются
в именованном томе Docker. Демо-вход включается через `DEMO_AUTH_ENABLED=true`.

Восстановление исходных аккаунтов и протоколов:

```sh
docker compose exec backend python -m app.seed --reset
```

Backend-тесты запускаются из каталога `backend` командой `pytest`. Локальный запуск без Docker
описан в [корневом README](../README.md).

## Работа команды

Основная ветка — `main`. Для отдельных задач создавайте ветки `feature/frontend-*`, `feature/backend-*` или `feature/database-*` и объединяйте готовые изменения через pull request. Изменения API отражайте одновременно в `Docs/API.md` и `Docs/openapi.yaml`.
