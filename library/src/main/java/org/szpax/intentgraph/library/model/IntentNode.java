package org.szpax.intentgraph.library.model;

import java.util.List;
import java.util.Map;

public record IntentNode(
    String id,
    NodeType type,
    String name,
    String description,
    List<String> invariants,
    List<EntryPoint> entryPoints,
    List<NodeReference> inputs,
    List<NodeReference> outputs,
    Map<String, String> metadata
) {
    public IntentNode {
        invariants = invariants != null ? List.copyOf(invariants) : List.of();
        entryPoints = entryPoints != null ? List.copyOf(entryPoints) : List.of();
        inputs = inputs != null ? List.copyOf(inputs) : List.of();
        outputs = outputs != null ? List.copyOf(outputs) : List.of();
        metadata = metadata != null ? Map.copyOf(metadata) : Map.of();
    }

    // Secondary constructor for convenience if needed, similar to Kotlin's default values
    public IntentNode(String id, NodeType type, String name, String description) {
        this(id, type, name, description, List.of(), List.of(), List.of(), List.of(), Map.of());
    }
}
