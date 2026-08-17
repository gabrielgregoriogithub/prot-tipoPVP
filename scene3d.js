import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

// Fase 0 do plano de migração 3D: spike estático (grid plano, sem terreno
// real/unidades/input ainda — isso entra nas fases seguintes). Lê BOARD_SIZE
// direto do escopo global de game.js (script clássico carregado antes deste
// módulo, então já executou e populou suas const/let de nível superior).

const canvas = document.getElementById("scene3d-canvas");
const boardWrapper = document.getElementById("board-wrapper");
const toggleBtn = document.getElementById("scene3d-toggle-btn");
const zoomControls = document.getElementById("scene3d-zoom-controls");
const zoomInBtn = document.getElementById("scene3d-zoom-in-btn");
const zoomOutBtn = document.getElementById("scene3d-zoom-out-btn");
const zoomResetBtn = document.getElementById("scene3d-zoom-reset-btn");
const zoomIndicator = document.getElementById("scene3d-zoom-indicator");
let scene3dEnabled = false; // 2D é a visão padrão; 3D continua disponível no botão.

const ISO_ELEVATION_DEG = 32; // ângulo de elevação da câmera, faixa clássica do FFT (30-35°)
const CAMERA_DISTANCE = BOARD_SIZE * 1.4;
// A visão anterior usava 0.66 tiles de altura por tile do mapa (8.58 no
// tabuleiro 13x13). 0.58 aproxima um pouco mais a leitura sem perder as
// bordas, inclusive nas quatro rotações e com as estruturas mais altas.
// Pan continua sendo a forma de explorar qualquer trecho que fique fora da
// composição inicial em uma tela pequena.
// Frustum ortográfico em unidades de mundo por tile lógico. Mantê-lo abaixo
// da escala física do grid faz cada célula ocupar mais pixels; pan cobre as
// bordas que deixam de caber no enquadramento inicial.
const CAMERA_VIEW_SIZE_PER_TILE = 0.35;
const CAMERA_ZOOM_MIN_VIEW_SIZE_PER_TILE = 0.24;
const CAMERA_ZOOM_MAX_VIEW_SIZE_PER_TILE = 0.52;
const CAMERA_ZOOM_STEP = 0.1;
const CAMERA_ZOOM_SMOOTHING = 0.22;
let cameraViewSizePerTile = CAMERA_VIEW_SIZE_PER_TILE;
let targetCameraViewSizePerTile = CAMERA_VIEW_SIZE_PER_TILE;
// Espaçamento físico único do grid 3D. Coordenadas lógicas continuam em
// {x,y}; somente tileToWorld converte cada passo para o mundo Three.js.
const WORLD_TILE_SIZE = 1.55;
// O grid pode crescer sem transformar o lunge em deslocamento de tile.
const MAX_LUNGE_VISUAL_DISTANCE = 0.72;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);

// Fase 6: rotação em snap de 90° ao redor do centro do tabuleiro (yaw) +
// controle de elevação (pitch, "visão aérea") — os dois só mudam de onde a
// câmera olha, nunca coordenada de tile/lógica: onTileClick,
// computeReachable etc. continuam operando em {x,y} do grid, alheios a de
// onde a câmera olha. cameraYawSteps=0 + cameraElevationDeg=ISO_ELEVATION_DEG
// é a "câmera clássica" original (canto isométrico, x=z) — CAMERA_BASE_YAW_DEG
// foi escolhido pra reproduzir exatamente essa posição nesse caso.
const CAMERA_BASE_YAW_DEG = 45;
let cameraYawSteps = 0; // 0-3, cada passo = 90°
let cameraElevationDeg = ISO_ELEVATION_DEG;
// Navegação por arrastar (ver mousedown/mousemove mais abaixo) — offset em
// coordenadas de MUNDO (não view-relative), soma direto na posição da
// câmera E no ponto de mira, então continua válido não importa o
// yaw/elevação atual (arrastar "puxa" o chão pro lado que fizer sentido
// pra QUALQUER ângulo, sem precisar reprojetar ao girar/inclinar).
let cameraPanOffset = new THREE.Vector3(0, 0, 0);

function cameraPositionFor(yawSteps, elevationDeg) {
  const elevationRad = THREE.MathUtils.degToRad(elevationDeg);
  const yawRad = THREE.MathUtils.degToRad(CAMERA_BASE_YAW_DEG + yawSteps * 90);
  const horizontalRadius = CAMERA_DISTANCE * Math.cos(elevationRad) * Math.SQRT2;
  const height = CAMERA_DISTANCE * Math.sin(elevationRad);
  return new THREE.Vector3(horizontalRadius * Math.cos(yawRad), height, horizontalRadius * Math.sin(yawRad));
}

const cameraBasePosition = cameraPositionFor(0, ISO_ELEVATION_DEG); // referência de "repouso" pro jitter do screen shake (Fase 4) voltar depois
camera.position.copy(cameraBasePosition);
camera.lookAt(0, 0, 0);

function applyCameraTransform() {
  cameraBasePosition.copy(cameraPositionFor(cameraYawSteps, cameraElevationDeg)).add(cameraPanOffset);
  camera.position.copy(cameraBasePosition);
  camera.lookAt(cameraPanOffset.x, 0, cameraPanOffset.z);
}

function rotateCamera(steps) {
  cameraYawSteps = (cameraYawSteps + steps + 4) % 4;
  applyCameraTransform();
}

function setCameraElevation(deg) {
  cameraElevationDeg = deg;
  applyCameraTransform();
}

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(6, 10, 4);
scene.add(sun);

const originOffset = (BOARD_SIZE - 1) / 2;
function tileToWorld(x, y) {
  return new THREE.Vector3(
    (x - originOffset) * WORLD_TILE_SIZE,
    0,
    (y - originOffset) * WORLD_TILE_SIZE
  );
}

// Fase 1: malha de terreno real (não mais o placeholder xadrez da Fase 0),
// lida de terrainMap/TERRAIN_LAYOUT/structures (globais de game.js) e
// texturizada com os mesmos PNGs de assets/tiles/ que o board DOM usa como
// CSS background-image — ver render()/renderStructures() em game.js pro
// equivalente DOM desta lógica.

const textureLoader = new THREE.TextureLoader();

function loadPixelTexture(path, repeat = 1) {
  const texture = textureLoader.load(path);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  if (repeat > 1) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
  }
  return texture;
}

// THREE.Texture NÃO dispara um evento "load" próprio (isso é só do
// TextureLoader.load(url, onLoad), não do objeto Texture em si — usar
// texture.addEventListener("load", ...) nunca chama nada). Pra corrigir a
// proporção do sprite assim que a imagem chegar, sem depender de qual API
// de callback essa versão do three.js expõe, usa-se um Image() nativo em
// paralelo — o browser serve do cache HTTP, então não duplica o download.
function onImageDimensions(path, callback) {
  const img = new Image();
  img.onload = () => callback(img.naturalWidth, img.naturalHeight);
  img.src = path;
}

function boxMaterials(topMaterial, sideMaterial) {
  return [sideMaterial, sideMaterial, topMaterial, sideMaterial, sideMaterial, sideMaterial];
}

// Cor terrosa (não mais roxo quase preto) — com vários degraus de elevação
// próximos uns dos outros (colinas), a face lateral escura demais lia como
// "quadrado preto quebrado" em vez de barranco de terra.
const dirtSideMaterial = new THREE.MeshStandardMaterial({ color: 0x5c4a33 });
// repeat=1 (não ladrilhado): grass.png é 80x76, NÃO potência de 2 — usar
// RepeatWrapping numa textura NPOT causa artefato de quadriculado preto
// em parte dos tiles (falha de sampling em algumas GPUs/drivers), visto
// direto no jogo. Uma textura só esticada por tile perde o efeito de
// grama "ladrilhada" fina, mas renderiza sólido em vez de quebrado.
const grassTopMaterial = new THREE.MeshStandardMaterial({ map: loadPixelTexture("assets/tiles/grass.png") });
const waterMaterial = new THREE.MeshStandardMaterial({ color: 0x2a5a8a });
const groundMaterialsByType = {
  grass: boxMaterials(grassTopMaterial, dirtSideMaterial),
};

// Fase 5: eleva­ção real (elevationAt, game.js) — cada tile já era uma caixa
// (não um plano) desde a Fase 1 exatamente pra isso não exigir trocar de
// geometria agora, só ficar mais alta/baixa. A caixa sempre desce até
// GROUND_BASE_Y (bem abaixo de qualquer nível existente) pra nunca aparecer
// vão entre tiles vizinhos de altura diferente — só um punhado de níveis
// inteiros existe no mapa (-1 a 3), então a geometria é cacheada por nível
// em vez de criada de novo por tile.
const ELEVATION_UNIT = 0.6; // altura em unidades de mundo de 1 nível de eleva­ção
const GROUND_BASE_Y = -3;
function tileTopY(x, y) {
  return elevationAt(Math.floor(x), Math.floor(y)) * ELEVATION_UNIT;
}

// Fase 7 (fechamento de gap): projeta um ponto do tabuleiro (x,y em
// coordenadas de tile, aceita fracionário) pra %-de-tela de dentro de
// #board-wrapper, respeitando câmera/rotação/elevação atuais de verdade —
// exposta global de propósito pra game.js (script clássico, sem import de
// módulo) poder reposicionar VFX/menus que hoje vivem em #board-overlay
// (ver tileScreenPercent em game.js). yOffset é em unidades de mundo,
// somado à altura do chão naquele ponto (útil pra "flutuar" acima do tile,
// ex: texto de dano na altura do peito de um personagem).
window.scene3dTileToScreenPercent = function (x, y, yOffset = 0) {
  // null quando a 3D está desligada (toggle "🖼️ 2D (debug)") — sem isso,
  // VFX/menu ficavam usando a projeção 3D mesmo com o board 2D antigo
  // visível, aparecendo em lugar nenhuma relação com o grid plano de
  // verdade. tileScreenPercent (game.js) cai pra fórmula plana quando essa
  // função devolve null.
  if (!scene3dEnabled) return null;
  const world = tileToWorld(x, y);
  world.y = tileTopY(x, y) + yOffset;
  const ndc = world.project(camera);
  return { leftPct: ((ndc.x + 1) / 2) * 100, topPct: ((1 - ndc.y) / 2) * 100 };
};
const groundGeometryByLevel = new Map();
function getGroundGeometry(level) {
  if (!groundGeometryByLevel.has(level)) {
    const topY = level * ELEVATION_UNIT;
    groundGeometryByLevel.set(level, new THREE.BoxGeometry(WORLD_TILE_SIZE, topY - GROUND_BASE_Y, WORLD_TILE_SIZE));
  }
  return groundGeometryByLevel.get(level);
}

// Decoração/props (árvore, casa, castelo etc.): sprites que sempre encaram
// a câmera, mesma técnica planejada pra unidades na Fase 2 — resolve o
// mesmo tipo de problema (arte 2D só existe de um ângulo) pra cenário
// estático, então reaproveitar aqui evita reinventar duas abordagens.
const billboardTextureCache = new Map();
function loadBillboardTexture(path) {
  if (!billboardTextureCache.has(path)) {
    billboardTextureCache.set(path, loadPixelTexture(path));
  }
  return billboardTextureCache.get(path);
}

function addBillboard(centerX, centerY, path, targetHeight) {
  const texture = loadBillboardTexture(path);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  const world = tileToWorld(centerX, centerY);
  sprite.scale.set(targetHeight, targetHeight, 1); // corrigido pra proporção real assim que a imagem carregar
  sprite.position.set(world.x, tileTopY(centerX, centerY) + targetHeight / 2, world.z);
  scene.add(sprite);

  onImageDimensions(path, (w, h) => sprite.scale.set(targetHeight * (w / h), targetHeight, 1));
  return sprite;
}

const TREE_ART = { tree: 1.5, tent: 1.4, house: 2.0, stump: 0.7, "house-rubble": 1.3, "tent-rubble": 1.1 };

// Fase 3: um plano fino por tile, empilhado bem acima do chão, que fica
// invisível (opacity 0) até ligarmos alguma cor de destaque — mesmo papel
// das classes CSS movable/attackable/telegraph/aoe-preview em render()
// (game.js:4280-4299), só que aqui não dá pra pintar o material do chão
// direto porque grama/água são materiais COMPARTILHADOS entre várias
// tiles (pintar um pintaria todas).
const highlightGeometry = new THREE.PlaneGeometry(WORLD_TILE_SIZE * 0.92, WORLD_TILE_SIZE * 0.92);
const highlightMeshes = new Map(); // "x,y" -> THREE.Mesh

function tileKey3d(x, y) {
  return `${x},${y}`;
}

const gridGroup = new THREE.Group();

for (let x = 0; x < BOARD_SIZE; x++) {
  for (let y = 0; y < BOARD_SIZE; y++) {
    const terrain = terrainAt(x, y);
    const isWater = terrain && terrain.type === "water";
    const groundMat = isWater ? waterMaterial : groundMaterialsByType.grass;

    const level = elevationAt(x, y);
    const topY = level * ELEVATION_UNIT;
    const box = new THREE.Mesh(getGroundGeometry(level), groundMat);
    const world = tileToWorld(x, y);
    box.position.set(world.x, (topY + GROUND_BASE_Y) / 2, world.z);
    box.userData = { x, y };
    gridGroup.add(box);

    const highlightMaterial = new THREE.MeshBasicMaterial({
      color: 0x3d5a7a,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const highlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
    highlight.rotation.x = -Math.PI / 2;
    highlight.position.set(world.x, topY + 0.01, world.z);
    gridGroup.add(highlight);
    highlightMeshes.set(tileKey3d(x, y), highlight);

    if (terrain && (terrain.type === "tree" || terrain.type === "tent")) {
      addBillboard(x, y, `assets/tiles/${terrain.art}`, TREE_ART[terrain.type]);
    } else if (terrain && terrain.type === "house") {
      addBillboard(x, y, "assets/tiles/house.png", TREE_ART.house);
    } else if (terrain && terrain.type === "stump") {
      addBillboard(x, y, "assets/tiles/stump.png", TREE_ART.stump);
    } else if (terrain && (terrain.type === "house-rubble" || terrain.type === "tent-rubble")) {
      addBillboard(x, y, "assets/tiles/rubble-castle.png", TREE_ART[terrain.type]);
    } else if (terrain && terrain.type === "water" && x === WATERFALL_TILE.x && y === WATERFALL_TILE.y) {
      addBillboard(x, y, "assets/tiles/waterfall.png", 1.8);
    }

    if (!terrain && !structureAt(x, y)) {
      const flower = FLOWER_LAYOUT.find((f) => f.x === x && f.y === y);
      if (flower) addBillboard(x, y, `assets/tiles/${flower.art}`, 0.5);
    }
  }
}

for (const structure of structures) {
  const minX = Math.min(...structure.tiles.map((t) => t.x));
  const maxX = Math.max(...structure.tiles.map((t) => t.x));
  const minY = Math.min(...structure.tiles.map((t) => t.y));
  const maxY = Math.max(...structure.tiles.map((t) => t.y));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const art = structure.destroyed
    ? `assets/tiles/rubble-${structure.type}.png`
    : `assets/tiles/${structure.type}.png`;
  addBillboard(centerX, centerY, art, 3.6);
}

scene.add(gridGroup);

// Fase 2: unidades como sprites que sempre encaram a câmera (mesma técnica
// dos props de terreno acima) — resolve a falta de arte de outras direções
// (só existe o frame "de frente"/down pra cada personagem, ver
// assets/README.md). Ainda cosmético: sem input, sem sync de movimento
// (isso entra nas Fases 3/4) — só posiciona cada unidade viva na pose idle
// no tile onde ela já está.
// Altura visual no mundo 3D, declarada por spriteKey e independente dos
// atributos/regras da unidade. Os valores partem da altura anterior (1.6)
// e consideram a leitura das silhuetas reais: o Guerreiro e o Troll ganham
// massa de linha de frente; os demais permanecem próximos entre si para não
// competir com o cenário nem cobrir tiles adjacentes.
const UNIT_VISUAL_PROFILES = {
  guerreiro: { height: 2.38 },
  arqueiro: { height: 2.1 },
  mago: { height: 2.16 },
  ladino: { height: 2.02 },
  quimico: { height: 2.13 },
  goblin: { height: 1.95 },
  orc: { height: 2.27 },
  xama: { height: 2.08 },
  fada: { height: 1.95 },
  troll: { height: 2.5 },
};
const DEFAULT_UNIT_VISUAL_PROFILE = { height: 2.05 };

function unitVisualHeight(unit) {
  return (UNIT_VISUAL_PROFILES[unit.spriteKey] || DEFAULT_UNIT_VISUAL_PROFILE).height;
}

const unitBillboards = new Map(); // unit -> THREE.Sprite
const unitMaterials = new Map(); // unit -> THREE.SpriteMaterial
const unitShadows = new Map(); // unit -> THREE.Mesh
const unitFrameSets = new Map(); // unit -> { idle, walk, attack, cast, hit, death } (mesmo formato de loadSpriteFrames, game.js:1301)
// Estado exclusivamente de apresentação: basePosition acompanha o tile
// lógico; attack/hit só acrescentam offsets que o render loop consome e zera.
// Nenhum destes campos é lido pelo motor de regras em game.js.
const unitVisualStates = new Map();
const attackSourceByTarget = new Map();
const unitShadowGeometry = new THREE.CircleGeometry(0.5, 20);
const unitShadowMaterial = new THREE.MeshBasicMaterial({
  color: 0x08060b,
  transparent: true,
  opacity: 0.28,
  depthWrite: false,
});

function unitShadowScale(unit) {
  const height = unitVisualHeight(unit);
  return { width: height * 0.46, depth: height * 0.19 };
}

const COMBAT_POSE_PROFILES = {
  guerreiro: { lungeMultiplier: 1.35, recoilMultiplier: 0.9, castLift: 0 },
  arqueiro: { lungeMultiplier: 0.38, recoilMultiplier: 1.08, castLift: 0 },
  mago: { lungeMultiplier: 0.28, recoilMultiplier: 1.05, castLift: 0.13 },
  ladino: { lungeMultiplier: 1.18, recoilMultiplier: 1.18, castLift: 0 },
  quimico: { lungeMultiplier: 0.55, recoilMultiplier: 1.08, castLift: 0.04 },
  goblin: { lungeMultiplier: 0.86, recoilMultiplier: 1.06, castLift: 0 },
  orc: { lungeMultiplier: 1.18, recoilMultiplier: 0.96, castLift: 0 },
  xama: { lungeMultiplier: 0.28, recoilMultiplier: 1.04, castLift: 0.11 },
  fada: { lungeMultiplier: 0.25, recoilMultiplier: 0.98, castLift: 0.1 },
  troll: { lungeMultiplier: 1.36, recoilMultiplier: 0.88, castLift: 0 },
};
const DEFAULT_COMBAT_POSE_PROFILE = { lungeMultiplier: 0.92, recoilMultiplier: 1, castLift: 0.06 };

// Etapa 9: a imagem é a fonte de verdade da encenação. Cada perfil descreve
// a sequência de PNGs que já existe no personagem; não participa de dano,
// alcance, CT ou MP. `contactFrame` e `releaseFrame` começam em 1, para a
// conferência direta com os arquivos.
const UNIT_ANIMATION_PROFILES = {
  guerreiro: {
    frameDurations: [100, 130, 80, 85, 95, 110],
    contactFrame: 3,
    releaseFrame: 3,
  },
  ladino: {
    frameDurations: [70, 70, 70, 65, 70, 70, 95],
    contactFrame: 3,
    releaseFrame: 3,
  },
  arqueiro: {
    frameDurations: [80, 100, 120, 70, 60, 75, 85],
    contactFrame: 5,
    releaseFrame: 5,
  },
  mago: {
    frameDurations: [100, 120, 115, 100, 85, 60, 100],
    contactFrame: 6,
    releaseFrame: 6,
  },
  quimico: {
    frameDurations: [90, 100, 105, 80, 75, 85, 115],
    contactFrame: 6,
    releaseFrame: 6,
  },
  goblin: {
    frameDurations: [85, 80, 60, 65, 75, 70, 85],
    contactFrame: 3,
    releaseFrame: 3,
  },
  fada: {
    frameDurations: [90, 90, 85, 80, 75, 65, 85, 120],
    contactFrame: 6,
    releaseFrame: 6,
  },
  orc: {
    frameDurations: [100, 85, 75, 90, 80, 105],
    contactFrame: 3,
    releaseFrame: 3,
  },
  troll: {
    frameDurations: [105, 100, 85, 80, 90, 75, 110],
    contactFrame: 6,
    releaseFrame: 6,
  },
  xama: {
    frameDurations: [95, 100, 95, 85, 80, 70, 105],
    contactFrame: 6,
    releaseFrame: 6,
  },
};
const DEFAULT_UNIT_ANIMATION_PROFILE = {
  frameDurations: [100, 100, 85, 90, 105],
  contactFrame: 3,
  releaseFrame: 3,
};

function combatPoseProfile(unit) {
  return COMBAT_POSE_PROFILES[unit.spriteKey] || DEFAULT_COMBAT_POSE_PROFILE;
}

function unitAnimationProfile(unit) {
  return UNIT_ANIMATION_PROFILES[unit.spriteKey] || DEFAULT_UNIT_ANIMATION_PROFILE;
}

function frameSchedule(profile, frameCount) {
  const source = profile.frameDurations || DEFAULT_UNIT_ANIMATION_PROFILE.frameDurations;
  const durations = Array.from(
    { length: frameCount },
    (_, index) => (source[index] || source[source.length - 1] || 100) / ATTACK_PLAYBACK_RATE,
  );
  const startTimes = [];
  let elapsed = 0;
  for (const duration of durations) {
    startTimes.push(elapsed);
    elapsed += duration;
  }
  return { durations, startTimes, duration: elapsed };
}

function frameMoment(profile, frameCount, frame) {
  const schedule = frameSchedule(profile, frameCount);
  const index = THREE.MathUtils.clamp((frame || 1) - 1, 0, frameCount - 1);
  return schedule.duration ? schedule.startTimes[index] / schedule.duration : 0;
}

function billboardIdleFramePhase(unit, frameCount) {
  const key = `${unit.spriteKey || unit.name || "unit"}:${unit.x},${unit.y}`;
  let hash = 0;
  for (let index = 0; index < key.length; index++) hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  return hash % frameCount;
}

function getOrCreateUnitVisualState(unit, sprite) {
  let state = unitVisualStates.get(unit);
  if (state) return state;
  state = {
    basePosition: sprite.position.clone(),
    baseWidth: sprite.scale.x,
    baseHeight: sprite.scale.y,
    attack: null,
    hit: null,
    dead: false,
    idleFrames: null,
    idlePhase: 0,
    idleFrameIndex: -1,
  };
  unitVisualStates.set(unit, state);
  return state;
}

function setBillboardFrame(unit, url) {
  const material = unitMaterials.get(unit);
  const sprite = unitBillboards.get(unit);
  if (!material || !sprite) return;
  material.map = loadPixelTexture(url);
  material.color.set(0xffffff);
  material.needsUpdate = true;
  const height = unitVisualHeight(unit);
  const state = getOrCreateUnitVisualState(unit, sprite);
  onImageDimensions(url, (w, h) => {
    state.baseWidth = height * (w / h);
    state.baseHeight = height;
  });
}

function createUnitBillboard(unit) {
  // Placeholder sólido na cor do personagem (mesmo papel do "bonequinho" de
  // CSS no board DOM) até o sprite de verdade carregar — ver loadSpriteFrames
  // (game.js:1301), reaproveitada aqui em vez de reimplementada.
  const material = new THREE.SpriteMaterial({
    color: unit.bodyColor ? new THREE.Color(unit.bodyColor) : 0xffffff,
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.center.set(0.5, 0); // ancorado embaixo, não no meio — "pés" ficam presos ao chão mesmo quando o frame muda de proporção
  sprite.renderOrder = 2;
  const world = tileToWorld(unit.x, unit.y);
  sprite.position.set(world.x, tileTopY(unit.x, unit.y), world.z);
  const height = unitVisualHeight(unit);
  sprite.scale.set(height, height, 1);
  getOrCreateUnitVisualState(unit, sprite);
  scene.add(sprite);
  unitBillboards.set(unit, sprite);
  unitMaterials.set(unit, material);

  // A sombra acompanha apenas a base do tile; lunge/recoil permanecem
  // deslocamentos estritamente visuais do billboard.
  const shadow = new THREE.Mesh(unitShadowGeometry, unitShadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(world.x, tileTopY(unit.x, unit.y) + 0.012, world.z);
  const shadowScale = unitShadowScale(unit);
  shadow.scale.set(shadowScale.width, shadowScale.depth, 1);
  shadow.renderOrder = 1;
  scene.add(shadow);
  unitShadows.set(unit, shadow);

  loadSpriteFrames(unit).then((frames) => {
    if (!frames || frames.idle.length === 0) return;
    unitFrameSets.set(unit, frames);
    const state = getOrCreateUnitVisualState(unit, sprite);
    state.idleFrames = frames.idle;
    state.idlePhase = billboardIdleFramePhase(unit, frames.idle.length) * 127;
    setBillboardFrame(unit, frames.idle[0]);
  });

  return sprite;
}

for (const unit of aliveUnits()) {
  createUnitBillboard(unit);
}

function updateCameraFrustum() {
  const width = boardWrapper.clientWidth || 1;
  const height = boardWrapper.clientHeight || 1;

  // A composição padrão privilegia um pouco mais as unidades, mas preserva
  // folga suficiente para castelo/montanha e unidades nas bordas. Como a
  // projeção usa a proporção real do wrapper, o mesmo enquadramento se
  // adapta a telas largas, estreitas ou baixas sem valores de pixel fixos.
  const viewSize = BOARD_SIZE * cameraViewSizePerTile;
  const aspect = width / height;
  camera.left = -viewSize * aspect;
  camera.right = viewSize * aspect;
  camera.top = viewSize;
  camera.bottom = -viewSize;
  camera.updateProjectionMatrix();
}

new ResizeObserver(resize).observe(boardWrapper);
resize();

// Fase 3: destaques de tile lidos direto dos arrays globais que
// computeReachable/computeRangeTiles/computeAoeAreaTiles (game.js) já
// preenchem pro board DOM — não recalcula nada aqui, só desenha. Recalculado
// todo frame (169 tiles é barato) em vez de tentar interceptar toda chamada
// que muda esses arrays no jogo.
const HIGHLIGHT_COLORS = {
  reachable: 0x3d5a7a,
  attackable: 0x7a3d3d,
  aoePreview: 0x6f3da3,
  telegraph: 0xffa94d,
};

function tilesInclude(list, x, y) {
  return list.some((t) => t.x === x && t.y === y);
}

// Reposiciona instantaneamente (sem tween ainda — isso é Fase 4) e
// esconde/mostra pela vida atual. Fase 4: quando o tile muda, em vez de
// pular direto pra posição nova, anima um tween linear de MOVE_TWEEN_MS —
// mesma duração da transição CSS "left 0.25s ease" que o token DOM usa
// (style.css, .unit-token), só que aqui é o sprite 3D que interpola.
const MOVE_TWEEN_MS = 250;
const unitLastTileKey = new Map(); // unit -> "x,y" do último tile visto
const unitTweens = new Map(); // unit -> { from: Vector3, to: Vector3, start: DOMHighResTimeStamp }

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function resize() {
  const width = boardWrapper.clientWidth || 1;
  const height = boardWrapper.clientHeight || 1;
  renderer.setSize(width, height, false);
  updateCameraFrustum();
}

function updateZoomIndicator() {
  zoomIndicator.textContent = `${Math.round((CAMERA_VIEW_SIZE_PER_TILE / targetCameraViewSizePerTile) * 100)}%`;
}

function setCameraZoomViewSize(viewSize) {
  targetCameraViewSizePerTile = THREE.MathUtils.clamp(viewSize, CAMERA_ZOOM_MIN_VIEW_SIZE_PER_TILE, CAMERA_ZOOM_MAX_VIEW_SIZE_PER_TILE);
  updateZoomIndicator();
}

function changeCameraZoom(direction) {
  setCameraZoomViewSize(targetCameraViewSizePerTile * (direction > 0 ? 1 - CAMERA_ZOOM_STEP : 1 + CAMERA_ZOOM_STEP));
}

function resetCameraZoom() {
  targetCameraViewSizePerTile = CAMERA_VIEW_SIZE_PER_TILE;
  cameraViewSizePerTile = CAMERA_VIEW_SIZE_PER_TILE;
  updateCameraFrustum();
  updateZoomIndicator();
}

function updateCameraZoom() {
  if (Math.abs(cameraViewSizePerTile - targetCameraViewSizePerTile) < 0.0001) return;
  cameraViewSizePerTile += (targetCameraViewSizePerTile - cameraViewSizePerTile) * CAMERA_ZOOM_SMOOTHING;
  updateCameraFrustum();
}

function attackPresentation(attacker, item) {
  const melee = item.maxRange === 1 || item.swing;
  const intensity = item.mpCost !== undefined
    ? 1.5
    : item.targetMode && item.targetMode !== "enemy"
      ? 1.25
      : 1;
  const kind = melee ? "melee" : item.mpCost === undefined ? "ranged" : "magic";
  const profile = unitAnimationProfile(attacker);
  const frameCount = (unitFrameSets.get(attacker)?.attack.length || profile.frameDurations.length);
  const schedule = frameSchedule(profile, frameCount);
  const impact = frameMoment(profile, frameCount, profile.contactFrame);
  const release = frameMoment(profile, frameCount, profile.releaseFrame);
  return {
    kind,
    intensity,
    duration: schedule.duration,
    releaseDelay: schedule.startTimes[THREE.MathUtils.clamp(profile.releaseFrame - 1, 0, frameCount - 1)],
    anticipation: Math.max(0.1, impact * 0.72),
    impact,
  };
}

function beginAttackPose(attacker, defender, item) {
  const sprite = unitBillboards.get(attacker);
  if (!sprite) return;
  const state = getOrCreateUnitVisualState(attacker, sprite);
  if (state.dead) return;

  const dx = defender.x - attacker.x;
  const dz = defender.y - attacker.y;
  const distance = Math.hypot(dx, dz) || 1;
  const presentation = attackPresentation(attacker, item);
  const profile = combatPoseProfile(attacker);
  // O máximo de 0.42 unidade mantém o pico do lunge bem antes do centro do
  // alvo vizinho; para ataques distantes, o corpo só prepara o disparo.
  const baseLunge = presentation.kind === "melee" ? Math.min(0.48, distance * 0.39) : 0.13;
  const lunge = Math.min(
    baseLunge * profile.lungeMultiplier * presentation.intensity,
    presentation.kind === "melee" ? MAX_LUNGE_VISUAL_DISTANCE : 0.22
  );
  state.attack = {
    start: performance.now(),
    duration: presentation.duration,
    kind: presentation.kind,
    dx: dx / distance,
    dz: dz / distance,
    lunge,
    intensity: presentation.intensity,
    castLift: profile.castLift,
    anticipationEnd: presentation.anticipation,
    impactAt: presentation.impact,
  };
  attackSourceByTarget.set(defender, { dx: dx / distance, dz: dz / distance, start: performance.now() });
}

function beginHitPose(unit) {
  const sprite = unitBillboards.get(unit);
  if (!sprite) return;
  const state = getOrCreateUnitVisualState(unit, sprite);
  if (state.dead) return;
  const source = attackSourceByTarget.get(unit);
  const freshSource = source && performance.now() - source.start < 1200 ? source : null;
  state.hit = {
    start: performance.now(),
    duration: 340,
    dx: freshSource ? freshSource.dx : 0,
    dz: freshSource ? freshSource.dz : 0,
    recoil: 0.19 * combatPoseProfile(unit).recoilMultiplier,
  };
}

function clearCombatPose(unit) {
  const state = unitVisualStates.get(unit);
  if (!state) return;
  state.attack = null;
  state.hit = null;
}

function applyCombatPose(unit, sprite, state, now) {
  let offsetX = 0;
  let offsetY = 0;
  let offsetZ = 0;
  let scaleX = 1;
  let scaleY = 1;

  const attack = state.attack;
  if (attack) {
    const progress = Math.min((now - attack.start) / attack.duration, 1);
    const anticipationEnd = attack.anticipationEnd;
    const impactAt = attack.impactAt;
    const backAmount = attack.lunge * (attack.kind === "melee" ? 0.26 : 0.58);
    let travel = 0;
    if (progress < anticipationEnd) {
      const phase = easeOutCubic(progress / anticipationEnd);
      travel = -backAmount * phase;
      scaleX = 1 + 0.07 * phase;
      scaleY = 1 - 0.075 * phase;
    } else if (progress < impactAt) {
      const phase = easeOutCubic((progress - anticipationEnd) / (impactAt - anticipationEnd));
      travel = -backAmount + (attack.lunge + backAmount) * phase;
      scaleX = 1.03 + 0.05 * phase;
      scaleY = 1.015 + 0.04 * phase;
    } else {
      const phase = easeOutCubic((progress - impactAt) / (1 - impactAt));
      travel = attack.lunge * (1 - phase);
      scaleX = 1.08 - 0.08 * phase;
      scaleY = 1.04 - 0.04 * phase;
    }
    offsetX += attack.dx * travel;
    offsetZ += attack.dz * travel;
    if (attack.kind === "magic") offsetY += Math.sin(progress * Math.PI) * attack.castLift;
    if (progress >= 1) state.attack = null;
  }

  const hit = state.hit;
  if (hit) {
    const progress = Math.min((now - hit.start) / hit.duration, 1);
    const peakAt = 0.24;
    const recoil = progress < peakAt
      ? hit.recoil * easeOutCubic(progress / peakAt)
      : hit.recoil * (1 - easeOutCubic((progress - peakAt) / (1 - peakAt)));
    offsetX += hit.dx * recoil;
    offsetZ += hit.dz * recoil;
    scaleX *= 1 + 0.08 * (1 - progress);
    scaleY *= 1 - 0.065 * (1 - progress);
    if (progress >= 1) state.hit = null;
  }

  sprite.position.set(state.basePosition.x + offsetX, state.basePosition.y + offsetY, state.basePosition.z + offsetZ);
  sprite.scale.set(state.baseWidth * scaleX, state.baseHeight * scaleY, 1);
}

function updateBillboardIdle(unit, state, now) {
  if (state.dead || state.attack || state.hit || !state.idleFrames || state.idleFrames.length < 2) return;
  const index = Math.floor((now + state.idlePhase) / 720) % state.idleFrames.length;
  if (index === state.idleFrameIndex) return;
  state.idleFrameIndex = index;
  setBillboardFrame(unit, state.idleFrames[index]);
}

function syncUnitPositions() {
  const now = performance.now();
  for (const [unit, sprite] of unitBillboards) {
    const state = getOrCreateUnitVisualState(unit, sprite);
    const shadow = unitShadows.get(unit);
    // Cadáver ainda no campo (mesma janela de turnsSinceDeath que o board
    // DOM usa pra manter o corpo visível/ressuscitável — ver decayCorpses/
    // deadUnitAt em game.js) continua visível aqui também, em vez de sumir
    // na hora da morte: o billboard só ficava invisível de vez (bug real —
    // sem morte/corpo nenhum aparecendo no modo 3D, mesmo com a versão DOM
    // por baixo mostrando o cadáver caído certinho).
    sprite.visible = unit.hp > 0 || unit.turnsSinceDeath !== undefined;
    if (shadow) shadow.visible = sprite.visible;
    if (!sprite.visible) continue;
    if (unit.hp > 0) state.dead = false;

    const key = tileKey3d(unit.x, unit.y);
    if (unitLastTileKey.get(unit) !== key) {
      const to = tileToWorld(unit.x, unit.y);
      to.y = tileTopY(unit.x, unit.y);
      unitTweens.set(unit, { from: state.basePosition.clone(), to, start: now });
      unitLastTileKey.set(unit, key);
    }

    const tween = unitTweens.get(unit);
    if (tween) {
      const t = Math.min((now - tween.start) / MOVE_TWEEN_MS, 1);
      state.basePosition.set(
        tween.from.x + (tween.to.x - tween.from.x) * t,
        tween.from.y + (tween.to.y - tween.from.y) * t,
        tween.from.z + (tween.to.z - tween.from.z) * t
      );
      if (t >= 1) unitTweens.delete(unit);
    }
    if (shadow) {
      shadow.position.set(state.basePosition.x, state.basePosition.y + 0.012, state.basePosition.z);
    }
    applyCombatPose(unit, sprite, state, now);
    updateBillboardIdle(unit, state, now);
  }
}

// Fase 4: animação de ataque/dano/morte no billboard — reaproveita a MESMA
// sequência de frames (unitFrameSets, carregada via loadSpriteFrames) que a
// versão DOM usa, só trocando textura em vez de <img src>. Em vez de
// duplicar toda chamada de playSpriteAction espalhada pelo combate
// (resolveSingleHit, cast* etc. — dezenas de call sites em game.js),
// "sobrescreve" a função global existente: como playSpriteAction é uma
// function DECLARATION no escopo top-level de um script clássico, ela é
// tanto uma binding léxica quanto uma propriedade do global, então dá pra
// reatribuir por cima com segurança (mesmo de dentro de um módulo) e todo
// call site que já existe passa a chamar esta versão também, sem editar
// game.js linha por linha.
const originalPlaySpriteAction = playSpriteAction;
const spriteActionTokens = new Map();

playSpriteAction = function scene3dPlaySpriteAction(unit, actionKey, durationMs, holdLastFrame = false) {
  const domResult = originalPlaySpriteAction(unit, actionKey, durationMs, holdLastFrame);
  const actionToken = (spriteActionTokens.get(unit) || 0) + 1;
  spriteActionTokens.set(unit, actionToken);
  if (actionKey === "death") {
    const state = unitVisualStates.get(unit);
    if (state) state.dead = true;
    clearCombatPose(unit);
  }

  const frames = unitFrameSets.get(unit);
  const requestedFrames = frames && frames[actionKey];
  const list = requestedFrames && requestedFrames.length > 0
    ? requestedFrames
    : actionKey === "cast"
      ? frames && frames.attack
      : null;
  if (list && list.length > 0) {
    const state = unitVisualStates.get(unit);
    const visualDuration = (actionKey === "attack" || actionKey === "cast") && state && state.attack ? state.attack.duration : durationMs;
    const startTimes = (actionKey === "attack" || actionKey === "cast")
      ? frameSchedule(unitAnimationProfile(unit), list.length).startTimes
      : list.map((_, index) => index * Math.max(visualDuration / list.length, 40));
    list.forEach((url, index) => setTimeout(() => {
      if (spriteActionTokens.get(unit) === actionToken) setBillboardFrame(unit, url);
    }, startTimes[index]));
    if (!holdLastFrame) {
      setTimeout(() => {
        if (spriteActionTokens.get(unit) === actionToken && unit.hp > 0) {
          const state = unitVisualStates.get(unit);
          if (state) state.idleFrameIndex = -1;
        }
      }, visualDuration);
    }
  }

  return domResult;
};

// O jogo já decide quando uma unidade ataca ou é atingida. Estes wrappers só
// espelham esses mesmos eventos no billboard e preservam integralmente as
// animações DOM usadas na visão 2D.
const originalPlayAttackAnimation = playAttackAnimation;
const CAMERA_IMPACT_PROFILES = {
  guerreiro: 1,
  ladino: 0.35,
  arqueiro: 0.45,
  mago: 0.7,
  quimico: 0.65,
  orc: 0.85,
  troll: 1,
};
let latestAttackImpact = null;
playAttackAnimation = function scene3dPlayAttackAnimation(attacker, defender, item) {
  const presentation = attackPresentation(attacker, item);
  latestAttackImpact = {
    attacker,
    defender,
    multiplier: CAMERA_IMPACT_PROFILES[attacker.spriteKey] || 0.55,
    intensity: presentation.intensity,
    at: performance.now(),
  };
  beginAttackPose(attacker, defender, item);
  return originalPlayAttackAnimation(attacker, defender, item);
};

// O rastro externo continua existindo como complemento do PNG, mas só nasce
// no frame de contato que a arte indica. O timer original já foi agendado
// por playAttackAnimation; aqui apenas postergamos o desenho quando ele cair
// antes do contato, sem tocar na resolução do golpe.
const originalSpawnWeaponTrail = spawnWeaponTrail;
spawnWeaponTrail = function scene3dSpawnWeaponTrail(attacker, defender, swingType) {
  const state = unitVisualStates.get(attacker);
  if (!scene3dEnabled || !state || !state.attack) return originalSpawnWeaponTrail(attacker, defender, swingType);
  const presentation = attackPresentation(attacker, { maxRange: 1, swing: swingType });
  const elapsed = performance.now() - state.attack.start;
  const delay = Math.max(0, presentation.releaseDelay - elapsed);
  if (delay === 0) return originalSpawnWeaponTrail(attacker, defender, swingType);
  setTimeout(() => {
    if (!state.dead && unitBillboards.has(attacker)) originalSpawnWeaponTrail(attacker, defender, swingType);
  }, delay);
};

// A camada de regras continua disparando a intenção do projétil no mesmo
// instante; apenas sua apresentação espera o frame de release da pose 3D.
// O delay devolvido inclui essa espera, mantendo impacto/número sincronizados.
const originalSpawnAttackProjectile = spawnAttackProjectile;
spawnAttackProjectile = function scene3dSpawnAttackProjectile(attacker, defender, item, options = {}) {
  const hasTravelingVisual = item.projectile && item.maxRange > 1;
  if (!scene3dEnabled || !hasTravelingVisual) return originalSpawnAttackProjectile(attacker, defender, item, options);
  const presentation = attackPresentation(attacker, item);
  const releaseDelay = presentation.releaseDelay;
  const speedMultiplier = item.mpCost !== undefined ? MAGIC_TRAVEL_MULTIPLIER : 1;
  const distance = Math.hypot(defender.x - attacker.x, defender.y - attacker.y);
  const travelMs = item.projectile === "beam"
    ? 150 * speedMultiplier
    : Math.min(120 + distance * 45, 550) * speedMultiplier;
  setTimeout(() => originalSpawnAttackProjectile(attacker, defender, item, options), releaseDelay);
  return releaseDelay + travelMs;
};

const originalPlayHitReaction = playHitReaction;
playHitReaction = function scene3dPlayHitReaction(unit) {
  beginHitPose(unit);
  return originalPlayHitReaction(unit);
};

// spawnFloatingText já se autocorrige pra projeção 3D direto em game.js
// (ver tileScreenPercent lá) desde o fechamento de gaps da Fase 7 — não
// precisa mais de um wrapper aqui.

// Fase 4: screen shake — jitter na posição da câmera em vez do transform
// CSS em .board-wrapper (que a versão DOM continua aplicando por baixo,
// sem problema, os dois só se somam visualmente).
const originalScreenShake = screenShake;
let shakeUntil = 0;
let shakeMagnitude = 0;
let shakeStartedAt = 0;
const shakeDirection = new THREE.Vector3();
screenShake = function scene3dScreenShake(kind) {
  originalScreenShake(kind);
  const info = SHAKE_KINDS[kind] || SHAKE_KINDS.light;
  const now = performance.now();
  const impact = latestAttackImpact && now - latestAttackImpact.at < 900 ? latestAttackImpact : null;
  const baseMagnitude = kind === "heavy" ? 0.12 : kind === "magic-heavy" ? 0.1 : kind === "magic-light" ? 0.055 : 0;
  shakeStartedAt = now;
  shakeUntil = now + Math.min(info.duration, kind === "magic-heavy" ? 260 : 190);
  shakeMagnitude = baseMagnitude * (impact ? impact.multiplier * impact.intensity : 0.55);
  if (!impact || shakeMagnitude === 0) return;
  const from = tileToWorld(impact.attacker.x, impact.attacker.y);
  const to = tileToWorld(impact.defender.x, impact.defender.y);
  shakeDirection.set(to.x - from.x, 0.35, to.z - from.z).normalize();
};

function applyCameraShake() {
  const now = performance.now();
  if (now >= shakeUntil || shakeMagnitude === 0) {
    camera.position.copy(cameraBasePosition);
    return;
  }
  const progress = (now - shakeStartedAt) / (shakeUntil - shakeStartedAt);
  const envelope = Math.sin(progress * Math.PI) * (1 - progress) * shakeMagnitude;
  camera.position.copy(cameraBasePosition).addScaledVector(shakeDirection, envelope);
}

function syncHighlights() {
  const telegraphPulse = 0.35 + 0.25 * Math.sin(performance.now() / 180);
  for (let x = 0; x < BOARD_SIZE; x++) {
    for (let y = 0; y < BOARD_SIZE; y++) {
      const mesh = highlightMeshes.get(tileKey3d(x, y));
      const mat = mesh.material;
      if (tilesInclude(aoePreviewTiles, x, y)) {
        mat.color.setHex(HIGHLIGHT_COLORS.aoePreview);
        mat.opacity = 0.55;
      } else if (tilesInclude(telegraphTiles, x, y)) {
        mat.color.setHex(HIGHLIGHT_COLORS.telegraph);
        mat.opacity = telegraphPulse;
      } else if (tilesInclude(attackableTiles, x, y)) {
        mat.color.setHex(HIGHLIGHT_COLORS.attackable);
        mat.opacity = 0.5;
      } else if (tilesInclude(reachableTiles, x, y)) {
        mat.color.setHex(HIGHLIGHT_COLORS.reachable);
        mat.opacity = 0.5;
      } else {
        mat.opacity = 0;
      }
    }
  }
}

// Fase 3: picking por raycasting contra os boxes de chão (marcados com
// userData={x,y} acima) — a cena 3D vira só mais uma fonte de clique pro
// dispatcher central já existente (onTileClick, game.js:5181+), sem
// reescrever nenhuma lógica de alvo/movimento/confirmação.
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();

function pickTile(event) {
  const rect = canvas.getBoundingClientRect();
  pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);
  const hits = raycaster.intersectObjects(gridGroup.children, false);
  const hit = hits.find((h) => h.object.userData && h.object.userData.x !== undefined);
  return hit ? hit.object.userData : null;
}

// Navegação por arrastar (pan): com o zoom mais fechado (pedido do
// usuário), partes do tabuleiro ficam fora do quadro no ângulo padrão —
// sem isso não haveria como alcançar/clicar naqueles tiles. Arrasta
// deslizando a câmera (posição + ponto de mira) num offset em coordenadas
// de MUNDO, calculado projetando o cursor no plano y=0 antes/depois do
// movimento — assim o ponto exato debaixo do cursor "gruda" na mão
// enquanto arrasta, em vez de um pan a uma velocidade arbitrária.
// Distingue clique de arrasto pelo deslocamento total: abaixo do limiar
// (DRAG_CLICK_THRESHOLD_PX) ainda conta como clique normal (seleciona/
// interage com o tile), só acima disso vira pan puro (não seleciona nada).
const DRAG_CLICK_THRESHOLD_PX = 5;
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let isDragging = false;
let dragMoved = false;
let dragStartClientPos = null;
let dragLastGroundPoint = null;

function raycastGroundPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);
  const point = new THREE.Vector3();
  return raycaster.ray.intersectPlane(groundPlane, point) ? point : null;
}

function resetCameraPan() {
  cameraPanOffset.set(0, 0, 0);
  applyCameraTransform();
}

canvas.addEventListener("mousedown", (event) => {
  if (!scene3dEnabled || event.button !== 0) return;
  isDragging = true;
  dragMoved = false;
  dragStartClientPos = { x: event.clientX, y: event.clientY };
  dragLastGroundPoint = raycastGroundPoint(event.clientX, event.clientY);
});

window.addEventListener("mousemove", (event) => {
  if (!scene3dEnabled) return;
  if (isDragging) {
    if (!dragMoved) {
      const dx = event.clientX - dragStartClientPos.x;
      const dy = event.clientY - dragStartClientPos.y;
      if (Math.hypot(dx, dy) < DRAG_CLICK_THRESHOLD_PX) return; // ainda pode virar clique — não move a câmera enquanto indeciso
      dragMoved = true;
    }
    const current = raycastGroundPoint(event.clientX, event.clientY);
    if (dragLastGroundPoint && current) {
      cameraPanOffset.add(dragLastGroundPoint.clone().sub(current));
      applyCameraTransform();
    }
    dragLastGroundPoint = raycastGroundPoint(event.clientX, event.clientY);
    canvas.style.cursor = "grabbing";
    return;
  }
  canvas.style.cursor = pickTile(event) ? "pointer" : "default";
});

window.addEventListener("mouseup", (event) => {
  if (!isDragging) return;
  isDragging = false;
  canvas.style.cursor = pickTile(event) ? "pointer" : "default";
  if (!scene3dEnabled || dragMoved) return; // arrasto de verdade não seleciona tile
  const tile = pickTile(event);
  if (tile) onTileClick(tile.x, tile.y);
});

function renderLoop() {
  if (scene3dEnabled) {
    updateCameraZoom();
    syncHighlights();
    syncUnitPositions();
    applyCameraShake();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(renderLoop);
}
renderLoop();

// Alternância explícita: o jogo abre em 2D e só mostra o canvas após clique.
toggleBtn.addEventListener("click", () => {
  scene3dEnabled = !scene3dEnabled;
  canvas.classList.toggle("hidden", !scene3dEnabled);
  zoomControls.classList.toggle("hidden", !scene3dEnabled);
  toggleBtn.textContent = scene3dEnabled ? "🖼️ Voltar ao 2D" : "🧊 Ativar 3D";
  if (scene3dEnabled) resize();
});

zoomInBtn.addEventListener("click", () => changeCameraZoom(1));
zoomOutBtn.addEventListener("click", () => changeCameraZoom(-1));
zoomResetBtn.addEventListener("click", resetCameraZoom);

canvas.addEventListener("wheel", (event) => {
  if (!scene3dEnabled) return;
  event.preventDefault();
  changeCameraZoom(event.deltaY < 0 ? 1 : -1);
}, { passive: false });

document.getElementById("scene3d-rotate-left-btn").addEventListener("click", () => rotateCamera(-1));
document.getElementById("scene3d-rotate-right-btn").addEventListener("click", () => rotateCamera(1));

document.getElementById("scene3d-elevation-up-btn").addEventListener("click", () => setCameraElevation(ISO_ELEVATION_DEG + 30));
document.getElementById("scene3d-elevation-reset-btn").addEventListener("click", () => {
  cameraElevationDeg = ISO_ELEVATION_DEG;
  resetCameraPan(); // "ângulo original" também recentraliza, já que só arrastar não tem outro jeito de voltar
});

// O HTML já entrega canvas e controles ocultos. Mantê-los assim torna o 2D
// o padrão mesmo quando Three.js carrega normalmente.
updateZoomIndicator();
