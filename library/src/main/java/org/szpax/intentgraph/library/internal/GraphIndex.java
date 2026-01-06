package org.szpax.intentgraph.library.internal;

import org.szpax.intentgraph.library.model.*;
import java.util.*;

public class GraphIndex {
    private final Map<String, IntentNode> nodes;
    private final Map<String, Set<String>> downstream = new HashMap<>();
    private final Map<String, Set<String>> upstream = new HashMap<>();
    private final Map<NodeType, List<String>> byType = new EnumMap<>(NodeType.class);
    private final Map<String, Set<String>> byEntryPoint = new HashMap<>();

    public GraphIndex(Map<String, IntentNode> nodes) {
        this.nodes = Map.copyOf(nodes);
        for (NodeType type : NodeType.values()) {
            byType.put(type, new ArrayList<>());
        }

        for (IntentNode node : nodes.values()) {
            byType.get(node.type()).add(node.id());
            for (EntryPoint ep : node.entryPoints()) {
                byEntryPoint.computeIfAbsent(ep.ref(), k -> new HashSet<>()).add(node.id());
            }
            for (NodeReference input : node.inputs()) {
                upstream.computeIfAbsent(node.id(), k -> new HashSet<>()).add(input.ref());
                downstream.computeIfAbsent(input.ref(), k -> new HashSet<>()).add(node.id());
            }
            for (NodeReference output : node.outputs()) {
                downstream.computeIfAbsent(node.id(), k -> new HashSet<>()).add(output.ref());
                upstream.computeIfAbsent(output.ref(), k -> new HashSet<>()).add(node.id());
            }
        }
    }

    public IntentNode getNodeById(String id) {
        return nodes.get(id);
    }

    public List<IntentNode> getNodesByType(NodeType type) {
        List<String> ids = byType.get(type);
        if (ids == null) return List.of();
        return ids.stream().map(nodes::get).filter(Objects::nonNull).toList();
    }

    public List<IntentNode> getDownstream(String nodeId) {
        Set<String> ids = downstream.get(nodeId);
        if (ids == null) return List.of();
        return ids.stream().map(nodes::get).filter(Objects::nonNull).toList();
    }

    public List<IntentNode> getUpstream(String nodeId) {
        Set<String> ids = upstream.get(nodeId);
        if (ids == null) return List.of();
        return ids.stream().map(nodes::get).filter(Objects::nonNull).toList();
    }

    public List<IntentNode> getNodesByEntryPointRef(String entryPointRef) {
        Set<String> ids = byEntryPoint.get(entryPointRef);
        if (ids == null) return List.of();
        return ids.stream().map(nodes::get).filter(Objects::nonNull).toList();
    }

    public IntentGraph getSubgraphByEntryPoint(String entryPointRef) {
        List<IntentNode> entryNodes = getNodesByEntryPointRef(entryPointRef);
        Map<String, IntentNode> resultNodes = new HashMap<>();
        Deque<IntentNode> queue = new ArrayDeque<>(entryNodes);

        while (!queue.isEmpty()) {
            IntentNode node = queue.removeFirst();
            if (!resultNodes.containsKey(node.id())) {
                resultNodes.put(node.id(), node);
                for (IntentNode next : getDownstream(node.id())) {
                    queue.addLast(next);
                }
            }
        }
        return new IntentGraph(resultNodes);
    }
}
