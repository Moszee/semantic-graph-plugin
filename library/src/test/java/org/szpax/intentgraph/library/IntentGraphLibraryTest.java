package org.szpax.intentgraph.library;

import org.junit.jupiter.api.*;
import org.szpax.intentgraph.library.client.*;
import org.szpax.intentgraph.library.delta.*;
import org.szpax.intentgraph.library.model.*;

import java.io.File;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class IntentGraphLibraryTest {
    private final IntentGraphLibrary library = new IntentGraphLibrary();
    private final String repoRoot = "test-repo";

    @BeforeEach
    void setup() {
        deleteDirectory(new File(repoRoot));
        new File(repoRoot).mkdirs();
    }

    @AfterEach
    void teardown() {
        deleteDirectory(new File(repoRoot));
    }

    private void deleteDirectory(File file) {
        File[] contents = file.listFiles();
        if (contents != null) {
            for (File f : contents) {
                deleteDirectory(f);
            }
        }
        file.delete();
    }

    @Test
    void testSchemaValidationMissingReference() {
        IntentNode node1 = new IntentNode("n1", NodeType.behavior, "Node 1", "D1",
                List.of(), List.of(), List.of(new NodeReference("n2")), List.of(), Map.of());
        IntentGraph graph = new IntentGraph(Map.of("n1", node1));
        ValidationResult result = library.validateGraph(graph);
        assertFalse(result.isValid());
        assertTrue(result.errors().stream().anyMatch(e -> e.contains("missing input reference: n2")));
    }

    @Test
    void testSchemaValidationCycle() {
        IntentNode node1 = new IntentNode("n1", NodeType.behavior, "Node 1", "D1",
                List.of(), List.of(), List.of(), List.of(new NodeReference("n2")), Map.of());
        IntentNode node2 = new IntentNode("n2", NodeType.behavior, "Node 2", "D2",
                List.of(), List.of(), List.of(), List.of(new NodeReference("n1")), Map.of());
        IntentGraph graph = new IntentGraph(Map.of("n1", node1, "n2", node2));
        ValidationResult result = library.validateGraph(graph);
        assertFalse(result.isValid());
        assertTrue(result.errors().contains("Graph contains cycles"));
    }

    @Test
    void testDeltaApplicationAddNode() {
        IntentGraph graph = new IntentGraph(Map.of());
        IntentGraphDelta delta = new IntentGraphDelta(
                "d1",
                "Add first node",
                List.of(
                        new DeltaOperation(
                                DeltaOperationType.ADD_NODE,
                                "n1",
                                Map.of(
                                        "id", "n1",
                                        "type", "behavior",
                                        "name", "Node 1",
                                        "description", "D1"))));
        IntentGraph updated = library.applyDelta(graph, delta);
        assertEquals(1, updated.nodes().size());
        assertEquals("n1", updated.nodes().get("n1").id());
    }

    @Test
    void testDeltaApplicationRemoveNode() {
        IntentNode node1 = new IntentNode("n1", NodeType.behavior, "Node 1", "D1");
        IntentGraph graph = new IntentGraph(Map.of("n1", node1));
        IntentGraphDelta delta = new IntentGraphDelta(
                "d2",
                "Remove node",
                List.of(new DeltaOperation(DeltaOperationType.REMOVE_NODE, "n1", null)));
        IntentGraph updated = library.applyDelta(graph, delta);
        assertEquals(0, updated.nodes().size());
    }

    @Test
    void testDeltaApplicationDuplicateId() {
        IntentNode node1 = new IntentNode("n1", NodeType.behavior, "Node 1", "D1");
        IntentGraph graph = new IntentGraph(Map.of("n1", node1));
        IntentGraphDelta delta = new IntentGraphDelta(
                "d3",
                "Add duplicate node",
                List.of(
                        new DeltaOperation(
                                DeltaOperationType.ADD_NODE,
                                "n1",
                                Map.of("id", "n1", "type", "behavior", "name", "Node 1 duplicate", "description",
                                        "D1"))));
        assertThrows(IllegalArgumentException.class, () -> library.applyDelta(graph, delta));
    }

    @Test
    void testSubgraphExtraction() {
        IntentNode n1 = new IntentNode("n1", NodeType.behavior, "N1", "D1",
                List.of(), List.of(new EntryPoint(EntryPointKind.REST, "/start")), List.of(),
                List.of(new NodeReference("n2")), Map.of());
        IntentNode n2 = new IntentNode("n2", NodeType.behavior, "N2", "D2",
                List.of(), List.of(), List.of(), List.of(new NodeReference("n3")), Map.of());
        IntentNode n3 = new IntentNode("n3", NodeType.behavior, "N3", "D3");
        IntentNode n4 = new IntentNode("n4", NodeType.behavior, "N4", "D4"); // Isolated

        IntentGraph graph = new IntentGraph(Map.of("n1", n1, "n2", n2, "n3", n3, "n4", n4));
        IntentGraph subgraph = library.getSubgraphByEntryPoint(graph, "/start");

        assertEquals(3, subgraph.nodes().size());
        assertTrue(subgraph.nodes().containsKey("n1"));
        assertTrue(subgraph.nodes().containsKey("n2"));
        assertTrue(subgraph.nodes().containsKey("n3"));
        assertFalse(subgraph.nodes().containsKey("n4"));
    }

    @Test
    void testWriteAndLoadGraph() {
        IntentGraphDelta delta = new IntentGraphDelta(
                "d1",
                "Add N1",
                List.of(
                        new DeltaOperation(
                                DeltaOperationType.ADD_NODE,
                                "n1",
                                Map.of("id", "n1", "type", "behavior", "name", "N1", "description", "D1"))));

        library.writeDelta(delta, repoRoot);

        IntentGraph loaded = library.loadGraph(repoRoot);
        assertEquals(1, loaded.nodes().size());
        assertEquals("n1", loaded.nodes().get("n1").id());

        // Check file exists
        assertTrue(new File(repoRoot, "intent/nodes/behavior/n1.yaml").exists());
    }

    @Test
    void testGenerateDelta() {
        IntentNode n1 = new IntentNode(
                "n1",
                NodeType.behavior,
                "Login",
                "Handles user login",
                List.of(),
                List.of(new EntryPoint(EntryPointKind.REST, "/users/login")),
                List.of(),
                List.of(),
                Map.of());
        IntentGraph graph = new IntentGraph(Map.of("n1", n1));
        String prompt = "Add a new node for user logout";

        ChatClient fakeClient = new ChatClient() {
            private int turn = 0;

            @Override
            public ChatMessage complete(List<ChatMessage> messages, List<ToolDefinition> tools) {
                turn++;
                assertTrue(messages.stream().anyMatch(m -> m.role() == ChatRole.SYSTEM));
                assertTrue(
                        messages.stream().anyMatch(m -> m.role() == ChatRole.USER && m.content().contains("logout")));

                if (turn == 1) {
                    return ChatMessage.assistant(null, List.of(
                            new ToolCall(
                                    "call-1",
                                    "list_nodes_by_entry_points",
                                    Map.of("filters", List.of(List.of("users"), List.of("login"))))));
                }

                ChatMessage last = messages.get(messages.size() - 1);
                assertEquals(ChatRole.TOOL, last.role());
                assertEquals("list_nodes_by_entry_points", last.toolName());
                assertTrue(last.content().contains("/users/login"));

                return ChatMessage.assistant(
                        """
                                deltaId: d1
                                intent: Add user logout
                                operations:
                                  - type: ADD_NODE
                                    target: logout_node
                                    payload:
                                      id: logout_node
                                      type: behavior
                                      name: User Logout
                                      description: Handles user logout
                                """.trim(),
                        List.of());
            }
        };

        IntentGraphDelta result = library.generateDelta("SYSTEM", prompt, graph, fakeClient);

        assertNotNull(result);
        assertEquals("d1", result.deltaId());
        assertEquals(1, result.operations().size());
        assertEquals(DeltaOperationType.ADD_NODE, result.operations().get(0).type());
    }

    @Test
    void testGenerateDeltaExceedsToolTurns() {
        IntentGraph graph = new IntentGraph(Map.of());

        ChatClient loopingClient = (messages, tools) -> ChatMessage.assistant(null, List.of(
                new ToolCall("call", "get_node", Map.of("id", "n1"))));

        assertThrows(IllegalStateException.class,
                () -> library.generateDelta("SYSTEM", "anything", graph, loopingClient));
    }
}
