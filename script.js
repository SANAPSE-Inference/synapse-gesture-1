'use strict';

const TARGET_NODES = ["刘磊", "陈鼎元", "陈子豪", "董奕斐", "顾曼妮", "古苗苗", "郭苏仪", "姬翔", "刘子慕", "李文轩", "李一鸣", "吕润柳", "孙垚博", "徐薇", "燕子楚齐", "郑雅今", "朱付晴晴"];
const SPECIAL_NODE = "祝大家\n前程似锦！！";

const CONFIG = { TOTAL_PARTICLES: 14000, BG_PARTICLES: 5000, COLLAPSE_SPEED: 0.12, GRAVITY_STRENGTH: 0.045, CAMERA_Z: 650, EXPLOSION_DURATION: 3000 };

const state = { currentIndex: 0, isPinched: false, specialPhase: 0, explosionTime: 0, isIgnited: false, hasTriggeredOne: false, currentTopology: null };

let oneGestureStartTime = 0, isOneGestureActive = false;

const audioBGM = document.getElementById('bgm_audio');
const audioSwitch = document.getElementById('sfx_switch');
const audioFirework = document.getElementById('sfx_firework');

function playSFX(audio, vol = 1.0) { if (audio) { audio.volume = vol; audio.currentTime = 0; audio.play().catch(() => {}); } }

const canvas = document.getElementById('output_canvas'), uiText = document.getElementById('status_text');
const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0, 0.0008);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 4000); camera.position.z = CONFIG.CAMERA_Z;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setSize(window.innerWidth, window.innerHeight);

const total = CONFIG.TOTAL_PARTICLES, bgLimit = CONFIG.BG_PARTICLES;
const posArr = new Float32Array(total * 3), baseArr = new Float32Array(total * 3), targetArr = new Float32Array(total * 3), phaseArr = new Float32Array(total), velArr = new Float32Array(total * 3), colArr = new Float32Array(total * 3);

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
geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
const partSys = new THREE.Points(geo, new THREE.PointsMaterial({ size: 9.0, blending: THREE.AdditiveBlending, transparent: true, vertexColors: true, opacity: 0.85 }));
scene.add(partSys);

const osCtx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
osCtx.canvas.width = osCtx.canvas.height = 512;

function updateTopology(text) {
    if (!state.isIgnited || state.currentTopology === text) return;
    state.currentTopology = text;
    osCtx.fillStyle = '#000'; osCtx.fillRect(0,0,512,512); osCtx.fillStyle = '#FFF';
    const lines = text.split('\n'); osCtx.textAlign = 'center'; osCtx.textBaseline = 'middle';
    osCtx.font = lines.length > 1 ? 'bold 75px sans-serif' : 'bold 125px sans-serif';
    if (lines.length > 1) { osCtx.fillText(lines[0], 256, 210); osCtx.fillText(lines[1], 256, 290); }
    else { osCtx.fillText(text, 256, 256); }
    const data = osCtx.getImageData(0,0,512,512).data;
    let pIdx = 0;
    for (let y = 0; y < 512; y += 2) {
        for (let x = 0; x < 512; x += 2) {
            if (data[(y*512+x)*4] > 128) {
                const i3 = (bgLimit + pIdx) * 3;
                if (i3 < total*3) {
                    targetArr[i3] = (x-256)*2.7; targetArr[i3+1] = -(y-256)*2.7; targetArr[i3+2] = 280;
                    pIdx++;
                }
            }
        }
    }
    uiText.innerText = state.specialPhase === 2 ? "MATRIX: 秩序重建" : `NODE: ${state.currentIndex + 1} / 17 | ${text}`;
}

function animate() {
    requestAnimationFrame(animate);
    if (!state.isIgnited) { renderer.render(scene, camera); return; }
    const now = performance.now(), time = now * 0.001;
    const isOrdered = state.isPinched || state.specialPhase === 2;

    if (state.specialPhase === 1 && (now - state.explosionTime > CONFIG.EXPLOSION_DURATION)) {
        state.specialPhase = 2; updateTopology(SPECIAL_NODE);
    }

    const spd = isOrdered ? CONFIG.COLLAPSE_SPEED : CONFIG.GRAVITY_STRENGTH;
    for (let i = 0, ix = 0; i < total; i++, ix += 3) {
        if (i >= bgLimit && state.specialPhase === 1) {
            posArr[ix] += velArr[ix]; posArr[ix+1] += velArr[ix+1]; posArr[ix+2] += velArr[ix+2];
            velArr[ix] *= 0.96; velArr[ix+1] *= 0.96; velArr[ix+2] *= 0.96;
        } else {
            const tx = (isOrdered && i >= bgLimit) ? targetArr[ix] : (baseArr[ix] + Math.sin(time + phaseArr[i]) * 45);
            const ty = (isOrdered && i >= bgLimit) ? targetArr[ix+1] : (baseArr[ix+1] + Math.cos(time + phaseArr[i]) * 45);
            posArr[ix] += (tx - posArr[ix]) * spd; posArr[ix+1] += (ty - posArr[ix+1]) * spd; posArr[ix+2] += (baseArr[ix+2] - posArr[ix+2]) * spd;
        }
    }
    geo.attributes.position.needsUpdate = true;
    partSys.rotation.y += isOrdered ? (0 - partSys.rotation.y) * 0.15 : 0.005;
    renderer.render(scene, camera);
}

// [物理破壁：强制本地 WASM 路径]
const hands = new window.Hands({locateFile: (file) => `./${file}`});
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.65, minTrackingConfidence: 0.65 });
const cam = new window.Camera(document.getElementById('input_video'), { 
    onFrame: async () => { if(state.isIgnited) await hands.send({image: document.getElementById('input_video')}); },
    width: 640, height: 480 
});

hands.onResults((res) => {
    if (!state.isIgnited) return;
    let matched = false;
    if (res.multiHandLandmarks && res.multiHandLandmarks.length > 0) {
        const lm = res.multiHandLandmarks[0], wrist = lm[0];
        const isPinching = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) < 0.08;
        const indexUp = Math.hypot(lm[8].x-wrist.x, lm[8].y-wrist.y) > Math.hypot(lm[6].x-wrist.x, lm[6].y-wrist.y) * 1.15;
        const middleUp = Math.hypot(lm[12].x-wrist.x, lm[12].y-wrist.y) > Math.hypot(lm[10].x-wrist.x, lm[10].y-wrist.y) * 1.15;
        const isOne = indexUp && !middleUp && !isPinching;
        const isPeace = indexUp && middleUp && !isPinching;

        if (isPeace) {
            state.isPinched = false; isOneGestureActive = false; state.hasTriggeredOne = false;
            if (state.specialPhase === 0) { 
                state.specialPhase = 1; state.explosionTime = performance.now(); state.currentTopology = "EXPLOSION";
                playSFX(audioFirework);
                for(let i=bgLimit; i<total; i++) {
                    const i3 = i*3, s = Math.random()*60+20, t = Math.random()*Math.PI*2, p = Math.acos(Math.random()*2-1);
                    velArr[i3] = s*Math.sin(p)*Math.cos(t); velArr[i3+1] = s*Math.sin(p)*Math.sin(t); velArr[i3+2] = s*Math.cos(p);
                    colArr[i3] = Math.random(); colArr[i3+1] = Math.random(); colArr[i3+2] = Math.random();
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
            if (!state.hasTriggeredOne && (performance.now() - oneGestureStartTime >= 1500)) {
                state.currentIndex = (state.currentIndex + 1) % TARGET_NODES.length; 
                updateTopology(TARGET_NODES[state.currentIndex]); playSFX(audioSwitch); state.hasTriggeredOne = true;
            }
            matched = true;
        }
    }
    if (!matched) { state.isPinched = false; isOneGestureActive = false; state.hasTriggeredOne = false; }
});

document.getElementById('ignition_overlay').addEventListener('click', function() {
    state.isIgnited = true; this.style.opacity = '0'; setTimeout(() => this.style.display = 'none', 600);
    audioBGM.play().catch(() => {}); updateTopology(TARGET_NODES[state.currentIndex]);
    cam.start().catch(() => { uiText.innerText = "传感器受阻"; });
});
animate();