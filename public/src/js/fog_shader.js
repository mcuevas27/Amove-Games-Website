export const fogVertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

export const fogFragmentShader = `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform vec2 uMouse;
    uniform sampler2D uVisionTexture; // Red channel = 1.0 (clear), 0.0 (fog)

    varying vec2 vUv;

    // Simplex 2D noise
    vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

    float snoise(vec2 v){
        const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                 -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy) );
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1;
        i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod(i, 289.0);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
        + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m ;
        m = m*m ;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
    }

    void main() {
        // Base fog noise
        float noise1 = snoise(vUv * 3.0 + uTime * 0.1);
        float noise2 = snoise(vUv * 6.0 - uTime * 0.15);
        float fogDensity = 0.5 + 0.5 * (noise1 * 0.6 + noise2 * 0.4);
        
        // Color of the fog
        vec3 fogColor = vec3(0.05, 0.05, 0.08); // Dark blue-grey

        // Sample the vision texture
        // It holds the "clearness" value (1 = clear, 0 = fog)
        vec4 vision = texture2D(uVisionTexture, vUv);
        float clearFactor = vision.r;
        
        // Mix fog with transparency
        // If clearFactor is 1 (clear), alpha should be 0.
        // If clearFactor is 0 (fog), alpha should be fogDensity.
        float alpha = fogDensity * (1.0 - clearFactor);
        
        alpha = clamp(alpha, 0.0, 1.0);
        
        gl_FragColor = vec4(fogColor, alpha);
    }
`;
