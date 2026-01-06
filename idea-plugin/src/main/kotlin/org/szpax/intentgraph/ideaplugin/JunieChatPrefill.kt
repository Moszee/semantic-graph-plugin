package org.szpax.intentgraph.ideaplugin

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowManager
import java.awt.Component
import java.awt.KeyboardFocusManager
import java.awt.datatransfer.StringSelection
import javax.swing.JComponent
import javax.swing.text.JTextComponent

/**
 * Best-effort bridge to Junie / AI Chat.
 *
 * There is no stable public API to programmatically "send" a message to Junie.
 * The only supported interaction we can emulate is pre-populating the input box.
 */
object JunieChatPrefill {
    private const val NOTIFICATION_GROUP_ID = "org.szpax.intentgraph.IntentGraph"

    private val toolWindowIdCandidates = listOf(
        "Junie",
        "AI Chat",
        "AI Assistant",
        "AI",
    )

    fun prefillOrCopy(project: Project, text: String) {
        ApplicationManager.getApplication().invokeLater {
            val toolWindow = findToolWindow(project)
            if (toolWindow == null) {
                copyToClipboardAndNotify(project, text, "Junie / AI Chat tool window not found. Prompt copied to clipboard.")
                return@invokeLater
            }

            toolWindow.activate {
                ApplicationManager.getApplication().invokeLater {
                    val filled = tryPrefillToolWindow(toolWindow, text)
                    if (!filled) {
                        copyToClipboardAndNotify(project, text, "Could not prefill Junie / AI Chat input. Prompt copied to clipboard.")
                    }
                }
            }
        }
    }

    private fun findToolWindow(project: Project): ToolWindow? {
        val manager = ToolWindowManager.getInstance(project)
        return toolWindowIdCandidates
            .asSequence()
            .mapNotNull { manager.getToolWindow(it) }
            .firstOrNull()
    }

    private fun tryPrefillToolWindow(toolWindow: ToolWindow, text: String): Boolean {
        // 1) If a text component is already focused (after activation), prefer it.
        val focusOwner = KeyboardFocusManager.getCurrentKeyboardFocusManager().focusOwner
        if (focusOwner is JTextComponent && focusOwner.isEditable && focusOwner.isEnabled) {
            focusOwner.text = text
            focusOwner.caretPosition = focusOwner.text.length
            return true
        }

        // 2) Otherwise, scan for editable text components inside the tool window.
        val root = toolWindow.component ?: return false
        val candidates = collectTextComponents(root)
            .filter { it.isEditable && it.isEnabled && it.isShowing }
            .toList()

        if (candidates.isEmpty()) return false

        val best = candidates.maxBy { score(it) }
        best.text = text
        best.caretPosition = best.text.length
        best.requestFocusInWindow()
        return true
    }

    private fun collectTextComponents(root: Component): Sequence<JTextComponent> = sequence {
        val queue = ArrayDeque<Component>()
        queue.add(root)
        while (queue.isNotEmpty()) {
            val c = queue.removeFirst()
            if (c is JTextComponent) yield(c)
            if (c is JComponent) {
                for (i in 0 until c.componentCount) {
                    queue.add(c.getComponent(i))
                }
            }
        }
    }

    private fun score(c: JTextComponent): Int {
        var s = 0
        val name = c.accessibleContext?.accessibleName.orEmpty().lowercase()
        val tooltip = c.toolTipText.orEmpty().lowercase()
        val compName = c.name.orEmpty().lowercase()
        val combined = "$name $tooltip $compName"
        if (combined.contains("prompt")) s += 5
        if (combined.contains("message")) s += 5
        if (combined.contains("chat")) s += 3
        if (combined.contains("ask")) s += 2
        // Slight bias towards smaller components (message input is usually shorter than history view).
        val h = c.height
        if (h in 1..120) s += 2
        return s
    }

    private fun copyToClipboardAndNotify(project: Project, text: String, message: String) {
        CopyPasteManager.getInstance().setContents(StringSelection(text))
        val notificationGroup = NotificationGroupManager.getInstance().getNotificationGroup(NOTIFICATION_GROUP_ID)
        Notifications.Bus.notify(
            notificationGroup.createNotification(message, NotificationType.INFORMATION),
            project,
        )
    }
}
