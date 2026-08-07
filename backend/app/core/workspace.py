import logging
import os

logger = logging.getLogger(__name__)

# Active workspace stored in RAM (defaults to "TEST" when in TEST_MODE, else "PRODUCTION")
_active_workspace_id = "TEST" if os.environ.get("TEST_MODE", "").lower() in ("1", "true", "yes") else "PRODUCTION"

def get_active_workspace() -> str:
    """Retrieve the current active workspace ID from RAM."""
    global _active_workspace_id
    if os.environ.get("TEST_MODE", "").lower() in ("1", "true", "yes"):
        return "TEST"
    return _active_workspace_id

def set_active_workspace(workspace_id: str):
    """Set the current active workspace ID in RAM."""
    global _active_workspace_id
    if os.environ.get("TEST_MODE", "").lower() in ("1", "true", "yes"):
        _active_workspace_id = "TEST"
        return
    if workspace_id:
        cleaned = workspace_id.strip().upper()
        if cleaned in ("QA", "TEST"):
            cleaned = "PRODUCTION"
        if cleaned:
            _active_workspace_id = cleaned
            logger.info(f"Active workspace updated in RAM to: {_active_workspace_id}")


