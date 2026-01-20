/**
 * Edge drawing and geometric calculations for the intent graph
 */

/**
 * Calculate closest border points between two rectangles
 * @param {Object} source - Source rectangle {x, y, width, height}
 * @param {Object} target - Target rectangle {x, y, width, height}
 * @returns {Object} Points {startX, startY, endX, endY}
 */
function getClosestBorderPoints(source, target) {
    const sourceCenterX = source.x + source.width / 2;
    const sourceCenterY = source.y + source.height / 2;
    const targetCenterX = target.x + target.width / 2;
    const targetCenterY = target.y + target.height / 2;

    // Get intersection point with source border
    const sourcePoint = getLineBorderIntersection(
        sourceCenterX, sourceCenterY,
        targetCenterX, targetCenterY,
        source.x, source.y, source.width, source.height
    );

    // Get intersection point with target border
    const targetPoint = getLineBorderIntersection(
        targetCenterX, targetCenterY,
        sourceCenterX, sourceCenterY,
        target.x, target.y, target.width, target.height
    );

    return {
        startX: sourcePoint.x,
        startY: sourcePoint.y,
        endX: targetPoint.x,
        endY: targetPoint.y
    };
}

/**
 * Get intersection of a line from center to target with rectangle border
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} tx - Target X
 * @param {number} ty - Target Y
 * @param {number} rx - Rectangle X
 * @param {number} ry - Rectangle Y
 * @param {number} rw - Rectangle width
 * @param {number} rh - Rectangle height
 * @returns {Object} Intersection point {x, y}
 */
function getLineBorderIntersection(cx, cy, tx, ty, rx, ry, rw, rh) {
    const dx = tx - cx;
    const dy = ty - cy;

    if (dx === 0 && dy === 0) {
        return { x: cx, y: cy };
    }

    // Check intersection with each edge
    let t = Infinity;
    let result = { x: cx, y: cy };

    // Right edge
    if (dx > 0) {
        const tRight = (rx + rw - cx) / dx;
        const yRight = cy + tRight * dy;
        if (yRight >= ry && yRight <= ry + rh && tRight < t) {
            t = tRight;
            result = { x: rx + rw, y: yRight };
        }
    }

    // Left edge
    if (dx < 0) {
        const tLeft = (rx - cx) / dx;
        const yLeft = cy + tLeft * dy;
        if (yLeft >= ry && yLeft <= ry + rh && tLeft < t) {
            t = tLeft;
            result = { x: rx, y: yLeft };
        }
    }

    // Bottom edge
    if (dy > 0) {
        const tBottom = (ry + rh - cy) / dy;
        const xBottom = cx + tBottom * dx;
        if (xBottom >= rx && xBottom <= rx + rw && tBottom < t) {
            t = tBottom;
            result = { x: xBottom, y: ry + rh };
        }
    }

    // Top edge
    if (dy < 0) {
        const tTop = (ry - cy) / dy;
        const xTop = cx + tTop * dx;
        if (xTop >= rx && xTop <= rx + rw && tTop < t) {
            t = tTop;
            result = { x: xTop, y: ry };
        }
    }

    return result;
}

/**
 * Get color and marker for relation type
 * @param {string} relation - Relation type (uses, triggers, filters, produces)
 * @returns {Object} Style {color, marker}
 */
function getRelationStyle(relation) {
    const styles = {
        uses: { color: 'var(--edge-uses)', marker: 'arrowhead-uses' },
        triggers: { color: 'var(--edge-triggers)', marker: 'arrowhead-triggers' },
        filters: { color: 'var(--edge-filters)', marker: 'arrowhead-filters' },
        produces: { color: 'var(--edge-produces)', marker: 'arrowhead-produces' }
    };
    return styles[relation] || { color: 'var(--edge-color)', marker: 'arrowhead-default' };
}

/**
 * Draw all edges between nodes
 * @param {Array} nodes - Array of node objects
 * @param {Object} nodePositions - Map of node positions
 */
function drawEdges(nodes, nodePositions) {
    const svg = document.getElementById('edges-svg');
    const nodeElements = document.querySelectorAll('.node');
    const nodeRects = {};

    // Build a map of node IDs from the data for validation
    const nodeIdSet = new Set(nodes.map(n => n.id));

    // Get node positions and dimensions from DOM elements
    nodeElements.forEach(el => {
        nodeRects[el.dataset.id] = {
            x: parseFloat(el.style.left) || 0,
            y: parseFloat(el.style.top) || 0,
            width: el.offsetWidth || 250,  // Default width if not yet rendered
            height: el.offsetHeight || 100  // Default height if not yet rendered
        };
    });

    // Also add nodeRects from nodePositions for any nodes not yet in DOM
    // This ensures edges can be drawn even if DOM is slightly delayed
    nodes.forEach(node => {
        if (!nodeRects[node.id] && nodePositions && nodePositions[node.id]) {
            nodeRects[node.id] = {
                x: nodePositions[node.id].x || 0,
                y: nodePositions[node.id].y || 0,
                width: 250,  // Default node width
                height: 100  // Default node height
            };
        }
    });

    // Clear existing edges
    svg.querySelectorAll('path').forEach(p => p.remove());

    // Track drawn edges to avoid duplicates (since both inputs and outputs can define the same edge)
    const drawnEdges = new Set();

    // Helper function to draw a single edge
    const drawSingleEdge = (sourceId, targetId) => {
        const edgeKey = `${sourceId}->${targetId}`;
        if (drawnEdges.has(edgeKey)) return;
        drawnEdges.add(edgeKey);

        const sourceRect = nodeRects[sourceId];
        const targetRect = nodeRects[targetId];

        if (!sourceRect) {
            console.debug(`Edge skipped: source node ${sourceId} has no rect`);
            return;
        }
        if (!targetRect) {
            console.debug(`Edge skipped: target node ${targetId} has no rect`);
            return;
        }

        // Calculate edge path with closest border points
        const points = getClosestBorderPoints(sourceRect, targetRect);

        // Create curved bezier path
        const dx = Math.abs(points.endX - points.startX);
        const dy = Math.abs(points.endY - points.startY);
        const controlOffset = Math.min(Math.max(dx, dy) * 0.4, 100);

        // Determine control point directions based on which edges connect
        const midX = (points.startX + points.endX) / 2;
        const midY = (points.startY + points.endY) / 2;

        // Use default style since outputs are just node IDs without relation info
        const style = getRelationStyle();

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${points.startX} ${points.startY} Q ${midX} ${points.startY}, ${midX} ${midY} T ${points.endX} ${points.endY}`);
        path.setAttribute('class', 'edge');
        path.setAttribute('stroke', style.color);
        path.setAttribute('marker-end', `url(#${style.marker})`);
        svg.appendChild(path);
    };

    // Draw edges for each connection (both outputs and inputs)
    nodes.forEach(node => {
        // Draw edges from this node to its outputs
        (node.outputs || []).forEach(outputNodeId => {
            if (nodeIdSet.has(outputNodeId)) {
                drawSingleEdge(node.id, outputNodeId);
            } else {
                console.debug(`Edge skipped: output node ${outputNodeId} not in current graph`);
            }
        });

        // Draw edges from inputs to this node
        (node.inputs || []).forEach(inputNodeId => {
            if (nodeIdSet.has(inputNodeId)) {
                drawSingleEdge(inputNodeId, node.id);
            } else {
                console.debug(`Edge skipped: input node ${inputNodeId} not in current graph`);
            }
        });
    });

    // Resize SVG to match content
    const graphWrapper = document.getElementById('graphWrapper');
    svg.setAttribute('width', graphWrapper.scrollWidth);
    svg.setAttribute('height', graphWrapper.scrollHeight);
}
