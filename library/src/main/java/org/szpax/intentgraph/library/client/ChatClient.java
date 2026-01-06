package org.szpax.intentgraph.library.client;

import java.util.List;

/**
 * Vendor-agnostic chat facade used by the library.
 * <p>
 * The library owns the tool-calling loop (RAG). Implementations (e.g. OpenAI) live outside the library
 * and translate {@link ChatMessage}/{@link ToolDefinition} to the provider SDK.
 */
public interface ChatClient {
    /**
     * Executes a single chat turn.
     *
     * @param messages conversation history (system/user/assistant/tool)
     * @param tools tool definitions available for this turn
     * @return assistant message. If the assistant requests tools, {@link ChatMessage#toolCalls()} is non-empty.
     */
    ChatMessage complete(List<ChatMessage> messages, List<ToolDefinition> tools);
}
