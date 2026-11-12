import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

export const scene = new THREE.Scene();
scene.background = new THREE.Color('#a88d91');
scene.fog = new THREE.Fog('#b99da0', 11, 25);
export const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 50);
export const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#scene'), antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

scene.add(new THREE.HemisphereLight('#ffe8d1', '#63505b', 1.75));
const moon = new THREE.DirectionalLight('#c1cde8', 1.1);
moon.position.set(-4, 7, -5);
moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
moon.shadow.camera.left = -8; moon.shadow.camera.right = 8; moon.shadow.camera.top = 8; moon.shadow.camera.bottom = -8;
scene.add(moon);
export const lampGlow = new THREE.PointLight('#ffc88f', 30, 8, 1.8);
lampGlow.position.set(-2.2, 2.7, -1.7);
scene.add(lampGlow);
const fill = new THREE.PointLight('#dfa5a0', 13, 10, 1.8);
fill.position.set(3.2, 3.2, -1.8);
scene.add(fill);

const mats = {};
function mat(key, color, roughness = 0.82, extra = {}) {
  return mats[key] ||= new THREE.MeshStandardMaterial({ color, roughness, ...extra });
}
const wood = mat('wood', '#8e6557');
const paleWood = mat('paleWood', '#d2ad91');
const cream = mat('cream', '#f0e2d4');
const wall = mat('wall', '#c8aaa0');
const leaf = mat('leaf', '#637d68');
const leaf2 = mat('leaf2', '#8da17c');
const dark = mat('dark', '#594a4c');
const brass = mat('brass', '#c29b67', 0.42, { metalness: 0.45 });

function box(parent, pos, size, material, cast = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...pos); mesh.castShadow = cast; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function sphere(parent, pos, scale, material, segments = 20) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(12, segments - 4)), material);
  mesh.position.set(...pos); mesh.scale.set(...scale); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function cyl(parent, pos, rTop, rBottom, height, material, segments = 24) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, height, segments), material);
  mesh.position.set(...pos); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}

// A warmly lit room, open toward the camera so the space reads clearly on a phone.
const room = new THREE.Group(); scene.add(room);
box(room, [0, -0.12, -0.05], [10, 0.24, 10.2], mat('floor', '#b48f7c'));
box(room, [0, 2.55, -5.05], [10, 5.3, 0.22], wall);
box(room, [-5.02, 2.55, -0.05], [0.2, 5.3, 10.2], mat('leftWall', '#d3b8aa'));
box(room, [5.02, 2.55, -0.05], [0.2, 5.3, 10.2], mat('rightWall', '#c9aaa0'));
box(room, [0, 5.22, -0.05], [10, 0.18, 10.2], mat('ceiling', '#d7c0b4'));
// Baseboards and restrained ceiling trim
for (const x of [-4.87, 4.87]) box(room, [x, 0.16, -0.02], [0.08, 0.22, 9.9], cream);
box(room, [0, 0.16, -4.88], [9.8, 0.22, 0.08], cream);
box(room, [0, 4.96, -4.9], [9.8, 0.08, 0.08], mat('crown', '#ead8c8'));

// Moonlit window on the rear wall, with a low sill and softly glowing panes.
const glass = mat('glass', '#8198ad', 0.3, { emissive: '#718aa4', emissiveIntensity: 0.42 });
box(room, [-2.32, 3.12, -4.91], [2.4, 2.35, 0.08], mat('windowFrame', '#765a55'));
box(room, [-2.32, 3.12, -4.855], [2.18, 2.13, 0.035], glass, false);
for (const x of [-3.43, -2.32, -1.21]) box(room, [x, 3.12, -4.81], [0.075, 2.25, 0.09], cream);
for (const y of [2.08, 3.12, 4.16]) box(room, [-2.32, y, -4.81], [2.32, 0.075, 0.09], cream);
box(room, [-2.32, 1.92, -4.65], [2.72, 0.16, 0.52], paleWood);
const moonDisc = sphere(room, [-2.94, 3.56, -4.76], [0.28, 0.28, 0.035], mat('moonDisc', '#f4e7c9', 0.35, { emissive: '#ffdfa7', emissiveIntensity: 0.8 }), 28);
for (const [x, y, s] of [[-1.6,3.55,.055],[-3.72,2.77,.045],[-1.95,2.62,.04],[-3.72,3.85,.035],[-2.65,2.35,.03]]) sphere(room, [x,y,-4.75], [s,s,s*.3], mat('star', '#fff0d3', 0.4, {emissive:'#ffe4b2',emissiveIntensity:.7}), 12);
// Curtains and tiebacks
for (const x of [-3.67, -0.98]) {
  const curtain = box(room, [x, 3.1, -4.62], [0.46, 2.55, 0.18], mat('curtain', '#9c747a'));
  curtain.rotation.z = x < -2 ? -0.025 : 0.025;
  sphere(room, [x, 2.8, -4.48], [0.055,0.07,0.055], brass, 14);
}
box(room, [-2.32, 4.46, -4.58], [3.05, 0.09, 0.12], paleWood);

// A large muted rug anchors the seating area.
box(room, [0, 0.025, -0.1], [4.3, 0.055, 2.75], mat('rug', '#c7a19a'));
for (const x of [-1.98, 1.98]) box(room, [x, 0.056, -0.1], [0.025, 0.012, 2.45], mat('rugTrim', '#e6c6b7'));
for (const z of [-1.29, 1.09]) box(room, [0, 0.056, z], [3.98, 0.012, 0.025], mat('rugTrim', '#e6c6b7'));

// Tea table with a cup, saucer, and a book.
box(room, [-2.12, 0.61, -1.65], [1.32, 0.12, 0.86], paleWood);
for (const x of [-2.65, -1.59]) for (const z of [-1.94, -1.36]) box(room, [x, 0.3, z], [0.085, 0.58, 0.085], wood);
cyl(room, [-2.18, 0.69, -1.56], 0.19, 0.19, 0.025, cream, 28);
cyl(room, [-2.18, 0.78, -1.56], 0.115, 0.095, 0.17, mat('cup', '#eee0cf'), 28);
cyl(room, [-2.18, 0.87, -1.56], 0.102, 0.102, 0.018, mat('tea', '#87604b'), 28);
const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 8, 18), cream); handle.position.set(-2.04,0.79,-1.56); room.add(handle);
box(room, [-1.78, 0.72, -1.85], [0.34, 0.07, 0.46], mat('bookCover', '#718276'));
box(room, [-1.78, 0.76, -1.85], [0.31, 0.025, 0.43], mat('pages', '#eadbc8'));

// A soft chair for the companion; cushions and piping keep the silhouette tactile.
const chair = mat('chair', '#a97876');
box(room, [0.02, 0.66, -2.32], [1.48, 0.22, 0.92], chair);
box(room, [0.02, 1.24, -2.73], [1.42, 1.02, 0.22], chair);
for (const x of [-0.69, 0.73]) box(room, [x, 0.79, -2.33], [0.16, 0.48, 0.9], mat('chairArm', '#b7847d'));
for (const x of [-0.58, 0.62]) for (const z of [-2.65, -2.02]) box(room, [x, 0.22, z], [0.1, 0.34, 0.1], wood);
box(room, [0.02, 0.79, -2.12], [1.0, 0.16, 0.06], mat('chairSeat', '#c6968d'));

// Lamp with a fabric shade and warm pool of light.
box(room, [-3.57, 0.73, -2.86], [0.66, 0.13, 0.62], wood);
cyl(room, [-3.57, 1.26, -2.86], 0.055, 0.075, 1.0, brass, 20);
cyl(room, [-3.57, 1.85, -2.86], 0.34, 0.19, 0.52, mat('shade', '#f1d7b6', 0.9, {emissive:'#8b5a37',emissiveIntensity:.15}), 32);
sphere(room, [-3.57, 1.58, -2.86], [0.11,0.11,0.11], mat('bulb', '#ffe8bd', .3, {emissive:'#ffd99b',emissiveIntensity:1}), 16);

// Plants and a bookcase bring natural shapes into the corners.
const pot = cyl(room, [-3.45, 0.38, -3.3], 0.38, 0.27, 0.7, mat('pot', '#b98275', 0.55), 32);
cyl(room, [-3.45, 0.76, -3.3], 0.39, 0.39, 0.07, mat('soil', '#514235'), 32);
for (let i=0;i<9;i++) {
  const a=i*2.4, r=.24+(i%3)*.07;
  const start=new THREE.Vector3(-3.45,.8,-3.3), end=new THREE.Vector3(-3.45+Math.cos(a)*r,1.35+(i%4)*.12,-3.3+Math.sin(a)*r);
  const dir=end.clone().sub(start), mid=start.clone().add(end).multiplyScalar(.5);
  const stem=cyl(room,mid.toArray(),.018,.025,dir.length(),leaf,9); stem.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());
  const blade=sphere(room,end.toArray(),[.13,.31,.045],i%2?leaf:leaf2,16); blade.quaternion.copy(stem.quaternion);
}
box(room, [3.55, 1.31, -3.72], [1.28, 2.55, .34], mat('shelfBack', '#89685e'));
for (const y of [.23,.96,1.72,2.43]) {
  box(room,[3.55,y,-3.5],[1.42,.09,.57],paleWood);
  for(const x of [3.02,4.08]) box(room,[x,y-.35,-3.52],[.08,.68,.5],wood);
}
for(let i=0;i<6;i++) {
  const h=.38+(i%3)*.08, b=box(room,[3.07+i*.15,.96+h/2,-3.42],[.105,h,.26],mat(`book${i}`,['#b97d79','#d5b68f','#788779','#8b7180','#dfc8a9','#a96f68'][i]));
  b.rotation.z=i%2?.04:-.03;
}
sphere(room,[3.84,2.6,-3.44],[.2,.27,.17],mat('vase','#d6b49b',.3),22);
cyl(room,[3.84,2.82,-3.44],.09,.12,.16,mat('vaseNeck','#d6b49b',.3),16);
for(let i=0;i<5;i++) {
  const x=3.95+i*.07, vine=cyl(room,[x,2.65,-3.4],.01,.012,.48,leaf,8); vine.rotation.z=-.22+i*.1;
  sphere(room,[x+.06,2.43-i*.06,-3.39],[.07,.15,.035],leaf2,12);
}
// Wall art: slim frame, paper, and a quiet botanical motif.
box(room, [2.46, 3.3, -4.86], [1.25, 1.62, .08], wood);
box(room, [2.46, 3.3, -4.80], [1.08, 1.44, .025], mat('printPaper', '#eadbc8'));
for(let i=0;i<4;i++) {
  const branch=cyl(room,[2.46,3.27+i*.015,-4.77],.012,.018,.76,leaf,8); branch.rotation.z=-.55;
  sphere(room,[2.28+(i%2)*.34,3.12+i*.12,-4.76],[.055,.15,.025],i%2?leaf:leaf2,12);
}

// Companion: natural adult proportions, gentle expression, seated inside the chair.
export const characterRoot = new THREE.Group();
scene.add(characterRoot);
characterRoot.position.set(.03, 0.42, -2.02);
const companionMats = {};
function charMat(key, color, opts={}) { return companionMats[key] ||= new THREE.MeshStandardMaterial({color,roughness:.72,...opts}); }
function partMesh(geometry, material, parent=characterRoot, pos=[0,0,0]) {
  const o=new THREE.Mesh(geometry,material); o.position.set(...pos); o.castShadow=true; o.receiveShadow=true; parent.add(o); return o;
}
function partSphere(pos,scale,material) { const o=partMesh(new THREE.SphereGeometry(1,28,20),material,characterRoot,pos); o.scale.set(...scale); return o; }
export function makeCompanion(type='mira') {
  while(characterRoot.children.length) characterRoot.remove(characterRoot.children[0]);
  const isMira=type==='mira';
  const skin=charMat(isMira?'skinM':'skinA',isMira?'#dca991':'#c9957d');
  const hair=charMat(isMira?'hairM':'hairA',isMira?'#4c3738':'#433432');
  const shirt=charMat(isMira?'shirtM':'shirtA',isMira?'#c58a87':'#82928c');
  const pants=charMat(isMira?'pantsM':'pantsA',isMira?'#615968':'#505c63');
  for(const x of [-.17,.17]) {
    const leg=partMesh(new THREE.CapsuleGeometry(.105,.57,5,12),pants,characterRoot,[x,.55,.13]); leg.rotation.z=x<0?.12:-.12;
    partSphere([x,.2,.26],[.14,.085,.23],dark);
  }
  const torso=partMesh(new THREE.CapsuleGeometry(.31,.67,8,18),shirt,characterRoot,[0,1.27,0]); torso.scale.set(1,.92,.72);
  for(const x of [-.33,.33]) {
    const arm=partMesh(new THREE.CapsuleGeometry(.105,.56,6,14),shirt,characterRoot,[x,1.24,.04]); arm.rotation.z=x<0?-.3:.3;
    partSphere([x*1.25,.93,.12],[.09,.12,.09],skin);
  }
  partMesh(new THREE.CylinderGeometry(.105,.12,.2,20),skin,characterRoot,[0,1.79,0]);
  partSphere([0,2.02,.005],[.245,.315,.225],skin);
  partSphere([0,2.22,-.035],[.257,.19,.235],hair);
  if(isMira) {
    for(const x of [-.215,.215]) { const lock=partMesh(new THREE.CapsuleGeometry(.073,.43,6,12),hair,characterRoot,[x,1.98,-.015]); lock.rotation.z=x<0?-.06:.06; }
  } else {
    const forelock=partSphere([0,2.35,.04],[.22,.095,.2],hair); forelock.rotation.z=-.13;
    partSphere([-.12,2.26,.15],[.12,.08,.08],hair);
  }
  for(const x of [-.24,.24]) partSphere([x,2.03,0],[.045,.07,.045],skin);
  const eye=charMat('eyes','#49383a'), glint=charMat('glint','#fff6e8',{emissive:'#fff2dd',emissiveIntensity:.35});
  for(const x of [-.085,.085]) { partSphere([x,2.06,.213],[.022,.031,.018],eye); partSphere([x-.006,2.071,.23],[.007,.009,.006],glint); }
  partSphere([0,1.995,.233],[.024,.033,.024],skin);
  const smile=partMesh(new THREE.TorusGeometry(.045,.008,8,18,Math.PI),charMat('mouth','#985f62'),characterRoot,[0,1.94,.214]); smile.rotation.z=Math.PI;
  if(isMira) for(const x of [-1,1]) partSphere([x*.075,1.99,.2],[.045,.025,.009],charMat('blush','#d78c8a',{transparent:true,opacity:.32}));
  const collar=partMesh(new THREE.TorusGeometry(.15,.024,8,24,Math.PI),charMat('collar','#f0d7c6'),characterRoot,[0,1.66,.08]); collar.rotation.x=Math.PI/2;
  partSphere([0,1.59,.23],[.035,.045,.02],brass);
  characterRoot.userData={type,torso};
}
makeCompanion('mira');

export const interactables=[];
function target(name,position,radius,kind) {
  const o=new THREE.Mesh(new THREE.SphereGeometry(radius,12,8),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));
  o.position.set(...position); o.userData={name,kind}; scene.add(o); interactables.push(o); return o;
}
target('Спутник',[.03,1.65,-2.02],.78,'companion');
target('Чай',[-2.17,1.01,-1.44],.4,'tea');
target('Книга',[-1.88,.93,-1.58],.34,'book');
target('Окно',[-2.25,2.9,-4.2],.72,'window');
target('Книжная полка',[3.5,1.25,-3.25],.7,'shelf');
export function animateCompanion(time) {
  const torso=characterRoot.userData.torso;
  if(torso) { torso.position.y=1.27+Math.sin(time*1.65)*.012; characterRoot.rotation.y=Math.sin(time*.45)*.045; }
}
