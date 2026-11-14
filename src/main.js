import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { scene, camera, renderer, lampGlow, characterRoot, interactables, makeCompanion, animateCompanion, setCompanionAction, setCompanionEmotion } from './scene.js';

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

const names = { mira: 'Мира' };
const introLines = {
  mira: 'Я оставила чай у кровати. Луна сегодня похожа на театральный прожектор — будто вот-вот поднимется занавес.'
};
const currentCharacter = 'mira';
function setCharacter() {
  makeCompanion('mira');
  $('#companion-name').textContent = names.mira;
  $('#dialog-name').textContent = names.mira;
  $('.avatar').textContent = 'м';
  $('.dialog-avatar').textContent = 'м';
  $('#mood').textContent = 'спокойное настроение';
  $('#focus').innerHTML = 'Мира рядом <span>·</span> <b>коснись, чтобы поговорить</b><i>⌄</i>';
  $('#message').placeholder = 'Скажи Мире что-нибудь…';
  $('#mic').setAttribute('aria-label', 'Сказать голосом Мире');
  memory.character = 'mira';
  saveMemory();
}
setCharacter();
$('#dialog-text').textContent = introLines.mira;

const rules = [
  { keys: ['истор', 'сказ', 'story'], topic: 'истории', emotion: 'рассказывает историю', reply: 'В одном старом театре был маленький кот, который выходил на пустую сцену после каждого спектакля. Он садился в первый ряд и смотрел на погасший занавес, будто аплодировал тем, кто уже ушёл домой. Мне нравится думать, что искусство остаётся с нами именно так — тихо, после финала.' },
  { keys: ['кино', 'фильм', 'актёр', 'режиссёр', 'сцен', 'театр', 'спектак', 'пьес'], topic: 'кино и театр', emotion: 'оживление', reply: 'Я люблю, когда в фильме или спектакле есть сцена, которая ничего не объясняет напрямую — просто взгляд, пауза, свет на лице. Потом выходишь и ещё долго прокручиваешь её в голове. Какая сцена у тебя недавно осталась внутри?' },
  { keys: ['чай', 'завар', 'напит', 'tea'], topic: 'чай', emotion: 'забота', reply: 'Чай уже заварен. Я оставила немного мёда: с жасмином он пахнет почти как сад после дождя. Давай устроим ему честную дегустацию?' },
  { keys: ['мечт', 'будущ', 'хотел', 'dream'], topic: 'мечты', emotion: 'мечтательность', reply: 'Если бы завтра можно было проснуться где угодно, я бы выбрала маленький дом у моря и утро без расписания. А ты бы куда сбежал хотя бы на один день?' },
  { keys: ['груст', 'тяжел', 'плохо', 'устал', 'одиноко', 'тревож', 'боюсь'], topic: 'поддержка', emotion: 'внимание', reply: 'Не нужно сейчас подбирать правильные слова. Можно просто посидеть рядом. Хочешь — расскажи, что сегодня было самым трудным; я не буду торопить.' },
  { keys: ['спасибо', 'благодар'], topic: 'благодарность', emotion: 'улыбка', reply: 'Скажешь так — и у меня сразу появляется повод улыбнуться. Спасибо, что поделился со мной этим вечером.' },
  { keys: ['привет', 'здравств', 'hello'], topic: 'вечер', emotion: 'радость', reply: 'Я всё думаю о финале того фильма, где героиня так и не сказала главного вслух. Иногда пауза честнее красивой речи, правда? Что у тебя сегодня крутится в голове?' }
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
  const remembered = memory.name ? `${memory.name}, ` : '';
  const oldTopicWasCommand = [...actionCommands, ...emotionCommands].some((command) =>
    command.keys.some((key) => (memory.lastTopic || '').toLowerCase().includes(key))
  );
  const rememberedTopic = oldTopicWasCommand ? '' : memory.lastTopic;
  const line = memory.visits > 1
    ? `${remembered}я оставила чай у кровати. В прошлый раз мы заговорили о теме «${rememberedTopic || 'твоего вечера'}» — я поймала себя на мысли, что всё ещё об этом думаю.`
    : introLines.mira;
  showConversation(line, 'задумчивость');
}

const actionCommands = [
  { keys: ['обним', 'hug'], action: 'hug', emotion: 'shy', label: 'смущение', reply: 'Иди сюда… Мира мягко обнимает тебя, задерживаясь на мгновение дольше обычного.' },
  { keys: ['подойди', 'подойду', 'приблиз', 'иди ко мне'], action: 'approach', emotion: 'joy', label: 'радость', reply: 'Мира подходит ближе и чуть улыбается: «Так лучше? Теперь я могу говорить потише».' },
  { keys: ['сядь', 'сесть', 'садись', 'присяд'], action: 'sit', emotion: 'joy', label: 'спокойствие', reply: 'Мира садится на край кровати и похлопывает ладонью по месту рядом: «Осторожно, звёздная подушка сегодня занимает лучшие места».' },
  { keys: ['встань', 'встать', 'поднимись'], action: 'idle', emotion: 'joy', label: 'готовность', reply: 'Мира встаёт и поправляет складки юбки: «Ну вот, снова на ногах. Что дальше?»' },
  { keys: ['танц', 'потанц', 'dance'], action: 'dance', emotion: 'joy', label: 'радость', reply: 'Мира делает несколько лёгких танцевальных шагов, будто в комнате играет музыка только для вас двоих.' },
  { keys: ['завари', 'сделай чай', 'налей чай'], action: 'tea', emotion: 'joy', label: 'забота', reply: 'Мира берёт чашку со столика и осторожно разливает чай. «Готово. Только дай ему минутку, он горячий».' }
];
const emotionCommands = [
  { keys: ['грусти', 'грустн', 'печаль'], value: 'sad', label: 'грусть' },
  { keys: ['смущ', 'застенчив'], value: 'shy', label: 'смущение' },
  { keys: ['удив', 'шок'], value: 'surprised', label: 'удивление' },
  { keys: ['радост', 'весел', 'улыбнись'], value: 'joy', label: 'радость' }
];
function respond(raw) {
  const text = raw.trim();
  if (!text) return;
  const lower = text.toLowerCase();
  const nameMatch = text.match(/(?:меня зовут|зови меня|моё имя|мое имя)\s+([^,.!?]+)/i);
  if (nameMatch) memory.name = nameMatch[1].trim().slice(0, 32);

  const requestedEmotion = emotionCommands.find((item) => item.keys.some((key) => lower.includes(key)));
  const requestedAction = actionCommands.find((item) => item.keys.some((key) => lower.includes(key)));
  let reply, emotion = 'внимание';
  let rememberedTopic = text;
  if (requestedEmotion) {
    setCompanionEmotion(requestedEmotion.value);
    $('#mood').textContent = `${requestedEmotion.label} настроение`;
    reply = `Мира меняет выражение лица на ${requestedEmotion.label === 'грусть' ? 'печальное' : requestedEmotion.label === 'удивление' ? 'удивлённое' : requestedEmotion.label === 'смущение' ? 'смущённое' : 'радостное'} и смотрит на тебя, ожидая реакции.`;
    emotion = requestedEmotion.label;
  } else if (requestedAction) {
    setCompanionAction(requestedAction.action);
    if (requestedAction.emotion) setCompanionEmotion(requestedAction.emotion);
    $('#mood').textContent = requestedAction.label;
    reply = requestedAction.reply;
    emotion = requestedAction.label;
  } else {
    const matched = rules.find((rule) => rule.keys.some((key) => lower.includes(key)));
    if (matched) {
      reply = matched.reply;
      emotion = matched.emotion;
      rememberedTopic = matched.topic;
      if (!memory.likes.includes(matched.topic)) memory.likes.push(matched.topic);
    } else if (/[?？]$/.test(text) || lower.startsWith('почему') || lower.startsWith('как ')) {
      reply = 'Хороший вопрос. Мне кажется, ответ иногда появляется, если не торопить его. А ты сам к чему склоняешься?';
      emotion = 'слушает';
    } else if (/меня зовут|зови меня|моё имя|мое имя/i.test(text)) {
      reply = `Очень приятно, ${memory.name}. Постараюсь запомнить. А теперь расскажи: какой фильм ты пересматривал бы даже в дождливый вечер?`;
      emotion = 'улыбка';
    } else if (/люблю|нравится/.test(lower)) {
      reply = 'Запомню. Мне нравится узнавать, какие вещи делают твой день теплее.';
      emotion = 'интерес';
    } else if (memory.lastTopic) {
      reply = `Я запомнила, что ты говорил о «${memory.lastTopic}». Что в этом для тебя самое важное?`;
      emotion = 'внимание';
    } else {
      reply = 'Мира чуть кивает, внимательно слушая: «Расскажи мне об этом ещё немного — мне правда интересно, что ты сам об этом думаешь».';
    }
  }
  if (memory.name && !nameMatch && !reply.includes(memory.name)) reply = `${memory.name}, ${reply.charAt(0).toLowerCase()}${reply.slice(1)}`;
  if (!requestedAction && !requestedEmotion && !nameMatch) memory.lastTopic = rememberedTopic.slice(0, 100);
  saveMemory();
  showConversation(reply, emotion);
}

function interact(target = currentTarget) {
  if (!target) { toast('Осмотрись и выбери, к чему подойти'); return; }
  const kind = target.userData.kind;
  if (kind === 'companion') { approachConversation(); return; }
  const lines = {
    tea: 'Чашка ещё хранит тепло, а на блюдце лежит ложка мёда. Я выбирала его долго — не смейся, у чая тоже бывает характер.',
    bed: 'Белое покрывало чуть сбилось, а звёздная подушка заняла почти всё место. Похоже, кто-то уже выбрал себе сторону кровати.',
    desk: 'На экране застыл кадр старого фильма. Я никак не могу решить, красивее здесь свет или то, как актриса молчит.',
    window: 'За окном серебрится луна. Дождь почти стих, и на стекле остались только тонкие дорожки капель.',
    shelf: 'На полке стоят книги и сценарии, которые перечитывают, когда хочется снова оказаться в знакомой истории.'
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
