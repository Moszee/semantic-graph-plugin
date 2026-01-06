package org.szpax.intentgraph.library.client;

import java.util.Map;

/**
 * Tool definition for provider-agnostic function/tool calling.
 * <p>
 * {@code parametersSchema} is a JSON Schema object.
 */
public record ToolDefinition(
        String name,
        String description,
        Map<String, Object> parametersSchema
) {
}
