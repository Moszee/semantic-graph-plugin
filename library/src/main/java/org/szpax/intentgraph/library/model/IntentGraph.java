package org.szpax.intentgraph.library.model;

import java.util.Map;

public record IntentGraph(Map<String, IntentNode> nodes) {
    public IntentGraph {
        nodes = nodes != null ? Map.copyOf(nodes) : Map.of();
    }
}
