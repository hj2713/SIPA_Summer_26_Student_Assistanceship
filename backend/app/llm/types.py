"""Provider-agnostic data types for LLM requests and responses.

Each provider adapter translates between these types and its native
SDK shape. Business code should only depend on the types defined here.
"""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class LLMUsage:
    """Token usage reported by the provider at the end of a response."""
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass(frozen=True)
class LLMToolCall:
    """A completed tool call (fully assembled arguments)."""
    id: str
    name: str
    arguments: str  # raw JSON string


@dataclass(frozen=True)
class LLMToolCallDelta:
    """A partial tool call observed during streaming.

    Providers stream tool calls in pieces — id and name typically arrive
    in the first chunk; arguments are appended incrementally. Callers
    accumulate these into a finished `LLMToolCall`.
    """
    id: str | None = None
    name: str | None = None
    arguments_delta: str = ""


@dataclass(frozen=True)
class LLMChunk:
    """One streamed chunk from a chat completion.

    `response_id` and `usage` are typically only populated on certain
    chunks (first/last); callers should accumulate the most recent
    non-empty value.
    """
    response_id: str = ""
    text_delta: str = ""
    tool_call_deltas: tuple[LLMToolCallDelta, ...] = ()
    usage: LLMUsage | None = None
    finish_reason: str | None = None


@dataclass(frozen=True)
class LLMMessage:
    """A single conversation message in provider-neutral form.

    Roles follow OpenAI's vocabulary ("system", "user", "assistant", "tool")
    because it's the most widely understood; provider adapters translate
    to their native role names if needed.
    """
    role: str
    content: str | None = None
    # For assistant messages requesting tool execution
    tool_calls: tuple[LLMToolCall, ...] = ()
    # For tool result messages
    tool_call_id: str | None = None
    name: str | None = None


@dataclass(frozen=True)
class LLMTool:
    """A function tool the LLM can choose to call.

    `parameters` must be a JSON Schema object describing the call args.
    """
    name: str
    description: str
    parameters: dict = field(default_factory=dict)
