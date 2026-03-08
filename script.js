/**
 * @file script.js
 * @version 12.0.0 (Ultimate Fusion Architecture)
 * @description 最终部署级核心：融合分支预测优化(Loop Unrolling)、GC阻断、本地防墙引力交互与移动端全维事件监听。
 */

'use strict';

// ==========================================
// 1. 全局配置与状态矩阵
// ==========================================
const TARGET_NODES = ["刘磊", "陈鼎元", "陈子豪", "董奕斐", "顾曼妮", "古苗苗", "郭苏仪", "姬翔", "刘子慕", "李文轩", "李一鸣", "吕润柳", "孙垚博", "徐薇", "燕子楚齐", "郑雅今", "朱付晴晴"];
const SPECIAL_NODE = "祝大家\n前程似锦！！";

const CONFIG = {
    TOTAL_PARTICLES: 14000,
    BG_PARTICLES: 5000,   
    COLLAPSE_SPEED: 0.12,
    GRAVITY_STRENGTH: 0.045,
    ROTATION_IDLE: 0.005,
    CAMERA_Z: 650,
    EXPLOSION_DURATION: 3000
};

const state = {
    currentIndex: 0,
    isPinched: false,
    specialPhase: 0, 
    explosionTime: 0,
    isIgnited: false,
    hasTriggeredOne: false, 
    currentTopology: null 
};

// 交互计时变量 (整合自 1.5s 积分器)
let oneGestureStartTime = 0;
let isOneGestureActive = false;

// 静态常量缓存 (避免 GC Thrashing 内存抖动)
const EXPLOSION_COLORS = [
    new THREE.Color(0x00FFFF), 
    new THREE.Color(0xFF00FF), 
    new THREE.Color(0x39FF14), 
    new THREE.Color(0xFFD700)
];

// ==========================================
// 2. 原生 I/O 音频引擎
// ==========================================
const audioBGM = document.getElementById('bgm_audio');
const audioSwitch = document.getElementById('sfx_switch');
const audioFirework = document.getElementById('sfx_firework');

function playSFX(audioElement, volume = 1.0) {
    if (!audioElement) return;
    audioElement.volume = volume;
    audioElement.currentTime = 0; 
    // 捕获异步播放异常，防止底层 DOM Exception 阻塞主线程
    const playPromise = audioElement.play();
    if (playPromise !== undefined) {
        playPromise.catch(() => {});
    }
}

// ==========================================
// 3. WebGL 渲染管线与显存分配
// ==========================================
const canvas = document.getElementById('output_canvas');
const uiText = document.getElementById('status_text');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.0008);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 4000);
camera.position.z = CONFIG.CAMERA_Z;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

function createGlowTexture() {
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 64; pCanvas.height = 64;
    const ctx = pCanvas.getContext('2d', { alpha: true });
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');      
    grad.addColorStop(0.15, 'rgba(255, 215, 0, 0.9)');    
    grad.addColorStop(0.5, 'rgba(255, 120, 0, 0.15)');   
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(pCanvas);
}

const total = CONFIG.TOTAL_PARTICLES;
const bgLimit = CONFIG.BG_PARTICLES;
const geometry = new THREE.BufferGeometry();

// TypedArray 预分配，连续内存块提升 CPU 缓存命中率
const posArray = new Float32Array(total * 3);
const baseArray = new Float32Array(total * 3);
const targetArray = new Float32Array(total * 3);
const phaseArray = new Float32Array(total); 
const velocityArray = new Float32Array(total * 3); 
const colorArray = new Float32Array(total * 3);    

const colorBase = new THREE.Color(0xffd700);

for (let i = 0; i < total; i++) {
    const i3 = i * 3;
    if (i < bgLimit) {
        baseArray[i3] = (Math.random() - 0.5) * 4000;
        baseArray[i3+1] = (Math.random() - 0.5) * 4000;
        baseArray[i3+2] = (Math.random() - 0.5) * 800 - 200; 
    } else {
        const r = 140 * Math.cbrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos(2 * Math.random() - 1);
        baseArray[i3] = r * Math.sin(phi) * Math.cos(theta);
        baseArray[i3+1] = r * Math.sin(phi) * Math.sin(theta);
        baseArray[i3+2] = r * Math.cos(phi);
    }
    posArray[i3] = baseArray[i3]; posArray[i3+1] = baseArray[i3+1]; posArray[i3+2] = baseArray[i3+2];
    colorArray[i3] = colorBase.r; colorArray[i3+1] = colorBase.g; colorArray[i3+2] = colorBase.b;
    phaseArray[i] = Math.random() * Math.PI * 2;
}

// 动态渲染标记，优化 WebGL 数据吞吐
const posAttribute = new THREE.BufferAttribute(posArray, 3);
posAttribute.setUsage(THREE.DynamicDrawUsage);
geometry.setAttribute('position', posAttribute);

const colorAttribute = new THREE.BufferAttribute(colorArray, 3);
colorAttribute.setUsage(THREE.DynamicDrawUsage);
geometry.setAttribute('color', colorAttribute);

const material = new THREE.PointsMaterial({
    size: 9.0, map: createGlowTexture(), blending: THREE.AdditiveBlending,
    depthWrite: false, transparent: true, vertexColors: true, opacity: 0.85 
});
const particleSystem = new THREE.Points(geometry, material);
particleSystem.frustumCulled = false; // 禁用视锥体裁剪，跳过包围盒计算，节省 CPU 算力
scene.add(particleSystem);

// ==========================================
// 4. 防抱死拓扑矩阵与离屏重绘
// ==========================================
const osCanvas = document.createElement('canvas');
osCanvas.width = 512; osCanvas.height = 512;
const osCtx = osCanvas.getContext('2d', { willReadFrequently: true }); 

function updateTargetTopology(text) {
    if (!state.isIgnited || state.currentTopology === text) return;
    state.currentTopology = text;

    osCtx.fillStyle = '#000'; osCtx.fillRect(0, 0, 512, 512);
    osCtx.fillStyle = '#FFF';
    
    const lines = text.split('\n');
    osCtx.textAlign = 'center'; osCtx.textBaseline = 'middle';
    
    if (lines.length > 1) {
        osCtx.font = 'bold 75px "Microsoft YaHei", sans-serif';
        osCtx.fillText(lines[0], 256, 210); osCtx.fillText(lines[1], 256, 290);
    } else {
        osCtx.font = 'bold 125px "Microsoft YaHei", sans-serif';
        osCtx.fillText(text, 256, 256);
    }

    const data = osCtx.getImageData(0, 0, 512, 512).data;
    let pIdx = 0;

    for (let y = 0; y < 512; y += 2) {
        for (let x = 0; x < 512; x += 2) {
            if (data[(y * 512 + x) * 4] > 128) {
                const targetI = bgLimit + pIdx;
                if (targetI < total) {
                    const i3 = targetI * 3;
                    targetArray[i3] = (x - 256) * 2.7 + (Math.random() - 0.5) * 3;
                    targetArray[i3+1] = -(y - 256) * 2.7 + (Math.random() - 0.5) * 3;
                    targetArray[i3+2] = (Math.random() - 0.5) * 10 + 280; 
                    colorArray[i3] = colorBase.r; colorArray[i3+1] = colorBase.g; colorArray[i3+2] = colorBase.b;
                    pIdx++;
                }
            }
        }
    }

    for (let i = bgLimit + pIdx; i < total; i++) {
        const i3 = i * 3;
        targetArray[i3] = baseArray[i3] * 0.1;
        targetArray[i3+1] = baseArray[i3+1] * 0.1;
        targetArray[i3+2] = baseArray[i3+2] * 0.1 - 100;
        colorArray[i3] = colorBase.r; colorArray[i3+1] = colorBase.g; colorArray[i3+2] = colorBase.b;
    }
    
    geometry.attributes.color.needsUpdate = true;
    
    const isSpecial = (state.specialPhase === 2);
    uiText.innerText = isSpecial ? "MATRIX_OVERRIDE: 绝对熵减 | 秩序重建" : `NODE: ${state.currentIndex + 1} / 17 | LOCK: ${text}`;
    uiText.style.color = isSpecial ? "#FF4500" : "#FFD700";
}

// ==========================================
// 5. 绝对熵增爆发 (状态跃迁)
// ==========================================
function triggerExplosion() {
    state.specialPhase = 1;
    state.explosionTime = performance.now();
    state.currentTopology = "EXPLOSION"; 
    playSFX(audioFirework, 0.95);

    for (let i = bgLimit; i < total; i++) {
        const i3 = i * 3;
        const speed = Math.random() * 60 + 20;
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos(2 * Math.random() - 1);
        
        velocityArray[i3] = speed * Math.sin(phi) * Math.cos(theta);
        velocityArray[i3+1] = speed * Math.sin(phi) * Math.sin(theta);
        velocityArray[i3+2] = speed * Math.cos(phi) + (Math.random() * 30); 

        const c = EXPLOSION_COLORS[Math.floor(Math.random() * EXPLOSION_COLORS.length)];
        colorArray[i3] = c.r; colorArray[i3+1] = c.g; colorArray[i3+2] = c.b;
    }
    geometry.attributes.color.needsUpdate = true;
}

// ==========================================
// 6. 主渲染循环 (分支预测解卷 + 多轴旋转引力剥离)
// ==========================================
function animate() {
    requestAnimationFrame(animate);
    if (!state.isIgnited) { renderer.render(scene, camera); return; }
    
    const nowMs = performance.now();
    const time = nowMs * 0.001;
    
    // [逻辑融合] 仅在捏合或特殊收束态下，引力生效。
    const isOrdered = state.isPinched || state.specialPhase === 2;
    
    material.size += ((isOrdered ? 12.0 : 9.0) - material.size) * 0.15;
    material.opacity += ((isOrdered ? 1.0 : 0.85) - material.opacity) * 0.15;

    if (state.specialPhase === 1 && (nowMs - state.explosionTime > CONFIG.EXPLOSION_DURATION)) {
        state.specialPhase = 2; 
        updateTargetTopology(SPECIAL_NODE);
    }
    
    const orderedSpeed = CONFIG.COLLAPSE_SPEED;
    const gravSpeed = CONFIG.GRAVITY_STRENGTH;
    const pos = posArray, target = targetArray, base = baseArray, phase = phaseArray, vel = velocityArray;

    // [性能优化] 循环解卷：背景粒子独立处理，剔除条件分支
    for (let i = 0, ix = 0; i < bgLimit; i++, ix += 3) {
        const iy = ix + 1, iz = ix + 2;
        const angle = time + phase[i];
        const tx = base[ix] + Math.sin(angle) * 45;
        const ty = base[iy] + Math.cos(angle) * 45;
        const tz = base[iz];
        pos[ix] += (tx - pos[ix]) * gravSpeed; 
        pos[iy] += (ty - pos[iy]) * gravSpeed; 
        pos[iz] += (tz - pos[iz]) * gravSpeed;
    }

    // [性能优化] 循环解卷：前景粒子分态独立处理
    if (state.specialPhase === 1) {
        for (let i = bgLimit, ix = bgLimit * 3; i < total; i++, ix += 3) {
            const iy = ix + 1, iz = ix + 2;
            pos[ix] += vel[ix]; pos[iy] += vel[iy]; pos[iz] += vel[iz];
            vel[ix] *= 0.96; vel[iy] *= 0.96; vel[iz] *= 0.96;
        }
    } else {
        const currentSpeed = isOrdered ? orderedSpeed : gravSpeed;
        for (let i = bgLimit, ix = bgLimit * 3; i < total; i++, ix += 3) {
            const iy = ix + 1, iz = ix + 2;
            const angle = time + phase[i];
            const tx = isOrdered ? target[ix] : (base[ix] + Math.sin(angle) * 45);
            const ty = isOrdered ? target[iy] : (base[iy] + Math.cos(angle) * 45);
            const tz = isOrdered ? target[iz] : base[iz];
            pos[ix] += (tx - pos[ix]) * currentSpeed; 
            pos[iy] += (ty - pos[iy]) * currentSpeed; 
            pos[iz] += (tz - pos[iz]) * currentSpeed;
        }
    }

    geometry.attributes.position.needsUpdate = true;

    // [逻辑融合] V11.0.0 的多轴自转剥离机制
    if (isOrdered) {
        particleSystem.rotation.y += (0 - particleSystem.rotation.y) * 0.15;
        particleSystem.rotation.z += (0 - particleSystem.rotation.z) * 0.15;
    } else {
        particleSystem.rotation.y += CONFIG.ROTATION_IDLE;
        particleSystem.rotation.z += CONFIG.ROTATION_IDLE * 0.3;
    }
    
    renderer.render(scene, camera);
}

// ==========================================
// 7. 本地推断神经引擎与静默切换集成
// ==========================================
const video = document.getElementById('input_video');

// [安全隔离] 强制模型从本地根目录加载防挂起
const hands = new window.Hands({locateFile: (file) => `./${file}`}); 
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.65, minTrackingConfidence: 0.65 });

const cam_mp = new window.Camera(video, {
    onFrame: async () => { if(video.readyState >= 2 && state.isIgnited) await hands.send({image: video}); },
    width: 640, height: 480
});

function getDist(p1, p2) { return Math.hypot(p1.x - p2.x, p1.y - p2.y); }
function isExtended(tipIdx, pipIdx, wrist, lm) {
    return getDist(lm[tipIdx], wrist) > getDist(lm[pipIdx], wrist) * 1.15; 
}

hands.onResults((res) => {
    if (!state.isIgnited) return;
    let gestureMatched = false;

    if (res.multiHandLandmarks && res.multiHandLandmarks.length > 0) {
        const lm = res.multiHandLandmarks[0]; const wrist = lm[0]; 
        
        const isPinching = getDist(lm[4], lm[8]) < 0.08; 
        
        const indexUp = isExtended(8, 6, wrist, lm); 
        const middleUp = isExtended(12, 10, wrist, lm);
        const ringUp = isExtended(16, 14, wrist, lm); 
        const pinkyUp = isExtended(20, 18, wrist, lm);
        
        const isPeace = indexUp && middleUp && !ringUp && !pinkyUp && !isPinching;
        const isOne = indexUp && !middleUp && !ringUp && !pinkyUp && !isPinching;

        if (isPeace) { 
            state.isPinched = false; isOneGestureActive = false; state.hasTriggeredOne = false; 
            if (state.specialPhase === 0) triggerExplosion(); 
            gestureMatched = true;
        } else if (isPinching) { 
            state.isPinched = true; isOneGestureActive = false; state.hasTriggeredOne = false; 
            if (state.specialPhase !== 0) { state.specialPhase = 0; updateTargetTopology(TARGET_NODES[state.currentIndex]); }
            gestureMatched = true;
        } else if (isOne) { 
            state.isPinched = false; 
            if (state.specialPhase !== 0) { state.specialPhase = 0; updateTargetTopology(TARGET_NODES[state.currentIndex]); }
            
            // 1.5秒延迟静默切换逻辑 (精度同步至 performance.now)
            if (!isOneGestureActive) { 
                isOneGestureActive = true; 
                oneGestureStartTime = performance.now(); 
            }
            if (isOneGestureActive && !state.hasTriggeredOne && (performance.now() - oneGestureStartTime >= 1500)) {
                state.currentIndex = (state.currentIndex + 1) % TARGET_NODES.length;
                updateTargetTopology(TARGET_NODES[state.currentIndex]); // 底层切换无引力坍缩
                playSFX(audioSwitch, 0.85); 
                state.hasTriggeredOne = true; // 绝对锁死
            }
            gestureMatched = true;
        }
    } 

    if (!gestureMatched) {
        // 回归基态，松开锁钥
        state.isPinched = false; isOneGestureActive = false; state.hasTriggeredOne = false; 
        if (state.specialPhase === 0) updateTargetTopology(TARGET_NODES[state.currentIndex]); 
    }
});

// ==========================================
// 8. 物理环境探针与全局交互代理
// ==========================================
document.getElementById('ignition_overlay').addEventListener('click', function() {
    state.isIgnited = true; 
    this.style.opacity = '0';
    setTimeout(() => this.style.display = 'none', 600);
    
    if (audioBGM) { audioBGM.volume = 0.65; audioBGM.play().catch(() => {}); }
    if (audioSwitch) { audioSwitch.volume = 0; audioSwitch.play().then(()=>audioSwitch.pause()).catch(()=>{}); }
    if (audioFirework) { audioFirework.volume = 0; audioFirework.play().then(()=>audioFirework.pause()).catch(()=>{}); }
    
    updateTargetTopology(TARGET_NODES[state.currentIndex]);
    document.getElementById('status_text').innerText = "MATRIX_CORE: 神经连接已就绪 | 听觉链路开启";

    cam_mp.start().then(() => {
        console.log("SYS_KERNEL: 本地推断模型捕获成功");
    }).catch((e) => {
        console.error("SYS_ERR: 摄像头静默挂起", e);
        document.getElementById('status_text').innerText = "SYS_ERR: 传感器物理受阻";
        document.getElementById('status_text').style.color = "#FF4500";
    });
});

// [防坠缓冲] 移动端原生 Touch 模拟捏合后备方案
window.addEventListener('touchstart', () => { if(state.isIgnited) state.isPinched = true; });
window.addEventListener('touchend', () => { if(state.isIgnited) state.isPinched = false; });

// [视口拓扑自适应] 响应式防抖监听
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }, 150);
});
window.addEventListener('orientationchange', () => window.dispatchEvent(new Event('resize')));

animate();