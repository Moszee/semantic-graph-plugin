/**
 * State management for the intent graph
 */

// Application state
let zoomLevel = 1;
let selectedNodeId = null;
let nodePositions = {};

// Drag state
let isDraggingNode = false;
let draggedNode = null;
let dragOffset = { x: 0, y: 0 };

// Pan state
let isPanning = false;
let panStart = { x: 0, y: 0 };
let scrollStart = { x: 0, y: 0 };

/**
 * Get current zoom level
 * @returns {number} Current zoom level
 */
function getZoomLevel() {
    return zoomLevel;
}

/**
 * Set zoom level (used by zoom functions)
 * @param {number} level - New zoom level
 */
function setZoomLevelState(level) {
    zoomLevel = level;
}

/**
 * Get selected node ID
 * @returns {string|null} Selected node ID or null
 */
function getSelectedNodeId() {
    return selectedNodeId;
}

/**
 * Set selected node ID
 * @param {string|null} nodeId - Node ID to select
 */
function setSelectedNodeId(nodeId) {
    selectedNodeId = nodeId;
}

/**
 * Get all node positions
 * @returns {Object} Map of node ID to position {x, y}
 */
function getNodePositions() {
    return nodePositions;
}

/**
 * Set node position
 * @param {string} nodeId - Node ID
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 */
function setNodePosition(nodeId, x, y) {
    nodePositions[nodeId] = { x, y };
}

/**
 * Get node position
 * @param {string} nodeId - Node ID
 * @returns {Object|undefined} Position {x, y} or undefined
 */
function getNodePosition(nodeId) {
    return nodePositions[nodeId];
}

/**
 * Set all node positions
 * @param {Object} positions - Map of node ID to position
 */
function setNodePositions(positions) {
    nodePositions = positions;
}

// Drag state management
function setDraggingNode(dragging) {
    isDraggingNode = dragging;
}

function isDragging() {
    return isDraggingNode;
}

function setDraggedNodeElement(element) {
    draggedNode = element;
}

function getDraggedNodeElement() {
    return draggedNode;
}

function setDragOffset(offset) {
    dragOffset = offset;
}

function getDragOffset() {
    return dragOffset;
}

// Pan state management
function setPanning(panning) {
    isPanning = panning;
}

function isPanningActive() {
    return isPanning;
}

function setPanStart(start) {
    panStart = start;
}

function getPanStart() {
    return panStart;
}

function setScrollStart(start) {
    scrollStart = start;
}

function getScrollStart() {
    return scrollStart;
}
