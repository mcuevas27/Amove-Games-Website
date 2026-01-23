import * as THREE from 'three';
import { tileList } from './HexGrid.js';

let fogMesh;
let tileStates = null; // Float32Array to track Opacity/Scale (0.0 = Clear, 1.0 = Fog)
let unitsRef = []; // Reference to units to track

export function initFog(scene) {
    // Create a mesh matching the grid
    const geometry = new THREE.CylinderGeometry(1, 1, 0.2, 6);
    const material = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.9, // Slightly darker base
    });

    const count = tileList.length;
    fogMesh = new THREE.InstancedMesh(geometry, material, count);
    fogMesh.position.y = 0.6; 
    
    // Initialize States
    tileStates = new Float32Array(count).fill(1.0); // Start fully foggy

    // Initial Position
    const dummy = new THREE.Object3D();
    tileList.forEach((tile, index) => {
        dummy.position.set(tile.x, 0.6, tile.z);
        // Default Scale 1.0
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        fogMesh.setMatrixAt(index, dummy.matrix);
    });

    fogMesh.instanceMatrix.needsUpdate = true;
    scene.add(fogMesh);
}

export function registerFogUnits(units) {
    unitsRef = units;
}

export function updateFog(time) {
    if (!fogMesh || !tileStates) return;

    // 1. Calculate Visibility Targets (Binary)
    const range = 2.0; 
    const rangeSq = range * range;
    const visibleThisFrame = new Set();

    unitsRef.forEach(unit => {
        tileList.forEach(tile => {
            const dx = tile.x - unit.position.x;
            const dz = tile.z - unit.position.z;
            const dSq = dx*dx + dz*dz;

            if (dSq < rangeSq) {
                visibleThisFrame.add(tile.id);
            }
        });
    });

    // 2. Update States (Smooth Transition)
    const dummy = new THREE.Object3D();
    let hasChanges = false;

    tileList.forEach((tile, index) => {
        const isVisible = visibleThisFrame.has(tile.id);
        const target = isVisible ? 0.0 : 1.0;
        const current = tileStates[index];
        
        // Settings
        const revealSpeed = 0.2; // Fast reveal
        const coverSpeed = 0.02; // Slow fade back in
        
        let diff = target - current;
        
        if (Math.abs(diff) > 0.001) {
            const speed = isVisible ? revealSpeed : coverSpeed;
            const step = diff * speed;
            
            tileStates[index] += step;
            hasChanges = true;
            
            // Construct Matrix with new Scale
            // Note: Optimizing this to only setMatrixAt when significant change occurs is good, 
            // but for 225 tiles, doing all is safe.
            const scale = tileStates[index];
            dummy.position.set(tile.x, 0.6, tile.z);
            dummy.scale.set(scale, scale, scale); 
            dummy.updateMatrix();
            fogMesh.setMatrixAt(index, dummy.matrix);

        } else if (current !== target) {
            // Snap to finish
            tileStates[index] = target;
            hasChanges = true;

            const scale = target;
            dummy.position.set(tile.x, 0.6, tile.z);
            dummy.scale.set(scale, scale, scale); 
            dummy.updateMatrix();
            fogMesh.setMatrixAt(index, dummy.matrix);
        }
    });

    if (hasChanges) {
        fogMesh.instanceMatrix.needsUpdate = true;
    }
}

// Deprecated
export function revealFogAt(x, z, radius) {}
