package org.szpax.intentgraph.library.client;

import java.util.List;

public record ChatMessage(
        ChatRole role,
        String content,
        String toolName,
        String toolCallId,
        List<ToolCall> toolCalls
) {
    public static ChatMessage system(String content) {
        return new ChatMessage(ChatRole.SYSTEM, content, null, null, null);
    }

    public static ChatMessage user(String content) {
        return new ChatMessage(ChatRole.USER, content, null, null, null);
    }

    public static ChatMessage assistant(String content, List<ToolCall> toolCalls) {
        return new ChatMessage(ChatRole.ASSISTANT, content, null, null, toolCalls);
    }

    public static ChatMessage tool(String toolName, String toolCallId, String content) {
        return new ChatMessage(ChatRole.TOOL, content, toolName, toolCallId, null);
    }
}
