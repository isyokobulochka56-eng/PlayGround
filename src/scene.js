import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

export const scene = new THREE.Scene();
scene.background = new THREE.Color('#a88d9d');
scene.fog = new THREE.Fog('#b99da8', 12, 27);
export const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 60);
export const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#scene'), antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

scene.add(new THREE.HemisphereLight('#ffe9e2', '#67536d', 1.8));
const moon = new THREE.DirectionalLight('#c6d8ff', 1.25);
moon.position.set(-4, 7, -5); moon.castShadow = true; moon.shadow.mapSize.set(1024,1024);
moon.shadow.camera.left=-9; moon.shadow.camera.right=9; moon.shadow.camera.top=9; moon.shadow.camera.bottom=-9; scene.add(moon);
export const lampGlow = new THREE.PointLight('#ffd29d', 34, 9, 1.7); lampGlow.position.set(-3.35,2.1,-2.4); scene.add(lampGlow);
const pinkFill = new THREE.PointLight('#f0a8c0', 17, 11, 1.8); pinkFill.position.set(3,3.8,-3.3); scene.add(pinkFill);

const mats={};
function mat(key,color,roughness=.82,extra={}) { return mats[key] ||= new THREE.MeshStandardMaterial({color,roughness,...extra}); }
const wood=mat('wood','#9a705f'), paleWood=mat('paleWood','#ddbd9e'), cream=mat('cream','#f5e9dd'), wall=mat('wall','#d2b5ae'), dark=mat('dark','#453c50');
function box(parent,pos,size,material,cast=true) { const o=new THREE.Mesh(new THREE.BoxGeometry(...size),material); o.position.set(...pos); o.castShadow=cast; o.receiveShadow=true; parent.add(o); return o; }
function sphere(parent,pos,scale,material,segments=22) { const o=new THREE.Mesh(new THREE.SphereGeometry(1,segments,Math.max(12,segments-4)),material); o.position.set(...pos); o.scale.set(...scale); o.castShadow=true; o.receiveShadow=true; parent.add(o); return o; }
function cyl(parent,pos,rTop,rBottom,height,material,segments=24) { const o=new THREE.Mesh(new THREE.CylinderGeometry(rTop,rBottom,height,segments),material); o.position.set(...pos); o.castShadow=true; o.receiveShadow=true; parent.add(o); return o; }

const room=new THREE.Group(); scene.add(room);
box(room,[0,-.12,-.05],[10,.24,10.2],mat('floor','#bf9a88'));
box(room,[0,2.55,-5.05],[10,5.3,.22],wall);
box(room,[-5.02,2.55,-.05],[.2,5.3,10.2],mat('leftWall','#dfc8b7'));
box(room,[5.02,2.55,-.05],[.2,5.3,10.2],mat('rightWall','#d0b1aa'));
box(room,[0,5.22,-.05],[10,.18,10.2],mat('ceiling','#e7d4ca'));
for(const x of [-4.87,4.87]) box(room,[x,.16,-.02],[.08,.22,9.9],cream);
box(room,[0,.16,-4.88],[9.8,.22,.08],cream);

// Pink-curtained window and quiet moonlit sky.
const glass=mat('glass','#8eabc8',.3,{emissive:'#869abf',emissiveIntensity:.65});
box(room,[-2.63,3.12,-4.91],[2.5,2.35,.08],mat('windowFrame','#765b63'));
box(room,[-2.63,3.12,-4.855],[2.28,2.13,.035],glass,false);
for(const x of [-3.77,-2.63,-1.49]) box(room,[x,3.12,-4.81],[.075,2.25,.09],cream);
for(const y of [2.08,3.12,4.16]) box(room,[-2.63,y,-4.81],[2.4,.075,.09],cream);
box(room,[-2.63,1.92,-4.65],[2.8,.16,.52],paleWood);
sphere(room,[-3.13,3.58,-4.75],[.24,.24,.035],mat('moon','#fff0c8',.3,{emissive:'#ffe4ad',emissiveIntensity:1}),28);
for(const [x,y,s] of [[-2.1,3.7,.04],[-3.8,2.8,.035],[-2.2,2.6,.03],[-3.6,3.9,.026]]) sphere(room,[x,y,-4.75],[s,s,s*.3],mat('stars','#fff1d2',.4,{emissive:'#ffe8bd',emissiveIntensity:.8}),12);
for(const x of [-4.05,-1.2]) {
  const curtain=box(room,[x,3.11,-4.57],[.52,2.63,.24],mat('curtain','#cd829e'));
  curtain.rotation.z=x < -2 ? -.035 : .035;
  for(let i=0;i<4;i++) box(room,[x-.17+i*.11,3.1,-4.435],[.035,2.42,.025],mat(`fold${i}`,i%2?'#d992aa':'#be748f'),false);
  sphere(room,[x,2.83,-4.4],[.06,.07,.06],mat('tie','#c79869'),14);
}
box(room,[-2.63,4.46,-4.58],[3.3,.09,.13],paleWood);

// Textured oval rug with a stitched border.
const rug=new THREE.Mesh(new THREE.CylinderGeometry(2.15,2.15,.055,64),mat('rug','#c98592')); rug.scale.set(1.35,1, .72); rug.position.set(.1,.02,-.25); rug.receiveShadow=true; room.add(rug);
const rugTrim=new THREE.Mesh(new THREE.TorusGeometry(2.05,.018,8,64),mat('rugTrim','#f0c6c0')); rugTrim.rotation.x=Math.PI/2; rugTrim.scale.set(1.32,.72,1); rugTrim.position.set(.1,.063,-.25); room.add(rugTrim);

// White bed at the right, with a star cushion and orange round pillow.
box(room,[2.82,.42,-2.55],[2.75,.48,3.65],mat('bedBase','#f2e9e3'));
box(room,[2.82,.72,-2.55],[2.8,.24,3.55],mat('mattress','#fffaf4'));
box(room,[2.82,.86,-3.72],[2.7,.12,1.1],mat('duvet','#f7f1ee'));
box(room,[2.82,1.25,-4.25],[2.8,1.05,.18],mat('headboard','#c99da0'));
box(room,[2.25,.91,-4.05],[.92,.22,.6],mat('pillow','#fffefd'));
box(room,[3.38,.91,-4.05],[.92,.22,.6],mat('pillow2','#fffefd'));
const starShape=new THREE.Shape();
for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2?.24:.5,x=Math.cos(a)*r,y=Math.sin(a)*r;i===0?starShape.moveTo(x,y):starShape.lineTo(x,y);} starShape.closePath();
const star=new THREE.Mesh(new THREE.ExtrudeGeometry(starShape,{depth:.13,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.045,bevelThickness:.04}),mat('starPillow','#f5d477')); star.position.set(2.35,1.12,-3.88); star.rotation.x=-.13; star.castShadow=true; room.add(star);
sphere(room,[3.38,1.04,-3.82],[.39,.22,.39],mat('orangePillow','#e99b58'));

// Desk and glowing monitor on the left side.
box(room,[-3.45,1.05,-3.38],[2.45,.16,1.08],paleWood);
for(const x of [-4.45,-2.45]) for(const z of [-3.78,-2.98]) box(room,[x,.55,z],[.1,1,.1],wood);
box(room,[-3.45,1.83,-3.83],[1.35,.82,.12],mat('monitorCase','#51485c'));
box(room,[-3.45,1.84,-3.75],[1.2,.66,.025],mat('monitorScreen','#788fae',.25,{emissive:'#8398bd',emissiveIntensity:.75}),false);
box(room,[-3.45,1.35,-3.82],[.12,.2,.1],dark); box(room,[-3.45,1.24,-3.82],[.62,.06,.36],mat('monitorStand','#645560'));
box(room,[-3.44,1.16,-3.05],[.95,.035,.28],mat('keyboard','#71626a'));
// Desk cup and books.
cyl(room,[-2.65,1.28,-3.25],.14,.12,.22,mat('deskCup','#f2e2d3'));
box(room,[-4.18,1.2,-3.13],[.38,.07,.52],mat('bookCover','#bd7e8d'));

// Bedside table, tea and warm lamp.
box(room,[.95,.55,-3.56],[.72,.12,.72],wood);
for(const x of [.68,1.22]) for(const z of [-3.82,-3.3]) box(room,[x,.28,z],[.07,.52,.07],wood);
cyl(room,[.9,.72,-3.5],.17,.17,.025,cream,28); cyl(room,[.9,.81,-3.5],.11,.095,.17,mat('cup','#fff4e7'),28); cyl(room,[.9,.9,-3.5],.095,.095,.018,mat('tea','#a46c4c'),28);
const handle=new THREE.Mesh(new THREE.TorusGeometry(.055,.014,8,18),cream); handle.position.set(1.04,.82,-3.5); room.add(handle);
box(room,[-4.28,.73,-2.44],[.64,.13,.61],wood); cyl(room,[-4.28,1.23,-2.44],.05,.07,.92,mat('brass','#c39b69',.42,{metalness:.4}),20); cyl(room,[-4.28,1.78,-2.44],.3,.18,.48,mat('shade','#f5d9bb',.9,{emissive:'#c88755',emissiveIntensity:.2}),32); sphere(room,[-4.28,1.55,-2.44],[.1,.1,.1],mat('bulb','#fff0c4',.3,{emissive:'#ffd99b',emissiveIntensity:1}),16);

// Shelving, leafy plant and framed illustration.
box(room,[4.38,1.42,-3.55],[.34,2.7,1.2],mat('shelfBack','#87695f'));
for(const y of [.22,.92,1.62,2.32]) { box(room,[4.18,y,-3.55],[.7,.08,1.28],paleWood); for(let i=0;i<4;i++) box(room,[3.92+i*.17,y+.2,-3.52],[.12,.36,.32],mat(`shelfBook${i}`,['#b97d88','#ddba91','#81927f','#927d9d'][i])); }
box(room,[1.6,3.22,-4.86],[1.2,1.5,.07],wood); box(room,[1.6,3.22,-4.81],[1.04,1.34,.025],mat('artPaper','#f0e2d0'));
for(let i=0;i<4;i++) sphere(room,[1.38+i*.14,3.05+i*.13,-4.77],[.07,.16,.025],i%2?mat('artLeaf','#82957f'):mat('artLeaf2','#a5ab82'),12);
cyl(room,[-4.2,.36,-4.15],.3,.23,.62,mat('plantPot','#b98275'),28);
for(let i=0;i<7;i++){const a=i*2.4,r=.22+(i%3)*.06;sphere(room,[-4.2+Math.cos(a)*r,1.05+(i%3)*.12,-4.15+Math.sin(a)*r],[.12,.34,.05],i%2?mat('leafA','#769072'):mat('leafB','#9aaa81'),16);}

// Adult anime-inspired companion model, facing the player (+Z).
export const characterRoot=new THREE.Group(); scene.add(characterRoot);
characterRoot.position.set(.05,0,-1.85);
const character={};
const cm={};
function cmat(key,color,extra={}){return cm[key] ||= new THREE.MeshStandardMaterial({color,roughness:.72,...extra});}
const skin=cmat('skin','#f0c2ae'), hair=cmat('hair','#202b59'), hairLite=cmat('hairLite','#344477'), cap=cmat('cap','#315c9b'), capLight=cmat('capLight','#527fc2'), sweater=cmat('sweater','#c94856'), sweaterDark=cmat('sweaterDark','#9f3347'), skirt=cmat('skirt','#385c9b'), sock=cmat('sock','#bd4652'), white=cmat('white','#fff7ee'), eyeWhite=cmat('eyeWhite','#fffaf5'), iris=cmat('iris','#538cc1'), pupil=cmat('pupil','#19233e'), mouth=cmat('mouth','#a74e5a');
function part(geometry,material,parent=characterRoot,pos=[0,0,0]){const o=new THREE.Mesh(geometry,material);o.position.set(...pos);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
function ball(pos,scale,material,parent=characterRoot){const o=part(new THREE.SphereGeometry(1,28,20),material,parent,pos);o.scale.set(...scale);return o;}
function capsule(parent,material,pos,r,length){const o=part(new THREE.CapsuleGeometry(r,length,6,14),material,parent,pos);return o;}
// Legs and shoes.
character.legs=[];
for(const x of [-.22,.22]){
  const legGroup=new THREE.Group();legGroup.position.set(x,.92,.01);characterRoot.add(legGroup);character.legs.push(legGroup);
  capsule(legGroup,skirt,[0,-.08,0],.115,.38);
  const sockObj=capsule(legGroup,sock,[0,-.48,.015],.105,.38); sockObj.scale.y=1.04;
  for(const yy of [-.29,-.34]){const stripe=part(new THREE.TorusGeometry(.104,.012,8,22),white,legGroup,[0,yy,.015]);stripe.rotation.x=Math.PI/2;}
  const shoe=ball([x,.11,.08],[.16,.09,.23],cmat('shoe','#533e52')); shoe.position.x=x;
}
// Pleated skirt and waist.
cyl(characterRoot,[0,1.2,0],.32,.43,.42,skirt,32);
for(let i=0;i<12;i++){const a=i*Math.PI/6;const pleat=part(new THREE.BoxGeometry(.035,.34,.16),cmat(`pleat${i}`,i%2?'#476ca9':'#31558e'),characterRoot,[Math.sin(a)*.37,1.17,Math.cos(a)*.31]);pleat.rotation.y=a;pleat.rotation.z=Math.sin(a)*-.12;}
// Torso sweater, collarbone/shoulder cutout, sleeves and hands.
const torso=ball([0,1.68,0],[.43,.57,.29],sweater); character.torso=torso;
// Bare shoulder band and sweater neckline.
const neckline=part(new THREE.TorusGeometry(.33,.055,10,36,Math.PI),sweaterDark,characterRoot,[0,2.08,.01]); neckline.rotation.x=Math.PI/2; neckline.rotation.z=Math.PI;
character.arms=[];
for(const side of [-1,1]){
 const arm=new THREE.Group();arm.position.set(side*.39,1.91,0);characterRoot.add(arm);character.arms.push(arm);
 const sleeve=capsule(arm,sweater,[side*.12,-.26,0],.14,.32);sleeve.rotation.z=-side*.25;
 const cuff=part(new THREE.TorusGeometry(.115,.025,8,20),sweaterDark,arm,[side*.19,-.49,0]);cuff.rotation.z=Math.PI/2;
 ball([side*.2,-.63,.035],[.09,.12,.085],skin,arm);
}
// Neck and anime face.
capsule(characterRoot,skin,[0,2.19,0],.13,.15);
ball([0,2.57,.015],[.39,.47,.32],skin);
// Shoulder-length hair back, sides, fringe locks.
ball([0,2.64,-.105],[.415,.48,.30],hair);
for(const side of [-1,1]){
 const lock=capsule(characterRoot,hair,[side*.34,2.36,-.015],.105,.46);lock.rotation.z=side*-.08;
 const tip=ball([side*.34,2.1,.005],[.11,.14,.12],hair);
}
for(let i=0;i<7;i++){const x=-.3+i*.1;const bang=ball([x,2.82-(i%2)*.07,.22],[.095,.2,.09],i%3===0?hairLite:hair);bang.rotation.z=(i-3)*-.08;}
// Cat-ear cap, brim, badge.
const capTop=ball([0,2.95,-.005],[.4,.2,.31],cap);
for(const side of [-1,1]){const ear=part(new THREE.ConeGeometry(.15,.38,4),cap,characterRoot,[side*.29,3.14,-.02]);ear.rotation.z=side*.16;const inner=part(new THREE.ConeGeometry(.075,.22,4),cmat(side<0?'innerEar1':'innerEar2','#ee9cad'),characterRoot,[side*.29,3.15,.095]);inner.rotation.z=side*.16;}
const brim=ball([0,2.83,.24],[.43,.075,.24],capLight);brim.rotation.x=-.08;
ball([0,2.97,.29],[.065,.065,.025],cmat('badge','#f3d982',{metalness:.1}));
// Large expressive eyes with highlights, brows, blush and expression parts.
character.eyes=[];character.brows=[];
for(const side of [-1,1]){
 const eyeGroup=new THREE.Group();eyeGroup.position.set(side*.15,2.57,.296);characterRoot.add(eyeGroup);character.eyes.push(eyeGroup);
 ball([0,0,0],[.118,.16,.05],eyeWhite,eyeGroup);
 ball([0,-.01,.04],[.075,.117,.027],iris,eyeGroup);
 ball([0,-.015,.064],[.045,.082,.018],pupil,eyeGroup);
 ball([-.025,.045,.083],[.023,.03,.012],white,eyeGroup);
 ball([.03,-.05,.081],[.012,.016,.009],white,eyeGroup);
 const brow=ball([0,.205,.28],[.09,.025,.02],hair);character.brows.push(brow);
 const blush=ball([side*.245,2.46,.262],[.09,.035,.018],cmat(side<0?'blush1':'blush2','#ed8e9b',{transparent:true,opacity:.46}));
}
character.mouth=part(new THREE.TorusGeometry(.045,.009,8,20,Math.PI),mouth,characterRoot,[0,2.37,.319]);character.mouth.rotation.z=Math.PI;
// A small ribbon on the cap side.
for(const side of [-1,1])ball([side*.37,2.82,.12],[.08,.055,.04],cmat(side<0?'ribbonA':'ribbonB','#e89ba8'));
characterRoot.userData={character};

export function makeCompanion(){ return characterRoot; }
let action='idle', actionStarted=0, emotion='joy', baseTarget=new THREE.Vector3(.05,0,-1.85), actionTarget=baseTarget.clone();
export function setCompanionAction(next='idle'){
 action=next; actionStarted=performance.now()/1000;
 if(next==='approach'||next==='hug') actionTarget.set(.05,0,.2);
 else if(next==='tea') actionTarget.set(1.8,0,-2.55);
 else if(next==='sit') actionTarget.set(2.85,.68,-2.35);
 else actionTarget.copy(baseTarget);
}
export function setCompanionEmotion(next='joy'){
 emotion=next;
 const brows=character.brows;
 if(next==='sad'){brows[0].rotation.z=-.22;brows[1].rotation.z=.22;character.mouth.scale.set(.85,.7,.85);}
 else if(next==='surprised'){brows.forEach(b=>b.position.y=2.79);character.mouth.scale.set(.65,1.5,.8);}
 else if(next==='shy'){brows.forEach(b=>b.rotation.z=0);character.mouth.scale.set(.8,.7,.8);}
 else {brows.forEach(b=>{b.rotation.z=0;b.position.y=2.775;});character.mouth.scale.set(1,1,1);}
}
export function animateCompanion(time){
 const c=characterRoot.userData.character; if(!c)return;
 const elapsed=time-actionStarted;
 characterRoot.position.lerp(actionTarget,Math.min(1,.035+elapsed*.025));
 const moving=action==='approach'||action==='tea';
 const seated=action==='sit';
 characterRoot.scale.y=THREE.MathUtils.lerp(characterRoot.scale.y,seated?.72:1,.08);
 const bob=Math.sin(time*2.1)*.018;
 c.torso.position.y=1.68+bob+(action==='dance'?Math.sin(time*7)*.07:0);
 characterRoot.rotation.y=Math.sin(time*.7)*.035+(action==='dance'?Math.sin(time*5)*.24:0);
 c.arms.forEach((arm,i)=>{const side=i===0?-1:1;let swing= moving?Math.sin(time*7+i*Math.PI)*.38:Math.sin(time*1.7+i)*.035;
  if(action==='hug') swing=side===-1?-1.35:-1.35;
  if(action==='dance') swing=Math.sin(time*6+i*Math.PI)*.95;
  if(action==='tea') swing=side===1?-.7:.08;
  arm.rotation.z=swing*side;
 });
 c.legs.forEach((leg,i)=>{leg.rotation.x=moving?Math.sin(time*7+i*Math.PI)*.3:action==='dance'?Math.sin(time*7+i*Math.PI)*.24:0;});
 if(action==='hug'&&elapsed>4) setCompanionAction('idle');
 if(action==='dance'&&elapsed>7) setCompanionAction('idle');
 if(action==='tea'&&elapsed>5) setCompanionAction('idle');
 if(action==='approach'&&elapsed>2) action='idle';
}

export const interactables=[];
function target(name,position,radius,kind){const o=new THREE.Mesh(new THREE.SphereGeometry(radius,12,8),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));o.position.set(...position);o.userData={name,kind};scene.add(o);interactables.push(o);return o;}
target('Мира',[.05,1.55,-1.85],.78,'companion');
target('Чай',[.9,1,-3.5],.38,'tea');
target('Кровать',[2.8,1,-2.3],.95,'bed');
target('Монитор',[-3.45,1.8,-3.5],.6,'desk');
target('Окно',[-2.6,3,-4.2],.72,'window');
target('Книжная полка',[4.2,1.4,-3.4],.7,'shelf');
