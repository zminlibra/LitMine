"""Main arq worker entry point."""
from arq import Worker
from arq.connections import RedisSettings
from app.config import get_settings

from app.workers.crawl_paper_job import crawl_paper_job
from app.workers.generate_report_job import generate_report_job
from app.workers.parse_uploaded_pdf_job import parse_uploaded_pdf_job

settings = get_settings()


class WorkerSettings:
    functions = [crawl_paper_job, generate_report_job, parse_uploaded_pdf_job]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = 5
    poll_delay = 0.5
    job_timeout = 600  # 10 minutes for long-running crawl jobs
