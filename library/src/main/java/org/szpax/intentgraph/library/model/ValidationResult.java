package org.szpax.intentgraph.library.model;

import java.util.List;

public record ValidationResult(boolean isValid, List<String> errors) {
    public ValidationResult {
        errors = errors != null ? List.copyOf(errors) : List.of();
    }
}
