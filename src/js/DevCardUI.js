import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// DevCardUI.js

const loader = new GLTFLoader();

let cardContainer = null;
let currentTimeout = null;
// 3D Scene State
let miniScene, miniCamera, miniRenderer, miniReqId;
let currentLoadId = 0;

// Multi-unit selection state
let selectedUnitsData = [];
let currentViewIndex = 0;

// Interactive rotation state
let isDraggingPortrait = false;
let dragStartX = 0;
let currentRotY = 0;
let targetRotY = 0;

// Event handler references for cleanup
let portraitMouseMoveHandler = null;
let portraitPointerUpHandler = null;
let portraitLockChangeHandler = null;


export function initCardUI(container) {
    // Create the overlay container absolute in the relative parent
    cardContainer = document.createElement('div');
    cardContainer.id = 'dev-card-overlay';
    cardContainer.className = 'dev-card-wrapper hidden';
    container.appendChild(cardContainer);
}

// New: Show card for multiple units with a selection bar
export function showDevCard(dataArray, focusPos, w, h) {
    // Support both single data object and array
    const units = Array.isArray(dataArray) ? dataArray : [dataArray];
    selectedUnitsData = units;
    currentViewIndex = 0;

    const container = document.getElementById('devs-map-container');
    let card = document.getElementById('dev-unit-card');

    if (!card) {
        card = document.createElement('div');
        card.id = 'dev-unit-card';
        card.className = 'dev-card';
        if (container) container.appendChild(card);
        else document.body.appendChild(card);
    }

    // Reset Position
    card.classList.remove('alt-pos');

    // Multi-unit mode class
    if (units.length > 1) {
        card.classList.add('multi-select');
    } else {
        card.classList.remove('multi-select');
    }

    // Dynamic Positioning Logic
    if (focusPos && w && h) {
        const isBottomLeft = focusPos.x < 380 && focusPos.y > (h - 400);
        if (isBottomLeft) {
            card.classList.add('alt-pos');
        }
    }

    // Build card content
    renderCardContent(card, units, 0);

    // Show
    card.classList.add('visible');
}

function renderCardContent(card, units, viewIndex) {
    const data = units[viewIndex];
    const isMulti = units.length > 1;

    cleanup3D();

    // Set current unit ID and load its config
    currentUnitId = data.id;
    if (unitConfigs[currentUnitId]) {
        Object.assign(portraitSettings, unitConfigs[currentUnitId]);
    } else {
        Object.assign(portraitSettings, DEFAULT_SETTINGS);
    }

    // Update GUI sliders to reflect current unit's settings
    refreshGUIControllers();

    // Selection bar for multiple units
    let selectionBar = '';
    if (isMulti) {
        selectionBar = `
            <div class="dev-selection-bar">
                <span class="selection-count">${units.length} SELECTED</span>
                <div class="selection-portraits">
                    ${units.map((u, i) => `
                        <div class="selection-portrait ${i === viewIndex ? 'active' : ''}"
                             data-index="${i}"
                             style="border-color: ${u.color}; ${i === viewIndex ? `box-shadow: 0 0 10px ${u.color};` : ''}">
                            ${getPortraitContent(u)}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Visual content (portrait/3D)
    let visualContent = '';
    const is3D = data.img.endsWith('.glb');

    if (is3D) {
        visualContent = `<div class="dev-img-container dev-img-3d" id="dev-card-3d-mount" style="border-color: ${data.color}"></div>`;
    } else if (data.img === '?') {
        visualContent = `
            <div class="dev-img-container" style="border-color: ${data.color}; background: #111; color: ${data.color}; display: flex; align-items: center; justify-content: center; font-size: 100px; font-family: monospace; font-weight: bold;">
                ?
            </div>`;
    } else {
        visualContent = `
            <div class="dev-img-container" style="border-color: ${data.color}">
                <img src="${data.img}" alt="${data.name}" class="dev-img">
            </div>`;
    }

    card.innerHTML = `
        ${selectionBar}
        <div class="dev-card-header">
            ${visualContent}
            <div class="dev-header-text">
                <h3 style="color: ${data.color}">${data.name}</h3>
                <span class="dev-role">${data.role}</span>
            </div>
        </div>
        <div class="dev-stats">
            ${data.stats.map(s => `
                <div class="stat-row">
                    <span class="stat-label">${s.label}</span>
                    <div class="stat-bar-bg">
                        <div class="stat-bar-fill" style="width: 0%"></div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    // Attach click handlers to portraits
    if (isMulti) {
        const portraits = card.querySelectorAll('.selection-portrait');
        portraits.forEach(portrait => {
            portrait.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(portrait.dataset.index);
                if (idx !== currentViewIndex) {
                    currentViewIndex = idx;
                    renderCardContent(card, selectedUnitsData, idx);
                }
            });
        });
    }

    // Init 3D if needed
    if (is3D) {
        setTimeout(() => {
            const mount = document.getElementById('dev-card-3d-mount');
            if (mount) initMiniScene(mount, data.img);
        }, 10);
    }

    // Animate Bars
    setTimeout(() => {
        const fills = card.querySelectorAll('.stat-bar-fill');
        fills.forEach((fill, i) => {
            fill.style.width = data.stats[i].value + '%';
            fill.style.backgroundColor = data.color;
        });
    }, 50);
}

function getPortraitContent(data) {
    if (data.img === '?') {
        return `<span style="color: ${data.color}; font-size: 24px; font-weight: bold;">?</span>`;
    } else if (data.img.endsWith('.glb')) {
        // For 3D models, show colored initial
        const initial = data.name.charAt(0).toUpperCase();
        return `<span style="color: ${data.color}; font-size: 20px; font-weight: bold;">${initial}</span>`;
    } else {
        return `<img src="${data.img}" alt="${data.name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
    }
}

export function hideDevCard() {
    cleanup3D();

    // Clear state
    currentUnitId = null;
    selectedUnitsData = [];
    currentViewIndex = 0;

    const card = document.getElementById('dev-unit-card');
    if (card) {
        card.classList.remove('visible');
        card.classList.remove('multi-select');
    }
}

function cleanup3D() {
    if (miniReqId) {
        cancelAnimationFrame(miniReqId);
        miniReqId = null;
    }
    if (miniRenderer) {
        miniRenderer.dispose();
        miniRenderer.domElement.remove();
        miniRenderer = null;
    }

    // Remove document-level event listeners
    if (portraitMouseMoveHandler) {
        document.removeEventListener('mousemove', portraitMouseMoveHandler);
        portraitMouseMoveHandler = null;
    }
    if (portraitPointerUpHandler) {
        document.removeEventListener('pointerup', portraitPointerUpHandler);
        portraitPointerUpHandler = null;
    }
    if (portraitLockChangeHandler) {
        document.removeEventListener('pointerlockchange', portraitLockChangeHandler);
        portraitLockChangeHandler = null;
    }

    // Exit pointer lock if active
    if (document.pointerLockElement) {
        document.exitPointerLock();
    }

    miniScene = null;
    miniCamera = null;
    isDraggingPortrait = false;
}

const DEFAULT_SETTINGS = {
    scale: 1.21,
    posY: -0.14,
    rotY: 0.5277,
    fov: 25
};

// Storage for per-unit settings
const unitConfigs = {
    'skacal': {
        scale: 1,
        posY: 0.03,
        rotY: 0.5277,
        fov: 20
    },
    'david': {
        scale: 0.9,
        posY: 0,
        rotY: 0.5277,
        fov: 20
    },
    'ramon': {
        scale: 1,
        posY: -0.02,
        rotY: 0.5277,
        fov: 19
    },
    'unknown_1': {
        scale: 1,
        posY: -0.02,
        rotY: 0.5277,
        fov: 20
    },
    'unknown_2': {
        scale: 1,
        posY: -0.02,
        rotY: 0.5277,
        fov: 20
    }
};
let currentUnitId = null;

// Active settings object (bound to GUI)
const portraitSettings = { ...DEFAULT_SETTINGS };

// GUI Controllers References
let guiControllers = {
    scale: null,
    posY: null,
    rotY: null,
    fov: null
};

export function initDevCardGUI(gui) {
    const folder = gui.addFolder('Portrait Settings');
    guiControllers.scale = folder.add(portraitSettings, 'scale', 0.1, 5.0).name('Scale').onChange(updatePortraitTransform);
    guiControllers.posY = folder.add(portraitSettings, 'posY', -5.0, 5.0).name('Pos Y').onChange(updatePortraitTransform);
    guiControllers.rotY = folder.add(portraitSettings, 'rotY', -Math.PI, Math.PI).name('Rot Y').onChange(updatePortraitTransform);
    guiControllers.fov = folder.add(portraitSettings, 'fov', 10, 120).name('FOV').onChange(updateCameraFOV);
    
    // Save Config Button
    const configExport = {
        save: () => {
            console.log("--- PORTRAIT CONFIGS ---");
            console.log(JSON.stringify(unitConfigs, null, 4));
            alert("Portrait Configs saved to Console (F12)");
        }
    };
    folder.add(configExport, 'save').name('💾 Save Portraits');
}

function refreshGUIControllers() {
    // Update GUI sliders to show current unit's settings
    if (guiControllers.scale) guiControllers.scale.updateDisplay();
    if (guiControllers.posY) guiControllers.posY.updateDisplay();
    if (guiControllers.rotY) guiControllers.rotY.updateDisplay();
    if (guiControllers.fov) guiControllers.fov.updateDisplay();
}

function updatePortraitTransform() {
    if (miniScene && miniScene.children.length > 2) {
        const model = miniScene.children[miniScene.children.length - 1];
        if (model.type === 'Group') {
            model.scale.set(portraitSettings.scale, portraitSettings.scale, portraitSettings.scale);
            model.position.y = portraitSettings.posY;
            model.rotation.y = portraitSettings.rotY;
        }
    }
    // Update target rotation for smooth return
    targetRotY = portraitSettings.rotY;
    currentRotY = portraitSettings.rotY;

    // Save to config
    if (currentUnitId) {
        unitConfigs[currentUnitId] = { ...portraitSettings };
    }
}

function updateCameraFOV() {
    if (miniCamera) {
        miniCamera.fov = portraitSettings.fov;
        miniCamera.updateProjectionMatrix();
    }
    // Save to config
    if (currentUnitId) {
        unitConfigs[currentUnitId] = { ...portraitSettings };
    }
}

function initMiniScene(container, modelPath) {
    currentLoadId++;
    const w = container.clientWidth;
    const h = container.clientHeight;
    console.log(`DevCard 3D Init: Container Size ${w}x${h}`);

    if (w === 0 || h === 0) {
        console.warn("DevCard 3D: Container has 0 dimensions, retrying...");
        setTimeout(() => initMiniScene(container, modelPath), 100);
        return;
    }

    miniScene = new THREE.Scene();

    miniCamera = new THREE.PerspectiveCamera(portraitSettings.fov, w / h, 0.1, 100);
    miniCamera.position.set(0, 0.5, 3);

    miniRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    miniRenderer.setSize(w, h);
    miniRenderer.outputColorSpace = THREE.SRGBColorSpace;

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 2.0);
    miniScene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(2, 5, 5);
    miniScene.add(dirLight);

    // Initialize rotation state
    currentRotY = portraitSettings.rotY;
    targetRotY = portraitSettings.rotY;

    // Interactive rotation - drag to spin portrait with pointer lock
    const onPointerDown = (e) => {
        e.stopPropagation(); // Prevent selection box from appearing
        e.preventDefault();
        isDraggingPortrait = true;

        // Request pointer lock for infinite rotation
        container.requestPointerLock();
    };

    portraitMouseMoveHandler = (e) => {
        if (!isDraggingPortrait) return;

        // Use movementX for pointer lock compatibility
        const deltaX = e.movementX || 0;
        currentRotY += deltaX * 0.01; // Sensitivity

        // Apply rotation directly to model
        if (miniScene && miniScene.children.length > 2) {
            const model = miniScene.children[miniScene.children.length - 1];
            if (model.type === 'Group') {
                model.rotation.y = currentRotY;
            }
        }
    };

    portraitPointerUpHandler = (e) => {
        if (isDraggingPortrait) {
            e.stopPropagation();
            isDraggingPortrait = false;

            // Exit pointer lock
            if (document.pointerLockElement === container) {
                document.exitPointerLock();
            }
        }
    };

    // Pointer lock change handler
    portraitLockChangeHandler = () => {
        if (document.pointerLockElement !== container && isDraggingPortrait) {
            isDraggingPortrait = false;
        }
    };

    container.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('mousemove', portraitMouseMoveHandler);
    document.addEventListener('pointerup', portraitPointerUpHandler);
    document.addEventListener('pointerlockchange', portraitLockChangeHandler);
    container.style.cursor = 'grab';

    const thisLoadId = currentLoadId; // Capture ID
    console.log(`DevCard 3D: Loading ${modelPath} (LoadID: ${thisLoadId})`);

    loader.load(modelPath, (gltf) => {
        if (thisLoadId !== currentLoadId) {
            console.log(`DevCard: Stale load ignored (This: ${thisLoadId}, Current: ${currentLoadId})`);
            return;
        }

        const model = gltf.scene;

        // Initial set based on current settings
        model.scale.set(portraitSettings.scale, portraitSettings.scale, portraitSettings.scale);
        model.position.y = portraitSettings.posY;
        model.rotation.y = portraitSettings.rotY;

        miniScene.add(model);
        console.log("DevCard 3D Model Loaded");

    }, undefined, (err) => console.error(err));

    container.appendChild(miniRenderer.domElement);
    const animate = () => {
        if (!miniRenderer) return;
        miniReqId = requestAnimationFrame(animate);

        // Smooth return to default rotation when not dragging
        if (!isDraggingPortrait && miniScene && miniScene.children.length > 2) {
            const model = miniScene.children[miniScene.children.length - 1];
            if (model.type === 'Group') {
                const diff = targetRotY - currentRotY;
                if (Math.abs(diff) > 0.001) {
                    currentRotY += diff * 0.08; // Smooth lerp back
                    model.rotation.y = currentRotY;
                }
            }
        }

        miniRenderer.render(miniScene, miniCamera);
    };
    animate();
}
