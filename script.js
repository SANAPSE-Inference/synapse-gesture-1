'use strict';

const TARGET_NODES = [
    "刘磊", "陈鼎元", "陈子豪", "董奕斐", "顾曼妮", 
    "古苗苗", "郭苏仪", "姬翔", "刘子慕", "李文轩", 
    "李一鸣", "吕润柳", "孙垚博", "徐薇", "燕子楚齐", 
    "郑雅今", "朱付晴晴"
];

const CONFIG = {
    PARTICLE_COUNT: 10000, // 降低总数释放手机性能，保障丝滑高帧率
    NEBULA_RADIUS: 180,
    COLLAPSE_SPEED: 0.12,
    GRAVITY_STRENGTH: 0.05,
    CAMERA_Z: 600,
    GLOW_SIZE: 11 // 缩小粒子尺寸，让光晕更细腻，不再是一坨
};

const state = {
    currentIndex: 0,
    isPinched: false,
    lastSwitchTime: 0
};

// --- 3D 引擎初始化 ---
const canvas = document.getElementById('output_canvas');
const uiText = document.getElementById('status_text');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 3000);
camera.position.z = CONFIG.CAMERA_Z;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// --- 审美重塑：细腻的高动态发光贴图 ---
function createGlowTexture() {
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 64; pCanvas.height = 64;
    const ctx = pCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');     // 极亮白炽核心
    grad.addColorStop(0.1, 'rgba(255, 215, 0, 0.8)');   // 紧凑的内圈纯金
    grad.addColorStop(0.4, 'rgba(200, 100, 0, 0.15)');  // 极度扩散的暗橙色微弱光晕
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(pCanvas);
}

// --- 空间分配 ---
const geometry = new THREE.BufferGeometry();
const posArray = new Float32Array(CONFIG.PARTICLE_COUNT * 3);
const baseArray = new Float32Array(CONFIG.PARTICLE_COUNT * 3);
const targetArray = new Float32Array(CONFIG.PARTICLE_COUNT * 3);

for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    const r = CONFIG.NEBULA_RADIUS * Math.cbrt(Math.random());
    const theta = Math.random() * 2 * Math.PI;
    const phi = Math.acos(2 * Math.random() - 1);
    
    baseArray[i3] = r * Math.sin(phi) * Math.cos(theta);
    baseArray[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    baseArray[i3 + 2] = r * Math.cos(phi);
    
    posArray[i3] = baseArray[i3] + (Math.random() - 0.5) * 800; // 初始大范围散落
    posArray[i3 + 1] = baseArray[i3 + 1] + (Math.random() - 0.5) * 800;
    posArray[i3 + 2] = baseArray[i3 + 2] + (Math.random() - 0.5) * 800;
}

geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const material = new THREE.PointsMaterial({
    size: CONFIG.GLOW_SIZE,
    map: createGlowTexture(),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.95
});

const particleSystem = new THREE.Points(geometry, material);
scene.add(particleSystem);

// --- 文字空间映射 ---
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
            // 文字部分：增加 Z 轴厚度，立体感更强
            targetArray[i3] = points[i].x + (Math.random() - 0.5) * 4;
            targetArray[i3 + 1] = points[i].y + (Math.random() - 0.5) * 4;
            targetArray[i3 + 2] = (Math.random() - 0.5) * 40; 
        } else {
            // 背景部分：不再揉成团，而是推向远方，形成包裹文字的巨大星际尘埃
            targetArray[i3] = baseArray[i3] * 3.5;
            targetArray[i3 + 1] = baseArray[i3 + 1] * 3.5;
            targetArray[i3 + 2] = baseArray[i3 + 2] * 2.5 - 300; 
        }
    }
    uiText.innerText = `NODE: ${state.currentIndex + 1} / ${TARGET_NODES.length} | LOCK: ${text}`;
}

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
        
        // 当散开时，加入缓慢游荡的星云动效
        const tx = state.isPinched ? targetArray[i3] : baseArray[i3] + Math.sin(Date.now() * 0.001 + i) * 15;
        const ty = state.isPinched ? targetArray[i3+1] : baseArray[i3+1] + Math.cos(Date.now() * 0.001 + i) * 15;
        const tz = state.isPinched ? targetArray[i3+2] : baseArray[i3+2];
        
        pos[i3] += (tx - pos[i3]) * factor;
        pos[i3 + 1] += (ty - pos[i3 + 1]) * factor;
        pos[i3 + 2] += (tz - pos[i3 + 2]) * factor;
    }
    
    geometry.attributes.position.needsUpdate = true;
    
    if (!state.isPinched) {
        particleSystem.rotation.y += 0.004;
        particleSystem.rotation.z += 0.002;
    } else {
        particleSystem.rotation.y *= 0.90;
        particleSystem.rotation.z *= 0.90;
    }
    renderer.render(scene, camera);
}

// --- 备用点击通道 ---
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

// --- MediaPipe 绝对互斥控制 ---
const videoElement = document.getElementById('input_video');
const hands = new window.Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});

hands.setOptions({ 
    maxNumHands: 1, 
    modelComplexity: 1, 
    minDetectionConfidence: 0.65, 
    minTrackingConfidence: 0.65 
});

hands.onResults((results) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const lm = results.multiHandLandmarks[0];
        
        // 核心动作1：捏合判定
        const pinchDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
        state.isPinched = pinchDist < 0.08;

        const now = Date.now();
        
        // 【绝对互斥锁】：只有在确认没有捏合的前提下，才去检测是不是“比一”
        if (!state.isPinched) {
            // 核心动作2：伸出食指 (食指笔直，中指和无名指绝对弯曲)
            if (lm[8].y < lm[5].y && lm[12].y > lm[9].y && lm[16].y > lm[13].y) {
                if (now - state.lastSwitchTime > 1500) {
                    switchMatrixNode();
                    state.lastSwitchTime = now;
                }
            }
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

updateTargetTopology(TARGET_NODES[0]);
animate();
mpCamera.start().then(() => {
    uiText.innerText = `系统就绪 | 手势识别已启动`;
}).catch(() => {
    uiText.innerText = `传感器受阻 | 已切换至触控模式`;
});