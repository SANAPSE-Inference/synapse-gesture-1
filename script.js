/**
 * @file script.js
 * @description 核心逻辑：3D粒子物理场引擎与手势状态机
 * @author Principal Software Engineer
 */

'use strict';

const TARGET_NODES = [
    "刘磊", "陈鼎元", "陈子豪", "董奕斐", "顾曼妮", 
    "古苗苗", "郭苏仪", "姬翔", "刘子慕", "李文轩", 
    "李一鸣", "吕润柳", "孙垚博", "徐薇", "燕子楚齐", 
    "郑雅今", "朱付晴晴"
];

const CONFIG = {
    PARTICLE_COUNT: 15000, 
    NEBULA_RADIUS: 160,
    COLLAPSE_SPEED: 0.12,
    GRAVITY_STRENGTH: 0.05,
    CAMERA_Z: 600,
    GLOW_SIZE: 16
};

// 封装应用状态
const state = {
    currentIndex: 0,
    isPinched: false,
    lastSwitchTime: 0,
    isInitialized: false
};

// --- 初始化 3D 渲染器 ---
const canvas = document.getElementById('output_canvas');
const uiText = document.getElementById('status_text');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 3000);
camera.position.z = CONFIG.CAMERA_Z;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

/**
 * 生成预烘焙的发光粒子贴图 (优化性能，避开 BloomPass)
 * @returns {THREE.CanvasTexture}
 */
function createGlowTexture() {
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 64; pCanvas.height = 64;
    const ctx = pCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');   // 炽白核心
    grad.addColorStop(0.2, 'rgba(255, 215, 0, 0.9)'); // 金色
    grad.addColorStop(0.5, 'rgba(255, 120, 0, 0.3)'); // 橙色边际
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(pCanvas);
}

// --- 内存管理：BufferGeometry 预分配 ---
const geometry = new THREE.BufferGeometry();
const posArray = new Float32Array(CONFIG.PARTICLE_COUNT * 3);
const baseArray = new Float32Array(CONFIG.PARTICLE_COUNT * 3);
const targetArray = new Float32Array(CONFIG.PARTICLE_COUNT * 3);

// 构建初始球状星云拓扑
for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    const r = CONFIG.NEBULA_RADIUS * Math.cbrt(Math.random());
    const theta = Math.random() * 2 * Math.PI;
    const phi = Math.acos(2 * Math.random() - 1);
    
    baseArray[i3] = r * Math.sin(phi) * Math.cos(theta);
    baseArray[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    baseArray[i3 + 2] = r * Math.cos(phi);
    
    posArray[i3] = baseArray[i3];
    posArray[i3 + 1] = baseArray[i3 + 1];
    posArray[i3 + 2] = baseArray[i3 + 2];
}

geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const material = new THREE.PointsMaterial({
    size: CONFIG.GLOW_SIZE,
    map: createGlowTexture(),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.9
});

const particleSystem = new THREE.Points(geometry, material);
scene.add(particleSystem);

/**
 * 离屏渲染实现中文坐标采集
 * @param {string} text 
 */
function updateTargetTopology(text) {
    const tCanvas = document.createElement('canvas');
    const tCtx = tCanvas.getContext('2d');
    tCanvas.width = 1024; tCanvas.height = 1024;
    tCtx.fillStyle = '#000'; tCtx.fillRect(0, 0, 1024, 1024);
    tCtx.fillStyle = '#FFF';
    tCtx.font = 'bold 240px "Microsoft YaHei", sans-serif';
    tCtx.textAlign = 'center'; tCtx.textBaseline = 'middle';
    tCtx.fillText(text, 512, 512);

    const data = tCtx.getImageData(0, 0, 1024, 1024).data;
    const points = [];
    for (let y = 0; y < 1024; y += 7) {
        for (let x = 0; x < 1024; x += 7) {
            if (data[(y * 1024 + x) * 4] > 128) {
                points.push({ x: (x - 512) * 1.2, y: -(y - 512) * 1.2 });
            }
        }
    }

    const len = points.length;
    for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        if (i < len) {
            targetArray[i3] = points[i].x + (Math.random() - 0.5) * 4;
            targetArray[i3 + 1] = points[i].y + (Math.random() - 0.5) * 4;
            targetArray[i3 + 2] = (Math.random() - 0.5) * 10;
        } else {
            targetArray[i3] = baseArray[i3] * 0.25;
            targetArray[i3 + 1] = baseArray[i3 + 1] * 0.25;
            targetArray[i3 + 2] = baseArray[i3 + 2] * 0.25 - 100;
        }
    }
    uiText.innerText = `NODE: ${state.currentIndex + 1} / ${TARGET_NODES.length} | LOCK: ${text}`;
}

/**
 * 切换节点逻辑
 */
function switchMatrixNode() {
    state.currentIndex = (state.currentIndex + 1) % TARGET_NODES.length;
    updateTargetTopology(TARGET_NODES[state.currentIndex]);
    uiText.style.color = '#FFD700';
    setTimeout(() => uiText.style.color = 'rgba(255,255,255,0.6)', 300);
}

// --- 动画循环 ---
function animate() {
    requestAnimationFrame(animate);
    const pos = geometry.attributes.position.array;
    
    for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        const factor = state.isPinched ? CONFIG.COLLAPSE_SPEED : CONFIG.GRAVITY_STRENGTH;
        const tx = state.isPinched ? targetArray[i3] : baseArray[i3] + Math.sin(Date.now() * 0.001 + i) * 10;
        const ty = state.isPinched ? targetArray[i3+1] : baseArray[i3+1] + Math.cos(Date.now() * 0.001 + i) * 10;
        const tz = state.isPinched ? targetArray[i3+2] : baseArray[i3+2];
        
        pos[i3] += (tx - pos[i3]) * factor;
        pos[i3 + 1] += (ty - pos[i3 + 1]) * factor;
        pos[i3 + 2] += (tz - pos[i3 + 2]) * factor;
    }
    
    geometry.attributes.position.needsUpdate = true;
    
    if (!state.isPinched) {
        particleSystem.rotation.y += 0.003;
        particleSystem.rotation.z += 0.001;
    } else {
        particleSystem.rotation.y *= 0.92;
        particleSystem.rotation.z *= 0.92;
    }
    renderer.render(scene, camera);
}

// --- 事件监听 (Touch & Mouse Fallbacks) ---
window.addEventListener('touchstart', () => state.isPinched = true);
window.addEventListener('touchend', () => state.isPinched = false);
window.addEventListener('mousedown', () => state.isPinched = true);
window.addEventListener('mouseup', () => state.isPinched = false);
window.addEventListener('dblclick', switchMatrixNode);
window.addEventListener('contextmenu', e => { e.preventDefault(); switchMatrixNode(); });
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- MediaPipe 手势追踪接入 ---
const videoElement = document.getElementById('input_video');
const hands = new window.Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});

hands.setOptions({ 
    maxNumHands: 1, 
    modelComplexity: 1, 
    minDetectionConfidence: 0.6, 
    minTrackingConfidence: 0.6 
});

hands.onResults((results) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const lm = results.multiHandLandmarks[0];
        // 判定：拇指与食指捏合
        const pinchDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
        state.isPinched = pinchDist < 0.075;

        // 判定：食指伸直且中指弯曲 -> 触发切换
        const now = Date.now();
        if (lm[8].y < lm[5].y && lm[12].y > lm[9].y && now - state.lastSwitchTime > 1500) {
            switchMatrixNode();
            state.lastSwitchTime = now;
        }
    } else {
        state.isPinched = false;
    }
});

const mpCamera = new window.Camera(videoElement, {
    onFrame: async () => {
        if (videoElement.readyState >= 2) {
            try { await hands.send({image: videoElement}); } catch(e) {}
        }
    },
    width: 640, height: 480
});

// 系统自检与启动
updateTargetTopology(TARGET_NODES[0]);
animate();
mpCamera.start().then(() => {
    console.log('Neural Interface Connected.');
    uiText.innerText = `系统就绪 | 手势识别已启动`;
}).catch(err => {
    console.error('Sensor Error:', err);
    uiText.innerText = `传感器受阻 | 已切换至触控模式`;
});