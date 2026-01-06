package org.szpax.intentgraph.library.client;

import java.util.Map;

public record ToolCall(
        String id,
        String name,
        Map<String, Object> arguments
) {
}
