import * as THREE from 'three';

let mesh;
const TILE_SIZE = 1; // Radius
const GAP = 0.1;
const GRID_WIDTH = 15;
const GRID_HEIGHT = 15;

const COLOR_WATER = new THREE.Color('#0ea5e9');
const COLOR_FOREST = new THREE.Color('#166534');
const COLOR_DIRT = new THREE.Color('#3f3f46'); // Zinc-700 for a darker, tech-y dirt
const COLOR_HIGHLIGHT = new THREE.Color('#00ffff');

// Store tile data for game logic
// key: "x,y", value: { type, position }
export const tilesMap = new Map();
export const tileList = [];

export function initHexGrid(scene) {
    const geometry = new THREE.CylinderGeometry(TILE_SIZE, TILE_SIZE, 0.5, 6);
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.8,
        metalness: 0.2,
        flatShading: true
    });

    // Total count
    const count = GRID_WIDTH * GRID_HEIGHT;
    mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let index = 0;

    // Center the grid
    const offsetX = (GRID_WIDTH * TILE_SIZE * 1.732) / 2;
    const offsetZ = (GRID_HEIGHT * TILE_SIZE * 1.5) / 2;

    for (let q = 0; q < GRID_WIDTH; q++) {
        for (let r = 0; r < GRID_HEIGHT; r++) {
            // Hex-to-Pixel conversion (Pointy topped)
            // x = size * sqrt(3) * (q + r/2)
            // z = size * 3/2 * r
            
            // Offset coordinates to make grid rectangular-ish
            const qOffset = Math.floor(r / 2); // or similar offset logic
            const cx = TILE_SIZE * Math.sqrt(3) * (q + r%2 * 0.5);
            const cz = TILE_SIZE * 1.5 * r;

            // Center it
            const x = cx - offsetX;
            const z = cz - offsetZ;

            // Biome logic
            const rand = Math.random();
            let type = 'DIRT';
            let y = 0;
            let tileColor = COLOR_DIRT;

            if (rand < 0.2) {
                type = 'WATER';
                y = -0.2;
                tileColor = COLOR_WATER;
            } else if (rand < 0.5) {
                type = 'FOREST';
                y = 0; // Maybe slight height var?
                tileColor = COLOR_FOREST;
            }

            // Position
            dummy.position.set(x, y, z);
            dummy.updateMatrix();
            mesh.setMatrixAt(index, dummy.matrix);
            mesh.setColorAt(index, tileColor);

            // Save Data
            // We use axial coords or simple grid coords as ID
            const id = `${q},${r}`;
            const tileData = {
                id,
                q, r,
                x, z,
                type,
                color: tileColor.clone()
            };
            tilesMap.set(id, tileData);
            tileList.push(tileData);

            index++;
        }
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    
    scene.add(mesh);
}

export function getGridMesh() {
    return mesh;
}

export function updateGrid(time) {
    // Optional: Animate water or pulse effects here
    // Accessing instanceColor buffer is expensive, so keep it minimal
}
