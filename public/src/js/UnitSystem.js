import { tileList, tilesMap, getGridMesh } from './HexGrid.js';
import { registerFogUnits } from './FogSystem.js';
import { showDevCard, hideDevCard, initDevCardGUI, initMobileCardState } from './DevCardUI.js';
import { findPath, findClosestLand } from './Pathfinder.js';


import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Unit Data
const UNITS = [
    {
        id: 'skacal',
        name: 'Skacal',
        role: 'Tech Director',
        stats: [
            { label: 'Roll Forward Tech', value: 95 },
            { label: 'UNITY', value: 70 },
            { label: 'Server', value: 90 },
            { label: 'Live Operations', value: 99 },
            { label: 'AYCE Sushi', value: 80 }

        ],
        color: '#e11d48', // Red
        img: 'assets/3D/model_s3.glb'
    },
    {
        id: 'ramon',
        name: 'Ramon',
        role: 'Principal Engineer',
        stats: [
            { label: 'Office Space', value: 15 },
            { label: 'Canadian', value: 85 },
            { label: 'Gameplay', value: 99 },
            { label: 'UNITY', value: 89 },
            { label: 'Pineapple Pizza', value: 65 }

        ],
        color: '#22c55e', // Green
        img: 'assets/3D/model_r2.glb'
    },
    {
        id: 'david',
        name: 'David',
        role: 'Game Director',
        stats: [
            { label: 'Design', value: 92 },
            { label: 'Balance', value: 99 },
            { label: 'Top Ace', value: 90 },
            { label: 'n00b', value: 95 },
            { label: 'Politics', value: 2 }
        ],
        color: '#3b82f6', // Blue
        img: 'assets/3D/model_d1.glb'
    },
    {
        id: 'gavin',
        name: 'Gavin',
        role: 'Principal 3D Artist',
        stats: [
            { label: 'Writing', value: 70 },
            { label: 'Sass', value: 10 },
            { label: 'Pipeline', value: 60 },
            { label: 'Content Design', value: 50 },
            { label: '3D Art', value: 90 }

        ],
        color: '#a855f7', // Purple
        img: 'assets/3D/model_g4.glb'
    },
    {
        id: 'cuevas',
        name: 'Cuevas',
        role: 'Art Director',
        stats: [
            { label: 'Kalguksu', value: 15 },
            { label: 'Sleep', value: 30 },
            { label: 'Tech Art', value: 85 },
            { label: 'Animation', value: 95 },
            { label: 'VFX', value: 80 }


        ],
        color: '#f59e0b', // Amber
        img: 'assets/3D/model_c5.glb'
    }
];

let unitGroup = new THREE.Group();
let ringGroup = new THREE.Group(); // Independent group for rings
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let cameraRef = null;
let domRef = null;
let skacalMesh = null; // Ref for GUI


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
    cameraRef = camera;
    domRef = container;
    scene.add(unitGroup);
    scene.add(ringGroup); // Add rings to scene independently



    // Create Selection Box
    selectionBox = document.createElement('div');
    selectionBox.className = 'selection-box';
    container.appendChild(selectionBox);

    spawnUnits();

    registerFogUnits(unitGroup.children);

    // Initialize mobile card state (empty state on mobile)
    initMobileCardState();

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mouseup', onMouseUp);
    container.addEventListener('contextmenu', onRightClick);

    // Touch support for mobile
    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: false });
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

    // Cluster Logic
    const neighbors = landTiles.sort((a, b) => {
        const da = (a.x - startTile.x) ** 2 + (a.z - startTile.z) ** 2;
        const db = (b.x - startTile.x) ** 2 + (b.z - startTile.z) ** 2;
        return da - db;
    });

    UNITS.forEach((data, i) => {
        if (i < neighbors.length) {
            createUnitMesh(data, neighbors[i]);
        }
    });
}

function createUnitMesh(data, tile) {
    const geometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const material = new THREE.MeshStandardMaterial({
        color: data.color,
        roughness: 0.3,
        metalness: 0.5,
        emissive: 0x000000,
        emissiveIntensity: 0
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(tile.x, 0.5, tile.z);

    // Generic 3D Model Loading
    if (data.img.endsWith('.glb')) {
        loadCustomModel(mesh, data.img, data.id);
    }

    // Metadata
    mesh.userData = {
        isUnit: true,
        id: data.id,
        hexId: tile.id,
        data: data,
        baseY: 0.5,
        // Path State
        currentPath: [],
        targetPos: null,
        isMoving: false
    };

    // Selection Ring (Detached)
    const ringGeo = new THREE.RingGeometry(0.5, 0.65, 32);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
        depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(tile.x, 0.28, tile.z); // Fixed height in world space
    ring.visible = false;
    ring.name = 'selectionRing';

    // Do NOT add to mesh. Add to independent group.
    ringGroup.add(ring);

    // Store reference in userData for easy access
    mesh.userData.selectionRing = ring;

    unitGroup.add(mesh);
}

// --- TOUCH HANDLERS (Mobile) --- //
let longPressTimer = null;
let isLongPress = false;
const LONG_PRESS_DURATION = 600; // ms

function onTouchStart(event) {
    if (event.touches.length !== 1) return;
    // event.preventDefault(); // Allow scrolling if not acting? No, game map usually needs default prevented.

    const touch = event.touches[0];
    const rect = domRef.getBoundingClientRect();
    isDragging = true;
    startPos.x = touch.clientX - rect.left;
    startPos.y = touch.clientY - rect.top;

    // Reset Long Press
    isLongPress = false;
    clearTimeout(longPressTimer);

    // Start Long Press Timer
    longPressTimer = setTimeout(() => {
        isLongPress = true;
        isDragging = false; // Cancel drag check
        selectionBox.style.display = 'none'; // Hide box if it appeared

        // Trigger Move Command
        attemptMoveCommand(touch.clientX, touch.clientY);

        // Haptic feedback if available
        if (navigator.vibrate) navigator.vibrate(50);

    }, LONG_PRESS_DURATION);

    // Don't show selection box immediately
    selectionBox.style.display = 'none';
}

function onTouchMove(event) {
    if (event.touches.length !== 1) return;

    // If moved significantly, cancel long press
    const touch = event.touches[0];
    const rect = domRef.getBoundingClientRect();
    const currentX = touch.clientX - rect.left;
    const currentY = touch.clientY - rect.top;

    const dist = Math.sqrt((currentX - startPos.x) ** 2 + (currentY - startPos.y) ** 2);

    if (dist > 10) {
        clearTimeout(longPressTimer); // Cancel Move Command trigger

        if (!isLongPress) {
            // Only process drag if we haven't already triggered long press
            if (isDragging) {
                // ... existing drag logic ...
                selectionBox.style.display = 'block';
                selectionBox.style.zIndex = '99999';
                selectionBox.style.backgroundColor = 'rgba(0, 255, 255, 0.2)';
                selectionBox.style.border = '1px solid #00ffff';

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
    }
}

function onTouchEnd(event) {
    if (event.cancelable) event.preventDefault(); // Prevent ghost mouse events (click/mouseup)

    clearTimeout(longPressTimer);

    if (isLongPress) {
        // Was a long press, verify it's done? Already handled in timer.
        // Just reset and return.
        isLongPress = false;
        isDragging = false;
        return;
    }

    if (!isDragging) return;
    isDragging = false;
    selectionBox.style.display = 'none';

    const rect = domRef.getBoundingClientRect();
    const touch = event.changedTouches[0];
    const endX = touch.clientX - rect.left;
    const endY = touch.clientY - rect.top;

    const dist = Math.sqrt((endX - startPos.x) ** 2 + (endY - startPos.y) ** 2);

    if (dist < 10) {
        handleTouchTap(touch, rect);
    } else {
        handleBoxSelect(startPos.x, startPos.y, endX, endY, rect.width, rect.height);
    }
}

function handleTouchTap(touch, rect) {
    mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, cameraRef);
    const intersects = raycaster.intersectObjects(unitGroup.children, true);

    if (intersects.length > 0) {
        let hitObj = intersects[0].object;

        while (hitObj) {
            if (hitObj.userData && hitObj.userData.isUnit) {
                selectUnits([hitObj]);
                return;
            }
            hitObj = hitObj.parent;
            if (hitObj === unitGroup || hitObj === null) break;
        }
        selectUnits([]);
    } else {
        selectUnits([]);
    }
}

// --- DRAG SELECTION --- //
function onMouseDown(event) {
    if (event.button !== 0) return;

    // Prevent interaction if hovering over locked unit?
    // Handled in click logic mostly.

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

    const dist = Math.sqrt((endX - startPos.x) ** 2 + (endY - startPos.y) ** 2);

    if (dist < 5) {
        handleSingleClick(event, rect);
    } else {
        handleBoxSelect(startPos.x, startPos.y, endX, endY, rect.width, rect.height);
    }
}

function handleSingleClick(event, rect) {
    // Ignore clicks if they originated from the UI
    if (event.target.closest('.dev-card') || event.target.closest('.dev-selection-bar') || event.target.closest('.devs-mobile-card')) {
        return;
    }

    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, cameraRef);
    const intersects = raycaster.intersectObjects(unitGroup.children, true);

    if (intersects.length > 0) {
        let hitObj = intersects[0].object;

        while (hitObj) {
            if (hitObj.userData && hitObj.userData.isUnit) {
                selectUnits([hitObj]);
                return;
            }
            hitObj = hitObj.parent;
            if (hitObj === unitGroup || hitObj === null) break;
        }
        selectUnits([]);
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


// Shared Move Command Logic (used by Right Click and Long Press)
function attemptMoveCommand(clientX, clientY) {
    if (hoverState.selectedUnits.length === 0) return;

    const rect = domRef.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

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
                } else {
                    return; // No valid land found
                }
            }

            console.log("Moving Group to:", targetTile.id);
            moveGroup(hoverState.selectedUnits, targetTile, instanceId);

            // Spawn A-Move marker at click position
            spawnAMoveMarker(clientX, clientY);
        }
    }
}

function onRightClick(event) {
    event.preventDefault();
    attemptMoveCommand(event.clientX, event.clientY);
}

// A-Move marker animation - RTS-style move command feedback
function spawnAMoveMarker(x, y) {
    console.log('A-Move marker spawned at:', x, y);
    const marker = document.createElement('div');
    marker.className = 'amove-marker';
    marker.style.left = x + 'px';
    marker.style.top = y + 'px';

    for (let i = 0; i < 4; i++) {
        const arrow = document.createElement('div');
        arrow.className = 'arrow';
        arrow.style.setProperty('--angle', (i * 90) + 'deg');
        marker.appendChild(arrow);
    }

    document.body.appendChild(marker);

    setTimeout(() => {
        marker.remove();
    }, 500);
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
        .sort((a, b) => {
            const da = (a.x - targetTile.x) ** 2 + (a.z - targetTile.z) ** 2;
            const db = (b.x - targetTile.x) ** 2 + (b.z - targetTile.z) ** 2;
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
        const d = (t.x - unit.position.x) ** 2 + (t.z - unit.position.z) ** 2;
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

        if (u.material.emissive) {
            u.material.emissive.setHex(0x000000);
            u.material.emissiveIntensity = 0;
        }

        // Hide Ring (via reference)
        const ring = u.userData.selectionRing;
        if (ring) {
            ring.visible = false;
        }
    });

    hoverState.selectedUnits = units;

    if (units.length > 0) {
        units.forEach(u => {

            if (u.material.emissive) {
                u.material.emissiveIntensity = 0.8;
            }

            // Show Ring (via reference)
            const ring = u.userData.selectionRing;
            if (ring) {
                ring.visible = true;
            }
        });

        const rect = domRef.getBoundingClientRect();
        const screenPos = toScreenPosition(units[0], cameraRef, rect.width, rect.height);

        // Pass all selected units' data to card (supports multi-select display)
        const allUnitData = units.map(u => u.userData.data);
        showDevCard(allUnitData, screenPos, rect.width, rect.height);
    } else {
        hideDevCard();
    }
}

// Global Settings
let rotationSpeed = 0.1;

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

                // Smooth Rotation (Slerp)
                const targetPos = new THREE.Vector3(mesh.userData.targetPos.x, mesh.position.y, mesh.userData.targetPos.z);
                const dummy = new THREE.Object3D();
                dummy.position.copy(mesh.position);
                dummy.lookAt(targetPos);

                mesh.quaternion.slerp(dummy.quaternion, rotationSpeed);
            }
        }
        else {
            // Idle bobbing only when stationary
            // Idle bobbing only when stationary
            mesh.position.y = mesh.userData.baseY + Math.sin(time * 2 + i) * 0.1;
        }

        // Animate Selection Ring
        const ring = mesh.userData.selectionRing;
        if (ring) {
            // Sync Position X/Z, Keep Y Fixed
            ring.position.x = mesh.position.x;
            ring.position.z = mesh.position.z;
            ring.position.y = 0.28; // Fixed world height

            // Ensure flat rotation (reset if parent ever influenced it, though now independent)
            ring.rotation.x = -Math.PI / 2;

            if (ring.visible) {
                ring.rotation.z -= 0.02;
                const pulse = 0.8 + Math.sin(time * 5) * 0.2;
                ring.material.opacity = pulse;
            }
        }



    });
}

function loadCustomModel(parentMesh, modelPath, unitId) {
    const loader = new GLTFLoader();
    loader.load(modelPath, (gltf) => {
        const model = gltf.scene;

        // Default Scale/Pos Adjustments (Global for now)
        // Ideally these would be in the UNIT data config per model
        model.scale.set(1.4, 1.4, 1.4);
        model.position.y = 0.58;

        parentMesh.geometry.dispose();
        // parentMesh.material.dispose(); 

        parentMesh.add(model);

        // Make the box invisible but keep it for raycasting/selection
        parentMesh.material = new THREE.MeshBasicMaterial({ visible: false, opacity: 0, transparent: true });

        // Store reference for GUI controls explicitly if needed
        // For now, we only have one global GUI set that controls "skacalMesh"
        // If we want the GUI to control "currently selected unit", we'd need to update logic.
        // For now, let's just assign skacalMesh if it IS Skacal so the existing GUI works.
        if (unitId === 'skacal') {
            skacalMesh = model;
        }

        console.log(`Custom Model Loaded: ${modelPath}`);

        model.traverse(c => {
            if (c.isMesh) {
                c.castShadow = true;
                c.receiveShadow = true;
            }
        });

    }, undefined, (error) => {
        console.error(`Error loading model ${modelPath}:`, error);
    });
}

export function initUnitGUI(gui) {
    const folder = gui.addFolder('Unit Settings');

    const params = {
        skacalScale: 1.4,
        skacalElevation: 0.58,
        rotSpeed: 0.1
    };

    folder.add(params, 'skacalScale', 0.1, 2.0).name('Skacal Scale').onChange((v) => {
        if (skacalMesh) {
            skacalMesh.scale.set(v, v, v);
        }
    });

    folder.add(params, 'skacalElevation', -2.0, 2.0).name('Skacal Y Offset').onChange((v) => {
        if (skacalMesh) {
            skacalMesh.position.y = v;
        }
    });

    folder.add(params, 'rotSpeed', 0.01, 1.0).name('Rotation Rate').onChange((v) => {
        rotationSpeed = v;
    });
}
