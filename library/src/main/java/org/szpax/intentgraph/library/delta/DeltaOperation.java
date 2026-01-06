package org.szpax.intentgraph.library.delta;

import java.util.Map;

public record DeltaOperation(
    DeltaOperationType type,
    String target, // node-id
    Map<String, Object> payload
) {
    public DeltaOperation {
        payload = payload != null ? Map.copyOf(payload) : null;
    }
}
