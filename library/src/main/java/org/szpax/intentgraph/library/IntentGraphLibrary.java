package org.szpax.intentgraph.library;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.szpax.intentgraph.library.client.ChatClient;
import org.szpax.intentgraph.library.client.ChatMessage;
import org.szpax.intentgraph.library.client.ChatRole;
import org.szpax.intentgraph.library.client.ToolCall;
import org.szpax.intentgraph.library.client.ToolDefinition;
import org.szpax.intentgraph.library.delta.DeltaOperation;
import org.szpax.intentgraph.library.delta.IntentGraphDelta;
import org.szpax.intentgraph.library.internal.GraphIndex;
import org.szpax.intentgraph.library.model.*;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Stream;

public class IntentGraphLibrary {
    private final ObjectMapper mapper = new ObjectMapper(new YAMLFactory());
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int MAX_TOOL_TURNS = 8;

    public IntentGraph loadGraph(String repositoryRoot) {
        File root = new File(repositoryRoot);
        File intentDir = new File(root, "intent");
        if (!intentDir.exists()) {
            return new IntentGraph(Map.of());
        }

        Map<String, IntentNode> allNodes = new HashMap<>();
        File nodesDir = new File(intentDir, "nodes");

        if (nodesDir.exists()) {
            try (Stream<Path> paths = Files.walk(nodesDir.toPath())) {
                paths.filter(Files::isRegularFile)
                     .filter(p -> p.toString().endsWith(".yaml") || p.toString().endsWith(".yml"))
                     .forEach(path -> {
                         try {
                             IntentNode node = mapper.readValue(path.toFile(), IntentNode.class);
                             allNodes.put(node.id(), node);
                         } catch (IOException e) {
                             throw new RuntimeException("Failed to parse node file " + path.toAbsolutePath() + ": " + e.getMessage(), e);
                         }
                     });
            } catch (IOException e) {
                throw new RuntimeException("Failed to walk nodes directory: " + e.getMessage(), e);
            }
        }

        return new IntentGraph(allNodes);
    }

    public ValidationResult validateGraph(IntentGraph graph) {
        List<String> errors = new ArrayList<>();
        Set<String> nodeIds = graph.nodes().keySet();

        for (IntentNode node : graph.nodes().values()) {
            // Missing references
            for (NodeReference ref : node.inputs()) {
                if (!nodeIds.contains(ref.ref())) {
                    errors.add("Node " + node.id() + " has missing input reference: " + ref.ref());
                }
            }
            for (NodeReference ref : node.outputs()) {
                if (!nodeIds.contains(ref.ref())) {
                    errors.add("Node " + node.id() + " has missing output reference: " + ref.ref());
                }
            }
        }

        // Cycles
        if (hasCycles(graph)) {
            errors.add("Graph contains cycles");
        }

        return new ValidationResult(errors.isEmpty(), errors);
    }

    private boolean hasCycles(IntentGraph graph) {
        Set<String> visited = new HashSet<>();
        Set<String> recStack = new HashSet<>();

        for (String nodeId : graph.nodes().keySet()) {
            if (isCyclic(nodeId, graph, visited, recStack)) {
                return true;
            }
        }
        return false;
    }

    private boolean isCyclic(String nodeId, IntentGraph graph, Set<String> visited, Set<String> recStack) {
        if (recStack.contains(nodeId)) return true;
        if (visited.contains(nodeId)) return false;

        visited.add(nodeId);
        recStack.add(nodeId);

        IntentNode node = graph.nodes().get(nodeId);
        if (node != null) {
            Set<String> neighbors = new HashSet<>();
            for (NodeReference ref : node.inputs()) neighbors.add(ref.ref());
            for (NodeReference ref : node.outputs()) neighbors.add(ref.ref());

            for (String neighbor : neighbors) {
                if (isCyclic(neighbor, graph, visited, recStack)) return true;
            }
        }

        recStack.remove(nodeId);
        return false;
    }

    public IntentGraph applyDelta(IntentGraph graph, IntentGraphDelta delta) {
        Map<String, IntentNode> newNodes = new HashMap<>(graph.nodes());
        for (DeltaOperation op : delta.operations()) {
            switch (op.type()) {
                case ADD_NODE -> {
                    if (op.payload() == null) throw new IllegalArgumentException("ADD_NODE requires payload");
                    IntentNode node = mapper.convertValue(op.payload(), IntentNode.class);
                    if (newNodes.containsKey(node.id())) {
                        throw new IllegalArgumentException("Node " + node.id() + " already exists");
                    }
                    newNodes.put(node.id(), node);
                }
                case UPDATE_NODE -> {
                    if (op.payload() == null) throw new IllegalArgumentException("UPDATE_NODE requires payload");
                    if (!newNodes.containsKey(op.target())) {
                        throw new IllegalArgumentException("Node " + op.target() + " not found");
                    }
                    IntentNode updated = mapper.convertValue(op.payload(), IntentNode.class);
                    newNodes.put(op.target(), updated);
                }
                case REMOVE_NODE -> {
                    newNodes.remove(op.target());
                }
                case ADD_EDGE -> {
                    IntentNode targetNode = newNodes.get(op.target());
                    if (targetNode == null) throw new IllegalArgumentException("Node " + op.target() + " not found");
                    String type = (String) op.payload().get("type");
                    String ref = (String) op.payload().get("ref");
                    if (type == null || ref == null) throw new IllegalArgumentException("ADD_EDGE requires type and ref");

                    IntentNode newNode;
                    if ("input".equals(type)) {
                        List<NodeReference> newInputs = new ArrayList<>(targetNode.inputs());
                        newInputs.add(new NodeReference(ref));
                        newNode = new IntentNode(targetNode.id(), targetNode.type(), targetNode.name(), targetNode.description(), targetNode.invariants(), targetNode.entryPoints(), newInputs, targetNode.outputs(), targetNode.metadata());
                    } else {
                        List<NodeReference> newOutputs = new ArrayList<>(targetNode.outputs());
                        newOutputs.add(new NodeReference(ref));
                        newNode = new IntentNode(targetNode.id(), targetNode.type(), targetNode.name(), targetNode.description(), targetNode.invariants(), targetNode.entryPoints(), targetNode.inputs(), newOutputs, targetNode.metadata());
                    }
                    newNodes.put(op.target(), newNode);
                }
                case REMOVE_EDGE -> {
                    IntentNode targetNode = newNodes.get(op.target());
                    if (targetNode == null) throw new IllegalArgumentException("Node " + op.target() + " not found");
                    String type = (String) op.payload().get("type");
                    String ref = (String) op.payload().get("ref");
                    if (type == null || ref == null) throw new IllegalArgumentException("REMOVE_EDGE requires type and ref");

                    IntentNode newNode;
                    if ("input".equals(type)) {
                        List<NodeReference> newInputs = targetNode.inputs().stream().filter(r -> !r.ref().equals(ref)).toList();
                        newNode = new IntentNode(targetNode.id(), targetNode.type(), targetNode.name(), targetNode.description(), targetNode.invariants(), targetNode.entryPoints(), newInputs, targetNode.outputs(), targetNode.metadata());
                    } else {
                        List<NodeReference> newOutputs = targetNode.outputs().stream().filter(r -> !r.ref().equals(ref)).toList();
                        newNode = new IntentNode(targetNode.id(), targetNode.type(), targetNode.name(), targetNode.description(), targetNode.invariants(), targetNode.entryPoints(), targetNode.inputs(), newOutputs, targetNode.metadata());
                    }
                    newNodes.put(op.target(), newNode);
                }
            }
        }
        IntentGraph newGraph = new IntentGraph(newNodes);
        ValidationResult validation = validateGraph(newGraph);
        if (!validation.isValid()) {
            throw new IllegalArgumentException("Applying delta resulted in invalid graph: " + validation.errors());
        }
        return newGraph;
    }

    public void writeDelta(IntentGraphDelta delta, String repositoryRoot) {
        File root = new File(repositoryRoot);
        File deltasDir = new File(root, "intent/deltas");
        deltasDir.mkdirs();
        File deltaFile = new File(deltasDir, delta.deltaId() + ".yaml");
        try {
            mapper.writeValue(deltaFile, delta);
        } catch (IOException e) {
            throw new RuntimeException("Failed to write delta file: " + e.getMessage(), e);
        }

        IntentGraph graph = loadGraph(repositoryRoot);
        IntentGraph updatedGraph = applyDelta(graph, delta);
        persistGraph(updatedGraph, repositoryRoot);
    }

    private void persistGraph(IntentGraph graph, String repositoryRoot) {
        File root = new File(repositoryRoot);
        File nodesDir = new File(root, "intent/nodes");

        for (IntentNode node : graph.nodes().values()) {
            File typeDir = new File(nodesDir, node.type().name());
            typeDir.mkdirs();
            File nodeFile = new File(typeDir, node.id() + ".yaml");
            try {
                mapper.writeValue(nodeFile, node);
            } catch (IOException e) {
                throw new RuntimeException("Failed to write node file: " + e.getMessage(), e);
            }
        }

        // Handle removals
        if (nodesDir.exists()) {
            try (Stream<Path> paths = Files.walk(nodesDir.toPath())) {
                paths.filter(Files::isRegularFile)
                     .filter(p -> p.toString().endsWith(".yaml") || p.toString().endsWith(".yml"))
                     .forEach(path -> {
                         try {
                             IntentNode node = mapper.readValue(path.toFile(), IntentNode.class);
                             if (!graph.nodes().containsKey(node.id())) {
                                 Files.delete(path);
                             }
                         } catch (IOException e) {
                             // Ignore
                         }
                     });
            } catch (IOException e) {
                // Ignore
            }
        }
    }

    public IntentNode getNodeById(IntentGraph graph, String id) {
        return new GraphIndex(graph.nodes()).getNodeById(id);
    }

    public List<IntentNode> getNodesByType(IntentGraph graph, NodeType type) {
        return new GraphIndex(graph.nodes()).getNodesByType(type);
    }

    public IntentGraph getSubgraphByEntryPoint(IntentGraph graph, String entryPointRef) {
        return new GraphIndex(graph.nodes()).getSubgraphByEntryPoint(entryPointRef);
    }

    public List<IntentNode> getDownstream(IntentGraph graph, String nodeId) {
        return new GraphIndex(graph.nodes()).getDownstream(nodeId);
    }

    public List<IntentNode> getUpstream(IntentGraph graph, String nodeId) {
        return new GraphIndex(graph.nodes()).getUpstream(nodeId);
    }

    private static final String DEFAULT_SYSTEM_PROMPT = loadDefaultSystemPrompt();

    private static String loadDefaultSystemPrompt() {
        try (var is = IntentGraphLibrary.class.getResourceAsStream("/prompts/system-prompt.txt")) {
            if (is == null) {
                throw new RuntimeException("Default system prompt not found in classpath: /prompts/system-prompt.txt");
            }
            return new String(is.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new RuntimeException("Failed to load default system prompt", e);
        }
    }

    public IntentGraphDelta generateDelta(String prompt, String repositoryRoot, ChatClient chatClient) {
        return generateDelta(DEFAULT_SYSTEM_PROMPT, prompt, repositoryRoot, chatClient);
    }

    public IntentGraphDelta generateDelta(String systemPrompt, String prompt, String repositoryRoot, ChatClient chatClient) {
        IntentGraph graph = loadGraph(repositoryRoot);
        return generateDelta(systemPrompt, prompt, graph, chatClient);
    }

    public IntentGraphDelta generateDelta(String systemPrompt, String prompt, IntentGraph graph, ChatClient chatClient) {
        List<ChatMessage> messages = new ArrayList<>();
        messages.add(ChatMessage.system(systemPrompt));
        messages.add(ChatMessage.user(prompt));

        List<ToolDefinition> tools = defaultTools();

        for (int turn = 0; turn < MAX_TOOL_TURNS; turn++) {
            ChatMessage assistant = chatClient.complete(Collections.unmodifiableList(messages), tools);
            if (assistant == null) {
                throw new IllegalStateException("ChatClient returned null message");
            }
            if (assistant.role() != ChatRole.ASSISTANT) {
                throw new IllegalStateException("ChatClient must return an ASSISTANT message, got: " + assistant.role());
            }
            messages.add(assistant);

            List<ToolCall> toolCalls = assistant.toolCalls();
            if (toolCalls != null && !toolCalls.isEmpty()) {
                for (ToolCall call : toolCalls) {
                    String toolOutput = executeTool(call, graph);
                    messages.add(ChatMessage.tool(call.name(), call.id(), toolOutput));
                }
                continue;
            }

            String content = assistant.content();
            if (content == null || content.isBlank()) {
                throw new IllegalStateException("Assistant returned no content and no tool calls");
            }
            return parseDeltaFromAI(content);
        }
        throw new IllegalStateException("Exceeded max tool turns (" + MAX_TOOL_TURNS + ") while generating delta");
    }

    private List<ToolDefinition> defaultTools() {
        List<ToolDefinition> tools = new ArrayList<>();
        tools.add(new ToolDefinition(
                "get_node",
                "Get a single intent node by id.",
                Map.of(
                        "type", "object",
                        "properties", Map.of(
                                "id", Map.of("type", "string")
                        ),
                        "required", List.of("id")
                )
        ));
        tools.add(new ToolDefinition(
                "get_nodes",
                "Get multiple intent nodes by ids.",
                Map.of(
                        "type", "object",
                        "properties", Map.of(
                                "ids", Map.of(
                                        "type", "array",
                                        "items", Map.of("type", "string")
                                )
                        ),
                        "required", List.of("ids")
                )
        ));
        tools.add(new ToolDefinition(
                "get_subgraph_by_entry_point",
                "Get a subgraph reachable from an entry point ref (exact match).",
                Map.of(
                        "type", "object",
                        "properties", Map.of(
                                "entryPointRef", Map.of("type", "string")
                        ),
                        "required", List.of("entryPointRef")
                )
        ));
        tools.add(new ToolDefinition(
                "list_nodes_by_entry_points",
                "List nodes that declare entry points matching fuzzy keyword filters. Matching is case-insensitive `contains`.",
                Map.of(
                        "type", "object",
                        "properties", Map.of(
                                "filters", Map.of(
                                        "type", "array",
                                        "items", Map.of(
                                                "type", "array",
                                                "items", Map.of("type", "string")
                                        ),
                                        "description", "OR of groups; each group is AND of keywords. Example: [[\"delete\",\"users\"],[\"remove\",\"user\"]]"
                                )
                        ),
                        "required", List.of("filters")
                )
        ));
        return tools;
    }

    private String executeTool(ToolCall call, IntentGraph graph) {
        try {
            return switch (call.name()) {
                case "get_node" -> toolGetNode(call, graph);
                case "get_nodes" -> toolGetNodes(call, graph);
                case "get_subgraph_by_entry_point" -> toolGetSubgraphByEntryPoint(call, graph);
                case "list_nodes_by_entry_points" -> toolListNodesByEntryPoints(call, graph);
                default -> JSON.writeValueAsString(Map.of(
                        "ok", false,
                        "error", "Unknown tool: " + call.name()
                ));
            };
        } catch (Exception e) {
            try {
                return JSON.writeValueAsString(Map.of(
                        "ok", false,
                        "error", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()
                ));
            } catch (Exception ignored) {
                return "{\"ok\":false,\"error\":\"Tool execution failed\"}";
            }
        }
    }

    private String toolGetNode(ToolCall call, IntentGraph graph) throws IOException {
        String id = asString(call.arguments().get("id"));
        IntentNode node = getNodeById(graph, id);
        if (node == null) {
            return JSON.writeValueAsString(Map.of("ok", false, "error", "Node not found: " + id));
        }
        return JSON.writerWithDefaultPrettyPrinter().writeValueAsString(Map.of("ok", true, "node", node));
    }

    private String toolGetNodes(ToolCall call, IntentGraph graph) throws IOException {
        List<String> ids = JSON.convertValue(call.arguments().get("ids"), new TypeReference<List<String>>() {});
        List<IntentNode> nodes = new ArrayList<>();
        List<String> missing = new ArrayList<>();
        for (String id : ids) {
            IntentNode node = getNodeById(graph, id);
            if (node == null) missing.add(id);
            else nodes.add(node);
        }
        return JSON.writerWithDefaultPrettyPrinter().writeValueAsString(Map.of(
                "ok", true,
                "nodes", nodes,
                "missing", missing
        ));
    }

    private String toolGetSubgraphByEntryPoint(ToolCall call, IntentGraph graph) throws IOException {
        String ref = asString(call.arguments().get("entryPointRef"));
        IntentGraph subgraph = getSubgraphByEntryPoint(graph, ref);
        return JSON.writerWithDefaultPrettyPrinter().writeValueAsString(Map.of(
                "ok", true,
                "entryPointRef", ref,
                "subgraph", subgraph
        ));
    }

    private String toolListNodesByEntryPoints(ToolCall call, IntentGraph graph) throws IOException {
        List<List<String>> filters = JSON.convertValue(call.arguments().get("filters"), new TypeReference<List<List<String>>>() {});
        List<IntentNode> matched = graph.nodes().values().stream()
                .filter(n -> matchesEntryPointFilters(n, filters))
                .toList();
        return JSON.writerWithDefaultPrettyPrinter().writeValueAsString(Map.of(
                "ok", true,
                "filters", filters,
                "nodes", matched
        ));
    }

    private boolean matchesEntryPointFilters(IntentNode node, List<List<String>> filters) {
        if (node.entryPoints() == null || node.entryPoints().isEmpty()) return false;
        if (filters == null || filters.isEmpty()) return true;

        String haystack = node.entryPoints().stream()
                .map(ep -> (ep.kind() == null ? "" : ep.kind().name()) + ":" + (ep.ref() == null ? "" : ep.ref()))
                .reduce("", (a, b) -> a + " " + b)
                .toLowerCase(Locale.ROOT);

        for (List<String> group : filters) {
            if (group == null || group.isEmpty()) continue;
            boolean all = true;
            for (String kw : group) {
                if (kw == null || kw.isBlank()) continue;
                if (!haystack.contains(kw.toLowerCase(Locale.ROOT))) {
                    all = false;
                    break;
                }
            }
            if (all) return true;
        }
        return false;
    }

    private static String asString(Object value) {
        if (value == null) throw new IllegalArgumentException("Missing required argument");
        if (value instanceof String s) return s;
        return String.valueOf(value);
    }

    public IntentGraphDelta parseDeltaFromAI(String aiOutput) {
        try {
            return mapper.readValue(aiOutput, IntentGraphDelta.class);
        } catch (IOException e) {
            throw new RuntimeException("Failed to parse AI output as IntentGraphDelta: " + e.getMessage(), e);
        }
    }
}
