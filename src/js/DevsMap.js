import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

import { initHexGrid, updateGrid } from './HexGrid.js';
import { initUnits, updateUnits, initUnitGUI } from './UnitSystem.js';
import { initDevCardGUI } from './DevCardUI.js';
import { initFog, updateFog } from './FogSystem.js';
import { updateDiscoveryEffects } from './DiscoveryEffect.js';

let scene, camera, renderer, composer, controls;
let animationId = null;
let isVisible = false;
let container = null;

// Settings
const SETTINGS = {
    camera: {
        pos: [20, 20, 20],
        frustumSize: 12, // Base scene size
        zoom: 1.188 // User adjusted zoom
    },
    lighting: {
        ambientIntensity: 0.4,
        dirLightPos: [10, 20, 10],
        dirLightIntensity: 1.5
    }
};

export function initDevsMap(containerId) {
    container = document.getElementById(containerId);
    if (!container) {
        console.warn(`DevsMap: Container #${containerId} not found.`);
        return;
    }

    // 1. Scene Setup
    scene = new THREE.Scene();
    
    // Orthographic Camera
    const aspect = container.clientWidth / container.clientHeight;
    // Frustum Size Logic
    const frustum = SETTINGS.camera.frustumSize;
    camera = new THREE.OrthographicCamera(
        -aspect * frustum, aspect * frustum,
        frustum, -frustum,
        1, 1000
    );
    camera.position.set(...SETTINGS.camera.pos);
    camera.zoom = SETTINGS.camera.zoom;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    // Important: shadow map enabled if we want shadows
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Controls
    controls = new MapControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = false; // Disable zoom to allow scrolling
    controls.enableRotate = false; // Disabled to allow Right-Click Move
    controls.enablePan = false; // Disabled by user request
    controls.mouseButtons = {
        LEFT: null, 
        MIDDLE: null, // Let browser handle scroll
        RIGHT: null // Disable Rotate
    };

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, SETTINGS.lighting.ambientIntensity);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, SETTINGS.lighting.dirLightIntensity);
    dirLight.position.set(...SETTINGS.lighting.dirLightPos);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;

    // Expand shadow camera frustum to cover entire map
    dirLight.shadow.camera.left = -25;
    dirLight.shadow.camera.right = 25;
    dirLight.shadow.camera.top = 25;
    dirLight.shadow.camera.bottom = -25;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 60;

    scene.add(dirLight);

    // Composer (Bloom)
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    // Mild bloom for the neon effect
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(container.clientWidth, container.clientHeight),
        0.5, // Strength (lower than main scene)
        0.4, // Radius
        0.85 // Threshold (high to only bloom bright UI/Effects)
    );
    composer.addPass(bloomPass);

    // 2. Initialize Modules
    initHexGrid(scene);
    initFog(scene);
    initUnits(scene, camera, container); // Pass container for selection box

    // 3. Viewport Culling
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            isVisible = entry.isIntersecting;
            if (isVisible) {
                if (!animationId) animate();
            } else {
                // Optional: Stop loop completely if off screen
                // For now, we keep logic running if needed, or simple return in animate
            }
        });
    }, { threshold: 0.1 }); // 10% visible triggers it
    observer.observe(container);

    // Resize Handler
    window.addEventListener('resize', onWindowResize);

    // Debug GUI
    initGUI();
}

function initGUI() {
    const gui = new GUI({ title: 'Devs Map Config' });
    initUnitGUI(gui);
    initDevCardGUI(gui);
    
    const camFolder = gui.addFolder('Camera');
    camFolder.add(camera, 'zoom', 1, 100).name('Zoom').onChange(() => camera.updateProjectionMatrix());
    camFolder.add(camera.position, 'x').name('Pos X').listen();
    camFolder.add(camera.position, 'y').name('Pos Y').listen();
    camFolder.add(camera.position, 'z').name('Pos Z').listen();
    
    // Config Export
    const config = {
        save: () => {
            const data = {
                camera: {
                    pos: [camera.position.x, camera.position.y, camera.position.z],
                    zoom: camera.zoom
                }
            };
            console.log("--- SAVED CONFIG ---");
            console.log(JSON.stringify(data, null, 4));
            alert("Configuration saved to Console (F12)");
        }
    };
    gui.add(config, 'save').name('💾 Save Config');
}

function onWindowResize() {
    if (!container || !camera || !renderer) return;
    
    const aspect = container.clientWidth / container.clientHeight;
    const frustum = SETTINGS.camera.frustumSize;
    
    camera.left = -aspect * frustum;
    camera.right = aspect * frustum;
    camera.top = frustum;
    camera.bottom = -frustum;
    
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    composer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    if (!isVisible) {
        animationId = null;
        return; // Stop loop
    }

    animationId = requestAnimationFrame(animate);
    
    const time = performance.now() * 0.001;

    controls.update();

    // Module Updates
    updateGrid(time);
    updateFog(time);
    updateUnits(time);
    updateDiscoveryEffects(0.016); // ~60fps delta

    composer.render();
}
