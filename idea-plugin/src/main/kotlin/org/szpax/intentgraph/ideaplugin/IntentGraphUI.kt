package org.szpax.intentgraph.ideaplugin

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.szpax.intentgraph.library.model.IntentNode

@Composable
fun IntentGraphMainScreen(viewModel: IntentGraphViewModel) {
    Column(modifier = Modifier.fillMaxSize().background(Color(0xFF1E1E1E))) {
        TopBar(viewModel)
        Row(modifier = Modifier.weight(1f)) {
            Box(modifier = Modifier.weight(1f).fillMaxHeight()) {
                GraphView(viewModel)
            }
            
            Box(modifier = Modifier.width(1.dp).fillMaxHeight().background(Color.Gray))
            
            Box(modifier = Modifier.width(350.dp).fillMaxHeight()) {
                IntentGraphSidePanel(viewModel)
            }
        }
    }
}

@Composable
fun TopBar(viewModel: IntentGraphViewModel) {
    Surface(elevation = 4.dp, color = Color(0xFF2D2D2D)) {
        Row(
            modifier = Modifier.fillMaxWidth().height(48.dp).padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Intent Graph", color = Color.White, fontWeight = FontWeight.Bold)
            
            Spacer(Modifier.weight(1f))
            
            DeltaSelector(viewModel)
            
            Spacer(Modifier.width(8.dp))
            
            Button(
                onClick = { viewModel.implementSelectedDelta() },
                enabled = viewModel.selectedDelta != null,
                colors = ButtonDefaults.buttonColors(backgroundColor = Color(0xFF4CAF50)),
                modifier = Modifier.height(32.dp)
            ) {
                Text("Implement", color = Color.White, fontSize = 12.sp)
            }
            
            Spacer(Modifier.width(8.dp))
            
            Button(
                onClick = { viewModel.discardSelectedDelta() },
                enabled = viewModel.selectedDelta != null,
                colors = ButtonDefaults.buttonColors(backgroundColor = Color(0xFFF44336)),
                modifier = Modifier.height(32.dp)
            ) {
                Text("Discard", color = Color.White, fontSize = 12.sp)
            }
        }
    }
}

@Composable
fun DeltaSelector(viewModel: IntentGraphViewModel) {
    var expanded by remember { mutableStateOf(false) }
    
    Box {
        Row(
            modifier = Modifier
                .border(1.dp, Color.Gray, RoundedCornerShape(4.dp))
                .clickable { expanded = true }
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                viewModel.selectedDelta?.intent() ?: "Select Delta",
                color = Color.White,
                fontSize = 12.sp
            )
            Icon(Icons.Default.ArrowDropDown, contentDescription = null, tint = Color.White)
        }
        
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            viewModel.deltas.forEach { delta ->
                DropdownMenuItem(onClick = {
                    viewModel.selectedDelta = delta
                    expanded = false
                }) {
                    Text(delta.intent())
                }
            }
            if (viewModel.deltas.isEmpty()) {
                DropdownMenuItem(onClick = { expanded = false }) {
                    Text("No deltas available")
                }
            }
        }
    }
}

@Composable
fun GraphView(viewModel: IntentGraphViewModel) {
    val nodes = viewModel.graph?.nodes()?.values?.toList() ?: emptyList()
    
    Box(modifier = Modifier.fillMaxSize()) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            nodes.forEach { node ->
                val startPos = viewModel.nodePositions[node.id()] ?: Offset.Zero
                node.outputs().forEach { output ->
                    val endPos = viewModel.nodePositions[output.ref()] ?: Offset.Zero
                    if (endPos != Offset.Zero) {
                        drawLine(
                            color = Color.Gray,
                            start = startPos + Offset(200f, 80f),
                            end = endPos + Offset(200f, 80f),
                            strokeWidth = 2f
                        )
                    }
                }
            }
        }
        
        nodes.forEach { node ->
            val position = viewModel.nodePositions[node.id()] ?: Offset(0f, 0f)
            Box(modifier = Modifier.offset(position.x.dp, position.y.dp)) {
                IntentNodeBox(node, viewModel)
            }
        }
    }
}

@Composable
fun IntentNodeBox(node: IntentNode, viewModel: IntentGraphViewModel) {
    val isSelected = viewModel.selectedNode?.id() == node.id()
    val isDeltaNode = viewModel.selectedDelta?.operations()?.any { it.target() == node.id() } ?: false
    
    Card(
        modifier = Modifier
            .width(200.dp)
            .clickable { viewModel.selectNode(node) }
            .border(
                width = if (isSelected) 2.dp else 1.dp,
                color = if (isSelected) Color.Cyan else if (isDeltaNode) Color.Yellow else Color.Gray,
                shape = RoundedCornerShape(4.dp)
            ),
        backgroundColor = Color(0xFF3C3F41)
    ) {
        Column(modifier = Modifier.padding(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(node.type().name, fontSize = 10.sp, color = Color.LightGray, modifier = Modifier.weight(1f))
                if (isDeltaNode) {
                    Text("DELTA", color = Color.Yellow, fontSize = 8.sp, fontWeight = FontWeight.Bold)
                }
            }
            Text(node.name(), fontWeight = FontWeight.Bold, color = Color.White)
            Text(node.description() ?: "", fontSize = 11.sp, color = Color.Gray, maxLines = 2)
        }
    }
}

@Composable
fun IntentGraphSidePanel(viewModel: IntentGraphViewModel) {
    var selectedTabIndex by remember { mutableStateOf(0) }
    val tabs = if (viewModel.selectedNode != null) listOf("Node Details", "Prompt") else listOf("Prompt")
    
    if (selectedTabIndex >= tabs.size) selectedTabIndex = 0
    
    Column(modifier = Modifier.fillMaxSize().background(Color(0xFF2B2B2B))) {
        TabRow(
            selectedTabIndex = selectedTabIndex,
            backgroundColor = Color(0xFF2B2B2B),
            contentColor = Color.White
        ) {
            tabs.forEachIndexed { index, title ->
                Tab(
                    selected = selectedTabIndex == index,
                    onClick = { selectedTabIndex = index },
                    text = { Text(title, fontSize = 12.sp) }
                )
            }
        }
        
        Box(modifier = Modifier.weight(1f).padding(16.dp)) {
            when (tabs[selectedTabIndex]) {
                "Node Details" -> NodeDetailsTab(viewModel)
                "Prompt" -> PromptTab(viewModel)
            }
        }
    }
}

@Composable
fun NodeDetailsTab(viewModel: IntentGraphViewModel) {
    val node = viewModel.selectedNode ?: return
    val isDeltaNode = viewModel.selectedDelta?.operations()?.any { it.target() == node.id() } ?: false
    val isAttached = viewModel.attachedNodes.contains(node.id())
    
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Node: ${node.name()}", color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            if (isDeltaNode) {
                Text("DELTA", color = Color.Yellow, fontSize = 10.sp, modifier = Modifier.padding(end = 8.dp))
            }
            Button(
                onClick = { viewModel.toggleNodeAttachment(node.id()) },
                colors = ButtonDefaults.buttonColors(backgroundColor = if (isAttached) Color.Gray else Color(0xFF3574F0)),
                modifier = Modifier.height(24.dp),
                contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp)
            ) {
                Text(if (isAttached) "Detach" else "Attach", fontSize = 10.sp, color = Color.White)
            }
        }
        Spacer(Modifier.height(8.dp))
        Text("Type: ${node.type()}", color = Color.LightGray, fontSize = 12.sp)
        Spacer(Modifier.height(16.dp))
        Text("Description:", color = Color.LightGray, fontSize = 12.sp)
        
        if (isDeltaNode) {
            var desc by remember(node.id()) { mutableStateOf(node.description() ?: "") }
            TextField(
                value = desc,
                onValueChange = { desc = it },
                modifier = Modifier.fillMaxWidth(),
                colors = TextFieldDefaults.textFieldColors(
                    textColor = Color.White,
                    backgroundColor = Color(0xFF3C3F41),
                    focusedIndicatorColor = Color.Cyan
                )
            )
        } else {
            Text(node.description() ?: "No description", color = Color.White, fontSize = 14.sp)
        }
    }
}

@Composable
fun PromptTab(viewModel: IntentGraphViewModel) {
    Column(modifier = Modifier.fillMaxSize()) {
        TextField(
            value = viewModel.promptText,
            onValueChange = { viewModel.promptText = it },
            modifier = Modifier.fillMaxWidth().weight(1f),
            placeholder = { Text("Ask architect AI...") },
            colors = TextFieldDefaults.textFieldColors(
                textColor = Color.White,
                backgroundColor = Color(0xFF3C3F41),
                cursorColor = Color.Cyan,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent
            )
        )
        
        Spacer(Modifier.height(8.dp))
        
        Text("Attached Nodes:", color = Color.LightGray, fontSize = 12.sp)
        LazyColumn(modifier = Modifier.height(100.dp)) {
            items(viewModel.attachedNodes.toList()) { nodeId ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(nodeId, color = Color.Cyan, fontSize = 12.sp, modifier = Modifier.weight(1f))
                    IconButton(onClick = { viewModel.toggleNodeAttachment(nodeId) }, modifier = Modifier.size(24.dp)) {
                        Icon(Icons.Default.ArrowDropDown, contentDescription = "Remove", tint = Color.Red, modifier = Modifier.size(16.dp))
                    }
                }
            }
        }
        
        Button(
            onClick = { viewModel.sendPrompt() },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(backgroundColor = Color(0xFF3574F0))
        ) {
            Text("Send Prompt", color = Color.White)
        }
    }
}
