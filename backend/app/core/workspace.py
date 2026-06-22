import logging

logger = logging.getLogger(__name__)

# Active workspace stored in RAM (defaults to "PRODUCTION" initially)
_active_workspace_id = "PRODUCTION"

def get_active_workspace() -> str:
    """Retrieve the current active workspace ID from RAM."""
    global _active_workspace_id
    return _active_workspace_id

def set_active_workspace(workspace_id: str):
    """Set the current active workspace ID in RAM."""
    global _active_workspace_id
    if workspace_id:
        cleaned = workspace_id.strip().upper()
        if cleaned:
            _active_workspace_id = cleaned
            logger.info(f"Active workspace updated in RAM to: {_active_workspace_id}")
