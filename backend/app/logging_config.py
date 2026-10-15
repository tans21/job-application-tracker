import logging

_CONFIGURED = False


def setup_logging(level: int = logging.INFO) -> None:
    """Configure root logging once, with a readable timestamped format.

    Integrates with uvicorn's own loggers so app logs and access logs share
    the same formatting when run via `uvicorn app.main:app`.
    """
    global _CONFIGURED
    if _CONFIGURED:
        return
    _CONFIGURED = True

    fmt = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"
    datefmt = "%H:%M:%S"
    logging.basicConfig(level=level, format=fmt, datefmt=datefmt)

    # Keep uvicorn's handlers but align their format with ours.
    formatter = logging.Formatter(fmt, datefmt=datefmt)
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        for handler in logging.getLogger(name).handlers:
            handler.setFormatter(formatter)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
