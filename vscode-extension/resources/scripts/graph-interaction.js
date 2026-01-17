/**
 * User interaction handlers for drag, pan, and zoom
 */

/**
 * Start dragging a node
 * @param {MouseEvent} e - Mouse event
 * @param {HTMLElement} nodeEl - Node element
 * @param {string} nodeId - Node ID
 */
function startNodeDrag(e, nodeEl, nodeId) {
    setDraggingNode(true);
    setDraggedNodeElement(nodeEl);
    setSelectedNodeId(nodeId);

    const rect = nodeEl.getBoundingClientRect();
    const graphWrapper = document.getElementById('graphWrapper');
    const wrapperRect = graphWrapper.getBoundingClientRect();

    setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    });

    nodeEl.classList.add('dragging');
    updateNodeSelection();
    
    // Dispatch event for Preact app
    window.dispatchEvent(new CustomEvent('nodeSelected', { 
        detail: { nodeId: nodeId } 
    }));
}

/**
 * Handle mouse move for drag and pan
 * @param {MouseEvent} e - Mouse event
 */
function onMouseMove(e) {
    const canvasContainer = document.getElementById('canvasContainer');
    const graphWrapper = document.getElementById('graphWrapper');

    if (isDragging() && getDraggedNodeElement()) {
        const draggedNode = getDraggedNodeElement();
        const wrapperRect = graphWrapper.getBoundingClientRect();
        const containerRect = canvasContainer.getBoundingClientRect();
        const offset = getDragOffset();
        const zoom = getZoomLevel();

        // Calculate new position relative to wrapper
        let newX = (e.clientX - containerRect.left + canvasContainer.scrollLeft) / zoom - offset.x;
        let newY = (e.clientY - containerRect.top + canvasContainer.scrollTop) / zoom - offset.y;

        // Clamp to positive values
        newX = Math.max(0, newX);
        newY = Math.max(0, newY);

        draggedNode.style.left = newX + 'px';
        draggedNode.style.top = newY + 'px';
        setNodePosition(draggedNode.dataset.id, newX, newY);

        drawEdges(window.GRAPH_DATA.nodes, getNodePositions());
    } else if (isPanningActive()) {
        const panStart = getPanStart();
        const scrollStart = getScrollStart();
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;

        canvasContainer.scrollLeft = scrollStart.x - dx;
        canvasContainer.scrollTop = scrollStart.y - dy;
    }
}

/**
 * Handle mouse up to end drag/pan
 */
function onMouseUp() {
    if (isDragging() && getDraggedNodeElement()) {
        getDraggedNodeElement().classList.remove('dragging');
        setDraggingNode(false);
        setDraggedNodeElement(null);
    }

    if (isPanningActive()) {
        setPanning(false);
        document.getElementById('canvasContainer').classList.remove('panning');
    }
}

/**
 * Start panning the canvas
 * @param {MouseEvent} e - Mouse event
 */
function startPan(e) {
    const canvasContainer = document.getElementById('canvasContainer');
    const graphWrapper = document.getElementById('graphWrapper');
    const graph = document.getElementById('graph');

    if (e.target === canvasContainer || e.target === graphWrapper || e.target === graph) {
        setPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
        setScrollStart({ x: canvasContainer.scrollLeft, y: canvasContainer.scrollTop });
        canvasContainer.classList.add('panning');

        // Deselect node when clicking background
        setSelectedNodeId(null);
        updateNodeSelection();
        
        // Dispatch event for Preact app to clear selection
        window.dispatchEvent(new CustomEvent('nodeSelected', { 
            detail: { nodeId: null } 
        }));
    }
}

/**
 * Set zoom level
 * @param {number} level - Zoom level (0.25 to 3)
 */
function setZoom(level) {
    const zoomLevel = Math.max(0.25, Math.min(3, level));
    setZoomLevelState(zoomLevel);

    const graphWrapper = document.getElementById('graphWrapper');
    graphWrapper.style.transform = `scale(${zoomLevel})`;
    document.getElementById('zoomLevel').textContent = Math.round(zoomLevel * 100) + '%';
}

/**
 * Zoom in
 */
function zoomIn() {
    setZoom(getZoomLevel() + 0.1);
}

/**
 * Zoom out
 */
function zoomOut() {
    setZoom(getZoomLevel() - 0.1);
}

/**
 * Handle mouse wheel for zooming
 * @param {WheelEvent} e - Wheel event
 */
function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(getZoomLevel() + delta);
}
