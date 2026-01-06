package org.szpax.intentgraph.ideaplugin

import com.intellij.openapi.components.*
import com.intellij.openapi.project.Project

@Service(Service.Level.PROJECT)
@State(name = "IntentGraphSettings", storages = [Storage("intentGraph.xml")])
class IntentGraphSettings : PersistentStateComponent<IntentGraphSettings.State> {
    class State {
        var apiKey: String = ""
        var model: String = "gpt-4o"
        var baseUrl: String = "https://api.openai.com/v1"
    }

    private var myState = State()

    override fun getState(): State = myState

    override fun loadState(state: State) {
        myState = state
    }

    companion object {
        fun getInstance(project: Project): IntentGraphSettings = project.service()
    }
}
