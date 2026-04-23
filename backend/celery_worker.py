"""Celery worker entrypoint.

Run with:
    celery -A celery_worker.celery_app worker --loglevel=info
"""

from app.celery_app import celery_app

