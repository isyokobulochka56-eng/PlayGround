import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { scene, camera, renderer, lampGlow, characterRoot, interactables, makeCompanion, animateCompanion } from './scene.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#scene');
const player = { x: 0, z: 3.15, yaw: 0, pitch: -0.035 };
const raycaster = new THREE.Raycaster();
const clock = new THREE.Clock();
let currentTarget = null;
let lastInteraction = 0;
let isLooking = true;
let toastTimer;

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 2200);
}

function updateCamera() {
  camera.position.set(player.x, 1.62, player.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
}

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7));
}
window.addEventListener('resize', resize);

const memoryKey = 'quiet-room-memory-v1';
const defaults = { character: 'mira', visits: 0, met: false, likes: [], objects: [], lastTopic: '', name: '', lamp: true, sound: false };
let memory;
try { memory = { ...defaults, ...JSON.parse(localStorage.getItem(memoryKey) || '{}') }; }
catch { memory = { ...defaults }; }
memory.visits = (Number(memory.visits) || 0) + 1;
if (!Array.isArray(memory.likes)) memory.likes = [];
if (!Array.isArray(memory.objects)) memory.objects = [];
function saveMemory() {
  try { localStorage.setItem(memoryKey, JSON.stringify(memory)); }
  catch { /* Private browsing may disable storage; this visit still works. */ }
}
saveMemory();

const names = { mira: 'Мира', artyom: 'Артём' };
const introLines = {
  mira: 'Я оставила чай на столе. Он уже не горячий, зато теперь можно держать чашку обеими руками.',
  artyom: 'Хорошо, что ты заглянул. За окном дождь, а здесь можно никуда не спешить.'
};
let currentCharacter = memory.character === 'artyom' ? 'artyom' : 'mira';
function setCharacter(type, persist = true) {
  currentCharacter = type === 'artyom' ? 'artyom' : 'mira';
  makeCompanion(currentCharacter);
  const name = names[currentCharacter];
  const initial = currentCharacter === 'mira' ? 'м' : 'а';
  $('#companion-name').textContent = name;
  $('#dialog-name').textContent = name;
  $('.avatar').textContent = initial;
  $('.dialog-avatar').textContent = initial;
  $('#mood').textContent = currentCharacter === 'mira' ? 'спокойное настроение' : 'тихая улыбка';
  $('#character-select').value = currentCharacter;
  $('#focus').innerHTML = `${name} рядом <span>·</span> <b>коснись, чтобы поговорить</b><i>⌄</i>`;
  $('#message').placeholder = `Скажи ${name} что-нибудь…`;
  $('#mic').setAttribute('aria-label', `Сказать голосом ${name}`);
  if (persist) { memory.character = currentCharacter; saveMemory(); }
}
setCharacter(currentCharacter, false);
$('#dialog-text').textContent = introLines[currentCharacter];

const rules = [
  { keys: ['обним', 'hug'], topic: 'объятия', emotion: 'тепло', mira: 'Мира мягко обнимает тебя, и на минуту весь мир становится размером с эту комнату.', artyom: 'Артём приобнимает тебя за плечи. За окном может идти дождь — здесь ты не один.' },
  { keys: ['истор', 'сказ', 'story'], topic: 'истории', emotion: 'рассказывает историю', mira: 'В одном старом доме жил кот, который каждый вечер обходил все окна — проверял, всем ли хватает света. Однажды он уснул на подоконнике, и весь дом решил, что это он зажёг луну.', artyom: 'Когда-то я знал человека, который собирал красивые камешки с каждой прогулки. Говорил: так дорога не теряется. Наверное, некоторые вечера тоже хочется оставить себе.' },
  { keys: ['чай', 'завар', 'напит', 'tea'], topic: 'чай', emotion: 'забота', mira: 'Чай уже заварен. Мира подвигает чашку поближе: «С жасмином. Запах напоминает сад после дождя».', artyom: 'Я как раз налил. Чёрный, покрепче — и оставил немного места для молока, если захочешь.' },
  { keys: ['мечт', 'будущ', 'хотел', 'dream'], topic: 'мечты', emotion: 'мечтательность', mira: 'Если можно было бы проснуться завтра в любом месте, Мира выбрала бы маленький дом у моря — и утро, в котором никуда не надо.', artyom: 'Я бы отправился в поезд без расписания. Только книга, хороший термос и несколько новых станций.' },
  { keys: ['груст', 'тяжел', 'плохо', 'устал', 'одиноко', 'тревож', 'боюсь'], topic: 'поддержка', emotion: 'внимание', mira: 'Не нужно сейчас подбирать правильные слова. Можно просто посидеть рядом. Хочешь — расскажи, что сегодня было самым трудным.', artyom: 'Не обязательно сразу всё исправлять. Я побуду здесь, пока ты соберёшься с мыслями.' },
  { keys: ['спасибо', 'благодар'], topic: 'благодарность', emotion: 'улыбка', mira: 'Мира улыбается: «Спасибо, что разделил со мной этот вечер. Он стал чуть менее тихим — в хорошем смысле».', artyom: 'Всегда пожалуйста. Мне хорошо, что ты здесь.' },
  { keys: ['привет', 'здравств', 'hello'], topic: 'приветствие', emotion: 'радость', mira: 'Привет. Здесь пахнет деревом и чаем, а спешка осталась снаружи. Как прошёл твой день?', artyom: 'Привет! Я как раз смотрел на дождь. Рад, что ты зашёл. Как ты?' }
];

function showConversation(text, emotion = 'рядом с тобой') {
  $('#dialog-text').textContent = text;
  $('#emotion').textContent = `· ${emotion}`;
  $('#typing-indicator').textContent = memory.name ? `помнит тебя, ${memory.name}` : 'рядом с тобой';
  $('#conversation').classList.add('open');
  $('#composer').classList.remove('open');
}
function hideConversation() { $('#conversation').classList.remove('open'); }
function approachConversation() {
  memory.met = true;
  saveMemory();
  showConversation(introLines[currentCharacter], currentCharacter === 'mira' ? 'задумчивость' : 'доброжелательность');
}
function respond(raw) {
  const text = raw.trim();
  if (!text) return;
  const lower = text.toLowerCase();
  memory.lastTopic = text.slice(0, 100);
  const nameMatch = text.match(/меня зовут\s+([^,.!?]+)/i);
  if (nameMatch && !memory.name) memory.name = nameMatch[1].trim().slice(0, 32);
  const matched = rules.find((rule) => rule.keys.some((key) => lower.includes(key)));
  let reply, emotion = 'внимание';
  if (matched) {
    reply = matched[currentCharacter]; emotion = matched.emotion;
    if (!memory.likes.includes(matched.topic)) memory.likes.push(matched.topic);
  } else if (/[?？]$/.test(text) || lower.startsWith('почему') || lower.startsWith('как ')) {
    reply = currentCharacter === 'mira' ? 'Хороший вопрос. Мне кажется, ответ иногда появляется, если не торопить его. А ты сам к чему склоняешься?' : 'Я не уверен, что есть один ответ. Что тебе самому кажется самым важным здесь?';
    emotion = 'слушает';
  } else if (/люблю|нравится/.test(lower)) {
    reply = currentCharacter === 'mira' ? 'Запомню. Мне нравится узнавать, какие вещи делают твой день теплее.' : 'Я это запомню. Такие детали здорово помогают почувствовать человека.';
  } else {
    reply = currentCharacter === 'mira' ? 'Мира чуть кивает, внимательно слушая. «Я запомню это. Хочешь рассказать чуть больше?»' : 'Артём слушает, не перебивая. «Я понял. Что в этом для тебя самое важное?»';
  }
  if (memory.name) reply = reply.replace(/Мира/g, memory.name);
  saveMemory();
  showConversation(reply, emotion);
}

function interact(target = currentTarget) {
  if (!target) { toast('Осмотрись и выбери, к чему подойти'); return; }
  const kind = target.userData.kind;
  if (kind === 'companion') { approachConversation(); return; }
  const lines = {
    tea: currentCharacter === 'mira'
      ? 'Чашка ещё хранит тепло. Мира замечает твой взгляд: «Я положила сюда немного мёда, если захочешь».'
      : 'На блюдце тихо звякает ложка. Артём подвигает чашку к краю столика: «Угощайся».',
    book: 'Книга раскрыта на странице с загнутым уголком. Между страницами засушен маленький лист.',
    window: 'За окном серебрится луна. Дождь почти стих, и на стекле остались только тонкие дорожки капель.',
    shelf: 'На полке стоят книги, которые перечитывают, когда хочется снова оказаться в знакомом месте.'
  };
  if (!memory.objects.includes(kind)) memory.objects.push(kind);
  saveMemory();
  showConversation(lines[kind] || 'В комнате тихо и уютно.', 'замечает детали');
}

function updateTarget() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObjects(interactables, false);
  const next = hits.find((hit) => hit.distance <= 5.4)?.object || null;
  currentTarget = next;
  const focus = $('#focus');
  if (next) {
    const companion = next.userData.kind === 'companion';
    focus.innerHTML = `${companion ? names[currentCharacter] : next.userData.name} рядом <span>·</span> <b>${companion ? 'коснись, чтобы поговорить' : 'коснись, чтобы осмотреть'}</b><i>⌄</i>`;
    focus.classList.add('visible');
    $('#action small').textContent = companion ? 'Поговорить' : 'Осмотреть';
  } else {
    focus.classList.remove('visible');
    $('#action small').textContent = 'Действие';
  }
}

// Touch joystick drives gentle first-person movement; dragging the scene changes the view.
const joystick = $('#joystick');
const stick = $('#stick');
const move = { x: 0, y: 0, pointer: null };
function moveStick(event) {
  const rect = joystick.getBoundingClientRect();
  const radius = rect.width * 0.32;
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  const length = Math.hypot(dx, dy) || 1;
  const scale = Math.min(1, radius / length);
  move.x = dx / radius * scale;
  move.y = dy / radius * scale;
  stick.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
}
joystick.addEventListener('pointerdown', (event) => {
  event.preventDefault(); move.pointer = event.pointerId; joystick.setPointerCapture(event.pointerId); moveStick(event);
});
joystick.addEventListener('pointermove', (event) => { if (move.pointer === event.pointerId) moveStick(event); });
function releaseStick(event) {
  if (move.pointer !== event.pointerId) return;
  move.pointer = null; move.x = 0; move.y = 0; stick.style.transform = '';
}
joystick.addEventListener('pointerup', releaseStick);
joystick.addEventListener('pointercancel', releaseStick);

let lookPointer = null;
let lastLookX = 0, lastLookY = 0;
canvas.addEventListener('pointerdown', (event) => {
  if (!isLooking || event.pointerType === 'mouse' && event.button !== 0) return;
  lookPointer = event.pointerId; lastLookX = event.clientX; lastLookY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (lookPointer !== event.pointerId) return;
  const dx = event.clientX - lastLookX, dy = event.clientY - lastLookY;
  lastLookX = event.clientX; lastLookY = event.clientY;
  player.yaw -= dx * 0.0042;
  player.pitch = THREE.MathUtils.clamp(player.pitch - dy * 0.003, -0.5, 0.36);
});
function endLook(event) { if (lookPointer === event.pointerId) lookPointer = null; }
canvas.addEventListener('pointerup', endLook);
canvas.addEventListener('pointercancel', endLook);

$('#action').addEventListener('click', () => interact());
$('#focus').addEventListener('click', () => interact(currentTarget || interactables[0]));
$('#change-person').addEventListener('click', () => {
  setCharacter(currentCharacter === 'mira' ? 'artyom' : 'mira');
  $('#dialog-text').textContent = currentCharacter === 'mira' ? 'Мира возвращается в кресло и улыбается тебе.' : 'Артём снова рядом. «Я как раз сохранил тебе место».';
  toast(`Теперь рядом ${names[currentCharacter]}`);
});
$('#character-select').addEventListener('change', (event) => setCharacter(event.target.value));
$('#close-dialog').addEventListener('click', hideConversation);
$('#text-toggle').addEventListener('click', () => {
  const composer = $('#composer');
  composer.classList.toggle('open');
  if (composer.classList.contains('open')) $('#message').focus();
});
$('#composer').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#message');
  const value = input.value;
  input.value = '';
  respond(value);
});
document.querySelectorAll('.quick-actions [data-command]').forEach((button) => {
  button.addEventListener('click', () => respond(button.dataset.command));
});
$('#speak-reply').addEventListener('click', () => {
  if (!('speechSynthesis' in window)) { toast('Озвучивание не поддерживается этим браузером'); return; }
  window.speechSynthesis.cancel();
  const speech = new SpeechSynthesisUtterance($('#dialog-text').textContent);
  speech.lang = 'ru-RU'; speech.rate = 0.92; speech.pitch = currentCharacter === 'mira' ? 1.08 : 0.94;
  window.speechSynthesis.speak(speech);
});
let recognition = null;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
$('#mic').addEventListener('click', () => {
  if (!SpeechRecognition) { toast('Голосовой ввод недоступен — напиши сообщение'); $('#composer').classList.add('open'); $('#message').focus(); return; }
  if (recognition) { recognition.stop(); return; }
  recognition = new SpeechRecognition();
  recognition.lang = 'ru-RU'; recognition.interimResults = false; recognition.maxAlternatives = 1;
  $('#mic').classList.add('recording');
  recognition.onresult = (event) => respond(event.results[0][0].transcript);
  recognition.onerror = () => toast('Не удалось распознать речь. Попробуй ещё раз или напиши сообщение.');
  recognition.onend = () => { recognition = null; $('#mic').classList.remove('recording'); };
  try { recognition.start(); } catch { recognition = null; $('#mic').classList.remove('recording'); toast('Микрофон сейчас недоступен'); }
});
$('#look-toggle').addEventListener('click', () => {
  isLooking = !isLooking;
  $('#look-toggle').classList.toggle('active', isLooking);
  $('#look-note').textContent = isLooking ? '▱  проведи пальцем, чтобы оглядеться' : 'обзор остановлен';
  toast(isLooking ? 'Обзор включён' : 'Обзор остановлен');
});

$('#menu').addEventListener('click', () => $('#settings').classList.add('open'));
$('#close-settings').addEventListener('click', () => $('#settings').classList.remove('open'));
$('#settings').addEventListener('click', (event) => { if (event.target === $('#settings')) $('#settings').classList.remove('open'); });
function syncToggles() {
  $('#lamp-toggle').classList.toggle('on', memory.lamp);
  $('#sound-toggle').classList.toggle('on', memory.sound);
  lampGlow.visible = memory.lamp;
}
$('#lamp-toggle').addEventListener('click', () => { memory.lamp = !memory.lamp; syncToggles(); saveMemory(); });

// A soft filtered noise bed is generated locally, so the room needs no audio download.
let audioContext = null, rainSource = null, rainGain = null;
function setRain(enabled) {
  memory.sound = enabled; syncToggles(); saveMemory();
  if (!enabled) { if (rainGain) rainGain.gain.setTargetAtTime(0, audioContext.currentTime, .35); return; }
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume();
    if (!rainSource) {
      const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 3, audioContext.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i=0;i<data.length;i++) data[i] = (Math.random()*2-1) * (0.25 + Math.random()*0.75);
      rainSource = audioContext.createBufferSource(); rainSource.buffer = buffer; rainSource.loop = true;
      const filter = audioContext.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 720;
      rainGain = audioContext.createGain(); rainGain.gain.value = 0;
      rainSource.connect(filter).connect(rainGain).connect(audioContext.destination); rainSource.start();
    }
    rainGain.gain.setTargetAtTime(.035, audioContext.currentTime, .7);
  } catch { toast('Звук недоступен в этом браузере'); memory.sound = false; syncToggles(); saveMemory(); }
}
$('#sound-toggle').addEventListener('click', () => setRain(!memory.sound));
syncToggles();
if (memory.sound) setRain(true);

$('#photo').addEventListener('click', () => {
  try {
    const link = document.createElement('a');
    link.download = `тихая-комната-${new Date().toISOString().slice(0,10)}.png`;
    link.href = renderer.domElement.toDataURL('image/png'); link.click();
    toast('Снимок сохранён');
  } catch { toast('Не удалось сохранить снимок'); }
});
$('#reset-memory').addEventListener('click', () => {
  const keepCharacter = currentCharacter;
  memory = { ...defaults, character: keepCharacter };
  saveMemory();
  $('#settings').classList.remove('open');
  toast('Знакомство начнётся заново');
  $('#typing-indicator').textContent = 'рядом с тобой';
});
$('#enter').addEventListener('click', () => {
  $('#intro').classList.add('hidden');
  if (!memory.met) setTimeout(approachConversation, 700);
});

// Keep the player within the room and update raycast focus each frame.
function frame() {
  requestAnimationFrame(frame);
  const delta = Math.min(clock.getDelta(), 0.05);
  const speed = 2.25;
  const forward = -move.y * speed * delta;
  const sideways = move.x * speed * delta;
  player.x += Math.cos(player.yaw) * sideways + Math.sin(player.yaw) * forward;
  player.z += Math.sin(player.yaw) * sideways - Math.cos(player.yaw) * forward;
  player.x = THREE.MathUtils.clamp(player.x, -4.25, 4.25);
  player.z = THREE.MathUtils.clamp(player.z, -4.25, 4.1);
  updateCamera();
  updateTarget();
  animateCompanion(clock.elapsedTime);
  renderer.render(scene, camera);
}
updateCamera();
frame();
