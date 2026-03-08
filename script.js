/**
 * @file script.js
 * @version 10.0.0 (Zero-Base Core Reboot)
 * @description 核心重启：欧几里得距离抽象、原生音频切片、极简状态机与引力赋权。
 */

'use strict';

// ==========================================
// 1. 全局配置与极简状态矩阵
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
    EXPLOSION_DURATION: 3000 // 绝对爆裂常数 (ms)
};

const state = {
    currentIndex: 0,
    isPinched: false,
    isOneGesture: false,   // 维持展示态的引力锁
    specialPhase: 0,       // 0: 待机/游走/有序, 1: 爆裂, 2: 绝对收束
    explosionTime: 0,
    isIgnited: false,
    hasTriggeredOne: false // 单次物理扳机锁，杜绝连发
};

// ==========================================
// 2. 原生 I/O 音频引擎 (时间切片降维)
// ==========================================
// 绝对禁止 JS 动态生成与克隆，直接接管 HTML 底层节点
const audioBGM = document.getElementById('bgm_audio');
const audioSwitch = document.getElementById('sfx_switch');
const audioFirework = document.getElementById('sfx_firework');

function playSFX(audioElement, volume = 1.0) {
    if (!audioElement) return;
    audioElement.pause();
    audioElement.currentTime = 0; // 时间切片归零，极速复用单例，零 GC 开销
    audioElement.volume = volume;
    audioElement.play().catch(() => {});
}

// 物理点火锁解禁
document.getElementById('ignition_overlay').addEventListener('click', function() {
    state.isIgnited = true;
    this.style.opacity = '0';
    setTimeout(() => this.style.display = 'none', 600);
    
    if(audioBGM) {
        audioBGM.volume = 0.65;
        audioBGM.play().catch(() => {});
    }
    
    // 静默颁发 iOS 播放许可 (极简复苏协议)
    if(audioSwitch) { audioSwitch.volume = 0; audioSwitch.play().then(()=>audioSwitch.pause()).catch(()=>{}); }
    if(audioFirework) { audioFirework.volume = 0; audioFirework.play().then(()=>audioFirework.pause()).catch(()=>{}); }
    
    updateTargetTopology(TARGET_NODES[state.currentIndex]);
    document.getElementById('status_text').innerText = "MATRIX_CORE: 神经连接已就绪 | 听觉链路开启";
});

// ==========================================
// 3. WebGL 渲染管线与高能星核内存预分配
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
    const ctx = pCanvas.getContext('2d');
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
const posArray = new Float32Array(total * 3);
const baseArray = new Float32Array(total * 3);
const targetArray = new Float32Array(total * 3);
const phaseArray = new Float32Array(total); 
const velocityArray = new Float32Array(total * 3); 
const colorArray = new Float32Array(total * 3);    

const colorBase = new THREE.Color(0xffd700);

for (let i = 0; i < total; i++) {
    const i3 = i * 3;
    const isBG = i < bgLimit;
    
    if (isBG) {
        baseArray[i3] = (Math.random() - 0.5) * 4000;
        baseArray[i3 + 1] = (Math.random() - 0.5) * 4000;
        baseArray[i3 + 2] = (Math.random() - 0.5) * 800 - 200; 
    } else {
        const r = 140 * Math.cbrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos(2 * Math.random() - 1);
        baseArray[i3] = r * Math.sin(phi) * Math.cos(theta);
        baseArray[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        baseArray[i3 + 2] = r * Math.cos(phi);
    }
    
    posArray[i3] = baseArray[i3]; posArray[i3 + 1] = baseArray[i3 + 1]; posArray[i3 + 2] = baseArray[i3 + 2];
    colorArray[i3] = colorBase.r; colorArray[i3+1] = colorBase.g; colorArray[i3+2] = colorBase.b;
    phaseArray[i] = Math.random() * Math.PI * 2;
}

geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));

const material = new THREE.PointsMaterial({
    size: 9.0, 
    map: createGlowTexture(),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    vertexColors: true,
    opacity: 0.85 
});
const particleSystem = new THREE.Points(geometry, material);
scene.add(particleSystem);

// ==========================================
// 4. 稳健拓扑降维采样 (彻底剥离设备崩溃指令)
// ==========================================
const osCanvas = document.createElement('canvas');
osCanvas.width = 512; osCanvas.height = 512;
const osCtx = osCanvas.getContext('2d'); 

function updateTargetTopology(text) {
    if (!state.isIgnited) return;

    osCtx.fillStyle = '#000'; osCtx.fillRect(0, 0, 512, 512);
    osCtx.fillStyle = '#FFF';
    
    const lines = text.split('\n');
    osCtx.textAlign = 'center'; osCtx.textBaseline = 'middle';
    
    if (lines.length > 1) {
        osCtx.font = 'bold 75px "Microsoft YaHei", sans-serif';
        osCtx.fillText(lines[0], 256, 210);
        osCtx.fillText(lines[1], 256, 290);
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
                    targetArray[i3 + 1] = -(y - 256) * 2.7 + (Math.random() - 0.5) * 3;
                    targetArray[i3 + 2] = (Math.random() - 0.5) * 10 + 280; 
                    colorArray[i3] = colorBase.r; colorArray[i3+1] = colorBase.g; colorArray[i3+2] = colorBase.b;
                    pIdx++;
                }
            }
        }
    }

    // 冗余散落与颜色清洗
    for (let i = bgLimit + pIdx; i < total; i++) {
        const i3 = i * 3;
        targetArray[i3] = baseArray[i3] * 0.1;
        targetArray[i3 + 1] = baseArray[i3 + 1] * 0.1;
        targetArray[i3 + 2] = baseArray[i3 + 2] * 0.1 - 100;
        colorArray[i3] = colorBase.r; colorArray[i3+1] = colorBase.g; colorArray[i3+2] = colorBase.b;
    }
    
    geometry.attributes.color.needsUpdate = true;
    
    const isSpecial = (state.specialPhase === 2);
    uiText.innerText = isSpecial ? "MATRIX_OVERRIDE: 绝对熵减 | 秩序重建" : `NODE: ${state.currentIndex + 1} / 17 | LOCK: ${text}`;
    uiText.style.color = isSpecial ? "#FF4500" : "#FFD700";
}

// ==========================================
// 5. 绝对熵增爆发
// ==========================================
function triggerExplosion() {
    state.specialPhase = 1;
    state.explosionTime = Date.now();
    playSFX(audioFirework, 0.95);

    const colors = [new THREE.Color(0x00FFFF), new THREE.Color(0xFF00FF), new THREE.Color(0x39FF14), new THREE.Color(0xFFD700)];

    for (let i = bgLimit; i < total; i++) {
        const i3 = i * 3;
        const speed = Math.random() * 60 + 20;
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos(2 * Math.random() - 1);
        
        velocityArray[i3] = speed * Math.sin(phi) * Math.cos(theta);
        velocityArray[i3+1] = speed * Math.sin(phi) * Math.sin(theta);
        velocityArray[i3+2] = speed * Math.cos(phi) + (Math.random() * 30); 

        const c = colors[Math.floor(Math.random() * colors.length)];
        colorArray[i3] = c.r; colorArray[i3+1] = c.g; colorArray[i3+2] = c.b;
    }
    geometry.attributes.color.needsUpdate = true;
}

// ==========================================
// 6. 物理主渲染循环
// ==========================================
function animate() {
    requestAnimationFrame(animate);
    if (!state.isIgnited) { renderer.render(scene, camera); return; }

    const time = Date.now() * 0.001;
    const nowMs = Date.now();
    
    // 【绝对赋权】捏合、展示一、系统重写阶段，均执行引力坍缩
    const isOrdered = state.isPinched || state.isOneGesture || state.specialPhase === 2;
    
    material.size += ((isOrdered ? 12.0 : 9.0) - material.size) * 0.15;
    material.opacity += ((isOrdered ? 1.0 : 0.85) - material.opacity) * 0.15;

    if (state.specialPhase === 1 && (nowMs - state.explosionTime > CONFIG.EXPLOSION_DURATION)) {
        state.specialPhase = 2; 
        updateTargetTopology(SPECIAL_NODE);
    }

    const orderedSpeed = CONFIG.COLLAPSE_SPEED;
    const gravSpeed = CONFIG.GRAVITY_STRENGTH;
    const pos = posArray, target = targetArray, base = baseArray, phase = phaseArray, vel = velocityArray;

    for (let i = 0; i < total; i++) {
        const ix = i * 3, iy = ix + 1, iz = ix + 2; 
        
        if (i >= bgLimit && state.specialPhase === 1) {
            // 惯性抛射计算
            pos[ix] += vel[ix]; pos[iy] += vel[iy]; pos[iz] += vel[iz];
            vel[ix] *= 0.96; vel[iy] *= 0.96; vel[iz] *= 0.96;
        } else {
            // 引力场积分计算
            const isBG = i < bgLimit;
            const speed = isBG ? gravSpeed : (isOrdered ? orderedSpeed : gravSpeed);
            const angle = time + phase[i];
            
            const tx = (isOrdered && !isBG) ? target[ix] : (base[ix] + Math.sin(angle) * 45);
            const ty = (isOrdered && !isBG) ? target[iy] : (base[iy] + Math.cos(angle) * 45);
            const tz = (isOrdered && !isBG) ? target[iz] : base[iz];

            pos[ix] += (tx - pos[ix]) * speed;
            pos[iy] += (ty - pos[iy]) * speed;
            pos[iz] += (tz - pos[iz]) * speed;
        }
    }
    geometry.attributes.position.needsUpdate = true;

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
// 7. 欧几里得空间神经推断引擎
// ==========================================
const hands = new window.Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.65, minTrackingConfidence: 0.65 });

// 辅助向量测算：规避移动端摄像头畸变及手腕俯仰角误判
function getDist(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

// 严苛伸展阈值设定：标量乘数提升至 1.6，绝对拦截松弛手指
function isExtended(tipIdx, pipIdx, wrist, lm) {
    return getDist(lm[tipIdx], wrist) > getDist(lm[pipIdx], wrist) * 1.6;
}

hands.onResults((res) => {
    if (!state.isIgnited) return;

    if (res.multiHandLandmarks && res.multiHandLandmarks.length > 0) {
        const lm = res.multiHandLandmarks[0];
        const wrist = lm[0]; // 根节点锚定
        
        const isPinching = getDist(lm[4], lm[8]) < 0.08; 
        
        // 基于标量比值的绝缘判定
        const indexUp = isExtended(8, 6, wrist, lm);
        const middleUp = isExtended(12, 10, wrist, lm);
        const ringUp = isExtended(16, 14, wrist, lm);
        const pinkyUp = isExtended(20, 18, wrist, lm);

        // 数学动作映射矩阵
        const isPeace = indexUp && middleUp && !ringUp && !pinkyUp && !isPinching;
        const isOne = indexUp && !middleUp && !ringUp && !pinkyUp && !isPinching;

        if (isPeace) { 
            state.isPinched = false; state.isOneGesture = false; state.hasTriggeredOne = false; 
            if (state.specialPhase === 0) triggerExplosion(); 
        } 
        else if (isPinching) { 
            state.isPinched = true; state.isOneGesture = false; state.hasTriggeredOne = false; 
            if (state.specialPhase !== 0) { state.specialPhase = 0; updateTargetTopology(TARGET_NODES[state.currentIndex]); }
        } 
        else if (isOne) { 
            state.isPinched = false; state.isOneGesture = true; // 引力激活锁
            if (state.specialPhase !== 0) { state.specialPhase = 0; updateTargetTopology(TARGET_NODES[state.currentIndex]); }
            
            // 物理扳机约束：禁止机枪式扫射
            if (!state.hasTriggeredOne) {
                state.currentIndex = (state.currentIndex + 1) % TARGET_NODES.length;
                updateTargetTopology(TARGET_NODES[state.currentIndex]);
                playSFX(audioSwitch, 0.85); 
                state.hasTriggeredOne = true; 
            }
        } 
        else {
            // 张开手掌或废弃手势
            state.isPinched = false; state.isOneGesture = false; state.hasTriggeredOne = false; 
            if (state.specialPhase === 0) updateTargetTopology(TARGET_NODES[state.currentIndex]); 
        }
    } else {
        // 空白视野重置
        state.isPinched = false; state.isOneGesture = false; state.hasTriggeredOne = false; 
        if (state.specialPhase === 0) updateTargetTopology(TARGET_NODES[state.currentIndex]); 
    }
});

const video = document.getElementById('input_video');
const cam_mp = new window.Camera(video, {
    // 移除导致死锁的 try/catch 节流，交由 MediaPipe 底层 C++ 模块原生调度
    onFrame: async () => { if(video.readyState >= 2 && state.isIgnited) await hands.send({image: video}); },
    width: 640, height: 480
});

window.addEventListener('touchstart', () => { if(state.isIgnited) state.isPinched = true; });
window.addEventListener('touchend', () => { if(state.isIgnited) state.isPinched = false; });

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
cam_mp.start().then(() => console.log("MATRIX_CORE: 欧几里得推断与引力模型部署完毕"));