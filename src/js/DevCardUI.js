import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// DevCardUI.js

let cardContainer = null;
let currentTimeout = null;
// 3D Scene State
let miniScene, miniCamera, miniRenderer, miniReqId;
let currentLoadId = 0;


export function initCardUI(container) {
    // Create the overlay container absolute in the relative parent
    cardContainer = document.createElement('div');
    cardContainer.id = 'dev-card-overlay';
    cardContainer.className = 'dev-card-wrapper hidden';
    container.appendChild(cardContainer);
}

export function showDevCard(data, focusPos, w, h) {
    const container = document.getElementById('devs-map-container'); // Corrected ID
    // Or simpler: Just find or create #dev-unit-card
    let card = document.getElementById('dev-unit-card');
    
    if (!card) {
        card = document.createElement('div');
        card.id = 'dev-unit-card';
        card.className = 'dev-card';
        // Append to the section container so it is positioned relative to the canvas
        if (container) container.appendChild(card);
        else document.body.appendChild(card); // Fallback
    }

    // Reset Position
    card.classList.remove('alt-pos');

    // Dynamic Positioning Logic
    if (focusPos && w && h) {
        // Danger Zone: Bottom Left
        // x < 380 (Card 320 + 20 margin + buffer)
        // y > h - 400 (Card height approx)
        const isBottomLeft = focusPos.x < 380 && focusPos.y > (h - 400);
        
        if (isBottomLeft) {
            console.log("DevCard: Unit in Danger Zone, moving to Right.");
            card.classList.add('alt-pos');
        }
    }

    // Populate
    // Populate
    const is3D = data.img.endsWith('.glb');
    console.log("DevCard Data:", data.img, "Is 3D?", is3D);
    
    // Cleanup previous 3D if exists
    cleanup3D();

    let visualContent = '';
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

    // Show
    card.classList.add('visible');

    // Init 3D if needed
    if (is3D) {
        setTimeout(() => {
            const mount = document.getElementById('dev-card-3d-mount');
            if (mount) initMiniScene(mount, data.img);
        }, 10);
    }


    // Animate Bars (after slight delay for DOM paint)
    setTimeout(() => {
        const fills = card.querySelectorAll('.stat-bar-fill');
        fills.forEach((fill, i) => {
            fill.style.width = data.stats[i].value + '%';
            fill.style.backgroundColor = data.color;
        });
    }, 50);
}

export function hideDevCard() {
    cleanup3D();
    const card = document.getElementById('dev-unit-card');
    if (card) {
        card.classList.remove('visible');
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
    miniScene = null;
    miniCamera = null;
}

const DEFAULT_SETTINGS = {
    scale: 1.5,
    posY: -0.39,
    rotY: 0.5277,
    fov: 25
};

// Storage for per-unit settings
const unitConfigs = {
    'skacal': {
        scale: 1.5, // Matches Default
        posY: -0.39,
        rotY: 0.5277,
        fov: 25
    },
    'david': {
        scale: 1.3,
        posY: -0.26,
        rotY: 0.5277,
        fov: 18.81
    },
    'ramon': {
        scale: 1.5,
        posY: -0.02,
        rotY: 0.5277,
        fov: 25
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

function updatePortraitTransform() {
    if (miniScene && miniScene.children.length > 2) {
        const model = miniScene.children[miniScene.children.length - 1];
        if (model.type === 'Group') {
            model.scale.set(portraitSettings.scale, portraitSettings.scale, portraitSettings.scale);
            model.position.y = portraitSettings.posY;
            model.rotation.y = portraitSettings.rotY;
        }
    }
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
        
        // Auto-rotation disabled
        // if (miniScene.children.length > 2) {
        //      const model = miniScene.children[miniScene.children.length-1];
        //      if(model.type === 'Group') model.rotation.y += 0.01;
        // }

        miniRenderer.render(miniScene, miniCamera);
    };
    animate();
}
