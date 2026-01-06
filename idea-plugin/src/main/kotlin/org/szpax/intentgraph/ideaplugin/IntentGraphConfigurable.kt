package org.szpax.intentgraph.ideaplugin

import com.intellij.openapi.options.Configurable
import com.intellij.openapi.project.Project
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.JTextField
import java.awt.GridLayout
import javax.swing.JLabel

class IntentGraphConfigurable(private val project: Project) : Configurable {
    private val settings = IntentGraphSettings.getInstance(project)
    private var apiKeyField = JTextField()
    private var modelField = JTextField()
    private var baseUrlField = JTextField()

    override fun createComponent(): JComponent {
        val panel = JPanel(GridLayout(3, 2))
        panel.add(JLabel("OpenAI API Key:"))
        panel.add(apiKeyField)
        panel.add(JLabel("Model (e.g. gpt-4o):"))
        panel.add(modelField)
        panel.add(JLabel("Base URL:"))
        panel.add(baseUrlField)
        return panel
    }

    override fun isModified(): Boolean {
        val state = settings.state
        return apiKeyField.text != state.apiKey ||
                modelField.text != state.model ||
                baseUrlField.text != state.baseUrl
    }

    override fun apply() {
        val state = settings.state
        state.apiKey = apiKeyField.text
        state.model = modelField.text
        state.baseUrl = baseUrlField.text
    }

    override fun reset() {
        val state = settings.state
        apiKeyField.text = state.apiKey
        modelField.text = state.model
        baseUrlField.text = state.baseUrl
    }

    override fun getDisplayName(): String = "Intent Graph"
}
