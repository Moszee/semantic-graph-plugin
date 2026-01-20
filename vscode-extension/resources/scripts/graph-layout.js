/**
 * Node positioning and layout algorithms
 * Uses a hierarchical layout with barycentric ordering to minimize edge crossings
 */

/**
 * Initialize node positions using a dependency-based column layout with optimized ordering.
 * Nodes with no inputs are placed in the first column (column 0).
 * Dependent nodes are placed in subsequent columns based on their maximum depth from root nodes.
 * Nodes within each column are ordered to minimize edge crossings using barycentric method.
 * @param {Array} nodes - Array of node objects
 * @returns {Object} Map of node ID to position {x, y}
 */
function initializeNodePositions(nodes) {
    const nodeWidth = 250;
    const nodeHeight = 150;
    const gapX = 100;
    const gapY = 40;
    const startX = 40;
    const startY = 40;

    const positions = {};

    if (nodes.length === 0) {
        return positions;
    }

    // Build a lookup map for quick node access
    const nodeMap = new Map();
    nodes.forEach(node => nodeMap.set(node.id, node));

    // Build adjacency lists for connected node lookup
    const outgoingEdges = new Map(); // nodeId -> [targetIds]
    const incomingEdges = new Map(); // nodeId -> [sourceIds]

    nodes.forEach(node => {
        outgoingEdges.set(node.id, node.outputs || []);
        incomingEdges.set(node.id, node.inputs || []);
    });

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
        const inputs = incomingEdges.get(nodeId) || [];
        if (inputs.length === 0) {
            nodeColumns.set(nodeId, 0);
            return 0;
        }

        // Column is 1 + max column of all input nodes
        let maxInputColumn = 0;
        for (const inputId of inputs) {
            if (nodeMap.has(inputId)) {
                const inputCol = getColumn(inputId, new Set(visited));
                maxInputColumn = Math.max(maxInputColumn, inputCol);
            }
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

    // Sort column keys
    const sortedColIndices = Array.from(columns.keys()).sort((a, b) => a - b);

    // Apply barycentric ordering to minimize edge crossings
    // Process columns from left to right, then right to left, repeat
    for (let iteration = 0; iteration < 3; iteration++) {
        // Left to right pass
        for (let i = 1; i < sortedColIndices.length; i++) {
            const colIndex = sortedColIndices[i];
            const columnNodes = columns.get(colIndex);

            columnNodes.sort((a, b) => {
                const aBarycenter = calculateBarycenter(a.id, incomingEdges, nodeColumns, columns, 'left');
                const bBarycenter = calculateBarycenter(b.id, incomingEdges, nodeColumns, columns, 'left');
                return aBarycenter - bBarycenter;
            });
        }

        // Right to left pass
        for (let i = sortedColIndices.length - 2; i >= 0; i--) {
            const colIndex = sortedColIndices[i];
            const columnNodes = columns.get(colIndex);

            columnNodes.sort((a, b) => {
                const aBarycenter = calculateBarycenter(a.id, outgoingEdges, nodeColumns, columns, 'right');
                const bBarycenter = calculateBarycenter(b.id, outgoingEdges, nodeColumns, columns, 'right');
                return aBarycenter - bBarycenter;
            });
        }
    }

    // Assign positions: each column gets nodes stacked vertically
    // Center columns vertically based on the largest column
    let maxColumnHeight = 0;
    columns.forEach(columnNodes => {
        const height = columnNodes.length * (nodeHeight + gapY);
        maxColumnHeight = Math.max(maxColumnHeight, height);
    });

    columns.forEach((columnNodes, colIndex) => {
        const columnHeight = columnNodes.length * (nodeHeight + gapY);
        const offsetY = (maxColumnHeight - columnHeight) / 2;

        columnNodes.forEach((node, rowIndex) => {
            positions[node.id] = {
                x: startX + colIndex * (nodeWidth + gapX),
                y: startY + offsetY + rowIndex * (nodeHeight + gapY)
            };
        });
    });

    return positions;
}

/**
 * Calculate the barycenter (average position) of a node's neighbors
 * @param {string} nodeId - The node to calculate barycenter for
 * @param {Map} edges - The edge map to use (incoming or outgoing)
 * @param {Map} nodeColumns - Map of node ID to column index
 * @param {Map} columns - Map of column index to array of nodes
 * @param {string} direction - 'left' for incoming, 'right' for outgoing
 * @returns {number} The barycenter value
 */
function calculateBarycenter(nodeId, edges, nodeColumns, columns, direction) {
    const neighbors = edges.get(nodeId) || [];

    if (neighbors.length === 0) {
        return 0; // Default to top if no neighbors
    }

    let sum = 0;
    let count = 0;

    neighbors.forEach(neighborId => {
        const neighborCol = nodeColumns.get(neighborId);
        if (neighborCol !== undefined) {
            const columnNodes = columns.get(neighborCol);
            if (columnNodes) {
                const neighborIndex = columnNodes.findIndex(n => n.id === neighborId);
                if (neighborIndex >= 0) {
                    sum += neighborIndex;
                    count++;
                }
            }
        }
    });

    return count > 0 ? sum / count : 0;
}
