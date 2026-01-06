package org.szpax.intentgraph.ideaplugin

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import com.intellij.openapi.project.Project
import org.szpax.intentgraph.library.IntentGraphLibrary
import org.szpax.intentgraph.library.client.ChatClient
import org.szpax.intentgraph.library.model.IntentGraph
import org.szpax.intentgraph.library.model.IntentNode
import org.szpax.intentgraph.library.delta.IntentGraphDelta
import java.io.File

class IntentGraphViewModel(private val project: Project) {
    var rootPath: String? = null
    var graph by mutableStateOf<IntentGraph?>(null)
    var selectedNode by mutableStateOf<IntentNode?>(null)
    var deltas by mutableStateOf<List<IntentGraphDelta>>(emptyList())
    var selectedDelta by mutableStateOf<IntentGraphDelta?>(null)
    var promptText by mutableStateOf("")
    var attachedNodes by mutableStateOf<Set<String>>(emptySet())
    var nodePositions by mutableStateOf<Map<String, Offset>>(emptyMap())

    private fun getChatClient(): ChatClient? {
        val settings = IntentGraphSettings.getInstance(project).state
        if (settings.apiKey.isBlank()) return null
        return OpenAILLMClient(settings.apiKey, settings.model, settings.baseUrl)
    }

    fun selectNode(node: IntentNode?) {
        selectedNode = node
    }

    fun toggleNodeAttachment(nodeId: String) {
        attachedNodes = if (attachedNodes.contains(nodeId)) {
            attachedNodes - nodeId
        } else {
            attachedNodes + nodeId
        }
    }

    fun loadProjectGraph(path: String) {
        this.rootPath = path
        val library = IntentGraphLibrary()
        graph = library.loadGraph(path)
        graph?.let {
            nodePositions = calculateInitialLayout(it)
        }
    }

    fun implementSelectedDelta() {
        val delta = selectedDelta ?: return
        val path = rootPath ?: return
        val library = IntentGraphLibrary()
        
        // 1. Persist the intent change
        library.writeDelta(delta, path)
        
        // 2. Hand off implementation to Junie / AI Chat.
        // There is no reliable way to programmatically "send" a message to Junie.
        // The only supported interaction is pre-populating the chat input box.
        val deltaFile = File(path, "intent/deltas/${delta.deltaId()}.yaml")
        val prompt = """
            Implement the following Intent Graph delta in this repository.

            Repository root:
            $path

            Delta file (YAML):
            ${deltaFile.path}

            Delta summary:
            - ID: ${delta.deltaId()}
            - Intent: ${delta.intent()}
            - Operations: ${delta.operations()}

            Notes:
            - The delta has already been persisted and applied to the intent graph files under `intent/`.
            - Please change the codebase to match the updated intent graph behavior.
        """.trimIndent()

        JunieChatPrefill.prefillOrCopy(project, prompt)

        loadProjectGraph(path)
        selectedDelta = null
    }

    fun discardSelectedDelta() {
        val delta = selectedDelta ?: return
        deltas = deltas - delta
        selectedDelta = null
    }

    fun sendPrompt() {
        val chatClient = getChatClient() ?: return
        val path = rootPath ?: return
        val library = IntentGraphLibrary()

        val effectivePrompt = buildString {
            append(promptText)
            if (attachedNodes.isNotEmpty()) {
                append("\n\nAttached node ids (optional hints for tool usage):\n")
                attachedNodes.sorted().forEach { id ->
                    append("- ").append(id).append('\n')
                }
                append("You may call get_nodes with these ids if helpful.\n")
            }
        }.trim()

        val newDelta = library.generateDelta(effectivePrompt, path, chatClient)
        deltas = deltas + newDelta
        selectedDelta = newDelta
        promptText = ""
        attachedNodes = emptySet()
    }

    private fun calculateInitialLayout(graph: IntentGraph): Map<String, Offset> {
        val positions = mutableMapOf<String, Offset>()
        var x = 50f
        var y = 50f
        graph.nodes().values.forEach { node ->
            positions[node.id()] = Offset(x, y)
            x += 250f
            if (x > 750f) {
                x = 50f
                y += 150f
            }
        }
        return positions
    }
}
