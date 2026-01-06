package org.szpax.intentgraph.library.client;

/**
 * @deprecated Replaced by the vendor-agnostic {@link ChatClient} facade.
 * The library now owns the tool-calling loop and expects providers to implement {@link ChatClient}.
 */
@FunctionalInterface
@Deprecated(forRemoval = true)
public interface LLMClient {
    String generate(String systemPrompt, String userPrompt);
}
