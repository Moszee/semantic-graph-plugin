/**
 * Node positioning and layout algorithms
 */

/**
 * Initialize node positions using a dependency-based column layout.
 * Nodes with no inputs are placed in the first column (column 0).
 * Dependent nodes are placed in subsequent columns based on their maximum depth from root nodes.
 * @param {Array} nodes - Array of node objects
 * @returns {Object} Map of node ID to position {x, y}
 */
function initializeNodePositions(nodes) {
    const nodeWidth = 250;
    const nodeHeight = 200;
    const gapX = 80;
    const gapY = 60;
    const startX = 40;
    const startY = 40;

    const positions = {};

    // Build a lookup map for quick node access
    const nodeMap = new Map();
    nodes.forEach(node => nodeMap.set(node.id, node));

    // Calculate the column (depth) for each node based on its maximum distance from a root node
    const nodeColumns = new Map();

    function getColumn(nodeId, visited = new Set()) {
        if (nodeColumns.has(nodeId)) {
            return nodeColumns.get(nodeId);
        }

        // Prevent cycles
        if (visited.has(nodeId)) {
            return 0;
        }
        visited.add(nodeId);

        const node = nodeMap.get(nodeId);
        if (!node) {
            return 0;
        }

        // If no inputs, this is a root node -> column 0
        if (!node.inputs || node.inputs.length === 0) {
            nodeColumns.set(nodeId, 0);
            return 0;
        }

        // Column is 1 + max column of all input nodes
        let maxInputColumn = 0;
        for (const inputId of node.inputs) {
            const inputCol = getColumn(inputId, new Set(visited));
            maxInputColumn = Math.max(maxInputColumn, inputCol);
        }

        const column = maxInputColumn + 1;
        nodeColumns.set(nodeId, column);
        return column;
    }

    // Calculate columns for all nodes
    nodes.forEach(node => getColumn(node.id));

    // Group nodes by column
    const columns = new Map();
    nodes.forEach(node => {
        const col = nodeColumns.get(node.id) || 0;
        if (!columns.has(col)) {
            columns.set(col, []);
        }
        columns.get(col).push(node);
    });

    // Assign positions: each column gets nodes stacked vertically
    columns.forEach((columnNodes, colIndex) => {
        columnNodes.forEach((node, rowIndex) => {
            positions[node.id] = {
                x: startX + colIndex * (nodeWidth + gapX),
                y: startY + rowIndex * (nodeHeight + gapY)
            };
        });
    });

    return positions;
}
