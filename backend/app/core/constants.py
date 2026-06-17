"""Constants used across the backend application."""

MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB
DEFAULT_WORKSPACE_ID = "TEST"

# Supported mime types and extensions for ingestion
MIME_TO_EXT = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "text/html": ".html",
    "text/markdown": ".md",
    "text/plain": ".txt",
}

ALLOWED_EXTENSIONS = ["txt", "md", "html", "pdf", "docx"]
