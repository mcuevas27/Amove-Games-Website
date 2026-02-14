
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

// --- MOBILE DETECTION ---
function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// --- SHADERS INLINED ---
const mapVertexShader = `
    varying vec2 vUv;
    varying vec2 vPos;
    
    void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vPos = worldPosition.xy;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
`;

// --- SIMULATION SHADER (Ping Pong) ---
// Handles the persistent "Mask" layer
const simVertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const simFragmentShader = `
    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform vec2 uMouse;
    uniform float uResolutionRatio; // Aspect Ratio Correction
    uniform float uCursorRadius;
    uniform float uDecay;
    uniform float uTime;
    
    void main() {
        // Sample previous frame
        vec4 prev = texture2D(uTexture, vUv);
        
        // Decay
        float value = prev.r * uDecay;
        
        // Brush (Mouse Interaction)
        // Correct for Aspect Ratio in distance calc
        vec2 aspectUV = vUv;
        aspectUV.x *= uResolutionRatio;
        
        vec2 aspectMouse = uMouse;
        aspectMouse.x *= uResolutionRatio;
        
        // Distance to brush
        float d = distance(aspectUV, aspectMouse);
        
        // Draw new 'paint'
        // uCursorRadius is in grid units in the main shader.
        // We'll approximate: 0.05 is a decent size in UV space relative to radius.
        float brush = 1.0 - smoothstep(0.0, uCursorRadius * 0.005, d); 
        
        // Add brush to value
        value = max(value, brush);
        
        // Clamp
        value = clamp(value, 0.0, 1.0);
        
        gl_FragColor = vec4(value, 0.0, 0.0, 1.0);
    }
`;

// --- HEART PATTERN SHADER ---
const mapFragmentShader = `
    varying vec2 vUv;
    uniform float uTime;
    uniform float uScrollY; // New Uniform for Parallax
    uniform float uScale;
    uniform float uStrokeWidth;
    uniform float uGap;
    uniform vec2 uResolution;
    
    // Pulse Uniforms
    uniform float uPulseSpeed;
    uniform float uPulseDensity; // 0.0 to 1.0 (roughly)
    uniform vec3 uPulseColor;
    
    // Stroke Colors
    uniform vec3 uStrokeColor1;
    uniform vec3 uStrokeColor2;
    uniform vec3 uStrokeColor3;
    
    // Interaction Texture (from Sim)
    uniform sampler2D uMask;

    // Pseudo-random hash
    float hash21(vec2 p) {
        p = fract(p * vec2(234.34, 435.345));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
    }

    float dot2( in vec2 v ) { return dot(v,v); }

    // Heart SDF (Inigo Quilez)
    // Returns distance. < 0 inside, > 0 outside.
    // Adjusted to return positive approx distance for stroking.
    float sdHeart( in vec2 p )
    {
        p.x = abs(p.x);

        if( p.y+p.x>1.0 )
            return sqrt(dot2(p-vec2(0.25,0.75))) - sqrt(2.0)/4.0;
        return sqrt(min(dot2(p-vec2(0.00,1.00)),
                        dot2(p-0.5*max(p.x+p.y,0.0)))) * sign(p.x-p.y);
    }

    void main() {
        vec2 uv = vUv;
        uv.x *= uResolution.x / uResolution.y;

        // Apply Parallax Translation
        uv.y += uScrollY;
        
        // Scale
        uv *= uScale;
        
        // --- GRID LOGIC ---
        // Staggered Grid for Hearts
        // Every other row is offset by 0.5
        
        vec2 gridUV = uv;
        gridUV.y += 0.5; // Offset slightly
        
        vec2 id = floor(gridUV);
        
        // Check if row is odd
        float rowMod = mod(id.y, 2.0);
        
        // Offset odd rows
        if(rowMod > 0.5) {
            gridUV.x += 0.5;
            id = floor(gridUV);
        }
        
        vec2 gv = fract(gridUV) - 0.5;
        
        // Adjust Coordinate for Heart function
        // Heart is centered at roughly (0, 0.5) in 0..1 space.
        // We need to map our gv (-0.5 to 0.5) to heart space.
        // Let's flip Y because heart points down usually... wait IQ's heart points down?
        // IQ's heart: y goes 0 to 1.
        
        vec2 p = gv;
        // p.y = -p.y; // Flip Y (REMOVED: User says hearts are upside down)
        p *= 1.8; // Scale up to fit
        p.y += 0.5; // Center vertically
        
        float dist = sdHeart(p);
        
        // dist is signed: negative inside.
        // We want positive distance from edge.
        // Heart edge is at dist = 0.
        // Outside is positive. Inside is negative.
        
        // We want stroke at edge.
        float absDist = abs(dist);
        
        // --- RESTORE INTERACTION LOGIC ---
        // Read Interaction Mask from Texture
        float maskVal = texture2D(uMask, vUv).r;
        float interact = smoothstep(0.01, 1.0, maskVal); 
        
        // Stroke
        // We want stroke width. simple aa.
        float aa = uScale / uResolution.y * 2.0;
        float stroke = 1.0 - smoothstep(uStrokeWidth - aa, uStrokeWidth + aa, absDist);
        
        // Fill (Inner part)
        float fill = 1.0 - smoothstep(0.0, aa, dist); // 1 inside, 0 outside
        
        // Use consistent ID for noise
        vec2 noiseInput = id; 
        float noise = hash21(noiseInput); 
        
        // --- PULSE EFFECT ---
        float rawPulse = sin(uTime * uPulseSpeed + noise * 100.0);
        float threshold = 1.0 - uPulseDensity; 
        float pulse = smoothstep(threshold, 1.0, rawPulse);
        
        pulse *= interact;
        
        // Color Selection
        vec3 strokeColor = uStrokeColor1;
        if(noise > 0.33) strokeColor = uStrokeColor2;
        if(noise > 0.66) strokeColor = uStrokeColor3;
        
        strokeColor += uPulseColor * interact * 2.0;
        
        vec3 finalColor = vec3(0.0);
        
        // Add stroke
        finalColor = mix(finalColor, strokeColor, stroke);
        
        // Add pulse (mixing into fill)
        finalColor = mix(finalColor, uPulseColor, pulse * fill);
        
        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

export function initValentineScene(containerId) {
    const mobile = isMobile();

    // Scene Setup
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const renderer = new THREE.WebGLRenderer({ alpha: true });
    
    // Performance: Throttle pixel ratio on mobile
    const pixelRatio = mobile ? 1 : Math.min(window.devicePixelRatio, 2);
    
    const getCanvasSize = () => ({
        w: window.innerWidth,
        h: window.innerHeight * 1.5
    });
    let canvasSize = getCanvasSize();
    
    renderer.setSize(canvasSize.w, canvasSize.h);
    renderer.setPixelRatio(pixelRatio); 
    document.getElementById(containerId).appendChild(renderer.domElement);
    
    // --- SETTINGS (Defaults) ---
    // Update defaults for hearts - scale might need adjustment
    const settings = {
        // Scroll tracking
        scrollY: 0,
        scrollPercent: 0,
        // Pattern Defaults
        scale: 25.0, // Bigger hearts
        strokeWidth: 0.05,
        gap: 0.01,
        // Pulse Defaults
        pulseSpeed: 3.0, // Heartbeat pace?
        pulseDensity: 0.3,
        pulseColor: { r: 0.5, g: 0.0, b: 0.25 }, // Dimmed from 1.0, 0, 0.5
        // Stroke Defaults - Pink/Red variations (Dimmed)
        strokeColor1: { r: 0.2, g: 0.0, b: 0.1 }, 
        strokeColor2: { r: 0.3, g: 0.0, b: 0.15 }, 
        strokeColor3: { r: 0.4, g: 0.0, b: 0.2 }, 
        
        // Interaction
        cursorRadius: 15.0,
        decay: 0.96, // Decay
        
        export: function() {
             alert("Export disabled in Valentine mode.");
        },
        // Typography State (Unused here but kept for symmetry)
        scanThickness: 7.254,
        scanGap: 0,
        titleGlow: 6.5,
        devsGlow: 4
    };

    // --- PING PONG BUFFERS (Skipped on Mobile) ---
    const simRes = mobile ? 64 : 512; 
    const simParams = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType 
    };
    
    let simBufferA = new THREE.WebGLRenderTarget(simRes, simRes, simParams);
    let simBufferB = new THREE.WebGLRenderTarget(simRes, simRes, simParams);
    
    const simScene = new THREE.Scene();
    const simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    const simUniforms = {
        uTexture: { value: null },
        uMouse: { value: new THREE.Vector2(0, 0) },
        uResolutionRatio: { value: canvasSize.w / canvasSize.h },
        uCursorRadius: { value: settings.cursorRadius },
        uDecay: { value: settings.decay },
        uTime: { value: 0 }
    };
    
    const simMaterial = new THREE.ShaderMaterial({
        uniforms: simUniforms,
        vertexShader: simVertexShader,
        fragmentShader: simFragmentShader
    });
    
    const simQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMaterial);
    simScene.add(simQuad);

    // --- MAIN SCENE ---
    const mainUniforms = {
        uTime: { value: 0 },
        uScrollY: { value: 0 },
        uResolution: { value: new THREE.Vector2(canvasSize.w, canvasSize.h) },
        uScale: { value: settings.scale }, // Initial tile size
        uStrokeWidth: { value: settings.strokeWidth },
        uGap: { value: settings.gap },
        // Pulse defaults
        uPulseSpeed: { value: settings.pulseSpeed },
        uPulseDensity: { value: settings.pulseDensity }, 
        uPulseColor: { value: new THREE.Color(settings.pulseColor.r, settings.pulseColor.g, settings.pulseColor.b) },
        // Stroke defaults - Dark variations
        uStrokeColor1: { value: new THREE.Color(settings.strokeColor1.r, settings.strokeColor1.g, settings.strokeColor1.b) },
        uStrokeColor2: { value: new THREE.Color(settings.strokeColor2.r, settings.strokeColor2.g, settings.strokeColor2.b) },
        uStrokeColor3: { value: new THREE.Color(settings.strokeColor3.r, settings.strokeColor3.g, settings.strokeColor3.b) },
        // Mask from Sim
        uMask: { value: null } 
    };

    const mapGroup = new THREE.Group();
    scene.add(mapGroup);

    const mapGeo = new THREE.PlaneGeometry(2, 2);
    const mapMat = new THREE.ShaderMaterial({
        uniforms: mainUniforms,
        vertexShader: mapVertexShader,
        fragmentShader: mapFragmentShader
    });
    const mapPlane = new THREE.Mesh(mapGeo, mapMat);
    mapGroup.add(mapPlane);

    const canvasContainer = document.getElementById(containerId);

    // Skip mouse interaction on mobile
    if (!mobile) {
        document.addEventListener('mousemove', (e) => {
            const rect = renderer.domElement.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Normalize to 0-1, y flipped for UV
            const u = x / rect.width;
            const v = 1.0 - (y / rect.height);
            
            simUniforms.uMouse.value.set(u, v);
        });
    }

    window.addEventListener('resize', () => {
            canvasSize = getCanvasSize();
            renderer.setSize(canvasSize.w, canvasSize.h);
            composer.setSize(canvasSize.w, canvasSize.h);
            
            // Update shader uniforms
            mainUniforms.uResolution.value.set(canvasSize.w, canvasSize.h);
            simUniforms.uResolutionRatio.value = canvasSize.w / canvasSize.h;
    });

    const clock = new THREE.Clock();

    const composer = new EffectComposer(renderer);
    
    const mapPass = new RenderPass(scene, camera);
    composer.addPass(mapPass);

    // Performance: Disable Bloom on mobile
    if (!mobile) {
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight), 
            1.5,   // Strength
            0.1,  // Radius
            0.3    // Threshold
        );
        composer.addPass(bloomPass);
    }
    
    // No GUI for Valentine Mode (Hardcoded defaults)

    function updateCSS(varName, value, unit='px') {
        document.documentElement.style.setProperty(varName, value + unit);
    }

    let processing = false;
    let fpsInterval = 1000 / 30; // 30 FPS target
    let then = Date.now();

    function animate() {
        requestAnimationFrame(animate);

        // Performance: Throttle FPS on mobile
        if (mobile) {
            const now = Date.now();
            const elapsed = now - then;
            if (elapsed < fpsInterval) return;
            then = now - (elapsed % fpsInterval);
        }

        const dt = clock.getDelta();
        mainUniforms.uTime.value = clock.getElapsedTime();
        
        // --- STEP 1: RENDER SIMULATION (Opt-out on Mobile) ---
        if (!mobile) {
            // Sim Buffer Swap
            const bufferRead = simBufferA;
            const bufferWrite = simBufferB;
            
            simUniforms.uTexture.value = bufferRead.texture;
            
            renderer.setRenderTarget(bufferWrite);
            renderer.render(simScene, simCamera);
            
            // Pass the new texture to the main shader
            mainUniforms.uMask.value = bufferWrite.texture;
            
            // Swap Buffers for next frame
            simBufferA = bufferWrite;
            simBufferB = bufferRead;
        }
        
        // --- STEP 2: RENDER MAIN SCENE ---
        
        // Shader-based Parallax
        const scrollY = window.scrollY;
        
        // Normalize scroll relative to screen height or arbitrary scale factor
        // 0.0005 is a magic number to control speed. Adjust to taste.
        mainUniforms.uScrollY.value = scrollY * -0.001; 
        
        settings.scrollY = Math.round(scrollY);

        composer.render();
    }
    animate();
}
