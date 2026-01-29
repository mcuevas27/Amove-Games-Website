import { tilesMap, tileList } from './HexGrid.js';

// Directions for Odd-R Offset Coordinates
// Neighbors depend on whether the row 'r' is Even or Odd
const ODD_R_DIRECTIONS = [
    // Even rows
    [
        [1, 0], [0, -1], [-1, -1], 
        [-1, 0], [-1, 1], [0, 1]
    ],
    // Odd rows
    [
        [1, 0], [1, -1], [0, -1], 
        [-1, 0], [0, 1], [1, 1]
    ]
];

function getNeighbors(tile) {
    const parity = tile.r & 1;
    const dirs = ODD_R_DIRECTIONS[parity];
    const result = [];

    for (let i = 0; i < dirs.length; i++) {
        const dir = dirs[i];
        const nq = tile.q + dir[0];
        const nr = tile.r + dir[1];
        const id = `${nq},${nr}`;
        const neighbor = tilesMap.get(id);
        if (neighbor) {
            result.push(neighbor);
        }
    }
    return result;
}

// Heuristic: Euclidean distance
function heuristic(a, b) {
    return Math.sqrt((a.x - b.x)**2 + (a.z - b.z)**2);
}

// A* Pathfinding
export function findPath(startTile, endTile) {
    // If end is water, we can't path TO it.
    // But we should check validity. Actually handled by validation check before calls?
    // User logic: "Right clicking on water should move unit to closest non-water".
    // So caller should resolve endTile first.
    
    if (!startTile || !endTile) return [];
    if (startTile === endTile) return [];

    const openSet = [startTile];
    const cameFrom = new Map();
    
    // G Score: Cost from start to node
    const gScore = new Map();
    gScore.set(startTile, 0);

    // F Score: G + Heuristic
    const fScore = new Map();
    fScore.set(startTile, heuristic(startTile, endTile));

    // console.log("A* Start", startTile.id, "->", endTile.id);
    let iterations = 0;

    while (openSet.length > 0) {
        iterations++;
        // Safety Break
        if (iterations > 1000) {
            console.error("A* Aborted: Too many iterations");
            break; 
        }

        // Sort by F score (lowest first) - Simple array sort is O(N log N)
        openSet.sort((a, b) => {
            const fa = fScore.get(a) !== undefined ? fScore.get(a) : Infinity;
            const fb = fScore.get(b) !== undefined ? fScore.get(b) : Infinity;
            return fa - fb;
        });

        const current = openSet.shift(); // Pop lowest
        // console.log(`Visiting ${current.id} (F: ${fScore.get(current)})`);

        if (current === endTile) {
            // console.log("Path Found!");
            return reconstructPath(cameFrom, current);
        }

        const neighbors = getNeighbors(current);
        
        for (const neighbor of neighbors) {
            if (neighbor.type === 'WATER') continue; // Impassable

            // Cost is 1 for land
            const tentativeG = (gScore.get(current) !== undefined ? gScore.get(current) : Infinity) + 1;

            if (tentativeG < (gScore.get(neighbor) !== undefined ? gScore.get(neighbor) : Infinity)) {
                cameFrom.set(neighbor, current);
                gScore.set(neighbor, tentativeG);
                fScore.set(neighbor, tentativeG + heuristic(neighbor, endTile));

                if (!openSet.includes(neighbor)) {
                    openSet.push(neighbor);
                }
            }
        }
    }
    
    console.warn("A* Failed: OpenSet empty. Visited count:", iterations);
    return []; // No path found
}

function reconstructPath(cameFrom, current) {
    const totalPath = [current];
    while (cameFrom.has(current)) {
        current = cameFrom.get(current);
        totalPath.unshift(current);
    }
    // Remove start tile (we are already there)
    totalPath.shift(); 
    return totalPath;
}

// BFS to find closest non-water tile
export function findClosestLand(startTile) {
    if (startTile.type !== 'WATER') return startTile;

    const queue = [startTile];
    const visited = new Set([startTile]);

    while (queue.length > 0) {
        const current = queue.shift();

        if (current.type !== 'WATER') {
            return current;
        }

        const neighbors = getNeighbors(current);
        for (const n of neighbors) {
            if (!visited.has(n)) {
                visited.add(n);
                queue.push(n);
            }
        }
    }
    return null; // Should not happen unless map is all water
}
