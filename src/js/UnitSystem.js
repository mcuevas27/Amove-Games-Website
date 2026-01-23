import { tileList, tilesMap, getGridMesh } from './HexGrid.js';
import { registerFogUnits } from './FogSystem.js';
import { showDevCard, hideDevCard } from './DevCardUI.js';

import * as THREE from 'three';

// Unit Data
const UNITS = [
    {
        id: 'skacal',
        name: 'Michael Skacal',
        role: 'Art Director & Sequencer',
        stats: [
            { label: 'Rigging', value: 95 },
            { label: 'Unreal Engine', value: 90 },
            { label: 'Caffeine', value: 110 }
        ],
        color: '#e11d48', // Red
        img: 'assets/skacal.png'
    },
    {
        id: 'ramon',
        name: 'Ramon Zarate', // Assuming Ramon is the Lead/Gameplay eng based on context or just mapping him here
        role: 'Lead Gameplay Engineer',
        stats: [
            { label: 'C++', value: 99 },
            { label: 'Bug Squashing', value: 100 },
            { label: 'Sleep', value: 15 }
        ],
        color: '#22c55e', // Green
        img: 'assets/ramon.png'
    },
    {
        id: 'david',
        name: 'David',
        role: 'Narrative Designer',
        stats: [
            { label: 'World Building', value: 92 },
            { label: 'Dialogue', value: 88 },
            { label: 'Empathy', value: 95 }
        ],
        color: '#3b82f6', // Blue
        img: 'assets/david.png'
    },
    {
        id: 'unknown_1',
        name: 'REDACTED',
        role: 'Sound & Audio',
        stats: [
            { label: 'Decibels', value: 100 },
            { label: 'Synth Design', value: 90 },
            { label: 'Secrecy', value: 100 }
        ],
        color: '#a855f7', // Purple
        img: 'assets/portrait_placeholder.png'
    },
    {
        id: 'unknown_2',
        name: 'REDACTED',
        role: 'Level Designer',
        stats: [
            { label: 'Layout', value: 88 },
            { label: 'Lighting', value: 80 },
            { label: 'Access', value: 0 }
        ],
        color: '#f59e0b', // Amber
        img: 'assets/portrait_placeholder.png'
    }
];

let unitGroup = new THREE.Group();
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let cameraRef = null;
let domRef = null;

// Drag State
let selectionBox = null;
let isDragging = false;
let startPos = { x: 0, y: 0 };
let currentPos = { x: 0, y: 0 };

// Animation State
const hoverState = {
    hoveredUnit: null,
    selectedUnits: [] 
}; 

export function initUnits(scene, camera, container) {
    cameraRef = camera;
    domRef = container; // Use container for rect calculations to include overlay
    scene.add(unitGroup);

    // Create Selection Box
    selectionBox = document.createElement('div');
    selectionBox.className = 'selection-box';
    container.appendChild(selectionBox); // Append to container, sibling to canvas

    spawnUnits();

    // Register units for dynamic fog
    registerFogUnits(unitGroup.children);

    // Interaction Listeners - Attach to container to handle events over UI too if needed, 
    // but canvas is safe. However, domRef is now container.
    // Use the container to catch events!
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mouseup', onMouseUp);
    container.addEventListener('contextmenu', onRightClick); 
}

function spawnUnits() {
    // 1. Find a valid start tile (Not Water)
    const landTiles = tileList.filter(t => t.type !== 'WATER');
    if (landTiles.length === 0) return;

    // Pick start closest to center (0,0,0) instead of random
    landTiles.sort((a, b) => {
        const da = a.x * a.x + a.z * a.z;
        const db = b.x * b.x + b.z * b.z;
        return da - db;
    });
    
    // Take the closest one (center)
    const startTile = landTiles[0];
    
    // 2. Find neighbors for clustering
    const neighbors = landTiles.sort((a, b) => {
        const da = (a.x - startTile.x)**2 + (a.z - startTile.z)**2;
        const db = (b.x - startTile.x)**2 + (b.z - startTile.z)**2;
        return da - db;
    }).slice(0, 5); // Take top 5 closest including self

    // 3. Spawn Meshes
    const geometry = new THREE.BoxGeometry(0.6, 0.6, 0.6); // Placeholder Cube

    neighbors.forEach((tile, index) => {
        if(index >= UNITS.length) return;

        const data = UNITS[index];
        const material = new THREE.MeshStandardMaterial({ 
            color: data.color,
            roughness: 0.3,
            metalness: 0.5,
            emissive: 0x000000,
            emissiveIntensity: 0
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(tile.x, 0.5, tile.z); // Slightly above ground
        
        // Metadata
        mesh.userData = {
            isUnit: true,
            id: data.id,
            hexId: tile.id,
            data: data,
            baseY: 0.5
        };

        unitGroup.add(mesh);
    });
}

function onMouseDown(event) {
    if (event.button !== 0) return; // Only Left Click

    const rect = domRef.getBoundingClientRect();
    isDragging = true;
    startPos.x = event.clientX - rect.left;
    startPos.y = event.clientY - rect.top;

    // Reset Selection Box style
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';
    selectionBox.style.left = startPos.x + 'px';
    selectionBox.style.top = startPos.y + 'px';
    selectionBox.style.display = 'block';
}

function onMouseMove(event) {
    if (isDragging) {
        const rect = domRef.getBoundingClientRect();
        const currentX = event.clientX - rect.left;
        const currentY = event.clientY - rect.top;
        
        const width = Math.abs(currentX - startPos.x);
        const height = Math.abs(currentY - startPos.y);
        const left = Math.min(currentX, startPos.x);
        const top = Math.min(currentY, startPos.y);

        selectionBox.style.width = width + 'px';
        selectionBox.style.height = height + 'px';
        selectionBox.style.left = left + 'px';
        selectionBox.style.top = top + 'px';
    }
}

function onMouseUp(event) {
    if (!isDragging) return;
    isDragging = false;
    selectionBox.style.display = 'none';
    
    const rect = domRef.getBoundingClientRect();
    const endX = event.clientX - rect.left;
    const endY = event.clientY - rect.top;

    // Check if it was a Click (minimal drag)
    const dist = Math.sqrt((endX - startPos.x)**2 + (endY - startPos.y)**2);
    
    if (dist < 5) {
        // Pure Click Logic
        handleSingleClick(event, rect);
    } else {
        // Box Select Logic
        handleBoxSelect(startPos.x, startPos.y, endX, endY, rect.width, rect.height);
    }
}

function handleSingleClick(event, rect) {
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, cameraRef);
    const intersects = raycaster.intersectObjects(unitGroup.children);

    if (intersects.length > 0) {
        const hit = intersects[0].object;
        selectUnits([hit]);
    } else {
        selectUnits([]);
    }
}

// Convert 3D world pos to Screen XY
function toScreenPosition(obj, camera, width, height) {
    const vector = new THREE.Vector3();
    obj.getWorldPosition(vector);
    vector.project(camera); // now ranges -1 to 1

    const x = (vector.x * 0.5 + 0.5) * width;
    const y = (-(vector.y) * 0.5 + 0.5) * height; // Top is 0 in CSS

    return { x, y };
}

function handleBoxSelect(x1, y1, x2, y2, width, height) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    const gathered = [];

    unitGroup.children.forEach(unit => {
        const screenPos = toScreenPosition(unit, cameraRef, width, height);
        
        if (screenPos.x >= minX && screenPos.x <= maxX && 
            screenPos.y >= minY && screenPos.y <= maxY) {
            gathered.push(unit);
        }
    });

    if (gathered.length > 0) {
        selectUnits(gathered);
    }
}


function onRightClick(event) {
    event.preventDefault(); 

    if (hoverState.selectedUnits.length === 0) return; 

    const rect = domRef.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, cameraRef);

    // Raycast against the Terrain
    const gridMesh = getGridMesh();
    if (!gridMesh) return;

    const intersects = raycaster.intersectObject(gridMesh);

    if (intersects.length > 0) {
        const hit = intersects[0];
        const instanceId = hit.instanceId;
        
        if (instanceId !== undefined && tileList[instanceId]) {
            const targetTile = tileList[instanceId];
            
            if (targetTile.type === 'WATER') {
                return;
            }

            moveGroup(hoverState.selectedUnits, targetTile, instanceId);
        }
    }
}

function moveGroup(units, targetTile, targetIndex) {
    if (units.length === 1) {
        moveUnit(units[0], targetTile);
        return;
    }

    const slots = [targetTile];
    
    // Search spiral/neighbors for free slots
    const nearest = tileList
        .filter(t => t.type !== 'WATER')
        .sort((a,b) => {
            const da = (a.x - targetTile.x)**2 + (a.z - targetTile.z)**2;
            const db = (b.x - targetTile.x)**2 + (b.z - targetTile.z)**2;
            return da - db;
        })
        .slice(0, units.length);

    units.forEach((unit, i) => {
        if (nearest[i]) {
            moveUnit(unit, nearest[i]);
        } else {
            // Fallback (stack)
            moveUnit(unit, targetTile); 
        }
    });
}

function moveUnit(unit, targetTile) {
    // Current Position
    const startPos = unit.position.clone();
    const endPos = new THREE.Vector3(targetTile.x, unit.userData.baseY, targetTile.z);

    unit.userData.targetPos = endPos;
    unit.userData.isMoving = true;
    
    // No explicit reveal call needed
}

function selectUnits(units) {
    // Reset previous selection
    hoverState.selectedUnits.forEach(u => {
        u.scale.set(1, 1, 1);
        if(u.material.emissive) {
            u.material.emissive.setHex(0x000000);
            u.material.emissiveIntensity = 0;
        }
    });

    hoverState.selectedUnits = units;

    if (units.length > 0) {
        units.forEach(u => {
            u.scale.set(1.2, 1.2, 1.2);
            if(u.material.emissive) {
                // Use unit's own color
                u.material.emissive.set(u.userData.data.color); 
                u.material.emissiveIntensity = 0.8; 
            }
        });

        // Show UI for the FIRST unit in selection
         showDevCard(units[0].userData.data);
    } else {
        hideDevCard();
    }
}

export function updateUnits(time) {
    // Idle Animation & Movement
    unitGroup.children.forEach((mesh, i) => {
        if (!mesh.userData.baseY) return;

        // Movement Logic
        if (mesh.userData.isMoving && mesh.userData.targetPos) {
            const speed = 5.0 * 0.016; // unit/frame approx
            const dist = mesh.position.distanceTo(mesh.userData.targetPos);
            
            if (dist < 0.1) {
                mesh.position.copy(mesh.userData.targetPos);
                mesh.userData.isMoving = false;
                mesh.userData.targetPos = null;
            } else {
                const dir = new THREE.Vector3().subVectors(mesh.userData.targetPos, mesh.position).normalize();
                mesh.position.add(dir.multiplyScalar(speed));
            }
        } else {
            // Idle bobbing only when stationary
            mesh.position.y = mesh.userData.baseY + Math.sin(time * 2 + i) * 0.1;
        }

        // Spin if selected
        if (hoverState.selectedUnits.includes(mesh)) {
            mesh.rotation.y += 0.02;
        } else {
             mesh.rotation.y *= 0.9;
        }
    });
}
