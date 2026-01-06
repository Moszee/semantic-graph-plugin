package org.szpax.intentgraph.ideaplugin

import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import androidx.compose.ui.awt.ComposePanel

class IntentGraphToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val viewModel = IntentGraphViewModel(project)
        viewModel.loadProjectGraph(project.basePath ?: "")
        
        val composePanel = ComposePanel()
        composePanel.setContent {
            IntentGraphMainScreen(viewModel)
        }
        
        val content = ContentFactory.getInstance().createContent(composePanel, "", false)
        toolWindow.contentManager.addContent(content)
    }
}
