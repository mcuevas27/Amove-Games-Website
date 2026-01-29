import * as THREE from 'three';

let mesh;
const TILE_SIZE = 1; // Radius
const GAP = 0.1;
const GRID_WIDTH = 15;
const GRID_HEIGHT = 15;

const COLOR_WATER = new THREE.Color('#0ea5e9');
const COLOR_FOREST = new THREE.Color('#166534');
const COLOR_DIRT = new THREE.Color('#3f3f46'); // Zinc-700
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

    // 1. Generate Basic Grid & Positions
    // We'll store temp data first to apply "Lake" logic effectively
    const tempGrid = [];

    for (let q = 0; q < GRID_WIDTH; q++) {
        for (let r = 0; r < GRID_HEIGHT; r++) {
            const qOffset = Math.floor(r / 2); 
            const cx = TILE_SIZE * Math.sqrt(3) * (q + r%2 * 0.5);
            const cz = TILE_SIZE * 1.5 * r;

            const x = cx - offsetX;
            const z = cz - offsetZ;

            // Default Biome: Dirt with Forest Noise
            let type = 'DIRT';
            let y = 0;
            let tileColor = COLOR_DIRT;
            
            if (Math.random() < 0.3) {
                type = 'FOREST';
                y = 0; 
                tileColor = COLOR_FOREST;
            }

            // Store for Lake step
            const tileData = {
                id: `${q},${r}`,
                q, r,
                x, z,
                y,
                type,
                color: tileColor.clone(),
                index
            };
            
            tempGrid.push(tileData);
            tileList.push(tileData);
            tilesMap.set(tileData.id, tileData);

            index++;
        }
    }

    // 2. Lake Generation (3 Bodies of Water)
    const NUM_LAKES = 3;
    const LAKE_RADIUS_MIN = 1.0; 
    const LAKE_RADIUS_MAX = 3.5; 

    // Generate Lake Centers
    // Pick random tiles as centers
    for (let i = 0; i < NUM_LAKES; i++) {
        const centerTile = tempGrid[Math.floor(Math.random() * tempGrid.length)];
        const radius = LAKE_RADIUS_MIN + Math.random() * (LAKE_RADIUS_MAX - LAKE_RADIUS_MIN);
        
        // Apply Water to neighbors in radius
        tempGrid.forEach(tile => {
            const dx = tile.x - centerTile.x;
            const dz = tile.z - centerTile.z;
            const dist = Math.sqrt(dx*dx + dz*dz);
            
            // Core lake
            if (dist < radius) {
                makeWater(tile);
            } 
            // Organic edge (noise)
            else if (dist < radius + 1.0 && Math.random() < 0.5) {
                makeWater(tile);
            }
        });
    }

    // 3. Apply to InstancedMesh
    tempGrid.forEach(tile => {
        dummy.position.set(tile.x, tile.y, tile.z);
        dummy.updateMatrix();
        mesh.setMatrixAt(tile.index, dummy.matrix);
        mesh.setColorAt(tile.index, tile.color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    
    scene.add(mesh);
}

function makeWater(tile) {
    if (tile.type === 'WATER') return;
    tile.type = 'WATER';
    tile.y = -0.2; // Sink
    tile.color = COLOR_WATER;
}

export function getGridMesh() {
    return mesh;
}

export function updateGrid(time) {
    // Optional: Animate water or pulse effects here
}
