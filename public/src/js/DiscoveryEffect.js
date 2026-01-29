import * as THREE from 'three';

// Discovery Effect System - RPG-style celebration for finding hidden units

let sceneRef = null;
let activeEffects = [];

// Reusable geometries and materials
let particleGeometry = null;
let ringGeometry = null;
let pillarGeometry = null;

export function initDiscoveryEffect(scene) {
    sceneRef = scene;

    // Pre-create reusable geometries
    particleGeometry = new THREE.SphereGeometry(0.08, 8, 8);
    ringGeometry = new THREE.RingGeometry(0.1, 0.3, 32);
    pillarGeometry = new THREE.CylinderGeometry(0.3, 0.5, 8, 16, 1, true);
}

export function triggerDiscovery(position, color = '#ffd700') {
    if (!sceneRef) return;

    const basePos = position.clone();
    const threeColor = new THREE.Color(color);
    const goldColor = new THREE.Color('#ffd700');

    // Mix unit color with gold for unique but celebratory feel
    const effectColor = threeColor.clone().lerp(goldColor, 0.5);

    // 1. Particle Burst
    createParticleBurst(basePos, effectColor);

    // 2. Light Pillar
    createLightPillar(basePos, effectColor);

    // 3. Expanding Rings (multiple waves)
    createExpandingRing(basePos, effectColor, 0);
    setTimeout(() => createExpandingRing(basePos, effectColor, 0), 150);
    setTimeout(() => createExpandingRing(basePos, effectColor, 0), 300);

    // 4. Rising Stars
    createRisingStars(basePos, effectColor);

    // 5. Ground Flash
    createGroundFlash(basePos, effectColor);
}

function createParticleBurst(position, color) {
    const particleCount = 24;
    const particles = [];

    for (let i = 0; i < particleCount; i++) {
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 1.0,
        });

        const particle = new THREE.Mesh(particleGeometry, material);
        particle.position.copy(position);
        particle.position.y += 0.5;

        // Random outward velocity
        const angle = (i / particleCount) * Math.PI * 2 + Math.random() * 0.5;
        const speed = 2 + Math.random() * 2;
        const upSpeed = 3 + Math.random() * 2;

        particle.userData.velocity = new THREE.Vector3(
            Math.cos(angle) * speed,
            upSpeed,
            Math.sin(angle) * speed
        );
        particle.userData.gravity = -8;
        particle.userData.life = 1.0;
        particle.userData.decay = 0.8 + Math.random() * 0.4;

        sceneRef.add(particle);
        particles.push(particle);
    }

    activeEffects.push({
        type: 'particles',
        objects: particles,
        startTime: performance.now()
    });
}

function createLightPillar(position, color) {
    const material = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
    });

    const pillar = new THREE.Mesh(pillarGeometry, material);
    pillar.position.copy(position);
    pillar.position.y += 4;
    pillar.scale.set(1, 0, 1);

    sceneRef.add(pillar);

    activeEffects.push({
        type: 'pillar',
        object: pillar,
        startTime: performance.now(),
        phase: 'grow' // grow -> hold -> fade
    });
}

function createExpandingRing(position, color, delay) {
    const material = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
    });

    const ring = new THREE.Mesh(ringGeometry, material);
    ring.position.copy(position);
    ring.position.y += 0.15;
    ring.rotation.x = -Math.PI / 2;
    ring.scale.set(0.5, 0.5, 0.5);

    sceneRef.add(ring);

    activeEffects.push({
        type: 'ring',
        object: ring,
        startTime: performance.now() + delay,
        maxScale: 6
    });
}

function createRisingStars(position, color) {
    const starCount = 8;
    const stars = [];

    // Star shape using points
    const starGeom = new THREE.BufferGeometry();
    const starPoints = [];
    for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
        starPoints.push(Math.cos(angle) * 0.15, Math.sin(angle) * 0.15, 0);
    }
    starGeom.setAttribute('position', new THREE.Float32BufferAttribute(starPoints, 3));

    for (let i = 0; i < starCount; i++) {
        const material = new THREE.PointsMaterial({
            color: color,
            size: 0.3,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending
        });

        const star = new THREE.Points(starGeom, material);
        const angle = (i / starCount) * Math.PI * 2;
        const radius = 0.5 + Math.random() * 0.5;

        star.position.copy(position);
        star.position.x += Math.cos(angle) * radius;
        star.position.z += Math.sin(angle) * radius;
        star.position.y += 0.5;

        star.userData.riseSpeed = 1.5 + Math.random() * 1;
        star.userData.wobble = Math.random() * Math.PI * 2;
        star.userData.wobbleSpeed = 2 + Math.random() * 2;
        star.userData.life = 1.0;

        sceneRef.add(star);
        stars.push(star);
    }

    activeEffects.push({
        type: 'stars',
        objects: stars,
        startTime: performance.now()
    });
}

function createGroundFlash(position, color) {
    const flashGeom = new THREE.CircleGeometry(0.5, 32);
    const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
    });

    const flash = new THREE.Mesh(flashGeom, material);
    flash.position.copy(position);
    flash.position.y += 0.12;
    flash.rotation.x = -Math.PI / 2;

    sceneRef.add(flash);

    activeEffects.push({
        type: 'flash',
        object: flash,
        startTime: performance.now()
    });
}

export function updateDiscoveryEffects(deltaTime) {
    if (!sceneRef) return;

    const now = performance.now();
    const dt = deltaTime || 0.016;

    activeEffects = activeEffects.filter(effect => {
        const elapsed = (now - effect.startTime) / 1000;

        switch (effect.type) {
            case 'particles':
                return updateParticles(effect, dt);

            case 'pillar':
                return updatePillar(effect, elapsed);

            case 'ring':
                return updateRing(effect, elapsed);

            case 'stars':
                return updateStars(effect, dt);

            case 'flash':
                return updateFlash(effect, elapsed);

            default:
                return false;
        }
    });
}

function updateParticles(effect, dt) {
    let anyAlive = false;

    effect.objects.forEach(particle => {
        if (particle.userData.life <= 0) return;

        // Physics
        particle.userData.velocity.y += particle.userData.gravity * dt;
        particle.position.add(particle.userData.velocity.clone().multiplyScalar(dt));

        // Decay
        particle.userData.life -= dt * particle.userData.decay;
        particle.material.opacity = Math.max(0, particle.userData.life);
        particle.scale.setScalar(particle.userData.life);

        if (particle.userData.life > 0) {
            anyAlive = true;
        } else {
            sceneRef.remove(particle);
            particle.material.dispose();
        }
    });

    return anyAlive;
}

function updatePillar(effect, elapsed) {
    const pillar = effect.object;
    const duration = 2.0;

    if (elapsed < 0.3) {
        // Grow phase
        const t = elapsed / 0.3;
        pillar.scale.y = easeOutBack(t);
        pillar.material.opacity = 0.6;
    } else if (elapsed < 1.2) {
        // Hold phase - gentle pulse
        pillar.scale.y = 1.0;
        pillar.material.opacity = 0.4 + Math.sin(elapsed * 8) * 0.2;
    } else if (elapsed < duration) {
        // Fade phase
        const t = (elapsed - 1.2) / (duration - 1.2);
        pillar.material.opacity = 0.6 * (1 - t);
        pillar.scale.y = 1 + t * 0.5;
    } else {
        sceneRef.remove(pillar);
        pillar.material.dispose();
        return false;
    }

    return true;
}

function updateRing(effect, elapsed) {
    const ring = effect.object;
    const duration = 1.0;

    if (elapsed < 0) return true; // Delayed start

    if (elapsed < duration) {
        const t = elapsed / duration;
        const scale = 0.5 + t * effect.maxScale;
        ring.scale.set(scale, scale, scale);
        ring.material.opacity = 0.8 * (1 - easeInQuad(t));
    } else {
        sceneRef.remove(ring);
        ring.material.dispose();
        return false;
    }

    return true;
}

function updateStars(effect, dt) {
    let anyAlive = false;

    effect.objects.forEach(star => {
        if (star.userData.life <= 0) return;

        // Rise
        star.position.y += star.userData.riseSpeed * dt;

        // Wobble
        star.userData.wobble += star.userData.wobbleSpeed * dt;
        star.position.x += Math.sin(star.userData.wobble) * 0.02;

        // Spin
        star.rotation.z += dt * 2;

        // Fade
        star.userData.life -= dt * 0.5;
        star.material.opacity = star.userData.life;

        if (star.userData.life > 0) {
            anyAlive = true;
        } else {
            sceneRef.remove(star);
            star.material.dispose();
        }
    });

    return anyAlive;
}

function updateFlash(effect, elapsed) {
    const flash = effect.object;
    const duration = 0.4;

    if (elapsed < duration) {
        const t = elapsed / duration;
        const scale = 1 + t * 4;
        flash.scale.set(scale, scale, scale);
        flash.material.opacity = 1.0 * (1 - easeInQuad(t));
    } else {
        sceneRef.remove(flash);
        flash.material.dispose();
        return false;
    }

    return true;
}

// Easing functions
function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeInQuad(t) {
    return t * t;
}
