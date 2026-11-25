"""Создание схемы и демо-данных.

    python -m app.seed           # создать отсутствующее и загрузить демо
    python -m app.seed --reset   # удалить всё и восстановить стенд
"""

from __future__ import annotations

import argparse

from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.services.seed import initialise_database, reset_demo_data

logger = get_logger("seed.cli")


def main() -> None:
    parser = argparse.ArgumentParser(description="Подготовка БД AI Engineer")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Удалить данные и восстановить начальные аккаунты и протоколы",
    )
    args = parser.parse_args()

    configure_logging(settings.log_level)
    if args.reset:
        reset_demo_data()
        print("Демо-стенд восстановлен.")
    else:
        initialise_database()
        print("База готова.")


if __name__ == "__main__":
    main()
