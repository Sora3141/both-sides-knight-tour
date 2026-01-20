import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Global State ---
let N = 8, M = 8; 
let tiles = [[], []]; // tiles[layer][x][y]
let boxGroup;              
let knightMesh;            
let visitedPath = [];      
let isGameOver = false;
let interactionTargets = []; 

let particles = []; 
let shakeIntensity = 0; 

const COLORS = {
    cyan: 0x00f0ff,
    magenta: 0xff00cc,
    white: 0xffffff,
    unvisited: 0x5588aa, 
    bg: 0x020205,
    gold: 0xffaa00 
};

// --- Materials ---
const MATERIALS = {
    glassBase: new THREE.MeshPhysicalMaterial({
        color: COLORS.unvisited, metalness: 0.1, roughness: 0.2, transmission: 0.5,
        thickness: 0.5, clearcoat: 1.0, ior: 1.5, emissive: 0x112244, emissiveIntensity: 0.4,
        transparent: true, opacity: 0.7
    }),
    trail: new THREE.MeshPhysicalMaterial({
        color: COLORS.cyan, emissive: COLORS.cyan, emissiveIntensity: 2.0,
        metalness: 0.5, roughness: 0.1, clearcoat: 1.0, transparent: true, opacity: 0.9
    }),
    hint: new THREE.MeshPhysicalMaterial({
        color: COLORS.magenta, emissive: COLORS.magenta, emissiveIntensity: 1.2,
        metalness: 0.5, roughness: 0.1, transparent: true, opacity: 0.85
    }),
    line: new THREE.LineBasicMaterial({ color: 0xaaccff, transparent: true, opacity: 0.4 }),
    collider: new THREE.MeshBasicMaterial({ visible: false })
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.bg);
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

function setupLighting() {
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(5, 10, 7);
    scene.add(sun);
}

function createKnight() {
    if (knightMesh) scene.remove(knightMesh);
    const group = new THREE.Group();
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: COLORS.cyan }));
    core.name = "core";
    const shell = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), new THREE.MeshPhysicalMaterial({
        color: COLORS.cyan, metalness: 0.1, roughness: 0.1, transmission: 0.9, thickness: 1.0, emissive: COLORS.cyan, emissiveIntensity: 0.5
    }));
    shell.name = "shell";
    group.add(core, shell);
    knightMesh = group;
    scene.add(knightMesh);
    knightMesh.visible = false;
}

function createLevel() {
    if (boxGroup) scene.remove(boxGroup);
    boxGroup = new THREE.Group(); 
    scene.add(boxGroup);
    
    tiles = [[], []]; 
    interactionTargets = []; 
    visitedPath = []; 
    isGameOver = false;

    const tileGeom = new THREE.BoxGeometry(0.9, 0.9, 0.05);
    const edgeGeom = new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.9, 0.9));
    const colliderGeom = new THREE.PlaneGeometry(0.95, 0.95);

    // ★修正: 隙間をほぼゼロにする (タイルの厚みの半分)
    const plateThickness = 0.025; 

    for (let l = 0; l < 2; l++) {
        tiles[l] = [];
        for (let x = 0; x < N; x++) {
            tiles[l][x] = [];
            for (let y = 0; y < M; y++) {
                const mesh = new THREE.Mesh(tileGeom, MATERIALS.glassBase.clone());
                
                const visualX = (l === 0) ? x : (N - 1 - x);
                const zPos = (l === 0) ? plateThickness : -plateThickness;
                
                mesh.position.set(visualX - N / 2 + 0.5, y - M / 2 + 0.5, zPos);
                
                if (l === 1) mesh.rotation.y = Math.PI;

                const frame = new THREE.LineSegments(edgeGeom, MATERIALS.line.clone());
                frame.position.z = 0.03;
                mesh.add(frame);

                tiles[l][x][y] = { mesh, frame };
                boxGroup.add(mesh);

                const collider = new THREE.Mesh(colliderGeom, MATERIALS.collider);
                collider.position.copy(mesh.position);
                collider.rotation.copy(mesh.rotation);
                collider.translateZ(0.06); 
                collider.userData = { l, x, y };
                boxGroup.add(collider);
                interactionTargets.push(collider);
            }
        }
    }

    createKnight();
    camera.position.set(N * 0.5, M * 0.5, Math.max(N, M) * 1.5);
    controls.target.set(0, 0, 0);
    controls.update();
    updateVisuals(); 
}

function getPossibleMoves(current) {
    const { l, x, y } = current;
    const standardVectors = [
        [1, 2], [1, -2], [-1, 2], [-1, -2], 
        [2, 1], [2, -1], [-2, 1], [-2, -1]
    ];
    
    let possible = [];
    
    standardVectors.forEach(([dx, dy]) => {
        let xInt = (N === 1) ? 0 : (x + dx) % N;
        if (xInt < 0) xInt += N;

        let fx = 0;
        if (N === 1) {
            fx = Math.abs(dx) % 2;
        } else {
            if (x + dx >= N || x + dx < 0) fx = 1; 
        }
        let lInt = l ^ fx; 

        let dyActual = (lInt === 0) ? dy : -dy; 
        let yNew = y + dyActual;

        let fy = 0;
        if (M === 1) {
            fy = Math.abs(dyActual) % 2;
        } else {
            if (yNew >= M || yNew < 0) fy = 1; 
        }

        let yFinal;
        if (M === 1) {
            yFinal = 0;
        } else if (yNew >= M) {
            yFinal = 2 * M - 1 - yNew; 
        } else if (yNew < 0) {
            yFinal = -1 - yNew; 
        } else {
            yFinal = yNew;
        }

        let xFinal = (fy === 1 && N >= 2) ? (N - 1 - xInt) : xInt; 
        let lFinal = lInt ^ fy; 

        possible.push({ l: lFinal, x: xFinal, y: yFinal });
    });
    
    return possible;
}

function updateVisuals() {
    const infoEl = document.getElementById('pos-info');
    const totalCells = 2 * N * M; 
    
    for(let l=0; l<2; l++) {
        for(let x=0; x<N; x++) {
            for(let y=0; y<M; y++) {
                const t = tiles[l][x][y];
                t.mesh.material = MATERIALS.glassBase;
                t.mesh.scale.set(1, 1, 1);
            }
        }
    }

    visitedPath.forEach((p, i) => {
        const isLast = i === visitedPath.length - 1;
        const t = tiles[p.l][p.x][p.y];
        t.mesh.material = MATERIALS.trail;
        
        if (isLast) {
            t.mesh.scale.set(1.05, 1.05, 1.05); // 板が薄いのでスケールアップも少し控えめに
            const targetPos = new THREE.Vector3();
            t.mesh.getWorldPosition(targetPos);
            const targetQuat = new THREE.Quaternion();
            t.mesh.getWorldQuaternion(targetQuat);
            
            knightMesh.visible = true;
            // ★修正: 駒がタイルに埋まらないように法線方向に浮かせる
            const offset = new THREE.Vector3(0, 0, 0.35).applyQuaternion(targetQuat);
            knightMesh.position.copy(targetPos).add(offset);
            knightMesh.quaternion.copy(targetQuat);
            
            const moves = getPossibleMoves(p).filter(m => !visitedPath.some(v => v.l === m.l && v.x === m.x && v.y === m.y));
            moves.forEach(m => {
                const ht = tiles[m.l][m.x][m.y];
                ht.mesh.material = MATERIALS.hint;
            });

            if (visitedPath.length === totalCells) {
                infoEl.innerHTML = "<span style='color:#ffaa00'>🎉 DUAL-SIDE TOUR COMPLETE!</span>";
                isGameOver = true;
                controls.autoRotate = true;
            } else if (moves.length === 0) {
                infoEl.innerHTML = "<span style='color:#ff0000'>💀 SYSTEM STUCK</span>";
                isGameOver = true;
            } else {
                const progress = Math.round((visitedPath.length / totalCells) * 100);
                infoEl.innerText = `PROGRESS: ${progress}% [${visitedPath.length}/${totalCells}]`;
            }
        }
    });

    if (visitedPath.length === 0) {
        knightMesh.visible = false;
        infoEl.innerText = "SELECT STARTING POINT";
    }
}

function init() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('canvas-container').appendChild(renderer.domElement);
    setupLighting();
    createLevel();

    renderer.domElement.addEventListener('pointerdown', (e) => {
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(interactionTargets);
        if (intersects.length > 0) {
            const data = intersects[0].object.userData;
            if (isGameOver) return;
            const last = visitedPath[visitedPath.length - 1];
            if (!last || getPossibleMoves(last).some(m => m.l === data.l && m.x === data.x && m.y === data.y)) {
                if (!visitedPath.some(v => v.l === data.l && v.x === data.x && v.y === data.y)) {
                    visitedPath.push(data);
                    updateVisuals();
                }
            }
        }
    });

    document.getElementById('btnUndo').addEventListener('click', () => {
        visitedPath.pop();
        isGameOver = false;
        controls.autoRotate = false;
        updateVisuals();
    });

    const mobileUndo = document.getElementById('mobile-undo-btn');
    if(mobileUndo) {
        mobileUndo.addEventListener('click', () => {
            visitedPath.pop();
            isGameOver = false;
            controls.autoRotate = false;
            updateVisuals();
        });
    }

    const updateSize = () => {
        N = parseInt(document.getElementById('inN').value);
        M = parseInt(document.getElementById('inM').value);
        document.getElementById('valN').innerText = N;
        document.getElementById('valM').innerText = M;
        createLevel();
    };
    
    ['N','M'].forEach(id => document.getElementById(`in${id}`).addEventListener('input', updateSize));
    document.getElementById('btnApply').addEventListener('click', updateSize);

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        if (knightMesh && knightMesh.visible) {
            knightMesh.children[0].rotation.y += 0.05;
        }
        renderer.render(scene, camera);
    }
    animate();
}
init();