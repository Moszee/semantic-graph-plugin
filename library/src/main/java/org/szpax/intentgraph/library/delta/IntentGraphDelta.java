package org.szpax.intentgraph.library.delta;

import java.util.List;

public record IntentGraphDelta(
    String deltaId,
    String intent,
    List<DeltaOperation> operations
) {
    public IntentGraphDelta {
        operations = operations != null ? List.copyOf(operations) : List.of();
    }
}
