import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';

// ─── Scene ──────────────────────────────────────────────────────────────────
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const game = $('#game');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#ead5df');
scene.fog = new THREE.Fog('#ead5df', 14, 27);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, .05, 60);
camera.position.set(0, 1.63, 3.55);
camera.rotation.order = 'YXZ';
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .96;
game.appendChild(renderer.domElement);
const canvas = renderer.domElement;

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const tmpVector = new THREE.Vector3();
const tmpVector2 = new THREE.Vector3();
const tmpQuaternion = new THREE.Quaternion();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (current, target, lambda, dt) => THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
const shortestAngle = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const pick = (items) => items[Math.floor(Math.random() * items.length)];

// ─── Shared materials & helpers ─────────────────────────────────────────────
const toonRamp = (() => {
  const data = new Uint8Array([58, 112, 178, 255]);
  const texture = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
})();

const mat = (color, roughness = .82, metalness = 0, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
const toon = (color, extra = {}) =>
  new THREE.MeshToonMaterial({ color, gradientMap: toonRamp, ...extra });

const M = {
  wall: mat('#f4e5eb', .95),
  wallLow: mat('#edcedb', .92),
  trim: mat('#fffaf9', .9),
  floor: mat('#c9a797', .72),
  wood: mat('#b98976', .72),
  woodDark: mat('#8f6659', .78),
  woodLight: mat('#d4b4a3', .78),
  cream: mat('#fff6ed', .95),
  blush: mat('#e9b4c6', .9),
  pink: mat('#eaa9bd', .86),
  rose: mat('#ce7897', .8),
  lavender: mat('#c7b8dd', .9),
  blue: mat('#536a9e', .78),
  navy: mat('#2f3e66', .68),
  gold: mat('#d9b77a', .5, .25),
  dark: mat('#34303a', .55),
  metal: mat('#9a99a7', .3, .65),
  glass: new THREE.MeshPhysicalMaterial({ color: '#cbd8ea', roughness: .15, transmission: .5, transparent: true, opacity: .3 }),
  lampGlow: new THREE.MeshStandardMaterial({ color: '#ffdfb1', roughness: .7, emissive: '#ffc47a', emissiveIntensity: 1.1 }),
  screen: new THREE.MeshBasicMaterial({ color: '#f4d8e5' })
};

function addBox(parent, w, h, d, material, x, y, z, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  mesh.castShadow = options.cast !== false;
  mesh.receiveShadow = options.receive !== false;
  parent.add(mesh);
  return mesh;
}
function addRounded(parent, w, h, d, radius, material, x, y, z, options = {}) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, radius), material);
  mesh.position.set(x, y, z);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  mesh.castShadow = options.cast !== false;
  mesh.receiveShadow = options.receive !== false;
  parent.add(mesh);
  return mesh;
}
function addSphere(parent, sx, sy, sz, material, x, y, z, options = {}) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, options.segments || 24, options.rings || 16), material);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  mesh.castShadow = options.cast !== false;
  mesh.receiveShadow = options.receive !== false;
  parent.add(mesh);
  return mesh;
}
function addCylinder(parent, rt, rb, h, material, x, y, z, options = {}) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, options.segments || 24), material);
  mesh.position.set(x, y, z);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  mesh.castShadow = options.cast !== false;
  mesh.receiveShadow = options.receive !== false;
  parent.add(mesh);
  return mesh;
}
function addPlane(parent, w, h, material, x, y, z, options = {}) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.set(x, y, z);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  mesh.receiveShadow = options.receive !== false;
  parent.add(mesh);
  return mesh;
}
function makeCanvasTexture(width, height, draw, options = {}) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  draw(c.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  if (options.repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...options.repeat);
  }
  texture.needsUpdate = true;
  return texture;
}

// Wood floor texture with staggered boards and soft grain.
const floorTexture = makeCanvasTexture(1024, 1024, (ctx, w, h) => {
  ctx.fillStyle = '#c9a797'; ctx.fillRect(0, 0, w, h);
  const boardH = 96;
  for (let row = 0; row < 11; row++) {
    const y = row * boardH;
    const offset = row % 2 ? 270 : 0;
    for (let x = -360 + offset; x < w + 360; x += 360) {
      const tone = 184 + ((row * 13 + x / 20) % 18);
      ctx.fillStyle = `rgb(${tone + 24},${tone},${tone - 10})`;
      ctx.fillRect(x + 2, y + 2, 356, boardH - 4);
      ctx.strokeStyle = 'rgba(115, 74, 62, .18)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, 358, boardH - 2);
      ctx.strokeStyle = 'rgba(255, 245, 234, .16)';
      for (let g = 0; g < 5; g++) {
        const gy = y + 16 + g * 15 + Math.sin(x * .01 + row) * 4;
        ctx.beginPath();
        ctx.moveTo(x + 10, gy);
        ctx.bezierCurveTo(x + 100, gy - 8, x + 240, gy + 7, x + 350, gy - 2);
        ctx.stroke();
      }
    }
  }
  const vignette = ctx.createLinearGradient(0, 0, 0, h);
  vignette.addColorStop(0, 'rgba(255, 246, 237, .12)');
  vignette.addColorStop(1, 'rgba(99, 61, 65, .08)');
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h);
}, { repeat: [3, 3] });
const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture, color: '#fff6f1', roughness: .78 });

// Rug with a soft painted border.
const rugTexture = makeCanvasTexture(1024, 768, (ctx, w, h) => {
  ctx.fillStyle = '#f1dbe4'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#e7c6d5';
  ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w * .45, h * .42, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f7e8ee';
  ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w * .36, h * .34, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#d49ab0'; ctx.lineWidth = 4;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w * (.12 + i * .08), h * (.12 + i * .07), 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.strokeStyle = '#c989a2'; ctx.lineWidth = 2;
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(w / 2 + Math.cos(a) * 145, h / 2 + Math.sin(a) * 115);
    ctx.lineTo(w / 2 + Math.cos(a) * 184, h / 2 + Math.sin(a) * 146);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  for (let i = 0; i < 120; i++) {
    ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 2.2 + .4, 0, Math.PI * 2); ctx.fill();
  }
});

// Dreamy dusk visible through the window.
const skyTexture = makeCanvasTexture(900, 780, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#899bc3');
  g.addColorStop(.46, '#c8b9d8');
  g.addColorStop(.73, '#f1c8cf');
  g.addColorStop(1, '#f5d8c8');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * w, y = h * .46 + Math.random() * h * .28;
    const r = Math.random() * 24 + 5;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, `rgba(255,216,181,${Math.random() * .28 + .08})`);
    glow.addColorStop(1, 'rgba(255,216,181,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = `rgba(125,133,165,${.17 + Math.random() * .2})`;
    const bw = 18 + Math.random() * 38;
    const bh = 80 + Math.random() * 200;
    ctx.fillRect(Math.random() * w, h - bh, bw, bh);
  }
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = `rgba(255,229,195,${Math.random() * .6 + .2})`;
    ctx.fillRect(Math.random() * w, h * .52 + Math.random() * h * .3, 2, 2);
  }
});

// ─── Room shell ─────────────────────────────────────────────────────────────
const room = new THREE.Group();
scene.add(room);
addBox(room, 12.2, .18, 12.2, mat('#8f6e66', .8), 0, -.13, 0, { cast: false });
addPlane(room, 11.9, 11.9, floorMaterial, 0, -.025, 0, { rotation: [-Math.PI / 2, 0, 0] });
addBox(room, 12.2, 4.8, .22, M.wall, 0, 2.35, -5.88, { cast: false });
addBox(room, .22, 4.8, 12.2, M.wall, -5.88, 2.35, 0, { cast: false });
addBox(room, .22, 4.8, 12.2, M.wall, 5.88, 2.35, 0, { cast: false });
addBox(room, 12.2, 4.8, .22, M.wall, 0, 2.35, 5.88, { cast: false });
addBox(room, 12.2, .12, 12.2, mat('#f9edf1', .95), 0, 4.69, 0, { cast: false });
addBox(room, 12, .8, .08, M.wallLow, 0, .43, -5.74, { receive: false });
addBox(room, .08, .8, 12, M.wallLow, -5.74, .43, 0, { receive: false });
addBox(room, .08, .8, 12, M.wallLow, 5.74, .43, 0, { receive: false });
addBox(room, 12, .1, .1, M.trim, 0, .85, -5.67, { cast: false });
addBox(room, .1, .1, 12, M.trim, -5.67, .85, 0, { cast: false });
addBox(room, .1, .1, 12, M.trim, 5.67, .85, 0, { cast: false });
addBox(room, 12.2, .12, .16, M.trim, 0, .08, -5.69, { cast: false });
addBox(room, .16, .12, 12.2, M.trim, -5.69, .08, 0, { cast: false });
addBox(room, .16, .12, 12.2, M.trim, 5.69, .08, 0, { cast: false });
addBox(room, 12.1, .09, .12, M.trim, 0, 4.6, -5.7, { cast: false });
addBox(room, .12, .09, 12.1, M.trim, -5.7, 4.6, 0, { cast: false });
addBox(room, .12, .09, 12.1, M.trim, 5.7, 4.6, 0, { cast: false });

const rug = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 4.25), new THREE.MeshStandardMaterial({ map: rugTexture, roughness: .95 }));
rug.rotation.x = -Math.PI / 2;
rug.position.set(0, .006, 1.7);
rug.receiveShadow = true;
room.add(rug);

// Window with a deep white frame and gathered pink curtains.
const windowX = -2.85;
const windowY = 2.66;
addBox(room, 3.55, 2.95, .16, M.trim, windowX, windowY, -5.64, { cast: false });
addPlane(room, 3.15, 2.56, new THREE.MeshBasicMaterial({ map: skyTexture, toneMapped: false }), windowX, windowY, -5.53);
addBox(room, .075, 2.64, .08, M.trim, windowX, windowY, -5.47, { cast: false });
addBox(room, 3.18, .075, .08, M.trim, windowX, windowY, -5.47, { cast: false });
addBox(room, 3.45, .12, .44, M.trim, windowX, 1.22, -5.4, { cast: false });
addBox(room, 3.6, .1, .24, mat('#f4e2e8', .86), windowX, 1.15, -5.48, { cast: false });
addBox(room, 3.48, .12, .14, M.trim, windowX, 4.08, -5.43, { cast: false });

function makeCurtain(width, height, folds) {
  const geometry = new THREE.PlaneGeometry(width, height, 28, 1);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const u = (x + width / 2) / width;
    position.setZ(i, Math.sin(u * Math.PI * 2 * folds) * .055 + Math.sin(u * Math.PI) * .04);
  }
  geometry.computeVertexNormals();
  const curtain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: '#e6a8bd', roughness: .9, side: THREE.DoubleSide, transparent: true, opacity: .92
  }));
  curtain.castShadow = true;
  curtain.receiveShadow = true;
  return curtain;
}
const curtainLeft = makeCurtain(.82, 3.15, 5);
curtainLeft.position.set(windowX - 1.62, 2.63, -5.32);
curtainLeft.rotation.y = .04;
room.add(curtainLeft);
const curtainRight = makeCurtain(.82, 3.15, 5);
curtainRight.position.set(windowX + 1.62, 2.63, -5.32);
curtainRight.rotation.y = -.04;
room.add(curtainRight);
addCylinder(room, .025, .025, 3.9, M.gold, windowX, 4.22, -5.3, { rotation: [0, 0, Math.PI / 2], segments: 12 });
for (const x of [windowX - 1.9, windowX + 1.9]) {
  addSphere(room, .09, .09, .09, M.gold, x, 4.22, -5.3, { segments: 12, rings: 8 });
}

// Rain just outside the glass.
const rainGeometry = new THREE.BufferGeometry();
const rainCount = 95;
const rainPositions = new Float32Array(rainCount * 6);
const rainSeeds = [];
for (let i = 0; i < rainCount; i++) {
  const x = windowX - 1.45 + Math.random() * 2.9;
  const y = 1.4 + Math.random() * 2.55;
  const len = .09 + Math.random() * .2;
  rainPositions.set([x, y, -5.49, x + .022, y - len, -5.49], i * 6);
  rainSeeds.push({ speed: .35 + Math.random() * .75, len });
}
rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
const rain = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({ color: '#e6e7f5', transparent: true, opacity: .45, depthWrite: false }));
room.add(rain);

// ─── Bed ────────────────────────────────────────────────────────────────────
const bed = new THREE.Group();
bed.position.set(-4.28, 0, 1.72);
bed.rotation.y = Math.PI / 2;
bed.scale.set(.8, .9, .8);
room.add(bed);
addBox(bed, 3.0, .36, 2.78, M.wood, 0, .25, 0);
addRounded(bed, 2.93, .3, 2.66, .08, mat('#fff6f2', .92), 0, .57, 0);
addRounded(bed, 2.92, .18, 2.28, .06, mat('#edc3d4', .9), 0, .79, .14);
addRounded(bed, 2.93, .12, .6, .05, mat('#f8e8dd', .94), 0, .9, 1.0, { rotation: [-.06, 0, 0] });
addRounded(bed, 3.05, 1.18, .18, .08, M.woodLight, 0, 1.05, -1.29);
addRounded(bed, 2.8, .82, .07, .04, mat('#e8c3cd', .92), 0, 1.03, -1.2);
for (let i = -1; i <= 1; i++) {
  addRounded(bed, .86, .92, .08, .05, mat(i === 0 ? '#d8a7b7' : '#cfa0b2', .9), i * .94, 1.09, -1.17);
  for (let j = 0; j < 3; j++) addSphere(bed, .028, .028, .028, M.gold, i * .94, .78 + j * .27, -1.11, { segments: 10, rings: 8 });
}
addRounded(bed, 1.02, .22, .68, .1, mat('#fff9f4', .96), -.72, .91, -1.0, { rotation: [-.22, .05, 0] });
addRounded(bed, 1.02, .22, .68, .1, mat('#fff9f4', .96), .62, .93, -1.0, { rotation: [-.2, -.04, 0] });
addRounded(bed, .8, .21, .55, .09, mat('#f5d7df', .95), -.82, 1.06, -1.12, { rotation: [-.26, .1, -.06] });
// Round orange pillow.
const roundPillow = addSphere(bed, .34, .13, .34, mat('#d98555', .86), .8, 1.1, -1.08, { segments: 32, rings: 20, rotation: [0, 0, .12] });
// Star pillow.
const starShape = new THREE.Shape();
for (let i = 0; i < 10; i++) {
  const radius = i % 2 ? .17 : .4;
  const angle = -Math.PI / 2 + i * Math.PI / 5;
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;
  if (i === 0) starShape.moveTo(x, y); else starShape.lineTo(x, y);
}
starShape.closePath();
const starGeometry = new THREE.ExtrudeGeometry(starShape, { depth: .1, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 2 });
starGeometry.center();
const starPillow = new THREE.Mesh(starGeometry, mat('#f6dda3', .85));
starPillow.scale.setScalar(.52);
starPillow.position.set(.4, .98, .42);
starPillow.rotation.set(-Math.PI / 2 + .16, 0, .25);
starPillow.castShadow = true;
bed.add(starPillow);
// A small cat plush on the duvet.
const plush = new THREE.Group();
plush.position.set(-.95, 1.0, .72);
bed.add(plush);
addSphere(plush, .2, .19, .17, mat('#d8c7c7', .95), 0, .12, 0);
addSphere(plush, .16, .15, .14, mat('#e1d2d0', .95), 0, .31, -.04);
for (const s of [-1, 1]) {
  const ear = new THREE.Mesh(new THREE.ConeGeometry(.055, .12, 4), mat('#d8c7c7', .95));
  ear.position.set(s * .09, .44, -.04); ear.rotation.z = s * .25; plush.add(ear);
  addSphere(plush, .016, .02, .012, M.dark, s * .06, .32, .096, { segments: 8, rings: 6 });
}
addSphere(plush, .017, .012, .012, mat('#b97687', .8), 0, .275, .103, { segments: 8, rings: 6 });
const tail = new THREE.Mesh(new THREE.TorusGeometry(.11, .025, 8, 18, Math.PI * 1.5), mat('#d8c7c7', .95));
tail.position.set(.16, .1, .03); tail.rotation.x = Math.PI / 2; plush.add(tail);

// Bedside table and lamp.
const bedside = new THREE.Group();
bedside.position.set(-5.08, 0, 3.52);
room.add(bedside);
addBox(bedside, .72, .08, .7, M.wood, 0, .73, 0);
addBox(bedside, .54, .68, .52, M.woodDark, 0, .36, 0);
for (const x of [-.28, .28]) for (const z of [-.27, .27]) addBox(bedside, .07, .55, .07, M.woodDark, x, .28, z);
addBox(bedside, .56, .09, .03, M.woodLight, 0, .54, .285, { cast: false });
addSphere(bedside, .065, .065, .07, M.gold, 0, .54, .31, { segments: 12, rings: 8 });
addBox(bedside, .58, .04, .48, mat('#312d37', .5), 0, .8, 0);
addBox(bedside, .5, .18, .42, mat('#6c5b59', .8), 0, .91, 0);
addBox(bedside, .43, .1, .35, mat('#f1e4dd', .9), 0, 1.04, 0);
addCylinder(bedside, .018, .018, .35, M.gold, 0, 1.25, .02, { segments: 10 });
const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(.18, .28, .3, 24, 1, true), M.lampGlow);
lampShade.position.set(0, 1.46, .02); lampShade.castShadow = false; bedside.add(lampShade);
const shadeTop = new THREE.Mesh(new THREE.CylinderGeometry(.17, .18, .02, 24), mat('#fff3d6', .6));
shadeTop.position.set(0, 1.61, .02); bedside.add(shadeTop);
const bedsideLight = new THREE.PointLight('#ffc78d', 16, 5.5, 2);
bedsideLight.position.set(-5.08, 1.55, 3.52);
scene.add(bedsideLight);

// A soft round rug anchors the middle of the room.
addCylinder(room, 2.52, 2.52, .012, mat('#e5c1c0', .96), -.2, .006, .9, { segments: 72, cast: false });
addCylinder(room, 2.24, 2.24, .014, mat('#f3ded8', .94), -.2, .014, .9, { segments: 72, cast: false });
const rugRing = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.41, 80), mat('#d8aaac', .9));
rugRing.rotation.x = -Math.PI / 2;
rugRing.position.set(-.2, .023, .9);
rugRing.receiveShadow = true;
room.add(rugRing);

// ─── Desk, screen, chair ────────────────────────────────────────────────────
const desk = new THREE.Group();
desk.position.set(2.95, 0, -4.82);
room.add(desk);
addRounded(desk, 3.55, .13, 1.28, .035, M.woodLight, 0, .98, 0);
for (const x of [-1.55, 1.55]) for (const z of [-.45, .45]) addBox(desk, .1, .96, .1, M.woodDark, x, .49, z);
addBox(desk, 1.17, .62, .9, M.wood, 1.08, .46, -.08);
for (let i = 0; i < 3; i++) {
  addRounded(desk, 1.08, .16, .04, .02, M.woodLight, 1.08, .28 + i * .19, .39);
  addSphere(desk, .025, .025, .025, M.gold, 1.08, .28 + i * .19, .42, { segments: 8, rings: 6 });
}
// Monitor.
addRounded(desk, 1.1, .66, .075, .035, mat('#2e2c36', .45), -.2, 1.55, -.25);
const screenCanvas = document.createElement('canvas');
screenCanvas.width = 900; screenCanvas.height = 560;
const screenTexture = new THREE.CanvasTexture(screenCanvas);
screenTexture.colorSpace = THREE.SRGBColorSpace;
let screenNote = 'оставь окно приоткрытым';
function drawScreen() {
  const ctx = screenCanvas.getContext('2d');
  const w = screenCanvas.width, h = screenCanvas.height;
  const time = new Date();
  const hh = String(time.getHours()).padStart(2, '0');
  const mm = String(time.getMinutes()).padStart(2, '0');
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#3b4167'); g.addColorStop(.55, '#6d6489'); g.addColorStop(1, '#b37f97');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = .28;
  const blob = ctx.createRadialGradient(w * .72, h * .28, 0, w * .72, h * .28, 310);
  blob.addColorStop(0, '#ffd3b8'); blob.addColorStop(1, 'rgba(255,211,184,0)');
  ctx.fillStyle = blob; ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,248,251,.88)';
  ctx.font = '600 42px Montserrat, sans-serif';
  ctx.fillText(hh + ':' + mm, 66, 102);
  ctx.font = '500 19px Montserrat, sans-serif';
  ctx.fillStyle = 'rgba(255,248,251,.54)';
  ctx.fillText(screenNote, 68, 139);
  ctx.fillStyle = 'rgba(255,255,255,.16)';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.roundRect(62, 200 + i * 57, i === 0 ? 340 : 265 + i * 22, 37, 9);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,.1)';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.arc(640 + i * 66, 260 + Math.sin(i) * 30, 22, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(237,164,190,.65)';
  ctx.fillRect(610, 382, 220, 4);
  ctx.fillStyle = 'rgba(255,255,255,.15)';
  for (let i = 0; i < 6; i++) ctx.fillRect(610, 404 + i * 16, 150 + (i % 3) * 25, 4);
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  ctx.fillRect(610, 166, 220, 150);
  screenTexture.needsUpdate = true;
}
drawScreen();
const screen = addPlane(desk, 1.0, .58, new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false }), -.2, 1.55, -.205);
screen.renderOrder = 1;
addCylinder(desk, .035, .035, .36, M.metal, -.2, 1.03, -.43, { segments: 12 });
addRounded(desk, .34, .035, .22, .01, M.metal, -.2, .84, -.43);
// Keyboard, mouse, mug, notebook.
const keyboardTexture = makeCanvasTexture(800, 260, (ctx, w, h) => {
  ctx.fillStyle = '#e7e0e9'; ctx.fillRect(0, 0, w, h);
  const cols = 15, rows = 4, gap = 7;
  const cellW = (w - gap * (cols + 1)) / cols, cellH = (h - gap * (rows + 1)) / rows;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    ctx.fillStyle = y === 3 ? '#d8c9d6' : '#fbf7fa';
    ctx.beginPath(); ctx.roundRect(gap + x * (cellW + gap), gap + y * (cellH + gap), cellW, cellH, 5); ctx.fill();
    ctx.fillStyle = 'rgba(100,78,94,.2)';
    ctx.font = '500 10px Montserrat, sans-serif';
    ctx.fillText(String.fromCharCode(65 + (x + y * cols) % 26), gap + x * (cellW + gap) + 8, gap + y * (cellH + gap) + 18);
  }
});
addRounded(desk, 1.0, .035, .34, .02, new THREE.MeshStandardMaterial({ map: keyboardTexture, roughness: .7 }), -.2, 1.07, .06);
addRounded(desk, .11, .045, .17, .025, mat('#3b3742', .5), .65, 1.07, .04);
addCylinder(desk, .085, .075, .17, mat('#f4e6e2', .72), 1.2, 1.08, .02, { segments: 20 });
const mugHandle = new THREE.Mesh(new THREE.TorusGeometry(.063, .017, 8, 16, Math.PI * 1.55), mat('#f4e6e2', .72));
mugHandle.position.set(1.28, 1.1, .02); mugHandle.rotation.y = Math.PI / 2; desk.add(mugHandle);
addRounded(desk, .56, .025, .4, .01, mat('#f1cfd9', .9), -.98, 1.06, .14, { rotation: [0, -.1, 0] });
addBox(desk, .28, .008, .038, mat('#d69cb3', .8), -.98, 1.08, .1, { rotation: [0, -.1, .35], cast: false });
// Headphones on a stand.
addCylinder(desk, .018, .018, .38, M.metal, 1.46, 1.21, -.12, { segments: 10 });
const headband = new THREE.Mesh(new THREE.TorusGeometry(.15, .022, 8, 22, Math.PI), mat('#38333e', .55));
headband.position.set(1.46, 1.4, -.12); headband.rotation.z = Math.PI; desk.add(headband);
for (const s of [-1, 1]) addSphere(desk, .055, .075, .045, mat('#38333e', .55), 1.46 + s * .15, 1.28, -.12, { segments: 12, rings: 8 });
// Desk plant.
const deskPlant = new THREE.Group();
deskPlant.position.set(-1.52, 1.02, -.12);
desk.add(deskPlant);
addCylinder(deskPlant, .11, .14, .17, mat('#c78f7c', .9), 0, .08, 0, { segments: 18 });
for (let i = 0; i < 6; i++) {
  const a = i / 6 * Math.PI * 2;
  const leaf = addSphere(deskPlant, .12, .035, .18, mat(i % 2 ? '#70927c' : '#84a68b', .9), Math.cos(a) * .11, .28 + Math.sin(i) * .04, Math.sin(a) * .11, { segments: 12, rings: 8 });
  leaf.rotation.z = Math.cos(a) * .6; leaf.rotation.y = -a;
}
// Chair, turned a little away from the desk.
const chair = new THREE.Group();
chair.position.set(2.7, 0, -3.55);
chair.rotation.y = .28;
room.add(chair);
addRounded(chair, .72, .16, .68, .06, mat('#d5abb7', .88), 0, .54, 0);
addRounded(chair, .62, .08, .58, .05, mat('#f1dbe2', .92), 0, .64, -.02);
addRounded(chair, .68, .72, .12, .06, mat('#d5abb7', .88), 0, .98, .28, { rotation: [-.12, 0, 0] });
for (const x of [-.29, .29]) for (const z of [-.25, .25]) addCylinder(chair, .026, .026, .54, M.metal, x, .27, z, { segments: 10 });
addCylinder(chair, .04, .04, .34, M.metal, 0, .12, 0, { segments: 10 });
for (let i = 0; i < 5; i++) {
  const a = i / 5 * Math.PI * 2;
  addBox(chair, .38, .035, .045, M.metal, Math.cos(a) * .18, .05, Math.sin(a) * .18, { rotation: [0, -a, 0] });
}
// A folded cardigan over the chair.
addRounded(chair, .55, .15, .38, .04, mat('#d6c3cc', .95), -.05, .74, .31, { rotation: [0, .08, -.05] });

// ─── Bookshelf ──────────────────────────────────────────────────────────────
const shelf = new THREE.Group();
shelf.position.set(5.64, 0, -2.0);
room.add(shelf);
addBox(shelf, .42, 2.9, .07, M.wood, 0, 1.45, -.92);
addBox(shelf, .42, 2.9, .07, M.wood, 0, 1.45, .92);
addBox(shelf, .06, 2.9, 1.9, M.woodDark, .2, 1.45, 0);
for (const y of [.18, .85, 1.52, 2.19, 2.78]) addBox(shelf, .43, .055, 1.82, M.woodLight, 0, y, 0);
const bookColors = ['#a95d70', '#647ba8', '#caa66b', '#8d709f', '#708b78', '#d0a5a0', '#4b587e', '#bb8b71'];
for (let layer = 0; layer < 4; layer++) {
  let z = -.76;
  const count = 5 + (layer % 2);
  for (let i = 0; i < count; i++) {
    const width = .06 + Math.random() * .075;
    const height = .33 + Math.random() * .18;
    addBox(shelf, .26, height, width, mat(bookColors[(i + layer * 2) % bookColors.length], .82),
      -.055, .2 + layer * .67 + height / 2, z + width / 2, { rotation: [0, 0, (Math.random() - .5) * .04] });
    z += width + .018;
    if (z > .76) break;
  }
}
addCylinder(shelf, .07, .09, .16, mat('#d4b28c', .9), -.02, 2.87, .55, { segments: 16 });
for (let i = 0; i < 4; i++) {
  const a = i / 4 * Math.PI * 2;
  const leaf = addSphere(shelf, .11, .025, .17, mat('#75927d', .86), Math.cos(a) * .1, 3.02 + (i % 2) * .05, .55 + Math.sin(a) * .1, { segments: 10, rings: 8 });
  leaf.rotation.y = -a;
}
addRounded(shelf, .05, .32, .25, .01, M.gold, .14, 2.52, -.55, { rotation: [0, .1, 0] });
addPlane(shelf, .26, .34, new THREE.MeshBasicMaterial({ map: skyTexture, toneMapped: false }), -.22, 2.52, -.55, { rotation: [0, -Math.PI / 2, 0] });

// ─── Floor lamp, guitar, star projector, wall art, fairy lights ──────────────
const floorLamp = new THREE.Group();
floorLamp.position.set(-5.15, 0, -.18);
room.add(floorLamp);
addCylinder(floorLamp, .22, .3, .05, M.woodDark, 0, .03, 0, { segments: 20 });
addCylinder(floorLamp, .028, .028, 1.92, M.gold, 0, 1.0, 0, { segments: 10 });
const floorShade = new THREE.Mesh(new THREE.CylinderGeometry(.27, .43, .48, 28, 1, true), M.lampGlow);
floorShade.position.y = 2.0; floorShade.castShadow = false; floorLamp.add(floorShade);
addCylinder(floorLamp, .25, .17, .03, mat('#fff3dd', .6), 0, 2.24, 0, { segments: 24 });
const floorLight = new THREE.PointLight('#ffc585', 24, 8.5, 2);
floorLight.position.set(-5.05, 2.0, -.18);
scene.add(floorLight);

const guitar = new THREE.Group();
guitar.position.set(-5.15, .09, -3.8);
guitar.rotation.set(-.04, .5, -.16);
room.add(guitar);
const guitarBody = addSphere(guitar, .37, .48, .13, mat('#b77b5f', .55), 0, .5, 0, { segments: 28, rings: 20 });
addSphere(guitar, .29, .35, .13, mat('#c68c6b', .55), 0, .85, 0, { segments: 24, rings: 18 });
addCylinder(guitar, .05, .05, 1.42, mat('#8f5c48', .6), 0, 1.55, 0, { segments: 14 });
addRounded(guitar, .16, .26, .07, .015, mat('#5b3d34', .6), 0, 2.3, 0, { rotation: [0, 0, -.18] });
addSphere(guitar, .13, .13, .018, M.dark, 0, .6, .125, { segments: 20, rings: 12 });
for (let i = 0; i < 6; i++) addBox(guitar, .006, 1.68, .006, M.gold, -.055 + i * .022, 1.37, .13, { cast: false });
for (let i = 0; i < 3; i++) addBox(guitar, .05, .012, .02, M.metal, 0, .62 + i * .11, .142, { cast: false });

const projector = new THREE.Group();
projector.position.set(-4.05, 1.25, -5.35);
room.add(projector);
addCylinder(projector, .13, .16, .08, mat('#4c4b76', .7), 0, 0, 0, { segments: 20 });
addSphere(projector, .19, .18, .19, mat('#6d6aa2', .45), 0, .14, 0, { segments: 24, rings: 16 });
addSphere(projector, .055, .055, .025, mat('#dbe7ff', .1, 0, { emissive: '#a8c8ff', emissiveIntensity: 2 }), .08, .16, .17, { segments: 18, rings: 12 });
const starLight = new THREE.PointLight('#b3a2ff', 0, 8, 2);
starLight.position.set(0, .3, 0);
projector.add(starLight);

// Wall art above the bed.
function framedArt(x, z, w, h, rotation, draw) {
  const art = new THREE.Group();
  art.position.set(-5.73, 2.5, z);
  art.rotation.y = Math.PI / 2;
  room.add(art);
  addBox(art, w + .12, h + .12, .045, M.trim, 0, 0, 0, { cast: false });
  const texture = makeCanvasTexture(512, 640, draw);
  addPlane(art, w, h, new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }), 0, 0, .03);
}
framedArt(-5.73, 1.3, .75, .95, 0, (ctx, w, h) => {
  ctx.fillStyle = '#f4ddd8'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#d6a0a8';
  ctx.beginPath(); ctx.arc(w * .5, h * .4, w * .25, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8698b4';
  ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w * .26, h * .46); ctx.lineTo(w * .56, h * .72); ctx.lineTo(w * .78, h * .55); ctx.lineTo(w, h * .9); ctx.lineTo(w, h); ctx.fill();
  ctx.strokeStyle = '#fff8f4'; ctx.lineWidth = 3; ctx.strokeRect(20, 20, w - 40, h - 40);
});
framedArt(-5.73, 2.7, .58, .74, 0, (ctx, w, h) => {
  ctx.fillStyle = '#d8d2e7'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#fff9f1'; ctx.lineWidth = 5;
  for (let i = 0; i < 7; i++) {
    ctx.beginPath(); ctx.arc(w * .5, h * .48, 30 + i * 25, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = '#e8abbd'; ctx.beginPath(); ctx.arc(w * .5, h * .48, 22, 0, Math.PI * 2); ctx.fill();
});

// Fairy lights along the back wall.
const fairy = new THREE.Group();
room.add(fairy);
const fairyMaterial = new THREE.MeshBasicMaterial({ color: '#ffe1a4', toneMapped: false });
for (let i = 0; i < 42; i++) {
  const x = -5.3 + i * .26;
  const y = 3.95 - Math.sin(i / 41 * Math.PI) * .38;
  addSphere(fairy, .026, .026, .026, fairyMaterial, x, y, -5.48, { segments: 8, rings: 6, cast: false });
}
const fairyLight = new THREE.PointLight('#ffd9aa', 5, 7, 2);
fairyLight.position.set(-1, 3.7, -5.1);
scene.add(fairyLight);

// Star field on the ceiling, revealed by the projector.
const starGeometryPoints = new THREE.BufferGeometry();
const starCount = 90;
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  starPositions[i * 3] = (Math.random() - .5) * 10.6;
  starPositions[i * 3 + 1] = 4.52 - Math.random() * .08;
  starPositions[i * 3 + 2] = (Math.random() - .5) * 10.6;
}
starGeometryPoints.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const ceilingStars = new THREE.Points(starGeometryPoints, new THREE.PointsMaterial({
  color: '#fff0b8', size: .035, transparent: true, opacity: .9, depthWrite: false, toneMapped: false
}));
ceilingStars.visible = false;
room.add(ceilingStars);

// Dust in the warm light.
const dustGeometry = new THREE.BufferGeometry();
const dustCount = 110;
const dustPositions = new Float32Array(dustCount * 3);
const dustMeta = [];
for (let i = 0; i < dustCount; i++) {
  dustPositions[i * 3] = (Math.random() - .5) * 10;
  dustPositions[i * 3 + 1] = .5 + Math.random() * 3.7;
  dustPositions[i * 3 + 2] = (Math.random() - .5) * 9;
  dustMeta.push({ speed: .008 + Math.random() * .022, phase: Math.random() * Math.PI * 2 });
}
dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
  color: '#ffe7d2', size: .018, transparent: true, opacity: .38, depthWrite: false, toneMapped: false
}));
room.add(dust);

// ─── Lighting ───────────────────────────────────────────────────────────────
scene.add(new THREE.HemisphereLight('#ffe9ee', '#7d6473', 1.25));
const keyLight = new THREE.DirectionalLight('#ffe4d6', 1.9);
keyLight.position.set(3.5, 6.4, 4.3);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -7;
keyLight.shadow.camera.right = 7;
keyLight.shadow.camera.top = 7;
keyLight.shadow.camera.bottom = -7;
keyLight.shadow.camera.near = .5;
keyLight.shadow.camera.far = 20;
keyLight.shadow.bias = -.0008;
keyLight.shadow.radius = 4;
scene.add(keyLight);
const windowFill = new THREE.PointLight('#b7c4ef', 8, 8, 2);
windowFill.position.set(windowX, 2.8, -4.6);
scene.add(windowFill);
const deskGlow = new THREE.PointLight('#e5b0cf', 6, 3.5, 2);
deskGlow.position.set(2.95, 1.55, -4.25);
scene.add(deskGlow);

// ─── First-person hands ─────────────────────────────────────────────────────
const handsRoot = new THREE.Group();
camera.add(handsRoot);
const skinToon = toon('#e4b4a8');
const sleeveToon = toon('#d8c8d6');
const nailToon = toon('#f2d2ce');
function buildHand(side) {
  const hand = new THREE.Group();
  hand.position.set(side * .285, -.355, -.62);
  hand.rotation.set(-.2, -side * .12, side * .08);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.075, .06, .08, 16), sleeveToon);
  cuff.rotation.x = Math.PI / 2; cuff.position.z = .18; cuff.castShadow = false; hand.add(cuff);
  const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(.07, .28, 6, 14), sleeveToon);
  sleeve.rotation.x = Math.PI / 2; sleeve.position.z = .37; sleeve.castShadow = false; hand.add(sleeve);
  const palm = new THREE.Mesh(new RoundedBoxGeometry(.1, .048, .17, 3, .022), skinToon);
  palm.position.set(0, -.006, -.015); palm.castShadow = false; hand.add(palm);
  for (let i = 0; i < 4; i++) {
    const finger = new THREE.Group();
    finger.position.set((i - 1.5) * .023, -.002, -.1);
    const seg1 = new THREE.Mesh(new THREE.CapsuleGeometry(.0105, .06, 4, 8), skinToon);
    seg1.rotation.x = Math.PI / 2; seg1.position.z = -.035; finger.add(seg1);
    const seg2 = new THREE.Mesh(new THREE.CapsuleGeometry(.009, .045, 4, 8), skinToon);
    seg2.rotation.x = Math.PI / 2; seg2.position.set(0, -.004, -.083); seg2.rotation.z = -.08; finger.add(seg2);
    const nail = new THREE.Mesh(new THREE.SphereGeometry(.008, 8, 6), nailToon);
    nail.scale.set(.7, .25, 1); nail.position.set(0, .008, -.106); finger.add(nail);
    hand.add(finger);
  }
  const thumb = new THREE.Group();
  thumb.position.set(-side * .052, -.004, -.035);
  thumb.rotation.set(.22, side * .55, 0);
  const thumbMesh = new THREE.Mesh(new THREE.CapsuleGeometry(.012, .065, 4, 8), skinToon);
  thumbMesh.rotation.x = Math.PI / 2; thumbMesh.position.z = -.04; thumb.add(thumbMesh);
  hand.add(thumb);
  handsRoot.add(hand);
  return hand;
}
const handLeft = buildHand(-1);
const handRight = buildHand(1);
handsRoot.visible = false;

// ─── Interactable hotspots ─────────────────────────────────────────────────
const interactive = [];
function hotspot(name, label, x, y, z, radius = .55, parent = scene) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 10, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  marker.position.set(x, y, z);
  marker.userData = { name, label };
  parent.add(marker);
  interactive.push(marker);
  return marker;
}
hotspot('bed', 'присесть на край кровати', -3.95, .9, 1.72, 1.5);
hotspot('desk', 'коснуться монитора', 2.95, 1.15, -4.3, .9);
hotspot('window', 'посмотреть в окно', windowX, 2.55, -5.1, 1.3);
hotspot('shelf', 'провести по корешкам', 5.25, 1.4, -2.0, .9);
hotspot('lamp', 'включить или приглушить лампу', -5.15, 1.85, -.18, .58);
hotspot('guitar', 'тронуть струны', -5.1, 1.2, -3.8, .7);
hotspot('projector', 'зажечь звёзды', -4.05, 1.45, -5.25, .5);

// ─── Companion avatars ──────────────────────────────────────────────────────
const avatar = new THREE.Group();
avatar.position.set(0, 0, .2);
scene.add(avatar);
const girlRoot = new THREE.Group();
const boyRoot = new THREE.Group();
boyRoot.visible = false;
avatar.add(girlRoot, boyRoot);

const companionHotspot = new THREE.Mesh(
  new THREE.SphereGeometry(.58, 10, 8),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
);
companionHotspot.position.set(0, 1.0, 0);
companionHotspot.userData = { name: 'companion', label: 'заговорить' };
avatar.add(companionHotspot);
interactive.push(companionHotspot);

const characters = { girl: null, boy: null };
const state = {
  gender: localStorage.getItem('quiet-gender') === 'boy' ? 'boy' : 'girl',
  started: false,
  playerName: localStorage.getItem('quiet-name') || '',
  memories: [],
  lastActivity: Date.now(),
  mood: 'теплая задумчивость',
  action: 'idle',
  actionStart: 0,
  actionUntil: 0,
  talkUntil: 0,
  voiceOut: localStorage.getItem('quiet-voice') !== '0',
  idleIndex: 0,
  lastIdle: 0,
  blinkAt: performance.now() + 2600,
  blinkStart: -1,
  mouth: 0,
  typing: false,
  startedAt: 0
};
try {
  const saved = JSON.parse(localStorage.getItem('quiet-memories') || '[]');
  state.memories = Array.isArray(saved) ? saved.filter(item => item && typeof item.text === 'string').slice(-24) : [];
} catch (_) { state.memories = []; }

function colorizeTexture(source, tint, lift = 0) {
  if (!source || !source.image) return source;
  const image = source.image;
  const width = image.width || image.naturalWidth || 512;
  const height = image.height || image.naturalHeight || 512;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, width, height);
  try {
    const pixels = ctx.getImageData(0, 0, width, height);
    const d = pixels.data;
    const r = parseInt(tint.slice(1, 3), 16) / 255;
    const g = parseInt(tint.slice(3, 5), 16) / 255;
    const b = parseInt(tint.slice(5, 7), 16) / 255;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      let lum = (d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114) / 255;
      lum = clamp(Math.pow(lum, .72) * (1 - lift) + lift, 0, 1);
      d[i] = Math.round(lum * r * 255);
      d[i + 1] = Math.round(lum * g * 255);
      d[i + 2] = Math.round(lum * b * 255);
    }
    ctx.putImageData(pixels, 0, 0);
  } catch (_) {}
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = source.colorSpace;
  texture.flipY = source.flipY;
  texture.wrapS = source.wrapS;
  texture.wrapT = source.wrapT;
  texture.repeat.copy(source.repeat);
  texture.offset.copy(source.offset);
  texture.rotation = source.rotation;
  texture.center.copy(source.center);
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  texture.needsUpdate = true;
  return texture;
}

function makeToonMaterial(source, map, color, basic = false) {
  const options = {
    map,
    color,
    transparent: source.transparent,
    opacity: source.opacity,
    alphaTest: source.alphaTest,
    side: source.side,
    depthWrite: source.depthWrite,
    vertexColors: source.vertexColors
  };
  if (basic) return new THREE.MeshBasicMaterial(options);
  options.gradientMap = toonRamp;
  return new THREE.MeshToonMaterial(options);
}

function buildVRM(gltf, gender) {
  const vrm = gltf.userData.vrm;
  if (!vrm) throw new Error('VRM plugin did not return an avatar');
  vrm.scene.rotation.y = Math.PI;
  vrm.scene.traverse((object) => {
    if (!object.isMesh) return;
    const source = object.material;
    const name = source.name || '';
    const eyes = /Eye|Eyelash|Eyeline|Brow|Mouth|Highlight|FaceMouth/i.test(name);
    const hair = /Hair/i.test(name);
    const tops = /Tops/i.test(name);
    const bottoms = /Bottoms/i.test(name);
    const shoes = /Shoes/i.test(name);
    const keepOriginal = eyes || /_SKIN/i.test(name);
    let map = source.map || null;
    let color = '#ffffff';
    let visible = true;
    if (keepOriginal) {
      object.castShadow = false;
      object.receiveShadow = true;
      object.frustumCulled = false;
      return;
    }
    if (gender === 'girl') {
      if (hair) {
        map = colorizeTexture(source.map, '#4b67a6');
        color = '#ffffff';
      }
      if (tops) color = '#b94c63';
      if (shoes) color = '#b04259';
      if (bottoms) visible = false;
    } else {
      if (hair) {
        map = colorizeTexture(source.map, '#6b4a36', .1);
        color = '#ffffff';
      }
      if (tops) {
        map = colorizeTexture(source.map, '#a4abb8', .34);
        color = '#ffffff';
      }
      if (bottoms) {
        map = colorizeTexture(source.map, '#6178a6', .05);
        color = '#ffffff';
      }
      if (shoes) {
        map = colorizeTexture(source.map, '#737c8d', .04);
        color = '#ffffff';
      }
    }
    const material = makeToonMaterial(source, map, color, eyes);
    material.name = name;
    object.material = material;
    object.visible = visible;
    object.castShadow = !hair;
    object.receiveShadow = true;
    object.frustumCulled = false;
    if (source.map && source.map.colorSpace) source.map.colorSpace = THREE.SRGBColorSpace;
  });
  const root = gender === 'girl' ? girlRoot : boyRoot;
  root.add(vrm.scene);
  const h = vrm.humanoid;
  const bones = {};
  for (const name of ['head', 'neck', 'chest', 'spine', 'hips', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot']) {
    bones[name] = h.getNormalizedBoneNode(name);
  }
  const rawBones = {};
  for (const name of ['head', 'neck', 'chest', 'spine', 'hips', 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot']) {
    rawBones[name] = h.getRawBoneNode(name);
  }
  const controller = {
    gender, vrm, root, scene: vrm.scene, bones, rawBones,
    expressions: vrm.expressionManager,
    phase: Math.random() * 8,
    custom: null,
    visible: false
  };
  // Arms rest at the sides instead of the T-pose used by the source models.
  if (bones.leftUpperArm) {
    bones.leftUpperArm.rotation.set(0, 0, 1.2);
    bones.rightUpperArm.rotation.set(0, 0, -1.2);
    bones.leftLowerArm.rotation.set(-.2, 0, .08);
    bones.rightLowerArm.rotation.set(-.2, 0, -.08);
  }
  controller.rest = {};
  for (const [name, bone] of Object.entries(bones)) {
    if (bone) controller.rest[name] = bone.rotation.clone();
  }
  if (vrm.lookAt) {
    vrm.lookAt.target = camera;
    vrm.lookAt.autoUpdate = true;
  }
  vrm.update(.016);
  avatar.updateMatrixWorld(true);
  if (gender === 'girl') addMiraDetails(controller);
  else addLevDetails(controller);
  characters[gender] = controller;
  return controller;
}

function attachToBone(object, bone, worldOffset = new THREE.Vector3()) {
  const p = new THREE.Vector3();
  bone.getWorldPosition(p);
  object.position.copy(p).add(worldOffset);
  scene.add(object);
  scene.updateMatrixWorld(true);
  bone.attach(object);
  return object;
}

function addMiraDetails(controller) {
  const { rawBones } = controller;
  const cap = new THREE.Group();
  const capBlue = toon('#4a63a8');
  const capShade = toon('#354b80');
  const capPink = toon('#e6a4bb');
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20, 0, Math.PI * 2, 0, Math.PI * .5), capBlue);
  dome.scale.set(.132, .12, .142); dome.position.y = .05; dome.castShadow = true; cap.add(dome);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(.134, .136, .065, 32, 1, true), capShade);
  band.position.y = .023; band.castShadow = true; cap.add(band);
  const brim = new THREE.Mesh(
    new THREE.CylinderGeometry(.14, .14, .011, 30, 1, false, -Math.PI / 2, Math.PI),
    new THREE.MeshToonMaterial({ color: '#3c538e', gradientMap: toonRamp, side: THREE.DoubleSide })
  );
  brim.scale.z = 1.15;
  brim.position.set(0, .006, .068);
  brim.rotation.x = .2;
  brim.castShadow = true; cap.add(brim);
  const button = new THREE.Mesh(new THREE.SphereGeometry(.013, 12, 8), capShade);
  button.position.y = .173; cap.add(button);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(.048, .092, 4), capBlue);
    ear.scale.z = .5;
    ear.position.set(side * .066, .158, -.004);
    ear.rotation.z = side * .2; ear.rotation.y = Math.PI / 4; ear.castShadow = true; cap.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(.026, .058, 4), capPink);
    inner.scale.z = .4;
    inner.position.set(side * .063, .166, .018);
    inner.rotation.z = side * .2; inner.rotation.y = Math.PI / 4; cap.add(inner);
  }
  cap.traverse((part) => { if (part.isMesh) part.castShadow = false; });
  cap.scale.setScalar(.74);
  attachToBone(cap, rawBones.head, new THREE.Vector3(0, .15, .015));
  controller.custom = { cap };

  // Knee-length pleated skirt, built as a rippled ring and attached to the hips.
  if (rawBones.hips) {
    const segments = 80;
    const positions = [], indices = [], uvs = [];
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI * 2;
      const pleat = (i % 4 < 2 ? 1 : -1);
      const fade = Math.min(1, i / 4, (segments - i) / 4);
      const topR = .172 + pleat * .004 * fade;
      const bottomR = .242 + pleat * .014 * fade;
      positions.push(Math.cos(a) * topR, .035, Math.sin(a) * topR);
      positions.push(Math.cos(a) * bottomR, -.335, Math.sin(a) * bottomR);
      uvs.push(i / segments, 1, i / segments, 0);
      if (i < segments) {
        const n = i * 2;
        indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const skirt = new THREE.Group();
    const skirtMesh = new THREE.Mesh(geometry, toon('#3c5796', { side: THREE.DoubleSide }));
    skirtMesh.castShadow = true; skirt.add(skirtMesh);
    const waistband = new THREE.Mesh(new THREE.CylinderGeometry(.174, .177, .048, 40, 1, true), toon('#2b3f6f', { side: THREE.DoubleSide }));
    waistband.position.y = .05; waistband.castShadow = true; skirt.add(waistband);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(.168, .218, .3, 32, 1, true), toon('#263660', { side: THREE.DoubleSide }));
    inner.position.y = -.13; skirt.add(inner);
    attachToBone(skirt, rawBones.hips, new THREE.Vector3(0, .0, 0));
    controller.custom.skirt = skirt;
  }

  // Red knee socks layered over the source tights.
  const socks = [];
  for (const side of ['left', 'right']) {
    const kneeBone = rawBones[side + 'LowerLeg'];
    const footBone = rawBones[side + 'Foot'];
    if (!kneeBone || !footBone) continue;
    const knee = new THREE.Vector3(); kneeBone.getWorldPosition(knee);
    const ankle = new THREE.Vector3(); footBone.getWorldPosition(ankle);
    const up = tmpVector.copy(knee).sub(ankle);
    const length = up.length() * .88;
    if (length < .1) continue;
    up.normalize();
    const sock = new THREE.Group();
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(.061, .052, length, 18, 1, true), toon('#b84057', { side: THREE.DoubleSide }));
    cylinder.castShadow = true; sock.add(cylinder);
    const band = new THREE.Mesh(new THREE.TorusGeometry(.059, .007, 6, 18), toon('#f7e4e5'));
    band.rotation.x = Math.PI / 2; band.position.y = length / 2 - .025; sock.add(band);
    const band2 = band.clone(); band2.position.y -= .035; sock.add(band2);
    sock.position.copy(knee).add(ankle).multiplyScalar(.5);
    sock.quaternion.setFromUnitVectors(Y_AXIS, up);
    scene.add(sock); scene.updateMatrixWorld(true);
    kneeBone.attach(sock);
    socks.push(sock);
  }
  controller.custom.socks = socks;
}

function addLevDetails(controller) {
  const chest = controller.rawBones.chest;
  if (!chest) return;
  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(.17, .17),
    new THREE.MeshBasicMaterial({
      map: makeCanvasTexture(256, 256, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(238,235,242,.92)';
        ctx.fillStyle = 'rgba(238,235,242,.92)';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(w / 2, h * .56, 56, Math.PI, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w * .36, h * .56); ctx.lineTo(w * .4, h * .25); ctx.lineTo(w * .53, h * .42); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(w * .64, h * .56); ctx.lineTo(w * .6, h * .25); ctx.lineTo(w * .47, h * .42); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#d990a4';
        ctx.beginPath(); ctx.arc(w * .42, h * .53, 7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(w * .58, h * .53, 7, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(238,235,242,.75)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(w * .35, h * .62); ctx.lineTo(w * .15, h * .59); ctx.moveTo(w * .35, h * .66); ctx.lineTo(w * .16, h * .7); ctx.moveTo(w * .65, h * .62); ctx.lineTo(w * .85, h * .59); ctx.moveTo(w * .65, h * .66); ctx.lineTo(w * .84, h * .7); ctx.stroke();
      }),
      transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    })
  );
  decal.renderOrder = 2;
  attachToBone(decal, chest, new THREE.Vector3(0, .045, .19));
  controller.custom = { decal };
}

let loadedCount = 0;
let totalProgress = 0;
function loadAvatar(gender) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const url = gender === 'girl' ? './assets/mira.vrm' : './assets/lev.vrm';
    loader.load(url, (gltf) => {
      try {
        const controller = buildVRM(gltf, gender);
        loadedCount++;
        updateLoading(1, gender);
        markReady(gender);
        resolve(controller);
      } catch (error) { reject(error); }
    }, (event) => {
      if (event.total) totalProgress = Math.max(totalProgress, event.loaded / event.total);
      updateLoading(totalProgress * .92, gender);
    }, reject);
  });
}

// ─── Interface, memory and dialogue ────────────────────────────────────────
const els = {
  line: $('#line'), speaker: $('#speaker'), mood: $('#mood'), voiceState: $('#voiceState'),
  input: $('#msg'), mic: $('#mic'), companionLabel: $('#companionLabel'),
  start: $('#start'), help: $('#help'), fatal: $('#fatal'), fatalText: $('#fatalText'),
  loadBar: $('#loadBar'), loadStatus: $('#loadStatus'), toast: $('#toast'),
  interact: $('#interact'), interactLabel: $('#interactLabel'), crosshair: $('#crosshair'),
  dialog: $('#dialog')
};
const startButtons = $$('.choose-card');
let audioContext = null;

function updateLoading(progress, gender) {
  const p = clamp(progress, 0, 1);
  const known = Object.values(characters).filter(Boolean).length;
  els.loadBar.style.width = Math.max(8, known >= 2 ? 100 : known ? 68 : Math.round(p * 58)) + '%';
  if (known >= 2) els.loadStatus.textContent = 'комната дышит';
  else if (known === 1) els.loadStatus.textContent = 'один голос уже здесь…';
  else if (gender === 'girl') els.loadStatus.textContent = 'загружаю Миру…';
  else els.loadStatus.textContent = 'загружаю Льва…';
}
function markReady(gender) {
  const button = startButtons.find(button => button.dataset.start === gender);
  if (button) {
    button.disabled = false;
    button.classList.add('ready');
  }
  const known = Object.values(characters).filter(Boolean).length;
  loadedCount = known;
  if (known >= 2) {
    els.loadBar.style.width = '100%';
    els.loadStatus.textContent = 'комната дышит';
  } else if (known === 1) {
    els.loadBar.style.width = '68%';
  }
}
function showFatal(message) {
  els.fatalText.textContent = message;
  els.fatal.classList.add('open');
}
function toast(message, duration = 2600) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove('show'), duration);
}
function saveState() {
  try {
    localStorage.setItem('quiet-gender', state.gender);
    localStorage.setItem('quiet-name', state.playerName);
    localStorage.setItem('quiet-memories', JSON.stringify(state.memories.slice(-24)));
    localStorage.setItem('quiet-voice', state.voiceOut ? '1' : '0');
  } catch (_) {}
}
function remember(text) {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 240);
  if (!clean) return;
  state.memories.push({ text: clean, at: Date.now() });
  if (state.memories.length > 24) state.memories = state.memories.slice(-24);
  saveState();
}
function characterName(gender = state.gender) {
  return gender === 'girl' ? 'Мира' : 'Лев';
}
function characterMoodDefault(gender = state.gender) {
  return gender === 'girl' ? 'теплая задумчивость' : 'сухая нежность';
}
function updateChrome() {
  els.speaker.textContent = characterName().toUpperCase();
  els.companionLabel.textContent = characterName().toUpperCase();
  els.mood.textContent = state.mood;
  els.voiceState.textContent = state.voiceOut ? 'голос включён · V' : 'голос выключен · V';
  els.voiceState.classList.toggle('off', !state.voiceOut);
}
function setMood(mood) {
  state.mood = mood;
  els.mood.textContent = mood;
}
function startAction(action, duration = 3000) {
  state.action = action;
  state.actionStart = performance.now();
  state.actionUntil = state.actionStart + duration;
  state.actionDuration = duration;
}
function animateLine(text) {
  els.line.classList.remove('changing');
  void els.line.offsetWidth;
  els.line.textContent = text;
  els.line.classList.add('changing');
}
function say(text, options = {}) {
  const now = performance.now();
  animateLine(text);
  setMood(options.mood || characterMoodDefault());
  state.lastActivity = Date.now();
  state.talkUntil = now + Math.min(7600, 1000 + text.length * 48);
  startAction(options.action || 'talk', options.duration || Math.min(6200, 1600 + text.length * 30));
  if (state.voiceOut) speak(text);
}
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ru-RU';
  utterance.rate = state.gender === 'girl' ? .95 : .9;
  utterance.pitch = state.gender === 'girl' ? 1.06 : .88;
  const voices = window.speechSynthesis.getVoices();
  const russian = voices.find(v => /^ru(-|_)/i.test(v.lang));
  if (russian) utterance.voice = russian;
  utterance.onstart = () => { state.speaking = true; };
  utterance.onend = () => { state.speaking = false; };
  utterance.onerror = () => { state.speaking = false; };
  window.speechSynthesis.speak(utterance);
}
function toggleVoice() {
  state.voiceOut = !state.voiceOut;
  if (!state.voiceOut) window.speechSynthesis?.cancel();
  saveState();
  updateChrome();
  toast(state.voiceOut ? 'Голос включён. V — выключить.' : 'Голос выключен. V — включить.');
}

function setActiveCharacter(gender, quiet = false) {
  if (!characters[gender]) return;
  window.speechSynthesis?.cancel();
  state.gender = gender;
  state.activeCharacter = characters[gender];
  state.action = 'idle';
  state.actionUntil = 0;
  girlRoot.visible = gender === 'girl';
  boyRoot.visible = gender === 'boy';
  avatar.visible = state.started;
  state.mood = characterMoodDefault(gender);
  state.lastActivity = Date.now();
  state.lastIdle = Date.now();
  updateChrome();
  saveState();
  if (!quiet) {
    const switchingLine = gender === 'girl'
      ? 'Я вернулась. Лев оставил на столе чашку — значит, он тоже был здесь. А ты всё это время смотрел(а) в одну точку. О чём думал(а)?'
      : 'Я сменил её. Не спрашивай, где Мира, — пошла искать свою кепку. Пока её нет, могу я предложить тебе что-нибудь менее поэтичное?';
    say(switchingLine, { mood: characterMoodDefault(gender), action: 'talk' });
  }
}

function introLine(gender = state.gender) {
  const last = state.memories[state.memories.length - 1];
  const who = state.playerName ? `${state.playerName}, ` : '';
  if (last && last.text.length > 12) {
    return gender === 'girl'
      ? `${who}ты в прошлый раз сказал(а): «${quoteSnippet(last.text, 54)}». Я оставила это на подоконнике — дождь не смыл. Окно всё ещё открыто.`
      : `${who}помню, ты сказал(а): «${quoteSnippet(last.text, 54)}». Я не выключал монитор. Чайник ещё тёплый.`;
  }
  if (gender === 'girl') {
    return `${who}я оставила окно приоткрытым. Дождь стучит по карнизу, будто просится в комнату, — а я всё равно не закрываю.`;
  }
  return `${who}твой монитор до сих пор светится. Я не выключил — решил, что ты вернёшься. Чайник на кухне, кстати.`;
}
function phraseForName(name) {
  return state.gender === 'girl'
    ? `Значит, ${name}. Я произнесла про себя — звучит так, будто это имя можно оставить на подоконнике вместе с чашкой.`
    : `Хорошо, ${name}. Запомнил. Если забуду — называй меня «эй», и я сразу пойму, что облажался.`;
}
function memoryReference(text, gender = state.gender) {
  if (!text || text.length < 12) return '';
  const quote = text.replace(/[.!?…]+$/, '').slice(0, 74);
  return gender === 'girl'
    ? `Ты говорил(а): «${quote}». Я тогда не переспросила. Теперь жалею. Что за этим было?`
    : `Ты говорил(а): «${quote}». Я тогда промолчал. Сейчас думаю, что зря.`;
}

const generalMira = [
  'Я слушаю. Не выпрямляй историю — мне интересны углы, которые в ней остались.',
  'Вот сейчас ты говоришь тише. Не из-за меня — просто мысль тяжёлая. Не спеши.',
  'Мне нравится, когда человек не пытается звучать правильно. Так честнее.',
  'Оставь это здесь. Комната умеет хранить то, что мы не готовы носить с собой.',
  'Иногда мне кажется, что слова — только тени. Но твои почему-то оставляют след.',
  'Я не всегда понимаю людей. Но тебя хочется понимать медленно.',
  'Ты сейчас сказал(а) важнее, чем сам(а) думаешь. Я не буду делать вид, что не заметила.'
];
const generalLev = [
  'Не пересказывай гладко. Я лучше слушаю, когда в истории есть заусенцы.',
  'Ты сейчас сказал(а) меньше, чем собирался(ась). Это нормально. Я не тяну за язык.',
  'Я не мастер утешать. Зато умею не уходить, когда становится неловко.',
  'Хочешь совет — дам. Хочешь, чтобы просто выслушал, — скажу «ага» и не буду лезть. Выбирай.',
  'Такие вещи не решаются за один вечер. Но за один вечер можно перестать быть с ними один на один.',
  'Мне нравится ход твоих мыслей. Он неудобный, но живой.',
  'Давай так: ты говоришь, я не перебиваю. Потом могу сказать что-то непрошеное — но только если попросишь.'
];
const sadMira = [
  'Тогда не будем делать вид, что всё в порядке. Поставь чашку на пол, сядь как получится. Я не стану гладить тебя по голове и обещать, что завтра будет легче. Но я побуду рядом, пока внутри не станет тише.',
  'Усталость иногда приходит без причины. Это не слабость и не поломка. Просто ты давно держишь слишком много дверей закрытыми.',
  'Если тяжело говорить, скажи одно слово. Остальное я попробую услышать в паузах.',
  'Я не исчезну от того, что ты сейчас не в форме. Мне можно показать и такую версию тебя.'
];
const sadLev = [
  'Не буду просить улыбнуться. Скажи, нужна помощь или просто посидеть. Я умею быть рядом без сценария.',
  'Ты выглядишь так, будто сегодня держал(а) небо на плечах. Оно не упадёт, если опустишь на минуту.',
  'Я не умею лечить. Зато умею ставить чайник и молчать так, чтобы это не давило.',
  'Давай без философии. Что нужно прямо сейчас: чай, тишина или чтобы я просто был здесь?'
];
const happyMira = [
  'В такие дни мне хочется стащить тебя с этого вечера и спрятать в карман. Что именно случилось?',
  'Хорошо. Значит, сегодня можно быть чуть менее осторожной. Расскажи, из-за чего у тебя сейчас такое лицо.',
  'Мне нравится, когда радость застаёт тебя врасплох. Она тогда настоящая, без позы.'
];
const happyLev = [
  'Хорошо. Тогда сегодня никакой продуктивности. Что тебя так зацепило?',
  'Хорошие дни надо тратить на что-то бессмысленное. Пойдём, придумаем, чем заняться.',
  'Ты сейчас улыбнулся(ась) раньше, чем понял(а), что улыбаешься. Это лучшее, что я видел(а) за день.'
];
const idleMira = [
  'Знаешь, я сегодня думала о том, как странно устроена память: помнишь запах, а лицо уже стирается. Вот почему я запоминаю мелочи вроде твоей чашки.',
  'Тишина у тебя сегодня другая. Не плохая. Просто будто ты стараешься не занимать слишком много места. Со мной можно занимать.',
  'Я нашла на полке старую открытку. На ней написано «вернись, когда станет тише». Я не помню, кто её подписал.',
  'Обними меня, а то что-то холодно без причины. Только не спрашивай, откуда холод, — я сама не знаю.'
];
const idleLev = [
  'Знаешь, в чём проблема взрослых? Мы разучились удивляться. А я вот до сих пор радуюсь, когда снег первый.',
  'Ты молчишь уже минуту. Это нормально. Просто я проверяю, не выпал ли ты из реальности.',
  'Я поставил чайник. Он шумит громче, чем мы оба. Если хочешь, сделаем вид, что это музыка.',
  'На потолке опять эти звёзды. В детстве я думал, что они настоящие. Взрослым я стал только в паспорте.'
];
const idleMiraActions = ['story', 'talk', 'story', 'hug'];
const idleLevActions = ['talk', 'talk', 'tea', 'story'];

function idleSay() {
  const now = Date.now();
  if (!state.started || state.thinking || state.listening) return;
  if (now - state.lastActivity < 30000 || now - state.lastIdle < 30000) return;
  if (isTyping() || anyOverlayOpen() || state.speaking) return;
  state.lastIdle = now;
  state.lastActivity = now;
  const list = state.gender === 'girl' ? idleMira : idleLev;
  const actions = state.gender === 'girl' ? idleMiraActions : idleLevActions;
  const index = state.idleIndex++ % list.length;
  const action = actions[index] || 'talk';
  say(list[index], { mood: state.gender === 'girl' ? 'тихая нежность' : 'сухая нежность', action, duration: action === 'hug' ? 4200 : 5200 });
  if (action === 'tea') {
    deskGlow.intensity = 13;
    setTimeout(() => { deskGlow.intensity = 6; }, 2200);
  }
}

// ─── Voice input ────────────────────────────────────────────────────────────
state.lastLines = {};
state.askedName = false;
state.listening = false;
state.thinking = false;
state.lastHotspot = null;
state.handsUntil = 0;
state.handAction = '';
state.lampOn = true;
state.starsOn = false;

function isTyping() {
  return document.activeElement === els.input || els.input.value.trim().length > 0;
}
function anyOverlayOpen() {
  return els.start.classList.contains('open') || els.help.classList.contains('open') || els.fatal.classList.contains('open');
}
function requestInputFocus() {
  if (!state.started || anyOverlayOpen()) return;
  if (document.pointerLockElement) document.exitPointerLock();
  els.input.focus({ preventScroll: true });
  document.body.classList.add('dialog-open');
  state.lastActivity = Date.now();
}
function dropInputFocus() {
  if (document.activeElement === els.input) els.input.blur();
  document.body.classList.remove('dialog-open');
}
function recognitionError(code) {
  const messages = {
    'not-allowed': 'Микрофон не разрешён. Разреши доступ в адресной строке — или просто напиши, я прочитаю.',
    'service-not-allowed': 'Браузер закрыл микрофон. Разреши доступ в настройках сайта — или напиши текстом.',
    'audio-capture': 'Микрофон не найден. Проверь, что он подключён, — или скажи текстом.',
    'no-speech': 'Я не расслышала ни слова. Попробуй ещё раз или напиши.',
    'network': 'Распознавание не добралось до сети. Напиши — так надёжнее.',
    'aborted': ''
  };
  toast(messages[code] || 'Микрофон сегодня не в настроении. Напиши, я прочитаю.');
}
function stopListening() {
  if (!state.listening) return;
  try { window.__quietRecognition?.stop(); } catch (_) {}
  state.listening = false;
  els.mic.classList.remove('listening');
}
function toggleListening() {
  if (!state.started || anyOverlayOpen()) return;
  if (state.listening) { stopListening(); return; }
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    toast('Этот браузер не умеет слушать микрофон. Можно написать — я всё равно услышу.');
    return;
  }
  window.speechSynthesis?.cancel();
  requestInputFocus();
  let finalText = '';
  let failed = false;
  const recognition = new Recognition();
  window.__quietRecognition = recognition;
  recognition.lang = 'ru-RU';
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    state.listening = true;
    state.lastActivity = Date.now();
    els.mic.classList.add('listening');
    toast('Слушаю. Говори чуть ближе к микрофону.');
  };
  recognition.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0]?.transcript || '';
      if (event.results[i].isFinal) final += transcript;
      else interim += transcript;
    }
    if (final) {
      finalText = final.trim();
      els.input.value = finalText;
    } else if (interim) {
      els.input.value = interim.trim();
    }
  };
  recognition.onerror = (event) => {
    failed = true;
    state.listening = false;
    els.mic.classList.remove('listening');
    if (event.error !== 'aborted') recognitionError(event.error);
  };
  recognition.onend = () => {
    state.listening = false;
    els.mic.classList.remove('listening');
    window.__quietRecognition = null;
    if (failed) return;
    const heard = (finalText || els.input.value).trim();
    if (!heard) {
      toast('Тишина. Попробуй ещё раз — или напиши.');
      return;
    }
    if (finalText) {
      els.input.value = '';
      sendMessage(heard, { voice: true });
    } else {
      toast('Вот что я расслышала. Поправь, если нужно, и нажми Enter.');
      requestInputFocus();
    }
  };
  try {
    recognition.start();
  } catch (error) {
    state.listening = false;
    els.mic.classList.remove('listening');
    toast('Микрофон не запустился. Напиши — я рядом.');
  }
}

// ─── Memory and dialogue composition ───────────────────────────────────────
const nameStops = new Set([
  'не', 'нет', 'просто', 'очень', 'здесь', 'там', 'тебя', 'тебе', 'твой', 'твоя',
  'устал', 'устала', 'грустно', 'хорошо', 'нормально', 'всё', 'все', 'опять', 'снова',
  'человек', 'девушка', 'парень', 'тоже', 'ещё', 'еще', 'уже', 'так', 'это'
]);
function cleanName(value) {
  const name = value
    .replace(/[^A-Za-zА-Яа-яЁё-]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  if (name.length < 2 || nameStops.has(name.toLowerCase())) return null;
  return name.charAt(0).toUpperCase() + name.slice(1);
}
function extractName(text) {
  const direct = text.match(/(?:меня\s+зовут|зови\s+меня|мо[её]\s+имя(?:\s*[—:-]\s*|\s+))\s*([A-Za-zА-Яа-яЁё-]{2,24})/i);
  if (direct) return cleanName(direct[1]);
  const short = text.match(/^\s*я\s+([A-ZА-ЯЁ][A-Za-zА-Яа-яЁё-]{1,23})(?:[\s,.!?…]|$)/u);
  if (short) return cleanName(short[1]);
  return null;
}
function rememberName(name) {
  if (!name) return;
  state.playerName = name;
  saveState();
}
function chooseLine(key, lines) {
  const last = state.lastLines[key];
  const fresh = lines.filter(line => line !== last);
  const line = pick(fresh.length ? fresh : lines);
  state.lastLines[key] = line;
  return line;
}
function quoteSnippet(text, max = 72) {
  let clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  clean = clean.slice(0, max);
  const cut = clean.lastIndexOf(' ');
  return (cut > max * .55 ? clean.slice(0, cut) : clean).trim() + '…';
}
function address(gender = state.gender) {
  return gender === 'girl' ? 'Мира' : 'Лев';
}

const flirtMira = [
  'Осторожно. Я запоминаю такие слова лучше, чем названия созвездий. Потом не отшутишься.',
  'Скажи это ещё раз, но медленнее. Мне нужно проверить, что я не придумала интонацию.',
  'Ты сейчас смотришь так, будто в комнате стало на один градус теплее. Я не против. Только не делай вид, что это случайность.',
  'Я не против, чтобы ты остался(ась) чуть дольше положенного. Только не превращай это в обещание, которое забудешь к утру.'
];
const flirtLev = [
  'Ты сейчас сказал(а) это без иронии. Я оценил. И, кажется, покраснел — только не говори никому.',
  'Осторожно. Так можно привыкнуть, что кто-то ждёт тебя в комнате с включённым светом.',
  'Я не силён в красивых словах. Но твои, кажется, работают. Это немного нечестно.',
  'Иди сюда, расскажу кое-что, но это между нами: я рад(а), что ты не ушёл(ла) сразу.'
];
const howMira = [
  'Странно и хорошо одновременно. Я весь день собирала слова, а теперь они лежат не в том порядке. Но ты пришёл(ла) — и беспорядок стал уютнее.',
  'Как человек, который приоткрыл окно и забыл, зачем. Дождь всё решил за меня. А ты?',
  'Сегодня во мне больше тишины, чем обычно. Не грустной — просто такой, которую нужно кому-то показать.'
];
const howLev = [
  'Нормально. Если честно — устал держать лицо. Ты вовремя.',
  'Как чайник, который никак не закипит. Шумлю, но пока не горячий. Сам(а) как?',
  'Сегодня я на удивление спокойный. Наверное, потому что никто не просил меня быть продуктивным.'
];
const greetingMira = [
  'Привет. Только не спрашивай, как дела, — я расскажу не «нормально», а про дождь, который до сих пор не решил, стучать или просто смотреть.',
  'Ты пришёл(ла). Хорошо. Я как раз думала, что этот вечер слишком тихий, чтобы проводить его одной.',
  'Здравствуй. Я оставила для тебя свет у стола. Не потому, что ждала, — просто с ним комната меньше похожа на пустую.'
];
const greetingLev = [
  'Привет. Чайник ещё не остыл. Садись, только не на подлокотник.',
  'О, живой человек. Заходи. Я уже начал разговаривать с чашкой, а она не очень поддерживает беседу.',
  'Здравствуй. Я не ждал(а), но дверь оставил(а) открытой. На всякий случай.'
];

function composeReply(text, pastMemory = null) {
  const lower = text.toLowerCase();
  const raw = text.trim();
  const isGirl = state.gender === 'girl';
  const named = extractName(raw);
  if (named) {
    rememberName(named);
    return {
      text: phraseForName(named) + ' Теперь это не просто звук. Это ты.',
      mood: isGirl ? 'мягкое узнавание' : 'спокойное узнавание',
      action: 'talk',
      duration: 5200
    };
  }

  if (/как\s+меня\s+зовут|помнишь.*(?:мо[её]\s+имя|как\s+меня)|знаешь.*(?:мо[её]\s+имя|как\s+меня)/i.test(lower)) {
    if (state.playerName) {
      return {
        text: isGirl
          ? `${state.playerName}. Я не подсматривала — ты сам(а) сказал(а). И я оставила это имя в памяти рядом с дождём.`
          : `${state.playerName}. Помню. Я вообще-то памятью не хвастаюсь, но это имя не потерял.`,
        mood: isGirl ? 'тёплая уверенность' : 'сухая уверенность',
        action: 'talk'
      };
    }
    return {
      text: isGirl
        ? 'Пока никак. Ты не представился(ась), а я не люблю придумывать людям имена без спроса. Скажи «меня зовут…» — и я запомню.'
        : 'Пока безымянный. Ты не сказал(а). Я не угадываю — я запоминаю. Скажи «меня зовут…».',
      mood: isGirl ? 'лукавая нежность' : 'ровный интерес',
      action: 'talk'
    };
  }

  if (/как\s+(?:тебя\s+зовут|тво[её]\s+имя)|кто\s+ты|расскажи\s+о\s+себе/i.test(lower)) {
    return {
      text: isGirl
        ? 'Мира. Мне девятнадцать, если считать по паспорту, и гораздо больше, если по количеству вечеров, которые я здесь провела. Дождь, старые открытки, чужие истории — вот из чего я собрана.'
        : 'Лев. Мне двадцать один, если считать по паспорту. Люблю чай, тишину и вещи, которые не надо объяснять. Не люблю, когда уходят, не попрощавшись.',
      mood: isGirl ? 'тихое представление' : 'сухая нежность',
      action: 'talk'
    };
  }

  if (/помнишь|что\s+я\s+(?:говорил|рассказывал)|о\s+ч[её]м\s+я|что\s+ты\s+знаешь\s+обо\s+мне/i.test(lower)) {
    if (pastMemory) {
      return {
        text: isGirl
          ? `Помню: «${quoteSnippet(pastMemory.text)}». Я не записываю в блокнот — просто некоторые твои слова остаются на подкорке. Что в них было главным?`
          : `Помню: «${quoteSnippet(pastMemory.text)}». Дословно, может, и нет, но суть не потерял. Что ты хотел(а) к этому добавить?`,
        mood: isGirl ? 'сосредоточенная нежность' : 'внимательный покой',
        action: 'listen'
      };
    }
    return {
      text: isGirl
        ? 'Пока у меня только этот вечер: дождь, открытое окно и ты. Но я уже запоминаю. Начни с чего-нибудь, что стоит помнить.'
        : 'Пока только этот вечер. Но я уже слушаю. Скажи что-нибудь, что не хотел(а) бы оставлять на потом.',
      mood: isGirl ? 'открытая тишина' : 'ровная тишина',
      action: 'talk'
    };
  }

  if (/как\s+(?:ты|дела|сам[ао]?|настроение)|что\s+нового|у\s+тебя\s+всё\s+хорошо/i.test(lower)) {
    return {
      text: chooseLine(isGirl ? 'howGirl' : 'howBoy', isGirl ? howMira : howLev),
      mood: isGirl ? 'тихая откровенность' : 'усталая честность',
      action: 'talk'
    };
  }

  if (/груст|плохо|тяжел|устал|одинок|тревог|болит|плак|нет\s+сил|депресс|страшно|паник|не\s+могу/i.test(lower)) {
    const line = chooseLine(isGirl ? 'sadGirl' : 'sadBoy', isGirl ? sadMira : sadLev);
    return {
      text: line,
      mood: isGirl ? 'тихая грусть' : 'ровная серьёзность',
      action: 'listen',
      duration: 6200
    };
  }

  if (/рад|счаст|получил|получилось|хорошо|смеш|весел|удалось|наконец/i.test(lower)) {
    return {
      text: chooseLine(isGirl ? 'happyGirl' : 'happyBoy', isGirl ? happyMira : happyLev),
      mood: isGirl ? 'тёплая улыбка' : 'сдержанная улыбка',
      action: 'talk',
      duration: 5200
    };
  }

  if (/обними|обнять|обнимаш/i.test(lower)) {
    return {
      text: isGirl
        ? 'Иди сюда. Только не говори, что не замёрз(ла), — я слышу, как ты держишь плечи. Вот так. Пять секунд можно ничего не объяснять.'
        : 'Иди. Без комментариев. Я просто постою рядом, пока ты не решишь, что достаточно.',
      mood: isGirl ? 'близкая нежность' : 'тихая забота',
      action: 'hug',
      duration: 5400
    };
  }

  if (/станцу|потанцу|танец/i.test(lower)) {
    return {
      text: isGirl
        ? 'Только не смотри так внимательно, а то забуду движения. Вот. Это был не танец, а способ согреться — но с тобой пусть будет танцем.'
        : 'Я танцую как человек, который ремонтировал шкаф. Но если тебе смешно — считай, уже выступление. Не отходи, я ещё не закончил.',
      mood: isGirl ? 'игривая нежность' : 'ироничная теплота',
      action: 'dance',
      duration: 6400
    };
  }

  if (/чай|чаю|горяч/i.test(lower)) {
    return {
      text: isGirl
        ? 'Сейчас. Только не думай, что чай решает всё. Он просто даёт рукам занятие, пока внутри становится тише.'
        : 'Уже ставлю. Зелёный, без сахара, как ты любишь. Ну, или как я решил(а), что ты любишь.',
      mood: isGirl ? 'домашняя нежность' : 'ровная забота',
      action: 'tea',
      duration: 4800
    };
  }

  if (/спой|песн|голос/i.test(lower)) {
    return {
      text: isGirl
        ? 'Я не пою при людях. Но могу рассказать тихо, почти на выдохе: был вечер, было окно, и кто-то не уходил. Дальше ты сам(а) придумай мотив.'
        : 'Петь? Я лучше расскажу. Голос у меня как у несмазанной двери, зато слова честные.',
      mood: isGirl ? 'интимная тишина' : 'ироничная нежность',
      action: 'story',
      duration: 5600
    };
  }

  if (/люблю|нрав|скуча|красив|поцел|флирт|сердц|свидан/i.test(lower)) {
    return {
      text: chooseLine(isGirl ? 'flirtGirl' : 'flirtBoy', isGirl ? flirtMira : flirtLev),
      mood: isGirl ? 'лукавая нежность' : 'сдержанный флирт',
      action: 'talk'
    };
  }

  if (/^(?:привет|здравств|добрый\s+(?:вечер|день)|хай|hello)|(?:привет|здравств)[,!.\s]*$/i.test(lower)) {
    return {
      text: chooseLine(isGirl ? 'greetGirl' : 'greetBoy', isGirl ? greetingMira : greetingLev),
      mood: isGirl ? 'тёплый вечер' : 'спокойный вечер',
      action: 'talk'
    };
  }

  if (/пока|до\s+свидания|мне\s+пора|ухожу/i.test(lower)) {
    return {
      text: isGirl
        ? 'Иди. Только дверь не хлопай — я не люблю резких звуков. И знаешь… оставь свет включённым. Я потом досижу тут немного.'
        : 'Иди. Я не буду держать. Только куртку возьми — на улице холоднее, чем кажется из окна.',
      mood: isGirl ? 'тихая печаль' : 'спокойная забота',
      action: 'talk'
    };
  }

  if (/спасибо|благодар/i.test(lower)) {
    return {
      text: isGirl
        ? 'Не благодари. Я не сделала ничего героического — просто была здесь. Иногда это всё, что нужно.'
        : 'Не за что. Я не из тех, кто считает добрые дела. Просто остался(ась) рядом.',
      mood: isGirl ? 'мягкая неловкость' : 'ровная нежность',
      action: 'talk'
    };
  }

  if (/что\s+(?:ты\s+)?делаешь|чем\s+занят/i.test(lower)) {
    return {
      text: isGirl
        ? 'Слушаю, как остывает чай, и перекладываю одну и ту же открытку с места на место. Не спрашивай, зачем. У меня есть версия, что так я разговариваю с прошлым.'
        : 'Ничего полезного. Смотрю в потолок и делаю вид, что это медитация. Хочешь присоединиться?',
      mood: isGirl ? 'рассеянная нежность' : 'ленивый покой',
      action: 'talk'
    };
  }

  if (/о\s+ч[её]м\s+(?:ты\s+)?думаешь|мысли/i.test(lower)) {
    return {
      text: isGirl
        ? 'О том, что память хранит не лица, а запахи и углы. Вот этот вечер я запомню по свету на твоих руках. Это странно?'
        : 'О том, что взрослые слишком старательно делают вид, что у них всё под контролем. И о чае. В основном о чае.',
      mood: isGirl ? 'задумчивая нежность' : 'ироничная задумчивость',
      action: 'talk'
    };
  }

  const snippet = quoteSnippet(raw, 76);
  let reply;
  if (/\?$/.test(raw) || /\?/.test(raw)) {
    reply = isGirl
      ? `«${snippet}» — хороший вопрос. У меня нет готового ответа, и я не буду делать вид, что есть. Но я думаю, что тебе важно не услышать «да» или «нет», а чтобы кто-то не отвёл взгляд.`
      : `«${snippet}» — я мог(ла) бы ответить коротко. Но тогда ты не узнаешь, что я на самом деле думаю. Мне кажется, тебе нужен не ответ, а разговор.`;
  } else {
    reply = isGirl
      ? `«${snippet}» — я оставила это на минуту в голове. В таких фразах всегда есть второй слой. Расскажи, что под ним.`
      : `«${snippet}» — понял. Я не буду делать вид, что это ерунда, и не буду сразу чинить. Продолжай.`;
  }
  const general = chooseLine(isGirl ? 'generalGirl' : 'generalBoy', isGirl ? generalMira : generalLev);
  reply += ' ' + general;
  if (!state.playerName && !state.askedName) {
    state.askedName = true;
    reply += isGirl
      ? ' Кстати, назови себя. Я не хочу потом пересказывать этот вечер человеку без имени.'
      : ' И имя скажи. А то так и буду звать тебя «эй» — а это не по-дружески.';
  } else if (pastMemory && Math.random() < .3) {
    reply += isGirl
      ? ` Ты раньше сказал(а): «${quoteSnippet(pastMemory.text, 54)}». Сейчас это звучит иначе — или мне только кажется.`
      : ` И ещё, я не забыл: «${quoteSnippet(pastMemory.text, 54)}». Просто ждал, когда ты сам(а) к этому вернёшься.`;
  }
  return {
    text: reply,
    mood: isGirl ? 'внимательная нежность' : 'ровное внимание',
    action: 'talk',
    duration: 5800
  };
}

function sendMessage(raw, options = {}) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 420);
  if (!text || !state.started) return;
  const pastMemory = state.memories.length ? state.memories[state.memories.length - 1] : null;
  const reply = composeReply(text, pastMemory);
  if (!options.voice) remember(text);
  else remember(text);
  els.input.value = '';
  state.thinking = true;
  state.lastActivity = Date.now();
  clearTimeout(sendMessage.timer);
  sendMessage.timer = setTimeout(() => {
    state.thinking = false;
    say(reply.text, {
      mood: reply.mood,
      action: reply.action,
      duration: reply.duration
    });
  }, options.voice ? 180 : 420 + Math.min(420, text.length * 7));
  if (!state.playerName && state.askedName) saveState();
}

// ─── Small sounds ───────────────────────────────────────────────────────────
function ensureAudio() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  if (!audioContext) audioContext = new AudioCtor();
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  return audioContext;
}
function pluck(frequency, offset = 0, gain = .045, duration = 1.4) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const at = ctx.currentTime + offset;
  const osc = ctx.createOscillator();
  const envelope = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(frequency, at);
  osc.frequency.exponentialRampToValueAtTime(frequency * .985, at + duration);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1800, at);
  filter.frequency.exponentialRampToValueAtTime(640, at + duration);
  envelope.gain.setValueAtTime(.0001, at);
  envelope.gain.exponentialRampToValueAtTime(gain, at + .018);
  envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
  osc.connect(filter).connect(envelope).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + duration + .05);
}
function strumGuitar() {
  [196, 246.94, 293.66, 392, 493.88].forEach((frequency, index) => pluck(frequency, index * .07, .038, 1.8));
}

// ─── Object interactions ────────────────────────────────────────────────────
const objectLines = {
  girl: {
    bed: 'Кровать скрипнула один раз и замолчала. Я думаю, она ревнует: ты приходишь сюда не спать, а разговаривать.',
    desk: 'Экран светится, как маленькое окно в другую комнату. Я оставила на нём одну строчку. Прочитай, когда будешь готов(а).',
    window: 'Дождь идёт по стеклу не сверху вниз, а наискось — будто торопится куда-то. Я бы тоже так шла, если бы знала куда.',
    shelf: 'На третьей полке лежит открытка. Не спрашивай, от кого, — я сама забыла, но почерк мне нравится.',
    lamp: 'Свет стал тише. Хорошо, когда комната умеет не спорить с настроением.',
    guitar: 'Я не играю хорошо. Но если ты не будешь считать ошибки, я сыграю один аккорд — только для тебя.',
    projector: 'Смотри: звёзды на потолке. Ненастоящие, зато их можно включить, когда за окном слишком много дождя.'
  },
  boy: {
    bed: 'Садись, только не на подушку-звезду. Она уже пережила слишком много моих ночей.',
    desk: 'Монитор опять светится. Я оставил на нём сообщение — не потому, что не могу сказать вслух. Просто так оно дольше живёт.',
    window: 'Там весь город мокрый. А у нас тут сухо, если не считать твои кроссовки у двери.',
    shelf: 'Корешки шершавые. Я люблю вещи, которые можно потрогать и сразу понять: они старше тебя.',
    lamp: 'Вот так. Полумрак — единственное освещение, которое не требует от меня быть бодрым.',
    guitar: 'Струны расстроены. Как и я, впрочем. Но это не мешает им звучать.',
    projector: 'Вот. Теперь можно сделать вид, что мы не в комнате, а где-то, где нет соседей и дедлайнов.'
  }
};
const objectMoods = {
  girl: {
    bed: 'тихое смущение', desk: 'задумчивая нежность', window: 'вечерняя меланхолия',
    shelf: 'тёплая память', lamp: 'мягкий покой', guitar: 'смущённая искренность', projector: 'детская радость'
  },
  boy: {
    bed: 'сухая нежность', desk: 'ровная забота', window: 'городская усталость',
    shelf: 'спокойная внимательность', lamp: 'уютная лень', guitar: 'ироничная нежность', projector: 'тихое удивление'
  }
};

function interact(name) {
  if (!state.started || anyOverlayOpen()) return;
  state.lastActivity = Date.now();
  if (name === 'companion') {
    requestInputFocus();
    toast(state.gender === 'girl' ? 'Мира слушает. Напиши или нажми M.' : 'Лев слушает. Напиши или нажми M.');
    return;
  }
  if (!objectLines[state.gender]?.[name]) return;
  state.handsUntil = performance.now() + 1500;
  state.handAction = name;
  handsRoot.visible = true;
  if (name === 'lamp') {
    state.lampOn = !state.lampOn;
    floorLight.intensity = state.lampOn ? 24 : 4;
    bedsideLight.intensity = state.lampOn ? 16 : 4;
    M.lampGlow.emissiveIntensity = state.lampOn ? 1.1 : .18;
    screenNote = state.lampOn ? 'свет снова включён' : 'я оставила тебе полумрак';
    drawScreen();
  }
  if (name === 'projector') {
    state.starsOn = !state.starsOn;
    ceilingStars.visible = state.starsOn;
    starLight.intensity = state.starsOn ? 7 : 0;
    starLight.position.y = state.starsOn ? .3 : 0;
    const glow = projector.children.find(child => child.material?.emissive);
    if (glow) glow.material.emissiveIntensity = state.starsOn ? 2.5 : .2;
  }
  if (name === 'guitar') strumGuitar();
  if (name === 'desk') {
    screenNote = state.gender === 'girl' ? 'я оставила свет для тебя' : 'чай на столе. не забудь';
    drawScreen();
  }
  if (name === 'window') {
    windowFill.intensity = 15;
    setTimeout(() => { windowFill.intensity = 10; }, 900);
  }
  const line = objectLines[state.gender][name];
  const mood = objectMoods[state.gender][name];
  say(line, { mood, action: 'talk', duration: 5200 });
}

// ─── First-person player ────────────────────────────────────────────────────
const player = {
  position: new THREE.Vector3(.12, 0, 2.75),
  yaw: 0,
  pitch: -.045,
  step: 0,
  bob: 0,
  dragging: false,
  lastPointer: { x: 0, y: 0 },
  keys: Object.create(null)
};
camera.position.set(player.position.x, 1.62, player.position.z);
camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');

const obstacles = [
  { minX: -5.42, maxX: -3.16, minZ: .48, maxZ: 2.96 },   // bed
  { minX: -5.52, maxX: -4.68, minZ: 3.12, maxZ: 3.92 },   // bedside table
  { minX: 1.0, maxX: 4.95, minZ: -5.6, maxZ: -4.0 },      // desk
  { minX: 2.3, maxX: 3.18, minZ: -3.98, maxZ: -3.02 },    // chair
  { minX: 5.22, maxX: 5.95, minZ: -3.02, maxZ: -.98 },    // bookshelf
  { minX: -5.55, maxX: -4.72, minZ: -.65, maxZ: .26 },    // floor lamp
  { minX: -5.55, maxX: -4.7, minZ: -4.2, maxZ: -3.45 }    // guitar
];
function collides(x, z) {
  const radius = .3;
  if (x < -5.45 || x > 5.45 || z < -5.45 || z > 5.45) return true;
  for (const box of obstacles) {
    if (x > box.minX - radius && x < box.maxX + radius && z > box.minZ - radius && z < box.maxZ + radius) return true;
  }
  if (state.started) {
    const dx = x - avatar.position.x;
    const dz = z - avatar.position.z;
    if (dx * dx + dz * dz < .46 * .46) return true;
  }
  return false;
}
function updatePlayer(dt) {
  if (!state.started || document.activeElement === els.input || anyOverlayOpen()) {
    player.keys.KeyW = player.keys.KeyA = player.keys.KeyS = player.keys.KeyD = false;
    camera.position.y = damp(camera.position.y, 1.62 + player.bob, 10, dt);
    return;
  }
  const forward = (player.keys.KeyW ? 1 : 0) - (player.keys.KeyS ? 1 : 0);
  const strafe = (player.keys.KeyD ? 1 : 0) - (player.keys.KeyA ? 1 : 0);
  if (forward || strafe) {
    const length = Math.hypot(forward, strafe);
    const f = forward / length;
    const s = strafe / length;
    const speed = player.keys.ShiftLeft || player.keys.ShiftRight ? 2.35 : 1.55;
    const sin = Math.sin(player.yaw);
    const cos = Math.cos(player.yaw);
    const dx = (-sin * f + cos * s) * speed * dt;
    const dz = (-cos * f - sin * s) * speed * dt;
    if (!collides(player.position.x + dx, player.position.z)) player.position.x += dx;
    if (!collides(player.position.x, player.position.z + dz)) player.position.z += dz;
    player.step += speed * dt * 8.2;
    player.bob = Math.sin(player.step) * .018;
  } else {
    player.bob = damp(player.bob, 0, 5, dt);
    player.step = damp(player.step, Math.round(player.step / Math.PI) * Math.PI, 4, dt);
  }
  camera.position.x = player.position.x;
  camera.position.z = player.position.z;
  camera.position.y = damp(camera.position.y, 1.62 + player.bob, 12, dt);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
}

function updateHands(now, dt) {
  if (!state.started || now > state.handsUntil) {
    if (handsRoot.visible) handsRoot.visible = false;
    return;
  }
  handsRoot.visible = true;
  const pulse = Math.sin(now * .012);
  const target = state.handAction === 'guitar'
    ? { lx: -.17, ly: -.17, lz: -.5, rx: .2, ry: -.2, rz: -.47 }
    : { lx: -.13, ly: -.19, lz: -.53, rx: .13, ry: -.19, rz: -.53 };
  handLeft.position.x = damp(handLeft.position.x, target.lx, 9, dt);
  handLeft.position.y = damp(handLeft.position.y, target.ly + pulse * .012, 9, dt);
  handLeft.position.z = damp(handLeft.position.z, target.lz, 9, dt);
  handRight.position.x = damp(handRight.position.x, target.rx, 9, dt);
  handRight.position.y = damp(handRight.position.y, target.ry + pulse * .012, 9, dt);
  handRight.position.z = damp(handRight.position.z, target.rz, 9, dt);
  handLeft.rotation.x = damp(handLeft.rotation.x, -.3, 8, dt);
  handRight.rotation.x = damp(handRight.rotation.x, -.3, 8, dt);
}

// ─── Gaze, blinking, gestures ───────────────────────────────────────────────
function dampAngle(current, target, lambda, dt) {
  return current + shortestAngle(current, target) * (1 - Math.exp(-lambda * dt));
}
function aimBone(bone, target, dt, speed = 7) {
  if (!bone) return;
  bone.rotation.x = damp(bone.rotation.x, target.x, speed, dt);
  bone.rotation.y = damp(bone.rotation.y, target.y, speed, dt);
  bone.rotation.z = damp(bone.rotation.z, target.z, speed, dt);
}
function setMouth(value, vowel) {
  const em = state.activeCharacter?.expressions;
  if (!em) return;
  for (const shape of ['aa', 'ih', 'ou', 'ee', 'oh']) em.setValue(shape, 0);
  if (vowel) em.setValue(vowel, value);
}
function updateCharacter(controller, dt, now) {
  if (!controller || !avatar.visible || !controller.root.visible) return;
  const { bones, rest, expressions } = controller;
  if (!bones.head) return;
  const t = now / 1000 + controller.phase;
  const active = document.activeElement !== els.input;
  const action = active ? state.action : 'listen';
  const talking = state.speaking || now < state.talkUntil;
  const breath = Math.sin(t * 1.15);
  const sway = Math.sin(t * .53 + .8);
  const phase = Math.sin(t * 2.6);

  const hips = rest.hips || { x: 0, y: 0, z: 0 };
  const spine = rest.spine || { x: 0, y: 0, z: 0 };
  const chest = rest.chest || { x: 0, y: 0, z: 0 };
  const head = rest.head || { x: 0, y: 0, z: 0 };
  const lua = rest.leftUpperArm || { x: 0, y: 0, z: -1.42 };
  const rua = rest.rightUpperArm || { x: 0, y: 0, z: 1.42 };
  const lla = rest.leftLowerArm || { x: 0, y: 0, z: -.08 };
  const rla = rest.rightLowerArm || { x: 0, y: 0, z: .08 };

  let hipsY = sway * .012;
  let spineX = breath * .012;
  let spineY = sway * .016;
  let chestX = breath * .014;
  let chestY = sway * .012;
  let headX = breath * .012 + Math.sin(t * .83) * .012;
  let headY = sway * .035;
  let headZ = Math.sin(t * .61) * .012;
  let leftArm = { x: lua.x + Math.sin(t * 1.1) * .012, y: lua.y, z: lua.z + sway * .008 };
  let rightArm = { x: rua.x + Math.sin(t * 1.1 + .7) * .012, y: rua.y, z: rua.z - sway * .008 };
  let leftFore = { x: lla.x, y: lla.y, z: lla.z };
  let rightFore = { x: rla.x, y: rla.y, z: rla.z };
  let lean = 0;

  if (action === 'talk' || talking) {
    headX += Math.sin(t * 3.1) * .018;
    headY += Math.sin(t * 1.35) * .035;
    rightArm.x += -.09 + Math.sin(t * 2.35) * .07;
    rightArm.z += .035 + Math.sin(t * 1.9) * .045;
    rightFore.x += -.25 + Math.sin(t * 2.4) * .08;
    leftArm.x += -.025 + Math.sin(t * 1.7) * .025;
  }
  if (action === 'story') {
    headZ += .035;
    leftArm.z -= .08;
    rightArm.z += .08;
    leftFore.x -= .18;
    rightFore.x -= .18;
  }
  if (action === 'listen') {
    lean = .045;
    headX += .035;
    headY += Math.sin(t * .7) * .025;
    headZ += .055;
  }
  if (action === 'hug') {
    // Arms fold forward and inward, hands near the opposite shoulder.
    leftArm = { x: -.86, y: .22, z: 1.25 + Math.sin(t * 1.3) * .02 };
    rightArm = { x: -.86, y: -.22, z: -1.25 - Math.sin(t * 1.3) * .02 };
    leftFore = { x: -.96, y: .05, z: .08 };
    rightFore = { x: -.96, y: -.05, z: -.08 };
    headZ += .055;
    lean = .035;
  }
  if (action === 'dance') {
    const beat = Math.sin(t * 3.2);
    hipsY = beat * .16;
    spineY = -beat * .1;
    chestY = beat * .05;
    headY = beat * .13;
    headZ = -beat * .05;
    leftArm = { x: -.15, y: 0, z: 1.9 + beat * .18 };
    rightArm = { x: -.15, y: 0, z: -1.9 - beat * .18 };
    leftFore = { x: -.45, y: .1, z: .3 };
    rightFore = { x: -.45, y: -.1, z: -.3 };
  }
  if (action === 'tea') {
    rightArm = { x: -.5, y: -.08, z: -1.02 + Math.sin(t * 1.2) * .025 };
    rightFore = { x: -1.42, y: -.1, z: -.08 };
    headZ += .035;
  }
  if (action === 'wave') {
    rightArm = { x: -.22, y: 0, z: -2.05 - Math.sin(t * 7) * .2 };
    rightFore = { x: -.2, y: 0, z: .3 };
    headZ += .04;
  }
  if (action === 'reach') {
    rightArm = { x: -1.05, y: -.05, z: -1.18 };
    rightFore = { x: -.15, y: 0, z: -.08 };
    lean = .04;
  }

  aimBone(bones.hips, { x: hips.x, y: hips.y + hipsY, z: hips.z }, dt, 4);
  aimBone(bones.spine, { x: spine.x + spineX + lean, y: spine.y + spineY, z: spine.z }, dt, 5);
  aimBone(bones.chest, { x: chest.x + chestX + lean * .4, y: chest.y + chestY, z: chest.z }, dt, 5);
  aimBone(bones.head, { x: head.x + headX, y: head.y + headY, z: head.z + headZ }, dt, 6);
  aimBone(bones.neck, { x: 0, y: headY * .4, z: headZ * .5 }, dt, 6);
  aimBone(bones.leftUpperArm, leftArm, dt, 5.5);
  aimBone(bones.rightUpperArm, rightArm, dt, 5.5);
  aimBone(bones.leftLowerArm, leftFore, dt, 6);
  aimBone(bones.rightLowerArm, rightFore, dt, 6);

  // A quiet blink every few seconds, and speech-shaped mouth movement.
  if (now > state.blinkAt && state.blinkStart < 0) {
    state.blinkStart = now;
    state.blinkAt = now + 2400 + Math.random() * 4200;
  }
  let blink = 0;
  if (state.blinkStart > 0) {
    const p = (now - state.blinkStart) / 150;
    if (p >= 1) state.blinkStart = -1;
    else blink = Math.sin(p * Math.PI);
  }
  expressions.setValue('blink', blink);
  for (const mood of ['happy', 'relaxed', 'sad', 'angry', 'surprised']) expressions.setValue(mood, 0);
  if (/груст|печаль|серьёз/.test(state.mood)) expressions.setValue('sad', .22);
  else if (/улыб|радост|нежност|флирт|игр/.test(state.mood)) expressions.setValue('happy', .25);
  else expressions.setValue('relaxed', .22);
  if (talking && !state.speaking) {
    const shapes = ['aa', 'ih', 'ou', 'ee', 'oh'];
    const vowel = shapes[Math.floor(now / 118) % shapes.length];
    setMouth(.15 + Math.abs(Math.sin(now * .014)) * .38, vowel);
  } else if (talking && state.speaking) {
    const shapes = ['aa', 'ih', 'ou', 'ee', 'oh'];
    const vowel = shapes[Math.floor(now / 105) % shapes.length];
    setMouth(.18 + Math.abs(Math.sin(now * .018)) * .34, vowel);
  } else {
    setMouth(0, null);
  }
  controller.vrm.update(dt);
}

// ─── Hotspots and pointer look ──────────────────────────────────────────────
let activeHotspot = null;
function updateHotspot() {
  if (!state.started || isTyping() || anyOverlayOpen() || state.thinking) {
    if (activeHotspot) {
      activeHotspot = null;
      els.interact.classList.remove('on');
      els.crosshair.classList.remove('hot');
    }
    return;
  }
  raycaster.setFromCamera(center, camera);
  const hits = raycaster.intersectObjects(interactive, false);
  let next = null;
  for (const hit of hits) {
    if (hit.distance > 3.35) continue;
    const marker = hit.object;
    if (!marker.visible) continue;
    if (marker.parent && marker.parent.visible === false) continue;
    next = marker;
    break;
  }
  if (next === activeHotspot) return;
  activeHotspot = next;
  if (next) {
    els.interactLabel.textContent = next.userData.label || 'прикоснуться';
    els.interact.classList.add('on');
    els.crosshair.classList.add('hot');
  } else {
    els.interact.classList.remove('on');
    els.crosshair.classList.remove('hot');
  }
}
function lockPointer() {
  if (!state.started || anyOverlayOpen() || document.activeElement === els.input) return;
  if (document.pointerLockElement === canvas) return;
  try {
    const request = canvas.requestPointerLock();
    if (request && request.catch) request.catch(() => {});
  } catch (_) {}
}
canvas.addEventListener('pointerdown', (event) => {
  if (!state.started || anyOverlayOpen()) return;
  if (event.pointerType === 'mouse' && event.button === 0) {
    player.dragging = true;
    player.lastPointer.x = event.clientX;
    player.lastPointer.y = event.clientY;
    lockPointer();
  } else if (event.pointerType !== 'mouse') {
    player.dragging = true;
    player.lastPointer.x = event.clientX;
    player.lastPointer.y = event.clientY;
  }
});
window.addEventListener('pointerup', () => { player.dragging = false; });
window.addEventListener('pointercancel', () => { player.dragging = false; });
window.addEventListener('pointermove', (event) => {
  if (!state.started) return;
  if (document.pointerLockElement === canvas) {
    player.yaw -= (event.movementX || 0) * .00215;
    player.pitch -= (event.movementY || 0) * .00215;
  } else if (player.dragging) {
    const dx = event.clientX - player.lastPointer.x;
    const dy = event.clientY - player.lastPointer.y;
    player.lastPointer.x = event.clientX;
    player.lastPointer.y = event.clientY;
    player.yaw -= dx * (event.pointerType === 'mouse' ? .0032 : .005);
    player.pitch -= dy * (event.pointerType === 'mouse' ? .0032 : .005);
  } else {
    return;
  }
  player.pitch = clamp(player.pitch, -1.18, 1.18);
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  canvas.style.cursor = locked ? 'none' : 'crosshair';
});

// ─── Help and starting the evening ──────────────────────────────────────────
function openHelp(open) {
  const shouldOpen = typeof open === 'boolean' ? open : !els.help.classList.contains('open');
  if (shouldOpen) {
    if (document.pointerLockElement) document.exitPointerLock();
    dropInputFocus();
    stopListening();
    els.help.classList.add('open');
    state.keys = {};
  } else {
    els.help.classList.remove('open');
  }
}
function begin(gender) {
  if (!characters[gender] || state.started) return;
  ensureAudio();
  state.started = true;
  state.startedAt = Date.now();
  state.lastActivity = Date.now();
  state.lastIdle = Date.now();
  setActiveCharacter(gender, true);
  avatar.visible = true;
  els.start.classList.remove('open');
  document.body.classList.remove('dialog-open');
  updateChrome();
  const greeting = introLine(gender);
  say(greeting, {
    mood: characterMoodDefault(gender),
    action: 'talk',
    duration: 6600
  });
  setTimeout(() => {
    toast('Клик по комнате — захватить мышь. Space — сказать. H — подсказки.', 4200);
  }, 700);
}
function switchCharacter() {
  if (!state.started || anyOverlayOpen()) return;
  const target = state.gender === 'girl' ? 'boy' : 'girl';
  if (!characters[target]) {
    toast('Второй голос сегодня не загрузился. Но я всё ещё здесь.');
    return;
  }
  player.yaw = 0;
  player.pitch = -.055;
  setActiveCharacter(target, false);
}

// ─── World animation ────────────────────────────────────────────────────────
function updateWorld(now, dt) {
  const position = rain.geometry.attributes.position;
  for (let i = 0; i < rainCount; i++) {
    const base = i * 2;
    let y = position.getY(base) - rainSeeds[i].speed * dt * 2.1;
    if (y < 1.1) y = 3.8 + Math.random() * .35;
    position.setY(base, y);
    position.setY(base + 1, y - rainSeeds[i].len);
  }
  position.needsUpdate = true;
  const dustPosition = dust.geometry.attributes.position;
  for (let i = 0; i < dustCount; i++) {
    const meta = dustMeta[i];
    let y = dustPosition.getY(i) + meta.speed * dt * 2.2;
    if (y > 4.35) y = .35;
    dustPosition.setY(i, y);
    dustPosition.setX(i, dustPosition.getX(i) + Math.sin(now * .00022 + meta.phase) * .0007);
  }
  dustPosition.needsUpdate = true;
  if (ceilingStars.visible) {
    ceilingStars.material.opacity = .7 + Math.sin(now * .0017) * .2;
    starLight.intensity = 6 + Math.sin(now * .0014) * 2;
  }
  if (!updateWorld.lastScreen) updateWorld.lastScreen = now;
  if (now - updateWorld.lastScreen > 60000) {
    updateWorld.lastScreen = now;
    drawScreen();
  }
}

let lastFrame = performance.now();
let lastIdleCheck = 0;
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(.055, Math.max(.001, (now - lastFrame) / 1000));
  lastFrame = now;
  if (state.action !== 'idle' && now > state.actionUntil) state.action = 'idle';
  if (avatar.visible) {
    const desiredYaw = Math.atan2(camera.position.x - avatar.position.x, camera.position.z - avatar.position.z);
    avatar.rotation.y = dampAngle(avatar.rotation.y, desiredYaw, 2.1, dt);
  }
  updatePlayer(dt);
  updateHands(now, dt);
  updateCharacter(state.activeCharacter || characters[state.gender], dt, now);
  updateHotspot();
  updateWorld(now, dt);
  if (now - lastIdleCheck > 1000) {
    lastIdleCheck = now;
    idleSay();
  }
  renderer.render(scene, camera);
}

// ─── Event wiring ───────────────────────────────────────────────────────────
els.input.addEventListener('focus', () => {
  document.body.classList.add('dialog-open');
  state.lastActivity = Date.now();
});
els.input.addEventListener('blur', () => {
  if (!state.listening) document.body.classList.remove('dialog-open');
});
els.input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    sendMessage(els.input.value);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    dropInputFocus();
    if (document.pointerLockElement) document.exitPointerLock();
  }
});
els.mic.addEventListener('click', (event) => {
  event.preventDefault();
  toggleListening();
});
$('#helpClose').addEventListener('click', () => openHelp(false));
els.help.addEventListener('pointerdown', (event) => {
  if (event.target === els.help) openHelp(false);
});
startButtons.forEach((button) => {
  button.addEventListener('click', () => begin(button.dataset.start));
});

window.addEventListener('keydown', (event) => {
  const typing = document.activeElement === els.input;
  if (typing) {
    if (event.key === 'Escape') {
      event.preventDefault();
      dropInputFocus();
    }
    return;
  }
  if (els.start.classList.contains('open')) {
    if (event.code === 'Digit1' || event.key === '1') begin('girl');
    if (event.code === 'Digit2' || event.key === '2') begin('boy');
    return;
  }
  if (els.help.classList.contains('open')) {
    if (event.code === 'KeyH' || event.key === 'Escape') {
      event.preventDefault();
      openHelp(false);
    }
    return;
  }
  if (!state.started) return;
  if (event.code === 'KeyW' || event.code === 'KeyA' || event.code === 'KeyS' || event.code === 'KeyD') {
    player.keys[event.code] = true;
    event.preventDefault();
  } else if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
    player.keys[event.code] = true;
  } else if (event.code === 'Space') {
    event.preventDefault();
    requestInputFocus();
  } else if (event.code === 'KeyE') {
    event.preventDefault();
    if (activeHotspot) interact(activeHotspot.userData.name);
  } else if (event.code === 'KeyV') {
    event.preventDefault();
    toggleVoice();
  } else if (event.code === 'KeyM') {
    event.preventDefault();
    toggleListening();
  } else if (event.code === 'KeyH') {
    event.preventDefault();
    openHelp(true);
  } else if (event.code === 'Tab') {
    event.preventDefault();
    switchCharacter();
  } else if (event.key === 'Escape') {
    if (document.activeElement === els.input) dropInputFocus();
    else if (document.pointerLockElement) document.exitPointerLock();
  }
});
window.addEventListener('keyup', (event) => {
  if (event.code === 'KeyW' || event.code === 'KeyA' || event.code === 'KeyS' || event.code === 'KeyD') {
    player.keys[event.code] = false;
  }
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') player.keys[event.code] = false;
});
window.addEventListener('blur', () => {
  player.keys = {};
  player.dragging = false;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    player.keys = {};
    player.dragging = false;
    window.speechSynthesis?.cancel();
    if (state.listening) stopListening();
  }
});
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.setSize(innerWidth, innerHeight);
});
window.addEventListener('beforeunload', saveState);

// ─── Load the two voices and open the room ─────────────────────────────────
updateChrome();
updateLoading(0);
requestAnimationFrame(animate);
Promise.allSettled([loadAvatar('girl'), loadAvatar('boy')]).then((results) => {
  const girlOk = Boolean(characters.girl);
  const boyOk = Boolean(characters.boy);
  if (!girlOk && !boyOk) {
    const reason = results.map(result => result.reason).find(Boolean);
    showFatal(reason ? `Браузер не смог прочитать VRM: ${String(reason.message || reason).slice(0, 160)}` : 'Оба аватара не загрузились. Проверь подключение и обнови страницу.');
    return;
  }
  if (!girlOk || !boyOk) {
    const missingGender = girlOk ? 'boy' : 'girl';
    const missing = startButtons.find(button => button.dataset.start === missingGender);
    if (missing) {
      missing.classList.add('missing');
      missing.classList.remove('ready');
      missing.disabled = true;
      const copy = missing.querySelector('.choose-copy em');
      if (copy) copy.textContent = 'не загрузился — можно войти с другим';
    }
    els.loadStatus.textContent = girlOk ? 'Лев сегодня не пришёл — можно остаться с Мирой' : 'Мира не загрузилась — можно остаться со Львом';
    els.loadBar.style.width = '100%';
  } else {
    els.loadStatus.textContent = 'комната дышит';
    els.loadBar.style.width = '100%';
  }
});

// Small debug surface for automated checks; harmless in normal play.
window.__quiet = {
  state, characters, camera, player, avatar, begin, switchCharacter, setActiveCharacter,
  interact, idleSay, composeReply, sendMessage, objectLines
};
