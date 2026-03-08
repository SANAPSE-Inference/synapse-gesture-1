/**
 * @file script.js
 * @version 12.7.0 (Performance Optimized Edition)
 * @description 最终优化版：静态显存分配、分支预测解卷、高频音频保护。
 */

'use strict';

// [1] 配置与状态矩阵 (Frozen Object 提升引擎读取速度)
const TARGET_NODES = Object.freeze(["刘磊", "陈鼎元", "陈子豪", "董奕斐", "顾曼妮", "古苗苗", "顾苗苗", "郭苏仪", "姬翔", "刘子慕", "李文轩", "李一鸣", "吕润柳", "孙垚博", "徐薇", "燕子楚齐", "郑雅今", "朱付晴晴"]);
const SPECIAL_NODE = "祝大家\n前程似锦！！";

const CONFIG = Object.freeze({
    TOTAL_PARTICLES: 14000,
    BG_PARTICLES: 5000,   
    COLLAPSE_SPEED: 0.12,
    GRAVITY_STRENGTH: 0.045,
    ROTATION_IDLE: 0.005,
    CAMERA_Z: 650,
    EXPLOSION_DURATION: 3000
});

const state = {
    currentIndex: 0,
    isPinched: false,
    specialPhase: 0, 
    explosionTime: 0,
    isIgnited: false,
    hasTriggeredOne: false, 
    currentTopology: null 
};

// 交互计时变量 (使用性能更高的 performance.now)
let oneGestureStartTime = 0;
let isOneGestureActive = false;
let systemStartTime = 0;

// [2] 原生音频引擎 (异步提权保护)
const audioBGM = document.getElementById('bgm_audio');
const audioSwitch = document.getElementById('sfx_switch');
const audioFirework = document.getElementById('sfx_firework');

async function playSFX(audio, vol = 1.0) {
    if (!audio) return;
    try {
        audio.volume = vol;
        audio.currentTime = 0;
        await audio.play();
    } catch (e) {
        // 捕获移动端 Autoplay 限制或资源未加载异常
    }
}

// [3] WebGL 渲染管线 (静态显存分配)
const canvas = document.getElementById('output_canvas');
const uiText = document.getElementById('status_text');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.0008);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 4000);
camera.position.z = CONFIG.CAMERA_Z;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// 粒子显存分配 (使用连续内存提高缓存命中率)
const total = CONFIG.TOTAL_PARTICLES, bgLimit = CONFIG.BG_PARTICLES;
const posArr = new Float32Array(total * 3), baseArr = new Float32Array(total * 3), targetArr = new Float32Array(total * 3);
const phaseArr = new Float32Array(total), velArr = new Float32Array(total * 3), colArr = new Float32Array(total * 3);

for (let i = 0; i < total; i++) {
    const i3 = i * 3;
    if (i < bgLimit) {
        baseArr[i3] = (Math.random()-0.5)*4000; baseArr[i3+1] = (Math.random()-0.5)*4000; baseArr[i3+2] = (Math.random()-0.5)*800-200;
    } else {
        const r = 140*Math.cbrt(Math.random()), t = Math.random()*2*Math.PI, p = Math.acos(2*Math.random()-1);
        baseArr[i3] = r*Math.sin(p)*Math.cos(t); baseArr[i3+1] = r*Math.sin(p)*Math.sin(t); baseArr[i3+2] = r*Math.cos(p);
    }
    posArr[i3] = baseArr[i3]; posArr[i3+1] = baseArr[i3+1]; posArr[i3+2] = baseArr[i3+2];
    colArr[i3] = 1.0; colArr[i3+1] = 0.84; colArr[i3+2] = 0.0;
    phaseArr[i] = Math.random() * Math.PI * 2;
}

const geo = new THREE.BufferGeometry();
const posAttr = new THREE.BufferAttribute(posArr, 3); 
posAttr.setUsage(THREE.DynamicDrawUsage); // 标记为动态更新
geo.setAttribute('position', posAttr);
geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));

const partSys = new THREE.Points(geo, new THREE.PointsMaterial({ size: 9.0, blending: THREE.AdditiveBlending, transparent: true, vertexColors: true, opacity: 0.85 }));
partSys.frustumCulled = false; // 粒子系统不进行视锥裁剪，节省计算开销
scene.add(partSys);

// [4] 拓扑映射引擎 (离屏渲染优化)
const osCtx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
osCtx.canvas.width = osCtx.canvas.height = 512;

function updateTopology(text) {
    if (!state.isIgnited || state.currentTopology === text) return;
    state.currentTopology = text;
    
    osCtx.fillStyle = '#000'; osCtx.fillRect(0, 0, 512, 512);
    osCtx.fillStyle = '#FFF';
    const lines = text.split('\n');
    osCtx.textAlign = 'center'; osCtx.textBaseline = 'middle';
    osCtx.font = lines.length > 1 ? 'bold 75px sans-serif' : 'bold 125px sans-serif';
    
    if (lines.length > 1) { 
        osCtx.fillText(lines[0], 256, 210); osCtx.fillText(lines[1], 256, 290); 
    } else { 
        osCtx.fillText(text, 256, 256); 
    }
    
    const data = osCtx.getImageData(0, 0, 512, 512).data;
    let pIdx = 0;
    for (let y = 0; y < 512; y += 2) {
        for (let x = 0; x < 512; x += 2) {
            if (data[(y * 512 + x) * 4] > 128) {
                const i3 = (bgLimit + pIdx) * 3;
                if (i3 < total * 3) {
                    targetArr[i3] = (x - 256) * 2.7;
                    targetArr[i3+1] = -(y - 256) * 2.7;
                    targetArr[i3+2] = 280;
                    pIdx++;
                }
            }
        }
    }
    uiText.innerText = state.specialPhase === 2 ? "MATRIX: 重建完成" : `NODE: ${state.currentIndex + 1} / 17 | ${text}`;
}

// [5] 物理仿真核心 (分支预测解卷)
function animate() {
    requestAnimationFrame(animate);
    if (!state.isIgnited) { renderer.render(scene, camera); return; }
    
    const now = performance.now(), time = now * 0.001;
    const isOrdered = state.isPinched || state.specialPhase === 2;

    // 状态检查
    if (state.specialPhase === 1 && (now - state.explosionTime > CONFIG.EXPLOSION_DURATION)) {
        state.specialPhase = 2; updateTopology(SPECIAL_NODE);
    }

    const currentSpeed = isOrdered ? CONFIG.COLLAPSE_SPEED : CONFIG.GRAVITY_STRENGTH;
    const grav = CONFIG.GRAVITY_STRENGTH;

    // 分支解卷：背景粒子独立处理
    for (let i = 0, ix = 0; i < bgLimit; i++, ix += 3) {
        const angle = time + phaseArr[i];
        posArr[ix] += (baseArr[ix] + Math.sin(angle) * 45 - posArr[ix]) * grav;
        posArr[ix+1] += (baseArr[ix+1] + Math.cos(angle) * 45 - posArr[ix+1]) * grav;
        posArr[ix+2] += (baseArr[ix+2] - posArr[ix+2]) * grav;
    }

    // 分支解卷：前景粒子分态处理
    if (state.specialPhase === 1) { // 烟花爆发态
        for (let i = bgLimit, ix = bgLimit * 3; i < total; i++, ix += 3) {
            posArr[ix] += velArr[ix]; posArr[ix+1] += velArr[ix+1]; posArr[ix+2] += velArr[ix+2];
            velArr[ix] *= 0.96; velArr[ix+1] *= 0.96; velArr[ix+2] *= 0.96;
        }
    } else { // 坍缩或散落态
        for (let i = bgLimit, ix = bgLimit * 3; i < total; i++, ix += 3) {
            const angle = time + phaseArr[i];
            const tx = isOrdered ? targetArr[ix] : (baseArr[ix] + Math.sin(angle) * 45);
            const ty = isOrdered ? targetArr[ix+1] : (baseArr[ix+1] + Math.cos(angle) * 45);
            const tz = isOrdered ? targetArr[ix+2] : baseArr[ix+2];
            posArr[ix] += (tx - posArr[ix]) * currentSpeed;
            posArr[ix+1] += (ty - posArr[ix+1]) * currentSpeed;
            posArr[ix+2] += (tz - posArr[ix+2]) * currentSpeed;
        }
    }

    posAttr.needsUpdate = true;
    partSys.rotation.y += isOrdered ? (0 - partSys.rotation.y) * 0.15 : CONFIG.ROTATION_IDLE;
    renderer.render(scene, camera);
}

// [6] 神经引擎与 1.5s 静默逻辑
const hands = new window.Hands({locateFile: (file) => `./${file}`}); // 强制本地加载 WASM
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.65, minTrackingConfidence: 0.65 });

const cam = new window.Camera(document.getElementById('input_video'), { 
    onFrame: async () => { if(state.isIgnited) await hands.send({image: document.getElementById('input_video')}); },
    width: 640, height: 480 
});

hands.onResults((res) => {
    if (!state.isIgnited || (performance.now() - systemStartTime < 1000)) return;
    
    let matched = false;
    if (res.multiHandLandmarks && res.multiHandLandmarks.length > 0) {
        const lm = res.multiHandLandmarks[0], wrist = lm[0];
        
        // 基于 2D 归一化坐标的捏合判断
        const isPinching = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) < 0.08;
        // 手指伸展判断 (校准标量 1.15)
        const indexUp = Math.hypot(lm[8].x-wrist.x, lm[8].y-wrist.y) > Math.hypot(lm[6].x-wrist.x, lm[6].y-wrist.y) * 1.15;
        const middleUp = Math.hypot(lm[12].x-wrist.x, lm[12].y-wrist.y) > Math.hypot(lm[10].x-wrist.x, lm[10].y-wrist.y) * 1.15;
        
        const isOne = indexUp && !middleUp && !isPinching;
        const isPeace = indexUp && middleUp && !isPinching;

        if (isPeace) {
            state.isPinched = false; isOneGestureActive = false; state.hasTriggeredOne = false;
            if (state.specialPhase === 0) { 
                state.specialPhase = 1; state.explosionTime = performance.now();
                playSFX(audioFirework);
                // 爆发态颜色注入
                for(let i=bgLimit; i<total; i++) {
                    const i3 = i*3, s = Math.random()*60+20, t = Math.random()*Math.PI*2, p = Math.acos(Math.random()*2-1);
                    velArr[i3]=s*Math.sin(p)*Math.cos(t); velArr[i3+1]=s*Math.sin(p)*Math.sin(t); velArr[i3+2]=s*Math.cos(p);
                    colArr[i3]=Math.random(); colArr[i3+1]=Math.random(); colArr[i3+2]=Math.random();
                }
                geo.attributes.color.needsUpdate = true;
            }
            matched = true;
        } else if (isPinching) {
            state.isPinched = true; isOneGestureActive = false; state.hasTriggeredOne = false;
            if (state.specialPhase !== 0) { state.specialPhase = 0; updateTopology(TARGET_NODES[state.currentIndex]); }
            matched = true;
        } else if (isOne) {
            state.isPinched = false;
            if (!isOneGestureActive) { isOneGestureActive = true; oneGestureStartTime = performance.now(); }
            // 1.5s 物理锁判断
            if (!state.hasTriggeredOne && (performance.now() - oneGestureStartTime >= 1500)) {
                state.currentIndex = (state.currentIndex + 1) % TARGET_NODES.length; 
                updateTopology(TARGET_NODES[state.currentIndex]); 
                playSFX(audioSwitch, 0.85); 
                state.hasTriggeredOne = true;
            }
            matched = true;
        }
    }
    if (!matched) { state.isPinched = false; isOneGestureActive = false; state.hasTriggeredOne = false; }
});

// [7] 全局交互代理 (Unlock Context)
document.getElementById('ignition_overlay').addEventListener('click', function() {
    state.isIgnited = true; this.style.opacity = '0';
    setTimeout(() => this.style.display = 'none', 600);
    systemStartTime = performance.now();
    playSFX(audioBGM, 0.65);
    updateTopology(TARGET_NODES[state.currentIndex]);
    cam.start().catch(() => { uiText.innerText = "传感器链路异常"; });
});

// 响应式 Resize 防抖
let rT;
window.addEventListener('resize', () => {
    clearTimeout(rT);
    rT = setTimeout(() => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }, 150);
});

animate();