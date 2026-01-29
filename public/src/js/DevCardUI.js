import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// DevCardUI.js

const loader = new GLTFLoader();

const MOBILE_BREAKPOINT = 768;

function isMobile() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
}

let cardContainer = null;
let currentTimeout = null;
// 3D Scene State
let miniScene, miniCamera, miniReqId;
let miniRenderer = null; // Singleton renderer
const modelCache = new Map(); // Cache for GLTF models

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

    const mobile = isMobile();
    const mapContainer = document.getElementById('devs-map-container');
    const mobileContainer = document.getElementById('devs-mobile-card');
    
    // Target appropriate container based on device
    const targetContainer = mobile ? mobileContainer : mapContainer;
    
    // Remove empty state when showing a card (mobile only)
    if (mobileContainer) {
        const emptyState = mobileContainer.querySelector('.devs-mobile-card-empty');
        if (emptyState) emptyState.remove();
    }

    let card = document.getElementById('dev-unit-card');

    // If card exists in wrong container, move it
    if (card && card.parentElement !== targetContainer) {
        card.remove();
        card = null;
    }

    if (!card) {
        card = document.createElement('div');
        card.id = 'dev-unit-card';
        card.className = 'dev-card';
        if (targetContainer) targetContainer.appendChild(card);
        else document.body.appendChild(card);
    }

    // Multi-unit mode class
    if (units.length > 1) {
        card.classList.add('multi-select');
    } else {
        card.classList.remove('multi-select');
    }

    // Dynamic Positioning REMOVED - Always Bottom-Left
    
    // Apply Debug Layout Settings
    updateCardLayout();

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
                <div class="selection-header">
                    <span class="sel-count">${units.length}</span>
                    <span class="sel-label">Active</span>
                </div>
                <div class="selection-portraits">
                    ${units.map((u, i) => `
                        <div class="selection-portrait ${i === viewIndex ? 'active' : ''}"
                             data-index="${i}"
                             title="${u.name}"
                             style="border-color: ${u.color}; color: ${u.color}; ${i === viewIndex ? `background: ${u.color}22; box-shadow: 0 0 10px ${u.color}66;` : ''}">
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
        <div class="dev-portrait-external">
            ${visualContent}
        </div>
        <div class="dev-card-compact">
            <div class="dev-compact-header">
                <div class="dev-text">
                    <h3 style="color: ${data.color}">${data.name}</h3>
                    <span class="dev-role">${data.role}</span>
                </div>
            </div>
            <div class="radar-chart-container">
                ${generateRadarChart(data.stats, data.color)}
            </div>
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
}

function generateRadarChart(stats, color) {
    const numAxes = 5;
    const radius = 80; // Increased radius
    const centerX = 125; // SVG center X
    const centerY = 100;  // SVG center Y
    
    // Pad stats to 5
    const paddedStats = [...stats];
    while (paddedStats.length < numAxes) {
        paddedStats.push({ label: '', value: 0 });
    }
    
    // Helper to get coordinates
    const getCoords = (value, index) => {
        const angle = (Math.PI * 2 * index) / numAxes - (Math.PI / 2); // Start at top
        const r = (value / 100) * radius;
        return {
            x: centerX + Math.cos(angle) * r,
            y: centerY + Math.sin(angle) * r
        };
    };

    // Generate Polygon Points
    const points = paddedStats.map((s, i) => {
        const coords = getCoords(s.value, i);
        return `${coords.x},${coords.y}`;
    }).join(' ');

    // Generate Background Axis (Pentagon)
    const bgPoints = Array.from({ length: numAxes }).map((_, i) => {
        const coords = getCoords(100, i);
        return `${coords.x},${coords.y}`;
    }).join(' ');
    
    // Generate Axis Lines
    const axisLines = Array.from({ length: numAxes }).map((_, i) => {
        const coords = getCoords(100, i);
        return `<line x1="${centerX}" y1="${centerY}" x2="${coords.x}" y2="${coords.y}" class="radar-axis-line" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;
    }).join('');

    // Generate Interactive Points (instead of text labels)
    const pointsAndTooltips = paddedStats.map((s, i) => {
        if (!s.label) return '';
        const coords = getCoords(s.value, i); // Put dot right on the value vertex
        
        return `
            <circle cx="${coords.x}" cy="${coords.y}" r="5" class="radar-point" 
                fill="${color}" stroke="#fff" stroke-width="1.5"
                data-label="${s.label}" data-value="${Math.round(s.value)}">
            </circle>
        `;
    }).join('');

    return `
        <svg viewBox="0 0 250 220" class="radar-chart-svg">
            <!-- Background Pentagon -->
            <polygon points="${bgPoints}" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
            ${axisLines}
            
            <!-- Data Polygon -->
            <polygon points="${points}" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2" class="radar-polygon"/>
            
            <!-- Interactive Points -->
            ${pointsAndTooltips}
        </svg>
    `;
}

// Tooltip Management
function initRadarTooltips() {
    let tooltip = document.getElementById('dev-radar-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'dev-radar-tooltip';
        tooltip.className = 'dev-radar-tooltip';
        document.body.appendChild(tooltip);
    }

    document.addEventListener('mouseover', (e) => {
        if (e.target.classList.contains('radar-point')) {
            const label = e.target.getAttribute('data-label');
            const value = e.target.getAttribute('data-value');
            const color = e.target.getAttribute('fill');
            
            if (label) {
                tooltip.innerHTML = `
                    <div style="color: #aaa; font-size: 0.8em; text-transform: uppercase;">${label}</div>
                    <div style="color: ${color}; font-size: 1.2em; font-weight: bold;">${value}</div>
                `;
                tooltip.style.display = 'block';
                
                // Position near the point, but global
                const rect = e.target.getBoundingClientRect();
                tooltip.style.left = `${rect.left + window.scrollX}px`;
                tooltip.style.top = `${rect.top + window.scrollY - 40}px`; // Shift up
                tooltip.style.transform = 'translateX(-50%)';
            }
        }
    });

    document.addEventListener('mouseout', (e) => {
        if (e.target.classList.contains('radar-point')) {
            tooltip.style.display = 'none';
        }
    });
}

// Initialize tooltips once
initRadarTooltips();

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

    // Show empty state on mobile
    if (isMobile()) {
        showMobileEmptyState();
    }
}

function showMobileEmptyState() {
    const mobileContainer = document.getElementById('devs-mobile-card');
    if (!mobileContainer) return;

    // Remove existing card if any
    const existingCard = document.getElementById('dev-unit-card');
    if (existingCard && existingCard.parentElement === mobileContainer) {
        existingCard.remove();
    }

    // Show empty state if not already present
    let emptyState = mobileContainer.querySelector('.devs-mobile-card-empty');
    if (!emptyState) {
        emptyState = document.createElement('div');
        emptyState.className = 'devs-mobile-card-empty';
        emptyState.textContent = 'TAP A UNIT TO VIEW DETAILS';
        mobileContainer.appendChild(emptyState);
    }
}

// Initialize mobile empty state on load
// Renamed for clarity - now used globally (Unified Layout)
// Renamed for clarity - now used globally (Unified Layout)
export function initMobileCardState() {
    // Only show empty state on mobile
    if (isMobile()) {
        showMobileEmptyState();
    }

    // Update on resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        // Debounce resize handling
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const card = document.getElementById('dev-unit-card');
            const mobileContainer = document.getElementById('devs-mobile-card');

            // If card is gone or hidden, re-show empty state (Mobile Only)
            if (isMobile() && !card && mobileContainer) {
                 const emptyState = mobileContainer.querySelector('.devs-mobile-card-empty');
                 if (!emptyState) showMobileEmptyState();
            }
            
            // Remove empty state if on desktop
            if (!isMobile() && mobileContainer) {
                const emptyState = mobileContainer.querySelector('.devs-mobile-card-empty');
                if (emptyState) emptyState.remove();
            }

            // Update Mini 3D Scene if active
            if (miniRenderer && miniCamera && card) {
                const mount = document.getElementById('dev-card-3d-mount');
                if (mount) {
                    const w = mount.clientWidth;
                    const h = mount.clientHeight;
                    if (w > 0 && h > 0) {
                         miniRenderer.setSize(w, h);
                         miniCamera.aspect = w / h;
                         miniCamera.updateProjectionMatrix();
                    }
                }
            }
        }, 100);
    });
}



function cleanup3D() {
    if (miniReqId) {
        cancelAnimationFrame(miniReqId);
        miniReqId = null;
    }
    
    // Do NOT dispose renderer, just detach
    if (miniRenderer && miniRenderer.domElement && miniRenderer.domElement.parentElement) {
        miniRenderer.domElement.parentElement.removeChild(miniRenderer.domElement);
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
    scale: null,
    posY: null,
    rotY: null,
    fov: null,
    // Layout Controls
    cardWidth: null,
    cardHeight: null
};

// Layout Settings
const layoutSettings = {
    width: 300, // Default 300x200
    height: 200
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
    folder.add(configExport, 'save').name('💾 Save Portraits');
    
    // Layout Debug Controls
    const layoutFolder = gui.addFolder('Card Layout (Desktop)');
    guiControllers.cardWidth = layoutFolder.add(layoutSettings, 'width', 200, 800).name('Width (px)').onChange(updateCardLayout);
    guiControllers.cardHeight = layoutFolder.add(layoutSettings, 'height', 200, 800).name('Height (px)').onChange(updateCardLayout);
}

function updateCardLayout() {
    const card = document.getElementById('dev-unit-card');
    if (card && !isMobile()) {
        card.style.width = `${layoutSettings.width}px`;
        // card.style.height = `${layoutSettings.height}px`; // Let content dictate height mostly, or min-height
        // Using min-height usually better to avoid overflow
        card.style.minHeight = `${layoutSettings.height}px`;
    }
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

    // Initialize Singleton Renderer if needed
    if (!miniRenderer) {
        miniRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        miniRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Fix for high-DPI
        miniRenderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    
    miniRenderer.setSize(w, h); // Resize to current container

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
    
    // Check Cache
    if (modelCache.has(modelPath)) {
        console.log(`DevCard 3D: Using cached model for ${modelPath}`);
        setupModel(modelCache.get(modelPath).clone(), thisLoadId);
    } else {
        console.log(`DevCard 3D: Loading ${modelPath} (LoadID: ${thisLoadId})`);
        loader.load(modelPath, (gltf) => {
            if (thisLoadId !== currentLoadId) return; // Stale

            // Cache it
            modelCache.set(modelPath, gltf.scene);
            
            // Use clone
            setupModel(gltf.scene.clone(), thisLoadId);
        }, undefined, (err) => console.error(err));
    }
    
    function setupModel(model, loadId) {
        if (loadId !== currentLoadId) return;

        // Initial set based on current settings
        model.scale.set(portraitSettings.scale, portraitSettings.scale, portraitSettings.scale);
        model.position.y = portraitSettings.posY;
        model.rotation.y = portraitSettings.rotY;

        miniScene.add(model);
        console.log("DevCard 3D Model Added");
    }

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
