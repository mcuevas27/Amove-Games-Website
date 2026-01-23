import { tileList, tilesMap, getGridMesh } from './HexGrid.js';
import { registerFogUnits } from './FogSystem.js';
import { showDevCard, hideDevCard } from './DevCardUI.js';
import { findPath, findClosestLand } from './Pathfinder.js';

import * as THREE from 'three';

// Unit Data
const UNITS = [
    {
        id: 'skacal',
        name: 'Michael Skacal',
        role: 'Tech Director',
        stats: [
            { label: 'Roll Forward Tech', value: 95 },
            { label: 'Unity Engine', value: 90 },
            { label: 'AYCE Sushi', value: 80 }
        ],
        color: '#e11d48', // Red
        img: 'assets/skacal.png'
    },
    {
        id: 'ramon',
        name: 'Ramon Zarate', // Assuming Ramon is the Lead/Gameplay eng based on context or just mapping him here
        role: 'Principal Engineer',
        stats: [
            { label: 'Canadian', value: 85 },
            { label: 'Gameplay', value: 100 },
            { label: 'Office Space', value: 15 }
        ],
        color: '#22c55e', // Green
        img: 'assets/ramon.png'
    },
    {
        id: 'david',
        name: 'David',
        role: 'Game Director',
        stats: [
            { label: 'Design', value: 92 },
            { label: 'Balance', value: 99 },
            { label: 'Politics', value: 2 }
        ],
        color: '#3b82f6', // Blue
        img: 'assets/david.png'
    },
    {
        id: 'unknown_1',
        name: 'Unknown 1',
        role: 'Princple 3D Artist',
        stats: [
            { label: 'Environments', value: 100 },
            { label: 'Story Development', value: 90 },
            { label: 'CUDA Cores', value: 5 }
        ],
        color: '#a855f7', // Purple
        img: 'assets/portrait_placeholder.png'
    },
    {
        id: 'unknown_2',
        name: 'Unknown 2',
        role: 'Art Director',
        stats: [
            { label: 'Animation', value: 95 },
            { label: 'VFX', value: 70 },
            { label: 'Sleep', value: 20 }
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
    domRef = container; 
    scene.add(unitGroup);

    // Create Selection Box
    selectionBox = document.createElement('div');
    selectionBox.className = 'selection-box';
    container.appendChild(selectionBox); 

    spawnUnits();

    registerFogUnits(unitGroup.children);

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mouseup', onMouseUp);
    container.addEventListener('contextmenu', onRightClick); 
}

function spawnUnits() {
    const landTiles = tileList.filter(t => t.type !== 'WATER');
    if (landTiles.length === 0) return;

    landTiles.sort((a, b) => {
        const da = a.x * a.x + a.z * a.z;
        const db = b.x * b.x + b.z * b.z;
        return da - db;
    });
    
    const startTile = landTiles[0];
    
    // Clustering
    const neighbors = landTiles.sort((a, b) => {
        const da = (a.x - startTile.x)**2 + (a.z - startTile.z)**2;
        const db = (b.x - startTile.x)**2 + (b.z - startTile.z)**2;
        return da - db;
    }).slice(0, 5); 

    // Spawn Meshes
    const geometry = new THREE.BoxGeometry(0.6, 0.6, 0.6); 

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
        mesh.position.set(tile.x, 0.5, tile.z); 
        
        // Metadata
        mesh.userData = {
            isUnit: true,
            id: data.id,
            hexId: tile.id,
            data: data,
            baseY: 0.5,
            // Path State
            currentPath: [], // Array of tiles
            targetPos: null,
            isMoving: false
        };

        unitGroup.add(mesh);
    });
}

// --- DRAG SELECTION --- //
function onMouseDown(event) {
    if (event.button !== 0) return; 

    const rect = domRef.getBoundingClientRect();
    isDragging = true;
    startPos.x = event.clientX - rect.left;
    startPos.y = event.clientY - rect.top;

    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';
    selectionBox.style.left = startPos.x + 'px';
    selectionBox.style.top = startPos.y + 'px';
    selectionBox.style.display = 'block';
    
    selectionBox.style.zIndex = '99999';
    selectionBox.style.backgroundColor = 'rgba(0, 255, 255, 0.2)';
    selectionBox.style.border = '1px solid #00ffff';
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

    const dist = Math.sqrt((endX - startPos.x)**2 + (endY - startPos.y)**2);
    
    if (dist < 5) {
        handleSingleClick(event, rect);
    } else {
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

function toScreenPosition(obj, camera, width, height) {
    const vector = new THREE.Vector3();
    obj.getWorldPosition(vector);
    vector.project(camera); 

    const x = (vector.x * 0.5 + 0.5) * width;
    const y = (-(vector.y) * 0.5 + 0.5) * height; 

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

    const gridMesh = getGridMesh();
    if (!gridMesh) return;

    const intersects = raycaster.intersectObject(gridMesh);

    if (intersects.length > 0) {
        const hit = intersects[0];
        const instanceId = hit.instanceId;
        
        if (instanceId !== undefined && tileList[instanceId]) {
            let targetTile = tileList[instanceId];
            
            // Handle Water Clicks
            if (targetTile.type === 'WATER') {
                console.log("Clicked Water, finding closest land...");
                const nearest = findClosestLand(targetTile);
                if (nearest) {
                    targetTile = nearest;
                    console.log("Found nearest land:", targetTile.id);
                } else {
                    console.error("No valid land found near water.");
                    return; // No valid land found
                }
            }

            console.log("Moving Group to:", targetTile.id);
            moveGroup(hoverState.selectedUnits, targetTile, instanceId);
        }
    }
}

function moveGroup(units, targetTile, targetIndex) {
    console.log(`Moving ${units.length} units to ${targetTile.id}`);
    if (units.length === 1) {
        setPathForUnit(units[0], targetTile);
        return;
    }

    // Formation Logic: Scatter around target
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
            setPathForUnit(unit, nearest[i]);
        } else {
            setPathForUnit(unit, targetTile); 
        }
    });
}

function getCurrentTile(unit) {
    // Find unit's current nearest tile
    // ...
    let closest = null;
    let minD = Infinity;
    
    tileList.forEach(t => {
        const d = (t.x - unit.position.x)**2 + (t.z - unit.position.z)**2;
        if (d < minD) {
            minD = d;
            closest = t;
        }
    });
    // console.log("Unit at:", closest ? closest.id : "NONE");
    return closest;
}

function setPathForUnit(unit, endTile) {
    const startTile = getCurrentTile(unit);
    if (!startTile) {
        console.error("Could not determine unit start tile.");
        return;
    }

    console.log(`Pathing Unit ${unit.userData.id} from ${startTile.id} to ${endTile.id}`);
    const path = findPath(startTile, endTile);
    console.log("Path found:", path.length);
    
    if (path.length > 0) {
        unit.userData.currentPath = path;
        unit.userData.isMoving = true;
        
        // Start moving to first node
        setNextPathNode(unit);
    } else {
        console.warn("No path found or already at destination.");
    }
}

function setNextPathNode(unit) {
    if (unit.userData.currentPath.length === 0) {
        unit.userData.isMoving = false;
        unit.userData.targetPos = null;
        return;
    }

    const nextTile = unit.userData.currentPath.shift();
    const endPos = new THREE.Vector3(nextTile.x, unit.userData.baseY, nextTile.z);
    
    unit.userData.targetPos = endPos;
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
                u.material.emissive.set(u.userData.data.color); 
                u.material.emissiveIntensity = 0.8; 
            }
        });

         showDevCard(units[0].userData.data);
    } else {
        hideDevCard();
    }
}

export function updateUnits(time) {
    const speed = 5.0 * 0.016; 

    unitGroup.children.forEach((mesh, i) => {
        if (!mesh.userData.baseY) return;

        // Path Movement Logic
        if (mesh.userData.isMoving && mesh.userData.targetPos) {
            const dist = mesh.position.distanceTo(mesh.userData.targetPos);
            
            if (dist < 0.1) {
                // Reached Node
                mesh.position.copy(mesh.userData.targetPos);
                // Get next node
                setNextPathNode(mesh);
            } else {
                const dir = new THREE.Vector3().subVectors(mesh.userData.targetPos, mesh.position).normalize();
                mesh.position.add(dir.multiplyScalar(speed));
            }
        } 
        else {
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
