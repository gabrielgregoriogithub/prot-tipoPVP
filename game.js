const BOARD_SIZE = 13;
const CT_THRESHOLD = 100;
const CRIT_CHANCE = 0.15;

// Dano POR TURNO padronizado de cada status de dano contínuo — não importa
// qual arma/magia aplicou (Funda do Goblin, Zarabatana, Envenenamento do
// Xamã sempre envenenam pelo mesmo tanto; Bola de Fogo, Flecha de Fogo e
// Tiro Explosivo sempre queimam pelo mesmo tanto). Só a DURAÇÃO e efeitos
// extras (ex: dreno de CT do veneno da Funda) variam por fonte — o dano em
// si vem sempre daqui, espalhado via spread (...STATUS_DOT_DAMAGE.poison).
const STATUS_DOT_DAMAGE = {
  poison: { damageMin: 1, damageMax: 3 },
  burned: { damageMin: 1, damageMax: 1 },
};

// Armas de cada unidade. minRange/maxRange definem a distância (Manhattan)
// em que a arma pode ser usada — armas corpo a corpo têm min=max=1. hitChance
// é um número fixo; hitChanceByDistance (quando presente) varia conforme a
// distância exata do alvo. damage é um valor fixo (ou damageMin/damageMax
// pra faixa aleatória). critChance sobrescreve o CRIT_CHANCE global quando
// presente (ex: o Tacape tem crítico mais frequente).
const WEAPONS = {
  sword: {
    name: "Espada",
    icon: "🗡",
    ctCost: 50,
    damageMin: 8,
    damageMax: 10,
    critMultiplier: 2,
    hitChance: 0.8,
    swing: "slash",
    minRange: 1,
    maxRange: 1,
    sfx: "melee",
  },
  shortSword: {
    name: "Espada Curta",
    icon: "🗡",
    ctCost: 50,
    damageMin: 3,
    damageMax: 6,
    critMultiplier: 2,
    hitChance: 0.85,
    swing: "slash",
    minRange: 1,
    maxRange: 1,
    // Veneno permanente da arma do Goblin (era a habilidade Envenenamento,
    // agora embutida no golpe em vez de precisar ativar antes).
    appliesPoison: { ...STATUS_DOT_DAMAGE.poison, turns: 1, ctDrainPerTurn: 10 },
    tooltipNote: "Envenena ao acertar (1-2 de dano e -10 de CT por turno, por 1 turno).",
    sfx: "melee",
  },
  axe: {
    name: "Machado",
    icon: "🪓",
    ctCost: 60,
    damageMin: 8,
    damageMax: 12,
    critMultiplier: 3,
    hitChance: 0.8,
    swing: "blunt",
    minRange: 1,
    maxRange: 1,
    sfx: "melee",
  },
  shield: {
    name: "Escudo",
    icon: "🛡️",
    ctCost: 60,
    damageMin: 10,
    damageMax: 12,
    critMultiplier: 3,
    hitChance: 0.7,
    swing: "blunt",
    minRange: 1,
    maxRange: 1,
    // Quem for atingido perde 10 de CT (ver resolveSingleHit).
    appliesCtDrain: 10,
    tooltipNote: "Quem for atingido perde 10 de CT.",
    sfx: "melee",
  },
  bow: {
    name: "Arco",
    icon: "🏹",
    ctCost: 50,
    damageMin: 6,
    damageMax: 8,
    critMultiplier: 2,
    hitChance: 0.8,
    minRange: 2,
    maxRange: 5,
    projectile: "arrow",
    // Flecha voa em arco por cima de colina/obstáculo — só essa arma ignora
    // o bloqueio de linha de visão por altura (ver hasLineOfSight/
    // computeRangeTiles); as demais armas/magias continuam bloqueadas
    // normalmente por terreno alto no meio do caminho.
    ignoresTerrainLineOfSight: true,
    sfx: "ranged",
  },
  sling: {
    name: "Funda",
    icon: "🌀",
    ctCost: 30,
    damageMin: 3,
    damageMax: 6,
    critMultiplier: 2,
    hitChance: 0.8,
    minRange: 1,
    maxRange: 4,
    projectile: "stone",
    // Acerto (70%, ver hitChance acima) só abre a CHANCE do roubo de CT —
    // uma segunda rolagem própria (ctDrainConfirmChance) decide se os 15 de
    // CT realmente são roubados (ver resolveSingleHit). Sem efeito de
    // atordoar; só o roubo de CT, condicional.
    appliesCtDrain: 15,
    ctDrainConfirmChance: 0.4,
    tooltipNote: "Se acertar (70%), tem 40% de chance de roubar 15 de CT do alvo.",
    sfx: "ranged",
  },
  dagger: {
    name: "Adaga",
    icon: "🔪",
    ctCost: 50,
    damageMin: 2,
    damageMax: 5,
    critMultiplier: 2,
    hitChance: 1,
    swing: "stab",
    minRange: 1,
    maxRange: 1,
    // Quem for atingido perde 1 de deslocamento por 1 turno (mesmo esquema
    // do Golpe Debilitante/Atropelar — ver appliesSlow em resolveSingleHit).
    appliesSlow: { turns: 1, moveReduction: 1 },
    tooltipNote: "Sempre acerta. Quem for atingido perde 1 de deslocamento por 1 turno.",
    sfx: "melee",
  },
  club: {
    name: "Tacape",
    icon: "🔨",
    ctCost: 70,
    damageMin: 10,
    damageMax: 14,
    critMultiplier: 2,
    critChance: 0.2,
    hitChance: 0.7,
    swing: "blunt",
    minRange: 1,
    maxRange: 1,
    // Quem for atingido perde 10 de CT (ver resolveSingleHit).
    appliesCtDrain: 10,
    tooltipNote: "Quem for atingido perde 10 de CT.",
    sfx: "melee",
  },
  cajado: {
    name: "Cajado",
    icon: "🪄",
    ctCost: 50,
    damageMin: 2,
    damageMax: 4,
    critMultiplier: 2,
    critChance: 0.1,
    hitChance: 0.7,
    swing: "blunt",
    minRange: 1,
    maxRange: 1,
    // Quem for atingido perde 5 de MP (ver resolveSingleHit).
    appliesMpDrain: 5,
    tooltipNote: "Quem for atingido perde 5 de MP.",
    sfx: "melee",
  },
  zarabatana: {
    name: "Zarabatana",
    icon: "🎯",
    ctCost: 40,
    damageMin: 2,
    damageMax: 6,
    critMultiplier: 2,
    critChance: 0.15,
    hitChance: 0.7,
    minRange: 1,
    maxRange: 3,
    requiresClearPath: true,
    // Dardo envenenado: se acertar, aplica isso como status (ver addStatusEffect).
    appliesPoison: { ...STATUS_DOT_DAMAGE.poison, turns: 3 },
    tooltipNote: "Precisa de linha limpa; se algo bloquear, acerta quem estiver no caminho. Envenena ao acertar.",
    sfx: "ranged",
  },
  crossbow: {
    name: "Besta",
    icon: "🏹",
    ctCost: 50,
    damageMin: 4,
    damageMax: 6,
    critMultiplier: 2,
    critChance: 0.2,
    hitChance: 0.8,
    minRange: 1,
    maxRange: 3,
    requiresClearPath: true,
    // Dispara pra cima com facilidade — é uma das poucas armas que acerta a Fada.
    aerial: true,
    projectile: "bolt",
    tooltipNote: "Precisa de linha limpa; se algo bloquear, acerta quem estiver no caminho.",
    sfx: "ranged",
  },
  dirk: {
    name: "Punhal",
    icon: "🗡️",
    ctCost: 50,
    damageMin: 3,
    damageMax: 6,
    critMultiplier: 3,
    // Chance de crítico varia pelo ângulo do golpe (ver getAttackAngle) em vez
    // de um valor fixo — pela frente é o padrão, de lado ou pelas costas sobe.
    critChanceByAngle: { front: 0.15, side: 0.2, back: 0.25 },
    hitChance: 0.9,
    swing: "stab",
    minRange: 1,
    maxRange: 1,
    tooltipNote: "Chance de crítico aumenta atacando pelo lado ou pelas costas.",
    sfx: "melee",
  },
  shock: {
    name: "Choque",
    icon: "⚡",
    ctCost: 40,
    damageMin: 6,
    damageMax: 8,
    critMultiplier: 2,
    critChance: 0.15,
    hitChance: 0.8,
    minRange: 1,
    maxRange: 1,
    // Quem for atingido perde 20 de CT (ver resolveSingleHit).
    appliesCtDrain: 20,
    tooltipNote: "Quem for atingido perde 20 de CT.",
    sfx: "lightning",
  },
  // Ataque físico (não é magia — não gasta MP); quem for atingido fica ofuscado.
  light: {
    name: "Luz",
    icon: "💡",
    ctCost: 50,
    damageMin: 4,
    damageMax: 6,
    critMultiplier: 2,
    critChance: 0.15,
    hitChance: 0.8,
    minRange: 1,
    maxRange: 3,
    appliesBlind: { turns: 2 },
    projectile: "spark",
    tooltipNote: "Quem for atingido fica com -10% de chance de acerto por 2 turnos.",
    sfx: "arcane",
  },
  firearm: {
    name: "Arma de Fogo",
    icon: "🔫",
    ctCost: 50,
    damageMin: 6,
    damageMax: 8,
    critMultiplier: 3,
    critChance: 0.1,
    hitChance: 0.8,
    minRange: 1,
    maxRange: 6,
    requiresClearPath: true,
    projectile: "bullet",
    tooltipNote: "Precisa de linha limpa; se algo bloquear, acerta quem estiver no caminho.",
    sfx: "ranged",
  },
  // Arma do Troll: acerta todos os inimigos na direção escolhida (igual ao
  // Relâmpago do Mago), até 2 quadrados.
  trunk: {
    name: "Tronco",
    icon: "🪵",
    ctCost: 60,
    damageMin: 10,
    damageMax: 14,
    critMultiplier: 2,
    critChance: 0.1,
    hitChance: 0.7,
    minRange: 1,
    maxRange: 2,
    targetMode: "line-aoe",
    swing: "blunt",
    tooltipNote: "Acerta todos os inimigos na direção escolhida, até 2 quadrados.",
    sfx: "melee",
  },
  // Arma do Troll: escolhe uma das 4 direções cardeais e arremessa o tronco
  // rolando por uma faixa de bandLength x bandWidth (3x3 = 9 tiles) NESSA
  // direção só — o alcance E a área de efeito são essa própria faixa, sem
  // raio em volta de um ponto de impacto (ver castThrowLog/
  // computeCardinalRectTiles). bandLength/bandWidth também definem o que
  // startAttackTargeting mostra como "alcance" antes do clique (a cruz das
  // 4 direções possíveis, ver computeCardinalCrossTiles) — mesma fonte pros
  // dois, então não tem como o alcance mostrado ficar diferente do efeito.
  throwLog: {
    name: "Tacar Tronco",
    icon: "🪵",
    ctCost: 70,
    damageMin: 6,
    damageMax: 8,
    critMultiplier: 2,
    critChance: 0.1,
    hitChance: 0.8,
    minRange: 1,
    maxRange: 3,
    cardinalOnly: true,
    targetMode: "cardinal-blast",
    bandLength: 3,
    bandWidth: 3,
    // Empurra cada atingido 1 quadrado pra longe do Troll, na mesma direção
    // do arremesso; quem não tem pra onde ir (fora do tabuleiro ou outra
    // unidade no caminho) fica parado, mas leva blockedExtraDamage a mais.
    knockback: { distance: 1, blockedExtraDamage: 1 },
    tooltipNote: "Escolha uma direção cardeal: acerta uma faixa de 3x3 quadrados (9 no total) nessa direção, empurrando os atingidos 1 quadrado pra longe do Troll; quem estiver bloqueado toma +1 de dano em vez de ser empurrado.",
    sfx: "nature",
  },
  // Contra-ataque passivo do Troll: nunca aparece no menu de Atacar (não está
  // na lista `weapons` dele) — só é usado por resolveSingleHit quando o
  // contra-ataque dispara (ver counterAttackChance/counterWeapon). Mais fraco
  // que o Tronco/Tacar Tronco de propósito.
  trollCounter: {
    name: "Contra-ataque",
    icon: "👊",
    ctCost: 0,
    damageMin: 3,
    damageMax: 5,
    critMultiplier: 2,
    hitChance: 0.8,
    minRange: 1,
    maxRange: 1,
    sfx: "melee",
  },
  // Ataque normal do Mago (sem custo de MP) — só em linha reta cardeal e
  // precisa de linha limpa (como o Arco/Besta); a infraestrutura de mira já
  // existente cobre as duas coisas juntas sem código novo. Sem mpCost, então
  // é tratado como arma (isWeaponAttack), mas como maxRange > 1 continua
  // acertando a Fada normalmente (a imunidade dela só bloqueia corpo a corpo).
  iceRay: {
    name: "Raio de Gelo",
    icon: "🧊",
    ctCost: 50,
    damageMin: 3,
    damageMax: 6,
    critMultiplier: 2,
    critChance: 0.15,
    hitChance: 0.8,
    minRange: 1,
    maxRange: 5,
    cardinalOnly: true,
    requiresClearPath: true,
    appliesSpeedReduction: { turns: 2, amount: 1 },
    projectile: "beam",
    beamTint: "ice",
    tooltipNote: "Só em linha reta cardeal, até 5 quadrados, e precisa de linha limpa (para no primeiro obstáculo). Se acertar, reduz a agilidade do alvo em 1 por 2 turnos.",
    sfx: "freeze",
  },
};

// Magias do Mago: além dos campos de arma normais, têm mpCost (gasto de MP,
// que nunca se recupera) e um targetMode que muda como a mira funciona:
// "enemy" (padrão, igual às armas) exige clicar num inimigo dentro do
// alcance; "point-aoe" mira qualquer tile dentro do alcance e explode em
// área ao redor do ponto de impacto (ou antes, se algo bloquear o caminho);
// "line-aoe" só mira nas 8 direções retas/diagonais e acerta tudo na linha.
const SPELLS = {
  fireball: {
    name: "Bola de Fogo",
    icon: "🔥",
    ctCost: 70,
    mpCost: 10,
    damageMin: 6,
    damageMax: 12,
    critMultiplier: 1,
    critChance: 0,
    hitChance: 0.8,
    minRange: 1,
    maxRange: 6,
    areaRadius: 3,
    targetMode: "point-aoe",
    // Queimadura: 1 de dano por turno por 3 turnos (ver resolveSingleHit/
    // applyStatusEffectsAtTurnStart) — damageMin=damageMax=1 pra nunca variar.
    appliesBurn: { ...STATUS_DOT_DAMAGE.burned, turns: 3 },
    tooltipNote: "Explode em área; se algo bloquear o caminho, detona antes do alvo. Quem for atingido pega fogo (1 de dano por turno, 3 turnos).",
    sfx: "fire",
  },
  // Idêntica à Bola de Fogo (mesmo castFireball, mesmos números de dano/
  // área/alcance), só troca a queimadura por atordoamento sonoro — reaproveita
  // toda a infraestrutura de point-aoe sem precisar de função nova.
  soundBlast: {
    name: "Explosão Sonora",
    icon: "📣",
    ctCost: 70,
    mpCost: 10,
    damageMin: 4,
    damageMax: 6,
    critMultiplier: 1,
    critChance: 0,
    hitChance: 0.8,
    minRange: 1,
    maxRange: 6,
    areaRadius: 3,
    targetMode: "point-aoe",
    appliesDaze: { turns: 2 },
    // Sem isso, castFireball desenharia uma bola de fogo/explosão laranja
    // (visual padrão dele) mesmo sendo uma magia sonora — ver
    // projectileKind/burstKind em castFireball.
    projectileKind: "soundwave",
    burstKind: "sound",
    tooltipNote: "Explode em área; se algo bloquear o caminho, detona antes do alvo. Quem for atingido fica atordoado(a): -10% de chance de acerto nos próprios ataques por 2 turnos.",
    sfx: "lightning",
  },
  missile: {
    name: "Míssil Mágico",
    icon: "✨",
    ctCost: 50,
    mpCost: 3,
    damageMin: 2,
    damageMax: 10,
    critMultiplier: 1,
    critChance: 0,
    hitChance: 1,
    minRange: 1,
    maxRange: 5,
    targetMode: "enemy",
    projectile: "missile",
    tooltipNote: "Ignora obstáculos no caminho, como o Arco.",
    sfx: "arcane",
  },
  lightning: {
    name: "Relâmpago",
    icon: "⚡",
    ctCost: 60,
    mpCost: 12,
    damageMin: 10,
    damageMax: 20,
    critMultiplier: 1,
    critChance: 0,
    hitChance: 0.8,
    minRange: 1,
    maxRange: BOARD_SIZE - 1,
    targetMode: "line-aoe",
    appliesCtDrain: 15,
    tooltipNote: "Só em linha reta ou diagonal; atinge todos os inimigos no caminho. Quem for atingido perde 15 de CT.",
    sfx: "lightning",
  },
  // Magias do Xamã. São todas controladas pela IA (o Xamã é inimigo), então
  // não têm targetMode de clique — "kind" é o que a IA usa pra decidir
  // quando lançar cada uma (ver enemyAct). Nenhuma delas causa dano na hora:
  // curam ou aplicam status (veneno/raízes) cujo efeito só aparece no início
  // do turno de quem foi afetado (ver applyStatusEffectsAtTurnStart).
  // Agora é uma magia de área (losango de 5 quadrados, mesmo formato do
  // Congelamento) em vez de alvo único — cura qualquer um dentro da área,
  // aliado OU inimigo (toda magia de área acerta todo mundo, ver castHealAoe).
  cure: {
    name: "Cura",
    icon: "💚",
    kind: "heal-aoe",
    ctCost: 45,
    mpCost: 5,
    healMin: 5,
    healMax: 10,
    areaRadius: 1,
    critChance: 0,
    hitChance: 1,
    minRange: 0,
    maxRange: 3,
    targetMode: "heal-aoe",
    tooltipNote: "Área de 5 quadrados (losango); cura qualquer um dentro dela, aliado ou inimigo.",
    sfx: "heal",
  },
  // Cura ao longo do tempo em vez de na hora — mesma área e alcance da
  // Cura, mas mais barata (5 MP vs os 45 de CT da Cura) e rola acerto (80%)
  // em vez de acertar sempre. Aplica o status "regen" em cada atingido (ver
  // resolveRegen/applyStatusEffectsAtTurnStart).
  regenAoe: {
    name: "Regeneração em Área",
    icon: "🌱",
    kind: "regen-aoe",
    ctCost: 40,
    mpCost: 5,
    healMin: 2,
    healMax: 4,
    regenTurns: 3,
    areaRadius: 1,
    critChance: 0,
    hitChance: 0.8,
    minRange: 0,
    maxRange: 3,
    targetMode: "regen-aoe",
    tooltipNote: "Área de 5 quadrados (losango), alcance 3. 80% de chance de acerto; quem for atingido regenera 2-4 de vida por turno, por 3 turnos.",
    sfx: "heal",
  },
  // Mesma coisa, mas pro Químico — as habilidades dele são sempre 100% de
  // acerto (ver Poção de Cura/Mana/Bomba), então precisa do próprio objeto
  // em vez de reaproveitar regenAoe (que fica com os 80% do Xamã/Fada).
  regenAoeAlchemist: {
    name: "Regeneração em Área",
    icon: "🌱",
    kind: "regen-aoe",
    ctCost: 40,
    mpCost: 5,
    healMin: 2,
    healMax: 4,
    regenTurns: 3,
    areaRadius: 1,
    critChance: 0,
    hitChance: 1,
    minRange: 0,
    maxRange: 3,
    targetMode: "regen-aoe",
    tooltipNote: "Área de 5 quadrados (losango), alcance 3. Quem for atingido regenera 2-4 de vida por turno, por 3 turnos.",
    sfx: "heal",
  },
  // Alvo único: um cadáver aliado ainda no campo (até 3 turnos após a
  // morte — ver decayCorpses/deadUnitAt em game.js). ctCost alto de
  // propósito, é a magia mais forte do jogo (desfaz uma morte).
  resurrect: {
    name: "Ressurreição",
    icon: "✨",
    kind: "resurrect",
    ctCost: 90,
    mpCost: 7,
    critChance: 0,
    hitChance: 0.7,
    minRange: 0,
    maxRange: 3,
    targetMode: "resurrect",
    tooltipNote: "Alcance 3; ressuscita um aliado morto há até 3 turnos com metade do HP máximo. 70% de chance de sucesso.",
    sfx: "heal",
  },
  // Mesma coisa, mas pro Químico (100% de acerto, ver regenAoeAlchemist).
  resurrectAlchemist: {
    name: "Ressurreição",
    icon: "✨",
    kind: "resurrect",
    ctCost: 90,
    mpCost: 7,
    critChance: 0,
    hitChance: 1,
    minRange: 0,
    maxRange: 3,
    targetMode: "resurrect",
    tooltipNote: "Alcance 3; ressuscita um aliado morto há até 3 turnos com metade do HP máximo.",
    sfx: "heal",
  },
  // Escolha uma das 4 direções cardeais (attackableTiles mostra as 4 de uma
  // vez antes do clique, mas só a escolhida vira efeito — ver
  // startAttackTargeting); forma um "cilindro" de 3 tiles de espessura que
  // vai até a borda do tabuleiro NESSA direção (não pára no clique — ver
  // castCreepingDestruction/computeAoeAreaTiles). CT drain + imobilização
  // são incondicionais; só o dano depende da rolagem de 80%.
  creepingDestruction: {
    name: "Destruição Rastejante",
    icon: "🕸️",
    kind: "creeping-line",
    ctCost: 60,
    mpCost: 8,
    damageMin: 5,
    damageMax: 12,
    critMultiplier: 1,
    critChance: 0,
    hitChance: 0.8,
    minRange: 1,
    maxRange: 3,
    cardinalOnly: true,
    targetMode: "creeping-line",
    // bandLength: BOARD_SIZE não é "9999 tiles", é literalmente "até onde o
    // tabuleiro existir" — computeCardinalRectTiles corta sozinho na borda
    // via inBounds, então BOARD_SIZE sempre alcança a borda não importa de
    // onde o conjurador estiver.
    bandLength: BOARD_SIZE,
    bandWidth: 3,
    tooltipNote: "Escolha uma direção cardeal: faixa de 3 tiles de espessura que se estende até a borda do tabuleiro. 80% de chance de causar 5-12 de dano; todo mundo na área perde 15 de CT e fica imóvel no próximo turno, acertando ou não.",
    sfx: "nature",
  },
  poisonCone: {
    name: "Envenenamento",
    icon: "☠️",
    kind: "cone-poison",
    ctCost: 75,
    mpCost: 6,
    ...STATUS_DOT_DAMAGE.poison,
    turns: 3,
    critChance: 0,
    hitChance: 0.8,
    minRange: 1,
    maxRange: 5,
    targetMode: "cone-poison",
    tooltipNote: "Cone reto (1, 3, 5, 7, 9 quadrados de largura); acerta qualquer um na área, aliado ou inimigo.",
    sfx: "poison",
  },
  vinePrison: {
    name: "Prisão de Vinhas",
    icon: "🌿",
    kind: "root",
    ctCost: 55,
    mpCost: 2,
    damageMin: 1,
    damageMax: 2,
    turns: 2,
    critChance: 0,
    hitChance: 0.7,
    minRange: 1,
    maxRange: 3,
    targetMode: "root",
    tooltipNote: "Impede o alvo de se mover; atravessa outras unidades.",
    sfx: "nature",
  },
  // Habilidade do Ladino: buff em si mesmo, sem alvo/alcance/chance de acerto
  // — targetMode "self" faz o clique no menu já lançar direto, sem precisar
  // escolher um tile no tabuleiro (ver createItemSelectButton).
  invisibility: {
    name: "Invisibilidade",
    icon: "🫥",
    kind: "invisibility",
    ctCost: 60,
    mpCost: 5,
    turns: 2,
    targetMode: "self",
    tooltipNote: "Por 2 turnos inteiros, ataques de arma não acertam você (magias ainda acertam normalmente).",
    sfx: "arcane",
  },
  // Habilidade livre do Ladino: buff em si mesmo (ctCost 0), consumido no
  // próprio ataque em resolveSingleHit — só se acertar, aplica sangramento +
  // lentidão no alvo. Cada uso empilha efeitos novos e independentes (não
  // renova os existentes), então é cumulativo de propósito.
  weakeningStrike: {
    name: "Golpe Debilitante",
    icon: "🩸",
    kind: "weakening-strike",
    ctCost: 0,
    mpCost: 3,
    targetMode: "self",
    tooltipNote: "Se o próximo ataque neste turno acertar, o alvo sangra (1 de dano por turno) e perde 1 de deslocamento, por 3 turnos. Acumula com usos futuros.",
    sfx: "melee",
  },
  // Armadilha (Ladino): não causa dano na hora — instala uma área escondida
  // (ver traps/castTrap). Só inimigos que passarem por ela são afetados;
  // aliados atravessam sem nenhum efeito e sem revelar nada.
  trap: {
    name: "Armadilha",
    icon: "🪤",
    ctCost: 55,
    mpCost: 3,
    areaRadius: 1,
    noDamage: true,
    minRange: 1,
    maxRange: 3,
    targetMode: "trap",
    tooltipNote: "Invisível até um inimigo pisar: causa 1-3 de dano e cada quadrado custa +1 de deslocamento.<br>Revela a área ao ser acionada, some em 3 turnos. Aliados imunes; não instala em cima de alguém.",
    sfx: "nature",
  },
  // Magias da Fada.
  paralysis: {
    name: "Congelamento",
    icon: "❄️",
    kind: "freeze-aoe",
    ctCost: 70,
    mpCost: 4,
    damageMin: 1,
    damageMax: 3,
    areaRadius: 1,
    critChance: 0,
    hitChance: 0.7,
    minRange: 1,
    maxRange: 3,
    targetMode: "freeze-aoe",
    tooltipNote: "Área de 5 quadrados (losango); quem for atingido fica congelado por 1 turno, sofrendo 1-3 de dano.",
    sfx: "freeze",
  },
  // Mesma área do Envenenamento (cone reto, 1/3/5/7/9 de largura), mas em vez
  // de veneno empurra todo mundo atingido pra longe (ver castWindstorm).
  windstorm: {
    name: "Ventania",
    icon: "🌪️",
    kind: "windstorm",
    ctCost: 65,
    mpCost: 8,
    damageMin: 4,
    damageMax: 6,
    critMultiplier: 2,
    critChance: 0,
    hitChance: 0.8,
    minRange: 1,
    maxRange: 5,
    appliesCtDrain: 15,
    targetMode: "cone-windstorm",
    tooltipNote: "Cone reto (mesma área do Envenenamento); quem for atingido sofre 4-6 de dano, perde 15 de CT e é empurrado(a) 2-3 quadrados para trás.",
    sfx: "arcane",
  },
  // Habilidades livres: targetMode "self" e ctCost 0 — não consomem a ação do
  // turno (ver createItemSelectButton/castSelfAbility), só o MP.
  powerAttack: {
    name: "Ataque Poderoso",
    icon: "💪",
    kind: "power-attack",
    ctCost: 0,
    mpCost: 4,
    damageBonus: 3,
    targetMode: "self",
    tooltipNote: "Soma +3 de dano ao seu próximo ataque neste turno.",
    sfx: "melee",
  },
  // Habilidade do Guerreiro: ataque à distância com os mesmos números da
  // Espada, mas só nas 4 direções cardeais (ver cardinalOnly em
  // startAttackTargeting) — não é um "alcance livre" como o Arco.
  throwSword: {
    name: "Arremessar Espada",
    icon: "🗡️",
    ctCost: 50,
    mpCost: 3,
    damageMin: 8,
    damageMax: 10,
    critMultiplier: 2,
    hitChance: 0.8,
    minRange: 1,
    maxRange: 3,
    cardinalOnly: true,
    targetMode: "enemy",
    projectile: "blade",
    tooltipNote: "Só nas 4 direções cardeais, até 3 quadrados de distância. Mesmos dano/crítico/acerto da Espada.",
    sfx: "melee",
  },
  // Ataque Giratório (Guerreiro): mesmos números da Espada, mas acerta as 8
  // casas ao redor dele de uma vez (padrão do Crescimento do Troll — ver
  // castGrowthAttack/targetMode "self-attack").
  spinAttack: {
    name: "Ataque Giratório",
    icon: "🔄",
    kind: "spin-attack",
    ctCost: 50,
    mpCost: 3,
    damageMin: 8,
    damageMax: 10,
    critMultiplier: 2,
    hitChance: 0.8,
    targetMode: "self-attack",
    tooltipNote: "Ataca com a Espada todas as 8 casas ao redor (incluindo diagonais) de uma vez.",
    sfx: "melee",
  },
  // Habilidade livre do Guerreiro: postura defensiva, reduz o dano recebido
  // (ver damageReduction em resolveSingleHit).
  defend: {
    name: "Defender",
    icon: "🛡️",
    kind: "defend",
    ctCost: 0,
    mpCost: 1,
    turns: 2,
    targetMode: "self",
    tooltipNote: "Reduz o dano recebido em 2 nos próximos 2 turnos.",
    sfx: "melee",
  },
  trueShot: {
    name: "Tiro Certeiro",
    icon: "🎯",
    kind: "true-shot",
    ctCost: 0,
    mpCost: 2,
    critBonus: 0.1,
    targetMode: "self",
    tooltipNote: "Seu próximo ataque neste turno tem 100% de acerto e +10% de chance de crítico.",
    sfx: "ranged",
  },
  // Habilidade livre do Arqueiro: dobra o alcance só do próximo ataque com
  // o Arco (ver castLongShot/doubleRangeNextAttack, checado em
  // computeRangeTiles) — não afeta minRange nem outras armas/magias.
  longShot: {
    name: "Tiro Longo",
    icon: "🏹",
    kind: "long-shot",
    ctCost: 0,
    mpCost: 3,
    targetMode: "self",
    tooltipNote: "Dobra o alcance do seu próximo ataque neste turno.",
    sfx: "ranged",
  },
  // Habilidade livre do Arqueiro: queima o alvo do próximo ataque mesmo se
  // errar (ver castFireArrow/burnNextAttackAlwaysTurns); o dano extra só
  // entra se acertar de verdade.
  fireArrow: {
    name: "Flecha de Fogo",
    icon: "🔥",
    kind: "fire-arrow",
    ctCost: 0,
    mpCost: 3,
    bonusDamageMin: 1,
    bonusDamageMax: 3,
    burnTurns: 3,
    targetMode: "self",
    tooltipNote: "Seu próximo ataque queima o alvo por 3 turnos (1 de dano por turno), acertando ou não. Se acertar, ainda causa +1-3 de dano na hora.",
    sfx: "fire",
  },
  // Habilidades do Arqueiro.
  pierceShot: {
    name: "Tiro Penetrante",
    icon: "🏹",
    ctCost: 60,
    mpCost: 3,
    damageMin: 4,
    damageMax: 8,
    critMultiplier: 3,
    critChance: 0.15,
    hitChance: 0.8,
    minRange: 1,
    maxRange: 5,
    targetMode: "pierce-line",
    tooltipNote: "Sempre atira em linha reta (só nas 4 direções cardeais, nunca na diagonal) por 5 quadrados fixos — não dá pra escolher um alcance menor. Perfura e acerta todos os inimigos no caminho.",
    sfx: "ranged",
  },
  quickShot: {
    name: "Tiro Rápido",
    icon: "💨",
    kind: "haste-attack",
    ctCost: 0,
    mpCost: 4,
    targetMode: "self",
    restrictBonusToWeapon: WEAPONS.bow,
    tooltipNote: "Permite atirar com o Arco mais uma vez neste turno. Se atacar com outra arma em vez do Arco, a rodada de ataque acaba ali e o disparo extra é perdido.",
    sfx: "ranged",
  },
  agility: {
    name: "Agilidade",
    icon: "🌀",
    kind: "haste-attack",
    ctCost: 0,
    mpCost: 4,
    targetMode: "self",
    tooltipNote: "Permite atacar mais uma vez neste turno.",
    sfx: "melee",
  },
  swiftFeet: {
    name: "Pés Ágeis",
    icon: "🦶",
    kind: "swift-feet",
    ctCost: 0,
    mpCost: 2,
    targetMode: "self",
    tooltipNote: "Dobra seu deslocamento neste turno.",
    sfx: "melee",
  },
  // Evasiva (Goblin): reduz a chance de ser acertado por 2 turnos — soma com
  // a esquiva inata dele (innateEvasion, ver getEffectiveHitChance), não
  // substitui.
  evasiveManeuver: {
    name: "Evasiva",
    icon: "🍃",
    kind: "evasive",
    ctCost: 0,
    mpCost: 3,
    turns: 2,
    targetMode: "self",
    tooltipNote: "Por 2 turnos, reduz em mais 20% a chance de ser acertado — acumula com a esquiva inata do Goblin.",
    sfx: "melee",
  },
  // Investida (Orc): mover e atacar em uma ação só — ver targetMode "charge"
  // em onTileClick/computeChargeTargets/castCharge.
  charge: {
    name: "Investida",
    icon: "💢",
    kind: "charge",
    ctCost: 65,
    mpCost: 3,
    damageMin: 4,
    damageMax: 8,
    critMultiplier: 2,
    critChance: 0.1,
    hitChance: 0.9,
    targetMode: "charge",
    tooltipNote: "Corre em linha reta (só nas 4 direções cardeais) até 2x o seu deslocamento, pára ao lado do primeiro inimigo encontrado no caminho e ataca. Conta como mover E atacar no mesmo turno.",
    sfx: "melee",
  },
  fury: {
    name: "Fúria",
    icon: "😡",
    kind: "fury",
    ctCost: 0,
    mpCost: 3,
    damageBonus: 2,
    speedBonus: 2,
    hpDrainPerTurn: 1,
    turns: 3,
    targetMode: "self",
    tooltipNote: "Por 3 turnos: +2 de dano nos ataques e +2 de agilidade, mas perde 1 de HP por turno.",
    sfx: "melee",
  },
  // Versão "dobrada" da Fúria — mesmo kind ("fury"), então reaproveita
  // castFury inteiro sem precisar de função nova (ele já lê os números do
  // próprio item, não tem nada fixo). Só não SOMA com uma Fúria normal já
  // ativa: castFury só renova a duração nesse caso, não troca os números.
  berserk: {
    name: "Berserk",
    icon: "🤬",
    kind: "fury",
    ctCost: 0,
    mpCost: 6,
    damageBonus: 4,
    speedBonus: 4,
    hpDrainPerTurn: 2,
    turns: 3,
    targetMode: "self",
    tooltipNote: "Versão dobrada da Fúria — por 3 turnos: +4 de dano nos ataques e +4 de agilidade, mas perde 2 de HP por turno.",
    sfx: "melee",
  },
  // Habilidade livre do Químico: bônus de dano rolado na hora (ver
  // castExplosiveShot); a queimadura só aplica se o próximo ataque acertar
  // (diferente da Flecha de Fogo do Arqueiro, que queima mesmo errando).
  explosiveShot: {
    name: "Tiro Explosivo",
    icon: "💥",
    kind: "explosive-shot",
    ctCost: 0,
    mpCost: 6,
    bonusDamageMin: 1,
    bonusDamageMax: 3,
    burnTurns: 3,
    targetMode: "self",
    tooltipNote: "Seu próximo ataque com arma causa +1-3 de dano extra e, se acertar, deixa o alvo queimando (1 de dano por turno, 3 turnos).",
    sfx: "fire",
  },
  // Habilidades do Químico: como um ataque à distância, exigem linha limpa —
  // se algo bloquear o caminho até o aliado escolhido, afeta quem bloqueou.
  healPotion: {
    name: "Poção de Cura",
    icon: "🧪",
    ctCost: 45,
    mpCost: 5,
    healMin: 5,
    healMax: 10,
    critChance: 0,
    hitChance: 1,
    minRange: 0,
    maxRange: 3,
    requiresClearPath: true,
    targetMode: "ally-clearpath",
    tooltipNote: "Precisa de linha limpa; se algo bloquear, afeta quem estiver no caminho. Pode ser usada em si mesmo.",
    sfx: "heal",
  },
  manaPotion: {
    name: "Poção de Mana",
    icon: "💠",
    ctCost: 45,
    mpCost: 3,
    manaMin: 5,
    manaMax: 10,
    critChance: 0,
    hitChance: 1,
    minRange: 0,
    maxRange: 3,
    requiresClearPath: true,
    targetMode: "ally-clearpath",
    tooltipNote: "Precisa de linha limpa; se algo bloquear, afeta quem estiver no caminho. Pode ser usada em si mesmo.",
    sfx: "heal",
  },
  antidote: {
    name: "Antídoto",
    icon: "💉",
    ctCost: 60,
    mpCost: 7,
    areaRadius: 2,
    noDamage: true,
    minRange: 1,
    maxRange: 4,
    targetMode: "cure-aoe",
    tooltipNote: "Remove veneno e paralisia na hora de qualquer um na área, aliado ou inimigo.",
    sfx: "heal",
  },
  bomb: {
    name: "Bomba",
    icon: "💣",
    ctCost: 50,
    mpCost: 5,
    damageMin: 4,
    damageMax: 8,
    critMultiplier: 1,
    critChance: 0,
    hitChance: 1,
    minRange: 2,
    maxRange: 3,
    areaRadius: 1,
    // Mesma queimadura da Flecha de Fogo (1 de dano/turno, 3 turnos) — aqui
    // via appliesBurn (ver resolveSingleHit) em vez do esquema de "próximo
    // ataque" do Arqueiro, porque a Bomba já causa dano na hora (point-aoe),
    // não precisa de buff prévio.
    appliesBurn: { ...STATUS_DOT_DAMAGE.burned, turns: 3 },
    targetMode: "point-aoe",
    // Sem isso, castFireball (reaproveitado aqui, ver "Explosão Sonora" pro
    // mesmo truque) cai no visual padrão "fireball" — a Bomba viraria uma
    // Bola de Fogo com frasco, exatamente o que o redesign não queria.
    projectileKind: "bomb",
    burstKind: "bomb",
    tooltipNote: "Explode em losango de 5 quadrados (raio 1); quem for atingido pega fogo por 3 turnos. Se algo bloquear o caminho, detona antes do alvo.",
    sfx: "fire",
  },
  // Habilidades do Troll.
  regenBoost: {
    name: "Regeneração",
    icon: "🌱",
    kind: "regen-boost",
    ctCost: 0,
    mpCost: 4,
    regenBonus: 3,
    turns: 3,
    targetMode: "self",
    tooltipNote: "Aumenta sua regeneração passiva em +3 de vida por turno, por 3 turnos.",
    sfx: "nature",
  },
  // Idêntica ao Ataque Giratório do Guerreiro (mesmo nome, ícone e números)
  // — pedido do usuário pra substituir o antigo Crescimento. `kind`
  // continua "growth-attack" de propósito (só um identificador interno,
  // não aparece pro jogador) pra não quebrar castGrowthAttack/a IA do
  // Troll, que acham essa habilidade pelo kind, não pelo nome.
  growth: {
    name: "Ataque Giratório",
    icon: "🔄",
    kind: "growth-attack",
    ctCost: 50,
    mpCost: 3,
    damageMin: 8,
    damageMax: 10,
    critMultiplier: 2,
    hitChance: 0.8,
    targetMode: "self-attack",
    tooltipNote: "Ataca todas as 8 casas ao redor (incluindo diagonais) de uma vez.",
    sfx: "melee",
  },
  // Atropelar (Troll): move até 4 quadrados numa direção cardeal, atropelando
  // (sem parar em) todo inimigo no caminho — cada um sofre dano, perde CT e
  // fica mais lento. Só pára antes se um aliado ou a borda do tabuleiro
  // bloquear. Ver castTrample/computeLineTargetTiles.
  trample: {
    name: "Atropelar",
    icon: "💥",
    ctCost: 60,
    mpCost: 2,
    damageMin: 4,
    damageMax: 6,
    critMultiplier: 2,
    critChance: 0,
    hitChance: 0.8,
    minRange: 1,
    maxRange: 4,
    appliesCtDrain: 20,
    appliesSlow: { turns: 1, moveReduction: 1 },
    targetMode: "trample",
    tooltipNote: "Move até 4 quadrados em linha reta cardeal, atropelando todo inimigo no caminho sem parar: 80% de acerto, 0% de crítico, tira 20 de CT e reduz o deslocamento em 1 por 1 turno de quem for atingido.",
    sfx: "melee",
  },
};

function getHitChance(item, distance) {
  return item.hitChanceByDistance ? item.hitChanceByDistance[distance] : item.hitChance;
}

// `angle` (front/side/back, ver getAttackAngle) só importa pra itens com
// critChanceByAngle (ex: Punhal do Ladino) — os demais ignoram o parâmetro.
function getCritChance(item, angle) {
  if (item.critChanceByAngle) {
    return item.critChanceByAngle[angle] ?? item.critChanceByAngle.front;
  }
  return item.critChance !== undefined ? item.critChance : CRIT_CHANCE;
}

// Texto pro tooltip: item com crítico variável por ângulo mostra os 3
// valores de uma vez (não dá pra saber o ângulo antes de mirar um alvo real).
function critChanceTooltipText(item) {
  if (item.critChanceByAngle) {
    const a = item.critChanceByAngle;
    return `${Math.round(a.front * 100)}% frente / ${Math.round(a.side * 100)}% lado / ${Math.round(a.back * 100)}% trás`;
  }
  return `${Math.round(getCritChance(item) * 100)}%`;
}

// Vira `unit` pra encarar `tile` — chamada depois de mover e depois de
// atacar/lançar magia, pra guardar a última direção (mostrada como seta no
// tabuleiro). Só usa as 4 direções cardeais, escolhendo o eixo dominante do
// deslocamento (ex: mover 3 pra direita e 1 pra baixo vira "direita").
function setFacingTowards(unit, tile) {
  const dx = tile.x - unit.x;
  const dy = tile.y - unit.y;
  if (dx === 0 && dy === 0) return;
  unit.facing =
    Math.abs(dx) >= Math.abs(dy) ? { dx: Math.sign(dx), dy: 0 } : { dx: 0, dy: Math.sign(dy) };
}

function facingArrowSymbol(facing) {
  if (facing.dx === 1) return "▶";
  if (facing.dx === -1) return "◀";
  if (facing.dy === 1) return "▼";
  if (facing.dy === -1) return "▲";
  return "";
}

// Classifica o ângulo do ataque em relação a pra onde o defensor está virado:
// "front" (mesmo lado geral que a "frente" do defensor), "back" (lado
// oposto) ou "side" (nem um nem outro — perpendicular à frente/trás).
function getAttackAngle(attacker, defender) {
  const facing = defender.facing || { dx: 1, dy: 0 };
  const dx = attacker.x - defender.x;
  const dy = attacker.y - defender.y;
  const dot = dx * facing.dx + dy * facing.dy;
  if (dot > 0) return "front";
  if (dot < 0) return "back";
  return "side";
}

// Mantido por compatibilidade com quem só precisa saber frente x não-frente
// (ex: o bônus de Ataque Furtivo do Ladino, que vale tanto de lado quanto de trás).
function isAttackFromFront(attacker, defender) {
  return getAttackAngle(attacker, defender) === "front";
}

// Chance de acerto real de um golpe contra um defensor específico: a chance
// base da arma/magia, +10 pontos percentuais se vier de lado, +20 pontos
// percentuais se vier de trás, -10 pontos percentuais se o próprio atacante
// estiver ofuscado (Luz da Fada) e/ou atordoado (Explosão Sonora da Fada) —
// os dois descontam do que já era, então empilham se o atacante tiver as
// duas ao mesmo tempo, em vez de travar num valor fixo.
function getEffectiveHitChance(attacker, defender, item, distance) {
  const base = getHitChance(item, distance);
  if (base == null) return base;
  const angle = getAttackAngle(attacker, defender);
  const angleBonus = angle === "back" ? 0.2 : angle === "side" ? 0.1 : 0;
  let chance = base + angleBonus;
  if (isBlinded(attacker)) chance -= 0.1;
  if (isDazed(attacker)) chance -= 0.1;
  // Terreno alto (Casa): atacar DE CIMA dela dá +10 pontos percentuais, não
  // importa quem/onde está o alvo — bônus do lado do ATACANTE, condicionado
  // ao terreno DELE (ver terrainAt/TERRAIN_LAYOUT). Quem tem o status de voo
  // (flying, ex: a Fada) já é sempre "elevado" e ganha esse mesmo bônus em
  // qualquer tile, sem precisar estar fisicamente em cima de uma casa — por
  // isso é uma condição OU, não uma soma: não dobra se por acaso a unidade
  // voadora também estiver num desses tiles.
  const attackerTerrain = terrainAt(attacker.x, attacker.y);
  const attackerElevated = attacker.flying || (attackerTerrain && attackerTerrain.type === "house");
  if (attackerElevated) chance += 0.1;
  // Água: atacar DE DENTRO da água é 10 pontos percentuais mais difícil
  // (equilíbrio incerto, golpe mais fraco) — também condicionado ao
  // terreno do ATACANTE. Quem voa (flying) nunca toca a água de verdade,
  // então fica imune a essa penalidade.
  if (!attacker.flying && attackerTerrain && attackerTerrain.type === "water") chance -= 0.1;
  // Água: acertar um alvo atolado num tile de água é 10 pontos percentuais
  // mais fácil — bônus do lado do atacante, condicionado ao terreno do
  // DEFENSOR. Um defensor voando (flying) não está realmente atolado na
  // água, mesmo que o tile embaixo dele seja água, então não conta.
  const defenderTerrain = terrainAt(defender.x, defender.y);
  if (!defender.flying && defenderTerrain && defenderTerrain.type === "water") chance += 0.1;
  // Castelo/Montanha: quem ataca DE DENTRO da estrutura do próprio time tem
  // +20 pontos percentuais; quem ataca um alvo escondido na estrutura do
  // time DELE (defensor) tem -10 — só vale pro time "dono" da estrutura
  // (herói no castelo, inimigo na montanha), condicionado a
  // structure.team === unit.team dos dois lados.
  const attackerStructure = structureAt(attacker.x, attacker.y);
  if (attackerStructure && attackerStructure.team === attacker.team) chance += 0.2;
  const defenderStructure = structureAt(defender.x, defender.y);
  if (defenderStructure && defenderStructure.team === defender.team) chance -= 0.1;
  // Esquiva do defensor: inata (passiva, sempre ativa — ex: Goblin) + Evasiva
  // (ativável, acumula com a inata em vez de substituir).
  chance -= defender.innateEvasion || 0;
  const evasiveEffect = defender.statusEffects && defender.statusEffects.find((e) => e.type === "evasive");
  if (evasiveEffect) chance -= evasiveEffect.amount;
  // Esquiva específica contra magia (ex: Ladino) — só desconta quando o
  // ATAQUE é magia (item.mpCost definido), diferente de innateEvasion
  // (desconta de qualquer tipo de ataque).
  if (item.mpCost !== undefined) chance -= defender.magicEvasion || 0;
  // Regra global (item 32): ataque RANGED contra alvo em alcance de MELEE
  // (adjacente) tem -10 pontos percentuais fixos.
  if (isRangedAttack(item) && distance <= 1) chance -= RANGED_MELEE_HIT_PENALTY;
  return Math.min(Math.max(chance, 0), 1);
}

function getWeaponDamage(item) {
  if (item.damageMin !== undefined && item.damageMax !== undefined) {
    return Math.floor(Math.random() * (item.damageMax - item.damageMin + 1)) + item.damageMin;
  }
  return item.damage;
}

// Texto de dano pro tooltip: nunca "rola" o valor (ao contrário de
// getWeaponDamage), só mostra o intervalo/valor fixo pro jogador conferir.
function getDamageRangeText(item) {
  if (item.damageMin !== undefined && item.damageMax !== undefined) {
    return `${item.damageMin}-${item.damageMax}`;
  }
  return `${item.damage}`;
}

function isInWeaponRange(item, distance) {
  return distance >= item.minRange && distance <= item.maxRange;
}

// Regra global (item 32): qualquer arma/magia com alcance máximo > 1 conta
// como RANGED — mesma classificação que já decide, por exemplo, se um
// projétil visual é desenhado (ver spawnAttackProjectile). Não detecta por
// nome de habilidade nem por classe do personagem, só pelo dado real do
// item, como pedido.
function isRangedAttack(item) {
  return item.maxRange > 1;
}

// Ataque RANGED a distância de MELEE (alvo adjacente): -10 pontos
// percentuais fixos de chance de acerto (não redução relativa).
const RANGED_MELEE_HIT_PENALTY = 0.10;
// Depois da tentativa (acerte ou erre — o risco vem de tentar em corpo a
// corpo), 25% de chance do defensor contra-atacar, se seguir apto.
const RANGED_MELEE_COUNTER_CHANCE = 0.25;

// Ataque corpo a corpo básico do defensor pra revidar — primeira arma dele
// com alcance 1 (não usa magia/habilidade especial, só o equipamento comum).
function findBasicMeleeWeapon(unit) {
  return unit.weapons && unit.weapons.find((w) => w.maxRange === 1);
}

// Regra global (item 32): quem leva um ataque RANGED a distância de MELEE
// tem uma chance de contra-atacar, mesmo se o ataque errar — o risco vem da
// tentativa em si, de tão perto. Dispara tanto no branch de acerto quanto no
// de erro de resolveSingleHit (por isso é uma função própria, não só mais um
// bloco no final da função, que só roda depois de um acerto confirmado).
function maybeTriggerRangedMeleeCounter(attacker, defender, item, distance, isCounterAttack, cosmeticDelay) {
  if (isCounterAttack || attacker === defender) return;
  if (!isRangedAttack(item) || distance > 1) return;
  const counterWeapon = findBasicMeleeWeapon(defender);
  if (!counterWeapon) return;
  setTimeout(() => {
    if (defender.hp <= 0 || attacker.hp <= 0) return;
    // "morto, frozen/stunned/incapacitado ou não puder atacar" — este jogo
    // não tem status "frozen"; Paralisado é o equivalente de "perde a
    // capacidade de agir" (ver isParalyzed/beginTurnFor).
    if (isParalyzed(defender)) return;
    if (Math.random() < RANGED_MELEE_COUNTER_CHANCE) {
      log(`${defender.name} aproveita a distância curta e contra-ataca ${attacker.name}!`);
      playSfx("counter", boardPanFor(defender.x));
      resolveSingleHit(defender, attacker, counterWeapon, true);
      render();
      checkBattleOutcome();
      if (isHumanControlled(currentActor.team) && !battleEnded) {
        checkEndCurrentTurn();
      }
    }
  }, Math.max(cosmeticDelay, 0) + REACTION_ATTACK_DELAY);
}

// Terreno elevado (Castelo ou Casa) dá +1 de alcance pra ataques à
// distância de quem está em cima — voar conta como "sempre elevado" pelo
// mesmo motivo do bônus de acerto em getEffectiveHitChance.
function isUnitElevated(unit) {
  if (unit.flying) return true;
  const terrain = terrainAt(unit.x, unit.y);
  if (terrain && terrain.type === "house") return true;
  const structure = structureAt(unit.x, unit.y);
  if (structure && !structure.destroyed) return true;
  return false;
}

// Monta o texto do tooltip a partir dos dados reais da arma/magia (nunca
// fica desatualizado se os números mudarem).
function weaponTooltipHtml(attacker, item, distance) {
  const mpLineAlways = item.mpCost !== undefined ? `MP: ${item.mpCost}<br>` : "";
  const noteLineAlways = item.tooltipNote ? `<br><em>${item.tooltipNote}<\em>` : "";
  if (item.targetMode === "self") {
    // Buffs em si mesmo (ex: Invisibilidade, Fúria) não têm alcance/dano/
    // crítico — só custo e, quando houver, duração.
    const durationLine = item.turns !== undefined ? `Duração: ${item.turns} turno(s)` : "";
    return (
      `<strong>${item.name}</strong><br>` +
      `CT: ${item.ctCost}<br>` +
      mpLineAlways +
      durationLine +
      noteLineAlways
    );
  }
  if (item.targetMode === "self-attack") {
    // Ataca sozinho ao redor de si mesmo (Crescimento) — sem "alcance" pra
    // mostrar, mas tem dano/crítico/acerto normalmente.
    return (
      `<strong>${item.name}</strong><br>` +
      `CT: ${item.ctCost}<br>` +
      mpLineAlways +
      `Dano: ${getDamageRangeText(item)}<br>` +
      `Crítico: x${item.critMultiplier} (${Math.round(getCritChance(item) * 100)}%)<br>` +
      `Acerto: ${Math.round(item.hitChance * 100)}%` +
      noteLineAlways
    );
  }

  if (item.targetMode === "charge") {
    // Investida: o alcance depende do deslocamento de quem usa (2x
    // moveRange), então não dá pra guardar um valor fixo no item — calcula
    // aqui em cima do `attacker` de verdade.
    return (
      `<strong>${item.name}</strong><br>` +
      `Alcance: até ${attacker.moveRange * 2} (linha reta)<br>` +
      `CT: ${item.ctCost}<br>` +
      mpLineAlways +
      `Dano: ${getDamageRangeText(item)}<br>` +
      `Crítico: x${item.critMultiplier} (${Math.round(getCritChance(item) * 100)}%)<br>` +
      `Acerto: ${Math.round(item.hitChance * 100)}%` +
      noteLineAlways
    );
  }

  if (item.targetMode === "trap") {
    const rangeText = item.minRange === item.maxRange ? `${item.minRange}` : `${item.minRange}-${item.maxRange}`;
    return (
      `<strong>${item.name}</strong><br>` +
      `Alcance: ${rangeText} (área ${item.areaRadius})<br>` +
      `CT: ${item.ctCost}<br>` +
      mpLineAlways +
      `Dano ao ser pisada: 1-3<br>` +
      `Custo extra: +1 de deslocamento por quadrado da área<br>` +
      `Duração após acionada: 3 turnos` +
      noteLineAlways
    );
  }

  const isHeal = item.healMin !== undefined;
  const rangeText = item.minRange === item.maxRange ? `${item.minRange}` : `${item.minRange}-${item.maxRange}`;
  const hitChance = getHitChance(item, distance);
  const hitText = hitChance != null ? `${Math.round(hitChance * 100)}%` : "—";
  const outOfRange = distance != null && !isInWeaponRange(item, distance);
  const mpLine = item.mpCost !== undefined ? `MP: ${item.mpCost}<br>` : "";
  const noteLine = item.tooltipNote ? `<br><em>${item.tooltipNote}</em>` : "";
  const effectLine = isHeal
    ? `Cura: ${item.healMin}-${item.healMax}<br>`
    : item.noDamage
    ? ""
    : `Dano: ${getDamageRangeText(item)}<br>`;
  const critLine = isHeal || item.noDamage
    ? ""
    : `Crítico: x${item.critMultiplier} (${critChanceTooltipText(item)})<br>`;
  return (
    `<strong>${item.name}</strong><br>` +
    `Alcance: ${rangeText}<br>` +
    `CT: ${item.ctCost}<br>` +
    mpLine +
    effectLine +
    critLine +
    `Acerto: ${hitText}` +
    (outOfRange ? `<br><em>Fora de alcance</em>` : "") +
    noteLine
  );
}

// Pasta de assets (sprite/portrait) de cada personagem, indexada por
// spriteKey (ver assets/README.md). O jogo tenta carregar o portrait real;
// se o arquivo não existir, a imagem simplesmente some (onerror) e sobra só
// o emoji de sempre — nenhum personagem depende de ter um sprite pronto.
const SPRITE_MANIFEST = {
  guerreiro: "assets/heroes/guerreiro",
  arqueiro: "assets/heroes/arqueiro",
  mago: "assets/heroes/mago",
  ladino: "assets/heroes/ladino",
  quimico: "assets/heroes/quimico",
  goblin: "assets/enemies/goblin",
  orc: "assets/enemies/orc",
  xama: "assets/enemies/xama",
  fada: "assets/enemies/fada",
  troll: "assets/enemies/troll",
};

function portraitUrlFor(unit) {
  const folder = unit.spriteKey && SPRITE_MANIFEST[unit.spriteKey];
  return folder ? `${folder}/${unit.spriteKey}_portrait.png` : null;
}

function spriteIdleUrlFor(unit) {
  const folder = unit.spriteKey && SPRITE_MANIFEST[unit.spriteKey];
  return folder ? `${folder}/${unit.spriteKey}_idle_down_1.png` : null;
}

// --- Animação de sprite por troca de frames -------------------------------
// Além do idle único (spriteIdleUrlFor acima, só pro probe inicial), cada
// personagem pode ter uma sequência de frames por ação (idle/andar/atacar/
// dano/morte — ver assets/README.md). O jogo NUNCA assume quantos frames
// existem: testa _1, _2, _3... até um 404, então funciona igual pra quem tem
// 3 frames de morte ou 6, sem precisar mexer em código pra cada personagem
// novo. Cacheado por spriteKey (não por unidade) já que é sempre o mesmo
// conjunto de arquivos.
function probeImageExists(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

async function detectFrameSequence(folder, spriteKey, segment) {
  const frames = [];
  for (let n = 1; n <= 24; n++) {
    const url = `${folder}/${spriteKey}_${segment}_${n}.png`;
    if (!(await probeImageExists(url))) break;
    frames.push(url);
  }
  return frames;
}

const spriteFrameCache = new Map(); // spriteKey -> Promise<frames|null>

// Devolve { idle, walk, attack, hit, death, idleLeft, idleRight, idleBack,
// idleFront }, cada um um array de URLs (pode ser vazio se essa ação não
// tiver frames pra esse personagem) — ou null se o personagem não tem
// NENHUM sprite (cai no bonequinho de CSS de sempre). Os 4 últimos são a
// pose parada de verdade por direção (ver idle_novo_heroi.png/
// idle_novo_inimigos.png, fatiados em <key>_idle_<dir>_1.png) — diferentes
// de "idle" (só de frente, usado como fallback e pelo ciclo de respiração
// legado em startIdleCycle).
function loadSpriteFrames(unit) {
  const spriteKey = unit.spriteKey;
  const folder = spriteKey && SPRITE_MANIFEST[spriteKey];
  if (!folder) return Promise.resolve(null);
  if (spriteFrameCache.has(spriteKey)) return spriteFrameCache.get(spriteKey);

  const promise = (async () => {
    const idle = await detectFrameSequence(folder, spriteKey, "idle_down");
    if (idle.length === 0) return null; // sem nem o frame básico, nada pra usar
    const [walk, attack, cast, hit, death, idleLeft, idleRight, idleBack, idleFront] = await Promise.all([
      detectFrameSequence(folder, spriteKey, "walk_down"),
      detectFrameSequence(folder, spriteKey, "attack"),
      detectFrameSequence(folder, spriteKey, "cast"),
      detectFrameSequence(folder, spriteKey, "hit"),
      detectFrameSequence(folder, spriteKey, "death"),
      detectFrameSequence(folder, spriteKey, "idle_left"),
      detectFrameSequence(folder, spriteKey, "idle_right"),
      detectFrameSequence(folder, spriteKey, "idle_back"),
      detectFrameSequence(folder, spriteKey, "idle_front"),
    ]);
    return { idle, walk, attack, cast, hit, death, idleLeft, idleRight, idleBack, idleFront };
  })();
  spriteFrameCache.set(spriteKey, promise);
  return promise;
}

// Estado de animação de sprite por unidade: os frames já carregados e o
// timer do ciclo de idle em andamento (pra poder parar/trocar por outra ação
// sem duas animações brigando pelo mesmo <img>).
const unitSpriteState = new Map();

// `allowFlip` liga o espelhamento por CSS baseado em facing.dx (ver
// .facing-left) — só faz sentido pros frames "de frente" (andar/atacar/
// dano/morte/idle legado), que só existem olhando pra baixo/câmera. As
// poses paradas por direção (setIdlePose) já são arte própria por lado,
// então nunca devem espelhar — chamam com allowFlip:false.
function setSpriteFrame(unit, url, allowFlip = true) {
  const el = unitTokenEls.get(unit);
  const img = el && el.querySelector(".unit-sprite-img");
  if (!img || !url) return;
  img.src = url;
  const flip = allowFlip && !!(unit.facing && unit.facing.dx < 0);
  img.classList.toggle("facing-left", flip);
}

// Pose parada de verdade por direção (esquerda/direita/costas/frente) — ver
// loadSpriteFrames. Cai pra idleBack/idleFront conforme o eixo vertical de
// facing.dy, senão pro eixo horizontal (idleLeft/idleRight); se faltar
// algum desses (personagem sem arte nova, ou facing zerado) usa o frame de
// idle legado (só de frente) como último recurso.
// true se `list` é um array de frames com pelo menos 1 elemento — usado tanto
// aqui (qual direção usar) quanto em hasDirectionalArt (personagem tem
// alguma pose por direção?).
function hasFrames(list) {
  return !!(list && list.length);
}

function pickIdleDirectionUrl(unit, frames) {
  const facing = unit.facing || { dx: 1, dy: 0 };
  let list;
  if (facing.dy === -1 && hasFrames(frames.idleBack)) list = frames.idleBack;
  else if (facing.dy === 1 && hasFrames(frames.idleFront)) list = frames.idleFront;
  else if (facing.dx === -1 && hasFrames(frames.idleLeft)) list = frames.idleLeft;
  else if (facing.dx === 1 && hasFrames(frames.idleRight)) list = frames.idleRight;
  return (list && list[0]) || frames.idle[0];
}

// Aplica a pose parada correta pra direção atual — chamada sempre que a
// unidade fica ociosa (fim de playSpriteAction, ressurreição) e a cada
// render enquanto ela não estiver no meio de uma ação (ver
// state.actionPlaying/updateUnitTokenContent), pra "conectar" a pose com a
// última direção que ela ficou virada (setFacingTowards).
function setIdlePose(unit) {
  const state = unitSpriteState.get(unit);
  if (!state || !state.frames) return;
  const url = pickIdleDirectionUrl(unit, state.frames);
  // updateUnitTokenContent chama isso a cada render enquanto a unidade
  // estiver parada — sem esse cache, todo render reescreve img.src e faz um
  // querySelector à toa mesmo quando a direção não mudou desde o último.
  if (state.lastIdleUrl === url) return;
  state.lastIdleUrl = url;
  setSpriteFrame(unit, url, false);
}

function stopIdleCycle(unit) {
  const state = unitSpriteState.get(unit);
  if (state && state.idleTimer) {
    clearInterval(state.idleTimer);
    state.idleTimer = null;
  }
}

// Respeita prefers-reduced-motion: sem ciclo de idle (fica parado no
// primeiro frame) e ações "pulam" direto pro frame final em vez de animar
// quadro a quadro — mesmo espírito das outras animações do jogo (ver
// @media prefers-reduced-motion no CSS), só que essa troca de frame é feita
// em JS, então precisa do próprio guard aqui.
const prefersReducedMotion =
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Idle fica estático: a pose parada deve comunicar com clareza uma das quatro
// direções cardeais escolhidas ao fim do turno. Andar/ataque/dano/morte ainda
// usam integralmente suas sequências de frames.
const SPRITE_IDLE_CYCLE_ENABLED = false;

// Respiração: troca de frame devagar (~550ms) e em loop enquanto a unidade
// não estiver fazendo outra coisa — mesma ideia do balanço em CSS que já
// existia, só que agora com pose de verdade em vez de só um leve scale/tilt.
function startIdleCycle(unit) {
  if (prefersReducedMotion || !SPRITE_IDLE_CYCLE_ENABLED) return;
  const state = unitSpriteState.get(unit);
  if (!state || !state.frames || state.frames.idle.length <= 1) return;
  stopIdleCycle(unit);
  let i = 0;
  state.idleTimer = setInterval(() => {
    i = (i + 1) % state.frames.idle.length;
    setSpriteFrame(unit, state.frames.idle[i]);
  }, 550);
}

// Toca uma sequência de frames espalhada por `durationMs` (ex: os frames de
// ataque durante o tempo do swing) e volta pro ciclo de idle no final — a
// menos que `holdLastFrame` seja true (usado pela morte, que precisa ficar
// parada no frame final, não voltar a "respirar").
function playSpriteAction(unit, actionKey, durationMs, holdLastFrame = false) {
  const state = unitSpriteState.get(unit);
  if (!state || !state.frames) return false;
  // `cast` é opcional: futuros Mago/Químico podem fornecer frames próprios,
  // enquanto assets atuais seguem usando `attack` sem qualquer regressão.
  const requestedFrames = state.frames[actionKey];
  const frames = requestedFrames && requestedFrames.length > 0
    ? requestedFrames
    : actionKey === "cast"
      ? state.frames.attack
      : null;
  if (!frames || frames.length === 0) return false;

  stopIdleCycle(unit);
  const actionToken = (state.actionToken || 0) + 1;
  state.actionToken = actionToken;
  // Enquanto true, updateUnitTokenContent não pisa nos frames desta ação
  // com a pose parada (ver setIdlePose) — só volta a false quando a
  // sequência termina de verdade (ou fica true pra sempre com
  // holdLastFrame, ex: morte, que nunca deve "acordar" pra pose parada).
  state.actionPlaying = true;
  // Invalida o cache de setIdlePose: a ação vai escrever outros frames em
  // img.src, então o próximo setIdlePose (quando a ação acabar) precisa
  // reaplicar a pose parada de verdade, mesmo se a direção não tiver mudado.
  state.lastIdleUrl = null;
  if (prefersReducedMotion) {
    setSpriteFrame(unit, frames[frames.length - 1]);
    if (!holdLastFrame && state.actionToken === actionToken) state.actionPlaying = false;
    return true;
  }
  const stepMs = Math.max(durationMs / frames.length, 40);
  frames.forEach((url, i) => {
    setTimeout(() => {
      if (state.actionToken === actionToken) setSpriteFrame(unit, url);
    }, i * stepMs);
  });
  setTimeout(() => {
    if (holdLastFrame || state.actionToken !== actionToken) return;
    state.actionPlaying = false;
    if (unit.hp > 0) {
      // startIdleCycle não seta frame nenhum sozinha quando o ciclo de idle
      // está desligado (SPRITE_IDLE_CYCLE_ENABLED=false) — sem isso aqui, o
      // sprite ficava travado pra sempre no último frame da ação (ataque/
      // andar/dano) em vez de voltar pra pose parada.
      setIdlePose(unit);
      startIdleCycle(unit);
    }
  }, frames.length * stepMs);
  return true;
}

function createGuerreiroState() {
  return {
    name: "Guerreiro",
    icon: "⚔️",
    team: "player",
    x: 2,
    y: 5,
    hp: 35,
    maxHp: 35,
    moveRange: 4,
    speed: 10,
    ct: 0,
    mp: 6,
    maxMp: 6,
    hasMoved: false,
    hasActed: false,
    statusEffects: [],
    facing: { dx: 1, dy: 0 },
    bodyColor: "#6b7a99",
    spriteKey: "guerreiro",
    // Passiva: -1 de dano em QUALQUER golpe direto que ele levar (corpo a
    // corpo ou à distância, arma ou magia — ver damageReduction em
    // resolveSingleHit), sempre ativa, sem precisar de Defender. Não afeta
    // dano de status por turno (queimadura/veneno/etc — caminho separado).
    passiveDamageReduction: 1,
    weapons: [WEAPONS.sword, WEAPONS.shield],
    spells: [SPELLS.powerAttack, SPELLS.throwSword, SPELLS.defend, SPELLS.spinAttack],
  };
}

function createArqueiroState() {
  return {
    name: "Arqueiro",
    icon: "🏹",
    team: "player",
    x: 2,
    y: 7,
    hp: 25,
    maxHp: 25,
    moveRange: 5,
    speed: 11,
    ct: 0,
    mp: 8,
    maxMp: 8,
    hasMoved: false,
    hasActed: false,
    statusEffects: [],
    facing: { dx: 1, dy: 0 },
    bodyColor: "#5c8a52",
    spriteKey: "arqueiro",
    weapons: [WEAPONS.bow, WEAPONS.dagger],
    spells: [SPELLS.trueShot, SPELLS.fireArrow, SPELLS.pierceShot, SPELLS.quickShot, SPELLS.longShot],
    // Diferente das outras classes (Goblin, Troll etc.), o Arqueiro não pode
    // empilhar suas habilidades "de si mesmo" tudo no mesmo turno — só uma
    // por turno, com exceção dos pares liberados em FIRE_ARROW_COMBO_KINDS
    // (Flecha de Fogo + Tiro Rápido/Tiro Longo/Tiro Certeiro, sempre só 2 por
    // vez) — ver castSelfAbility/createItemSelectButton/
    // isSelfAbilityComboAllowed.
    singleSelfAbilityPerTurn: true,
  };
}

function createMagoState() {
  return {
    name: "Mago",
    icon: "🧙",
    team: "player",
    x: 2,
    y: 9,
    hp: 20,
    maxHp: 20,
    moveRange: 4,
    speed: 10,
    ct: 0,
    mp: 30,
    maxMp: 30,
    hasMoved: false,
    hasActed: false,
    statusEffects: [],
    facing: { dx: 1, dy: 0 },
    bodyColor: "#3a5ba0",
    spriteKey: "mago",
    weapons: [WEAPONS.cajado, WEAPONS.iceRay],
    spells: [SPELLS.fireball, SPELLS.missile, SPELLS.lightning, SPELLS.cure, SPELLS.regenAoe, SPELLS.resurrect],
  };
}

function createLadinoState() {
  return {
    name: "Ladino",
    icon: "🥷",
    team: "player",
    x: 2,
    y: 11,
    hp: 25,
    maxHp: 25,
    moveRange: 5,
    speed: 12,
    ct: 0,
    mp: 10,
    maxMp: 10,
    hasMoved: false,
    hasActed: false,
    statusEffects: [],
    facing: { dx: 1, dy: 0 },
    // +2 de dano sempre que o golpe não vem de frente do alvo (ver resolveSingleHit).
    backstabBonus: 2,
    // Ataque de oportunidade: fora do próprio turno, se um inimigo passar por
    // um quadrado adjacente a ele, o Ladino pode atacar de surpresa uma vez
    // por movimento (ver applyOpportunityAttacks/performMove).
    hasOpportunityAttack: true,
    // -10% de chance de SER acertado especificamente por magia (item.mpCost
    // definido) — ver getEffectiveHitChance. Reflexos rápidos o suficiente
    // pra escapar de boa parte de um feitiço mirado nele; não se aplica a
    // ataques de arma comuns.
    magicEvasion: 0.1,
    bodyColor: "#4a3b63",
    spriteKey: "ladino",
    weapons: [WEAPONS.crossbow, WEAPONS.dirk],
    spells: [SPELLS.invisibility, SPELLS.weakeningStrike, SPELLS.trap],
  };
}

function createGoblinState() {
  return {
    name: "Goblin",
    icon: "👹",
    team: "enemy",
    x: 10,
    y: 5,
    hp: 30,
    maxHp: 30,
    moveRange: 4,
    speed: 12,
    ct: 0,
    mp: 8,
    maxMp: 8,
    hasMoved: false,
    hasActed: false,
    statusEffects: [],
    facing: { dx: -1, dy: 0 },
    // Esquiva inata: qualquer ataque contra o Goblin tem 10% a menos de
    // chance de acertar, sempre (ver getEffectiveHitChance) — não é status,
    // não expira.
    innateEvasion: 0.1,
    bodyColor: "#6b7a3a",
    spriteKey: "goblin",
    weapons: [WEAPONS.shortSword, WEAPONS.sling],
    spells: [SPELLS.agility, SPELLS.swiftFeet, SPELLS.evasiveManeuver],
  };
}

function createOrcState() {
  return {
    name: "Orc",
    icon: "🧌",
    team: "enemy",
    x: 10,
    y: 7,
    hp: 40,
    maxHp: 40,
    moveRange: 5,
    speed: 9,
    ct: 0,
    mp: 6,
    maxMp: 6,
    hasMoved: false,
    hasActed: false,
    statusEffects: [],
    facing: { dx: -1, dy: 0 },
    // Contra-ataque passivo: ao levar um golpe corpo a corpo e sobreviver, 20%
    // de chance de revidar na hora com o ataque mais fraco dele (Machado) —
    // mesmo mecanismo do Troll (ver counterAttackChance em resolveSingleHit).
    counterAttackChance: 0.2,
    counterWeapon: WEAPONS.axe,
    bodyColor: "#7a3d2e",
    spriteKey: "orc",
    weapons: [WEAPONS.axe, WEAPONS.club],
    spells: [SPELLS.fury, SPELLS.berserk, SPELLS.charge],
  };
}

function createXamaState() {
  return {
    name: "Xamã",
    icon: "🧙‍♀️",
    iconTint: "witch-tint",
    team: "enemy",
    x: 10,
    y: 9,
    hp: 25,
    maxHp: 25,
    moveRange: 3,
    speed: 11,
    ct: 0,
    mp: 20,
    maxMp: 20,
    hasMoved: false,
    hasActed: false,
    statusEffects: [],
    facing: { dx: -1, dy: 0 },
    bodyColor: "#5a3d7a",
    spriteKey: "xama",
    weapons: [WEAPONS.zarabatana],
    spells: [SPELLS.cure, SPELLS.regenAoe, SPELLS.resurrect, SPELLS.creepingDestruction, SPELLS.poisonCone, SPELLS.vinePrison],
  };
}

function createFadaState() {
  return {
    name: "Fada",
    icon: "🧚",
    team: "enemy",
    x: 10,
    y: 11,
    hp: 20,
    maxHp: 20,
    moveRange: 4,
    speed: 13,
    ct: 0,
    mp: 20,
    maxMp: 20,
    hasMoved: false,
    hasActed: false,
    statusEffects: [],
    facing: { dx: -1, dy: 0 },
    // Status permanente de voo: só pode ser atingida por magia ou ataques à
    // distância (armas corpo a corpo erram sempre, ver resolveSingleHit),
    // atravessa tiles ocupados por inimigos ao mover sem poder parar neles
    // (ver computeReachable), não sofre custo extra nem efeito de chance de
    // acerto por estar num tile de água (ver waterStepCost/
    // getEffectiveHitChance), e sempre tem o bônus de "atacar de cima"
    // (como em cima de uma casa), independente do tile em que está.
    // Qualquer personagem futuro com flying:true ganha os mesmos efeitos —
    // nenhum deles checa "é a Fada", só checam esse campo.
    flying: true,
    bodyColor: "#d67ab8",
    spriteKey: "fada",
    weapons: [WEAPONS.shock, WEAPONS.light],
    spells: [SPELLS.paralysis, SPELLS.cure, SPELLS.regenAoe, SPELLS.resurrect, SPELLS.soundBlast, SPELLS.windstorm],
  };
}

function createQuimicoState() {
  return {
    name: "Químico",
    icon: "🧑‍🔬",
    team: "player",
    x: 2,
    y: 3,
    hp: 20,
    maxHp: 20,
    moveRange: 4,
    speed: 10,
    ct: 0,
    mp: 20,
    maxMp: 20,
    hasMoved: false,
    hasActed: false,
    statusEffects: [],
    facing: { dx: 1, dy: 0 },
    bodyColor: "#c9c9d4",
    spriteKey: "quimico",
    weapons: [WEAPONS.firearm],
    spells: [SPELLS.healPotion, SPELLS.manaPotion, SPELLS.antidote, SPELLS.bomb, SPELLS.regenAoeAlchemist, SPELLS.resurrectAlchemist, SPELLS.explosiveShot],
  };
}

function createTrollState() {
  return {
    name: "Troll",
    icon: "👺",
    team: "enemy",
    x: 10,
    y: 3,
    hp: 50,
    maxHp: 50,
    moveRange: 4,
    speed: 8,
    ct: 0,
    mp: 10,
    maxMp: 10,
    hasMoved: false,
    hasActed: false,
    statusEffects: [],
    facing: { dx: -1, dy: 0 },
    // Regenera vida sozinho todo turno, sem precisar de nenhuma magia (ver beginTurnFor).
    hpRegenPerTurn: 1,
    // Contra-ataque passivo: ao levar um golpe corpo a corpo e sobreviver,
    // 10% de chance de revidar na hora com um ataque mais fraco (ver
    // resolveSingleHit).
    counterAttackChance: 0.1,
    counterWeapon: WEAPONS.trollCounter,
    bodyColor: "#5a6b52",
    spriteKey: "troll",
    weapons: [WEAPONS.trunk, WEAPONS.throwLog],
    spells: [SPELLS.regenBoost, SPELLS.growth, SPELLS.trample],
  };
}

const guerreiro = createGuerreiroState();
const arqueiro = createArqueiroState();
const mago = createMagoState();
const ladino = createLadinoState();
const quimico = createQuimicoState();
const goblin = createGoblinState();
const orc = createOrcState();
const xama = createXamaState();
const fada = createFadaState();
const troll = createTrollState();
const playerTeam = [guerreiro, arqueiro, mago, ladino, quimico];
const enemyTeam = [goblin, orc, xama, fada, troll];
const units = [...playerTeam, ...enemyTeam];

let currentActor = guerreiro;
let selectedUnit = null;
let reachableTiles = [];
let attackableTiles = [];
let pendingWeapon = null;
let pendingBackAction = null;
// Pré-visualização de magias com área de efeito (bola de fogo, relâmpago,
// cone de veneno): o primeiro clique num tile válido só marca `aoePreviewTiles`
// (quais quadrados serão afetados); um segundo clique no mesmo alvo confirma
// e efetivamente lança a magia. Clicar em outro alvo válido atualiza a prévia.
let aoePreviewTarget = null;
let aoePreviewTiles = [];
// Ação (ataque de alvo único ou magia em área) esperando confirmação no
// popup: guarda um único callback `onConfirm` que executa a ação de fato —
// assim o mesmo popup/estado serve tanto pra openAttackConfirmation quanto
// pra openAoeConfirmation. Cancelar só fecha o popup (ver closeConfirmation);
// nada é desfeito, então o jogador pode tentar de novo na hora.
let pendingConfirmation = null;
// Armadilhas ativas (Ladino): cada uma é { tiles, ownerTeam, triggered,
// turnsLeft }. Ficam invisíveis (não desenhadas) até `triggered` virar true —
// isso só acontece quando um inimigo passa por um dos tiles dela ao se mover
// (ver applyTrapCrossings). turnsLeft só existe/conta a partir do gatilho
// (ver advanceToNextTurn); antes disso a armadilha dura indefinidamente.
let traps = [];
// Almas: { x, y } — nascem onde um cadáver termina de decompor sem ter sido
// ressuscitado a tempo (ver decayCorpses). Não são unidades (não entram em
// units/aliveUnits/unitAt), então já são automaticamente imunes a qualquer
// ataque/mira do jogo sem precisar de nenhum código extra pra isso — só
// curam 10 HP de quem passar ou parar em cima (ver applySoulPickups).
let souls = [];
// Cache do último computeReachable(): guarda de onde cada tile alcançável
// "veio" (cameFrom) e quanto custou chegar lá (costs), pra dar pra reconstruir
// o caminho de verdade quando o movimento é executado (ver performMove) —
// necessário porque atravessar uma armadilha inimiga custa 2 em vez de 1.
let lastReachableCameFrom = new Map();
let lastReachableCosts = new Map();
let telegraphTiles = [];
let turnToken = 0;
let battleEnded = false;
// Contador de turnos individuais (1 por unidade que age, não por rodada
// completa — mesmo sentido de "turno" que #turn-indicator já usa). Se
// chegar a MAX_GLOBAL_TURNS sem a batalha ter terminado por outro motivo,
// o time com mais HP total (unidades vivas + Castelo/Montanha) vence (ver
// checkBattleOutcome/beginTurnFor).
let globalTurnCount = 0;
const MAX_GLOBAL_TURNS = 100;
// Quando true (padrão), o time vermelho é jogado pela IA de sempre. Quando
// false, o time vermelho vira controlável por clique igual ao time azul
// (Jogador 2). Só afeta o PRÓXIMO turno de uma unidade do time vermelho —
// ver beginTurnFor.
let enemyControlledByAI = true;
// Mesma ideia, mas pro time azul — permite a IA jogar os 2 lados ao mesmo
// tempo (útil pra assistir uma partida sozinha rodar, ou testar).
let playerControlledByAI = false;

function isHumanControlled(team) {
  if (team === "player") return !playerControlledByAI;
  return !enemyControlledByAI;
}

const boardEl = document.getElementById("board");
const unitLayerEl = document.getElementById("unit-layer");
const waterForegroundLayerEl = document.getElementById("water-foreground-layer");
const structureLayerEl = document.getElementById("structure-layer");
const boardOverlayEl = document.getElementById("board-overlay");
const boardWrapperEl = document.getElementById("board-wrapper");
const screenFlashEl = document.getElementById("screen-flash");
const turnBannerEl = document.getElementById("turn-banner");

// Elementos persistentes de cada unidade (ícone, seta de direção, badge de
// status), separados da grade de tiles — a grade é recriada do zero a cada
// render(), mas esses tokens sobrevivem entre renders pra que a transição de
// CSS em left/top anime o deslocamento em vez de "teleportar". Ver
// renderUnitTokens/resetUnitTokens.
const unitTokenEls = new Map();
const unitLastPos = new Map();
// Igual unitTokenEls, mas pros cards do roster (fora do tabuleiro) — sem
// isso, cada updateHud() recriava os cards do zero (innerHTML = ""), e uma
// animação tocando no portrait (ex: reação de dano) sumia pela metade no
// próximo render, que acontece a qualquer mover/atacar, não só troca de
// turno. Zerado em resetGame() (ver resetUnitCards), igual unitTokenEls.
const unitCardEls = new Map();
// Último HP mostrado no card de cada unidade — usado só pra saber quando o
// "dano residual" (.hp-chip) deve disparar (ver updateUnitCardContent).
const unitLastCardHp = new Map();
const playerRosterEl = document.getElementById("player-roster");
const enemyRosterEl = document.getElementById("enemy-roster");
const turnOrderEl = document.getElementById("turn-order");
const logEl = document.getElementById("log");
const restartBtn = document.getElementById("restart-btn");
const endTurnBtn = document.getElementById("end-turn-btn");
const topBackBtn = document.getElementById("top-back-btn");
const aiControlBtn = document.getElementById("ai-control-btn");
const player2ControlBtn = document.getElementById("player2-control-btn");
const player1HumanControlBtn = document.getElementById("player1-human-control-btn");
const player1AiControlBtn = document.getElementById("player1-ai-control-btn");
const bgLeftEl = document.getElementById("bg-left");
const bgRightEl = document.getElementById("bg-right");
const battleEndModalEl = document.getElementById("battle-end-modal");
const battleEndTitleEl = document.getElementById("battle-end-title");
const battleEndRestartBtn = document.getElementById("battle-end-restart-btn");
const attackConfirmModalEl = document.getElementById("attack-confirm-modal");
const attackConfirmTitleEl = document.getElementById("attack-confirm-title");
const attackConfirmBodyEl = document.getElementById("attack-confirm-body");
const attackConfirmCancelBtn = document.getElementById("attack-confirm-cancel-btn");
const attackConfirmOkBtn = document.getElementById("attack-confirm-ok-btn");
const unitInfoModalEl = document.getElementById("unit-info-modal");
const unitInfoTitleEl = document.getElementById("unit-info-title");
const unitInfoBodyEl = document.getElementById("unit-info-body");
const unitInfoCloseBtn = document.getElementById("unit-info-close-btn");
// --- Cena de batalha dedicada (estilo Fire Emblem SNES) ---------------------
const battleSceneEls = {
  overlay: document.getElementById("battle-scene-overlay"),
  backdropImg: document.getElementById("battle-scene-backdrop-img"),
  leftImg: document.getElementById("battle-scene-left-img"),
  rightImg: document.getElementById("battle-scene-right-img"),
  leftName: document.getElementById("battle-scene-left-name"),
  rightName: document.getElementById("battle-scene-right-name"),
  leftHpFill: document.getElementById("battle-scene-left-hpfill"),
  rightHpFill: document.getElementById("battle-scene-right-hpfill"),
};
const battleSceneToggleBtn = document.getElementById("battle-scene-toggle-btn");
const musicToggleBtn = document.getElementById("music-toggle-btn");

// Trava de turno: não existe nenhuma trava de animação no resto do jogo (ver
// finalizeAction, que sempre roda síncrono) — esta é a primeira. Suficiente
// porque o overlay cobre a tela inteira (pointer-events:auto, inset:0), então
// fisicamente não dá pra clicar em nada por baixo enquanto está true.
let battleSceneActive = false;
// Desligada por padrão a pedido do usuário ("não gostei dessa cena de
// zoom") — a implementação continua toda aqui, só o toggle inicial mudou;
// dá pra reativar direto pelo botão "Cena de batalha" na UI.
let battleSceneEnabled = false;

// Irmã pequena de playSpriteAction (ver acima) — NÃO uma modificação dela.
// playSpriteAction/setSpriteFrame/playAttackAnimation/playHitReaction são
// hard-wired em unitTokenEls.get(unit) internamente; refatorar pra aceitar
// elemento explícito mexeria em 4 funções cheias de nuance (ciclo de idle,
// hold de frame de morte, branch arma/magia) à toa. Esta função lê os frames
// já carregados direto de unitSpriteState e escreve num <img> próprio da
// cena de batalha, com seu próprio loop de setTimeout — zero risco pro
// caminho de animação que já existe no tabuleiro pequeno.
function playBattleSceneFrames(imgEl, frames, durationMs, holdLastFrame = false) {
  if (!frames || frames.length === 0) return;
  if (prefersReducedMotion) {
    imgEl.src = frames[frames.length - 1];
    return;
  }
  const stepMs = Math.max(durationMs / frames.length, 40);
  frames.forEach((url, i) => {
    setTimeout(() => {
      imgEl.src = url;
    }, i * stepMs);
  });
  if (!holdLastFrame) {
    setTimeout(() => {
      imgEl.src = frames[0];
    }, frames.length * stepMs);
  }
}

// Só entra na cena de batalha se os dois lados tiverem sprite de verdade
// carregado (unitSpriteState) — quem só tem o boneco de CSS cairia numa cena
// grande vazia/quebrada, então usa o caminho normal (animação no tabuleiro).
// Mesmo ligada, só dispara 2/3 das vezes (reduzida em 1/3 — pedido do
// usuário, ficava repetitiva disparando em TODO ataque elegível).
const BATTLE_SCENE_CHANCE = 2 / 3;
function shouldShowBattleScene(attacker, defender, item) {
  return (
    battleSceneEnabled &&
    unitSpriteState.has(attacker) &&
    unitSpriteState.has(defender) &&
    Math.random() < BATTLE_SCENE_CHANCE
  );
}

function openBattleScene(attacker, defender) {
  battleSceneActive = true;
  const leftFrames = unitSpriteState.get(attacker).frames;
  const rightFrames = unitSpriteState.get(defender).frames;
  battleSceneEls.leftImg.src = leftFrames.idle[0];
  battleSceneEls.rightImg.src = rightFrames.idle[0];
  battleSceneEls.leftName.textContent = attacker.name;
  battleSceneEls.rightName.textContent = defender.name;
  battleSceneEls.leftHpFill.style.width = `${Math.max((attacker.hp / attacker.maxHp) * 100, 0)}%`;
  battleSceneEls.rightHpFill.style.width = `${Math.max((defender.hp / defender.maxHp) * 100, 0)}%`;
  battleSceneEls.overlay.classList.remove("hidden", "leaving");
  // Força reflow pra reiniciar a animação de entrada mesmo se a cena anterior
  // acabou de fechar (mesmo truque do .turn-banner/renderTurnOrder).
  void battleSceneEls.overlay.offsetWidth;
  battleSceneEls.overlay.classList.add("entering");
}

function closeBattleScene() {
  battleSceneEls.overlay.classList.remove("entering");
  battleSceneEls.overlay.classList.add("leaving");
  setTimeout(() => {
    battleSceneEls.overlay.classList.add("hidden");
    battleSceneEls.overlay.classList.remove("leaving");
    battleSceneActive = false;
  }, prefersReducedMotion ? 0 : 250);
}

// Orquestrador: abre a cena, dispara o golpe de verdade (resolveSingleHit
// continua fazendo EXATAMENTE o que já fazia — timing/dano/log intocados),
// sincroniza a animação grande com o momento real do impacto via onOutcome,
// segura um tempo pro jogador ler o resultado, fecha, e só então chama
// onDone (finalizeAction) — o turno fica travado até a cena terminar.
function runBattleScene(attacker, defender, item, onDone) {
  openBattleScene(attacker, defender);
  const attackDurationMs = 420;
  setTimeout(() => {
    const leftFrames = unitSpriteState.get(attacker).frames;
    playBattleSceneFrames(battleSceneEls.leftImg, leftFrames.attack, attackDurationMs);
    resolveSingleHit(attacker, defender, item, false, null, (hitLanded) => {
      battleSceneEls.rightHpFill.style.width = `${Math.max((defender.hp / defender.maxHp) * 100, 0)}%`;
      if (hitLanded) {
        const rightFrames = unitSpriteState.get(defender).frames;
        playBattleSceneFrames(battleSceneEls.rightImg, rightFrames.hit, 400);
      }
      setTimeout(() => {
        closeBattleScene();
        setTimeout(onDone, prefersReducedMotion ? 0 : 250);
      }, 500);
    });
  }, prefersReducedMotion ? 0 : 400);
}

function scheduled(fn, delay) {
  const token = turnToken;
  setTimeout(() => {
    if (token === turnToken) fn();
  }, delay);
}

// Mostra a área que a IA vai atingir por um instante antes do golpe
// realmente acontecer, pra dar tempo do adversário ver o que vem por aí
// (principalmente importante nas magias em área/linha).
function telegraphThenAct(tiles, executeFn, delay = 1000) {
  telegraphTiles = tiles;
  render();
  playSfx("telegraph");
  scheduled(() => {
    telegraphTiles = [];
    executeFn();
  }, delay);
}

// Adivinha o "tipo" de uma mensagem de log só pelo texto (ícone + cor),
// sem precisar tocar nas dezenas de chamadas de log() espalhadas pelo
// arquivo pra passar um tipo explícito. A ordem dos testes importa: coisas
// mais específicas (crítico, derrota) vêm antes de "ataca ... causando"
// genérico, senão um golpe crítico cairia no balde de acerto comum.
function classifyLogMessage(message) {
  let icon = "";
  let type = "generic";
  if (message.startsWith("--- Turno:")) {
    icon = "▶";
    type = "turn";
  } else if (/CRÍTICO/.test(message)) {
    icon = "💥";
    type = "crit";
  } else if (/foi derrotado|foi eliminad/i.test(message)) {
    icon = "☠️";
    type = "death";
  } else if (/errou!|não acerta nada|imune!/i.test(message)) {
    icon = "💨";
    type = "miss";
  } else if (/envenenad|ofuscad|paralisad|enraizad|fica mais lento/i.test(message)) {
    icon = "🌀";
    type = "status";
  } else if (/de vida|cura\b|curando|curad[oa]/i.test(message)) {
    icon = "💚";
    type = "heal";
  } else if (/de MP/.test(message)) {
    icon = "🔷";
    type = "mp";
  } else if (/ataca .* causando/.test(message)) {
    icon = "⚔️";
    type = "hit";
  }

  // Cor por time: só um chute a partir de quem é citado primeiro na
  // mensagem — não precisa ser perfeito, é só uma pista visual extra pra
  // escanear o log mais rápido.
  let team = null;
  for (const unit of units) {
    if (message.startsWith(unit.name)) {
      team = unit.team;
      break;
    }
  }
  return { icon, type, team };
}

function log(message) {
  const { icon, type, team } = classifyLogMessage(message);
  const entry = document.createElement("div");
  entry.className = `log-entry log-type-${type}${team ? ` log-team-${team}` : ""}`;
  entry.innerHTML = `${icon ? `<span class="log-icon">${icon}</span>` : ""}<span class="log-text"></span>`;
  entry.querySelector(".log-text").textContent = message;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}

const FLOATING_TEXT_DURATION_MS = 3800;

// Quantos textos flutuantes estão ativos, por tile — usado só pra
// escalonar a posição de quem chega enquanto outro ainda está subindo
// (ver spawnFloatingText). O índice nunca é reciclado enquanto o tile
// segue ocupado: se reciclasse (ex: sempre "a próxima vaga livre"), dois
// textos que nunca coexistiram no tempo podiam ainda assim herdar o mesmo
// deslocamento visual um do outro. Some do mapa de vez quando o tile zera,
// pra próxima leva recomeçar do centro.
const floatingTextStackByTile = new Map();

// Projeção pra tela: quando a cena 3D (scene3d.js) está carregada, ela
// expõe window.scene3dTileToScreenPercent(x,y,yOffset) — projeta um ponto
// do tabuleiro (aceita x/y fracionário, útil pra pontos entre dois tiles)
// pra %-de-tela respeitando câmera/rotação/elevação atuais de verdade. Sem
// isso (3D ainda não carregou), cai na fórmula plana de sempre — todo
// efeito abaixo funciona nos dois casos sem precisar saber qual é qual.
// yOffset é em "unidades de mundo" da cena 3D (ignorado no fallback plano,
// que não tem noção de altura).
function tileScreenPercent(x, y, yOffset = 0) {
  if (window.scene3dTileToScreenPercent) {
    const p = window.scene3dTileToScreenPercent(x, y, yOffset);
    if (p) return p;
  }
  return { leftPct: (x / BOARD_SIZE) * 100, topPct: (y / BOARD_SIZE) * 100 };
}

// Popup flutuante sobre o tile de uma unidade (acerto/crítico/erro).
// Vive no overlay separado do tabuleiro, então sobrevive aos re-renders
// (o board em si é recriado do zero a cada render()).
function spawnFloatingText(x, y, text, cssClass) {
  const key = `${x},${y}`;
  const state = floatingTextStackByTile.get(key) || { count: 0, nextIndex: 0 };
  const stackIndex = state.nextIndex;
  state.count++;
  state.nextIndex++;
  floatingTextStackByTile.set(key, state);

  const el = document.createElement("div");
  el.className = `floating-text ${cssClass}`;
  el.textContent = text;
  const pos = tileScreenPercent(x + 0.5, y + 0.5, 1.3);
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  // Cada texto que chega enquanto o tile já tem outro subindo nasce um
  // pouco mais alto e alternando pro lado, em vez de nascer bem em cima do
  // anterior (o caso clássico de dano em área acertando vários alvos, ou
  // até o mesmo alvo, quase ao mesmo tempo).
  const stackY = stackIndex * -22;
  const stackX = stackIndex === 0 ? 0 : (stackIndex % 2 === 0 ? 1 : -1) * Math.ceil(stackIndex / 2) * 13;
  el.style.setProperty("--stack-x", `${stackX}px`);
  el.style.setProperty("--stack-y", `${stackY}px`);
  boardOverlayEl.appendChild(el);
  setTimeout(() => {
    el.remove();
    const current = floatingTextStackByTile.get(key);
    if (!current) return;
    current.count--;
    if (current.count <= 0) floatingTextStackByTile.delete(key);
  }, FLOATING_TEXT_DURATION_MS);
}

// Popup simples com o nome de uma unidade, mostrado ao clicar nela fora do
// seu turno e sem estar mirando ataque/magia (ver onTileClick). Reaproveita
// o mesmo overlay das floating-texts, então some sozinho e sobrevive a
// re-renders; um novo clique em qualquer unidade substitui o popup anterior.
function showUnitNamePopup(unit, isCorpse) {
  const existing = document.getElementById("unit-name-popup");
  if (existing) existing.remove();

  const el = document.createElement("div");
  el.id = "unit-name-popup";
  el.className = "unit-name-popup";
  el.textContent = isCorpse ? `${unit.icon} ${unit.name} (morto)` : `${unit.icon} ${unit.name}`;
  const pos = tileScreenPercent(unit.x + 0.5, unit.y + 0.5, 1.9);
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  boardOverlayEl.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

// Flash de impacto no tile (efeito visual do golpe), colorido conforme a
// "família" do golpe (melee, à distância, fogo, etc — ver campo sfx nas
// armas/magias).
function spawnImpactEffect(x, y, sfxKey, visualScale = 1) {
  const el = document.createElement("div");
  el.className = `impact-effect impact-${sfxKey}`;
  const pos = tileScreenPercent(x + 0.5, y + 0.5, 0.1);
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  el.style.width = `${(1 / BOARD_SIZE) * 100 * visualScale}%`;
  el.style.height = `${(1 / BOARD_SIZE) * 100 * visualScale}%`;
  el.style.transform = "translate(-50%, -50%)";
  boardOverlayEl.appendChild(el);
  setTimeout(() => el.remove(), 450);
}

// --- Projéteis, feixes e explosões: dão corpo visual ao trajeto de um golpe
// à distância/mágico, em vez de só o flash instantâneo no alvo. Tudo vive no
// mesmo overlay (sobrevive a re-renders) e é puramente cosmético — nunca
// atrasa dano/estado, só quando o flash de impacto e o número de dano
// aparecem (ver cosmeticDelay em resolveSingleHit).

// Golpe de arma viaja no tempo normal; magia é o dobro disso (mais lenta
// pra "sentir" mais pesada) — ver isMagicItem/spawnAttackProjectile e os
// dois lançamentos de área (Bola de Fogo, Congelamento) que chamam
// spawnProjectile direto.
const MAGIC_TRAVEL_MULTIPLIER = 2;

// Só Xamã, Fada e Maga são conjuradores de verdade — o botão do menu de
// ação usa isso pra rotular como "Magia" (eles) vs "Habilidade" (Guerreiro,
// Arqueiro, Ladino, Químico, Troll, que reaproveitam o mesmo campo
// unit.spells internamente, mas não são magos).
const SPELLCASTER_SPRITE_KEYS = new Set(["mago", "xama", "fada"]);

// Perfis apenas cosméticos, indexados por spriteKey. Não carregam dano,
// alcance nem qualquer decisão de combate: escolhem a origem e o acabamento
// dos VFX que o fluxo de combate existente já dispara.
const COMBAT_VFX_PROFILES = {
  guerreiro: { accent: "warrior", projectileOriginHeight: 1.15, originAdvance: 0.12, particleColor: "#ffe08a", particleCount: 8, visualScale: 1.22, spriteVfxScale: 1 },
  ladino: { accent: "rogue", projectileOriginHeight: 1.0, originAdvance: 0.16, particleColor: "#e9dcff", particleCount: 4, visualScale: 1.3, spriteVfxScale: 0.55 },
  arqueiro: { accent: "archer", projectileOriginHeight: 1.18, originAdvance: 0.24, particleColor: "#d8b877", particleCount: 5, visualScale: 1.2, spriteVfxScale: 0.65 },
  mago: { accent: "mage", projectileOriginHeight: 1.28, originAdvance: 0.1, particleColor: "#c9a3ff", particleCount: 7, visualScale: 1.25, spriteVfxScale: 0.6 },
  quimico: { accent: "alchemist", projectileOriginHeight: 1.12, originAdvance: 0.16, particleColor: "#9be36b", particleCount: 6, visualScale: 1.25, spriteVfxScale: 0.6 },
};
const DEFAULT_COMBAT_VFX_PROFILE = { accent: null, projectileOriginHeight: 0.9, originAdvance: 0, particleColor: null, particleCount: 0, visualScale: 1, spriteVfxScale: 1 };
const ACTION_VISUAL_INTENSITY = { basic: 1, strong: 1.25, skill: 1.5, exceptional: 1.7 };
const combatVfxByImpactTile = new Map();

// Timing e assinatura 2D por habilidade real. Estes valores controlam
// somente apresentação; as regras continuam no fluxo de combate existente.
const ABILITY_VFX_PROFILES = {
  // Ataques físicos à distância (não-mágicos): -30% de velocidade a pedido
  // do usuário — projectileDuration dividido por 0.7 (mesma distância, mais
  // tempo pra percorrer) — e depois mais -50% em cima disso (×1.5), outro
  // pedido do usuário. Só o visual muda; hitChance/dano/alcance/cooldown
  // continuam os mesmos.
  bow: { id: "arrow", castDelay: 70, projectileDuration: 771, launch: "release", trajectory: "direct", castSfx: "bowRelease", travelSfx: "arrowTravel" },
  crossbow: { id: "bolt", castDelay: 45, projectileDuration: 665, launch: "release", trajectory: "direct", castSfx: "crossbowRelease", travelSfx: "boltTravel" },
  sling: { id: "stone", castDelay: 80, projectileDuration: 921, launch: "release", trajectory: "arc", castSfx: "slingRelease", travelSfx: "stoneTravel" },
  firearm: { id: "bullet", castDelay: 35, projectileDuration: 494, launch: "release", trajectory: "direct", castSfx: "firearmRelease", travelSfx: null },
  light: { id: "spark", castDelay: 120, projectileDuration: 500, launch: "channel", trajectory: "pulse", castSfx: "lightCast", travelSfx: "arcaneTravel" },
  iceRay: { id: "ice-ray", castDelay: 150, projectileDuration: 360, launch: "channel", trajectory: "beam", castSfx: "iceCast", travelSfx: "iceTravel" },
  missile: { id: "missile", castDelay: 180, projectileDuration: 620, launch: "channel", trajectory: "pulse", castSfx: "arcaneCast", travelSfx: "arcaneTravel" },
  throwSword: { id: "blade", castDelay: 90, projectileDuration: 629, launch: "release", trajectory: "spin", castSfx: "bladeRelease", travelSfx: "bladeTravel" },
  fireball: { id: "fireball", castDelay: 190, projectileDuration: 680, launch: "channel", trajectory: "float", castSfx: "fireCast", travelSfx: "fireTravel" },
  soundBlast: { id: "sound", castDelay: 130, projectileDuration: 520, launch: "pulse", trajectory: "wave", castSfx: "soundCast", travelSfx: "soundTravel" },
  bomb: { id: "bomb", castDelay: 110, projectileDuration: 600, launch: "throw", trajectory: "arc", castSfx: "flaskThrow", travelSfx: "flaskTravel" },
  healPotion: { id: "flask", castDelay: 90, projectileDuration: 520, launch: "throw", trajectory: "arc", castSfx: "flaskThrow", travelSfx: "flaskTravel" },
  manaPotion: { id: "flask", castDelay: 90, projectileDuration: 520, launch: "throw", trajectory: "arc", castSfx: "flaskThrow", travelSfx: "flaskTravel" },
  antidote: { id: "flask", castDelay: 90, projectileDuration: 520, launch: "throw", trajectory: "arc", castSfx: "flaskThrow", travelSfx: "flaskTravel" },
};
const DEFAULT_ABILITY_VFX_PROFILE = { id: "default", castDelay: 0, projectileDuration: null, launch: "direct", trajectory: "direct", castSfx: null, travelSfx: "whoosh" };

// Cache por referência: WEAPONS/SPELLS são objetos estáticos (nunca mudam
// depois de carregados) e cada item é sempre o MESMO objeto singleton, então
// o resultado nunca muda pra uma dada referência — sem isso, toda arma/magia
// usada refazia uma busca linear (com duas alocações de array via
// Object.entries) do zero a cada ataque/lançamento, mesmo repetindo o mesmo
// item várias vezes por batalha (auditoria de performance, item 31).
const abilityCatalogKeyCache = new Map();
function abilityCatalogKey(item) {
  if (abilityCatalogKeyCache.has(item)) return abilityCatalogKeyCache.get(item);
  let found = null;
  for (const [key, value] of Object.entries(WEAPONS)) {
    if (value === item) { found = key; break; }
  }
  if (found === null) {
    for (const [key, value] of Object.entries(SPELLS)) {
      if (value === item) { found = key; break; }
    }
  }
  abilityCatalogKeyCache.set(item, found);
  return found;
}

function abilityVfxProfile(item) {
  return ABILITY_VFX_PROFILES[abilityCatalogKey(item)] || DEFAULT_ABILITY_VFX_PROFILE;
}

function spawnCastCue(unit, profile) {
  if (!unit || !profile || profile.launch === "direct") return;
  const pos = tileScreenPercent(unit.x + 0.5, unit.y + 0.5, 1.05);
  const el = document.createElement("div");
  el.className = `cast-cue cast-cue-${profile.launch} ability-vfx-${profile.id}`;
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  const castDurationMs = Math.max(profile.castDelay, 120);
  el.style.setProperty("--cast-duration", `${castDurationMs}ms`);
  if (profile.id === "fireball") {
    // Faíscas extras convergindo pro cajado, além do par fixo do
    // ::before/::after em CSS — reforça a leitura de "calor se
    // concentrando" antes das chamas ganharem massa e serem lançadas.
    for (let i = 0; i < 5; i++) {
      const spark = document.createElement("span");
      spark.className = "cast-cue-fireball-spark";
      const angle = Math.random() * Math.PI * 2;
      // px, não %: translate() em % é relativo à própria caixa da faísca
      // (3px), não ao cast-cue — em % a convergência ficaria imperceptível.
      const distance = 46 + Math.random() * 34;
      spark.style.setProperty("--spark-x", `${Math.cos(angle) * distance}px`);
      spark.style.setProperty("--spark-y", `${Math.sin(angle) * distance}px`);
      spark.style.setProperty("--spark-delay", `${Math.random() * (castDurationMs * 0.35)}ms`);
      el.appendChild(spark);
    }
  }
  boardOverlayEl.appendChild(el);
  setTimeout(() => el.remove(), castDurationMs + 120);
}

function combatVfxProfile(unit) {
  return COMBAT_VFX_PROFILES[unit && unit.spriteKey] || DEFAULT_COMBAT_VFX_PROFILE;
}

function actionVisualIntensity(item) {
  if (item && item.mpCost !== undefined) return ACTION_VISUAL_INTENSITY.skill;
  if (item && item.targetMode && item.targetMode !== "enemy") return ACTION_VISUAL_INTENSITY.strong;
  return ACTION_VISUAL_INTENSITY.basic;
}

function rememberCombatVfxProfile(attacker, defender, item) {
  if (!attacker || !defender) return;
  const key = tileKey(defender.x, defender.y);
  const baseProfile = combatVfxProfile(attacker);
  combatVfxByImpactTile.set(key, {
    profile: { ...baseProfile, visualScale: baseProfile.visualScale * actionVisualIntensity(item) },
    expiresAt: performance.now() + 1400,
  });
}

function consumeCombatVfxProfile(x, y) {
  const key = tileKey(x, y);
  const entry = combatVfxByImpactTile.get(key);
  if (!entry || entry.expiresAt < performance.now()) {
    combatVfxByImpactTile.delete(key);
    return DEFAULT_COMBAT_VFX_PROFILE;
  }
  combatVfxByImpactTile.delete(key);
  return entry.profile;
}

// Projétil que desliza de um tile a outro (flecha, bala, orbe arcano etc.).
// Devolve a duração em ms, pra quem chamou saber quando o "impacto" deve
// aparecer de verdade. speedMultiplier estica essa duração (e o teto de
// 550ms) sem mexer na distância percorrida.
function spawnProjectile(fromX, fromY, toX, toY, kind, speedMultiplier = 1, visualProfile = DEFAULT_COMBAT_VFX_PROFILE, abilityProfile = DEFAULT_ABILITY_VFX_PROFILE) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.hypot(dx, dy);
  const durationMs = abilityProfile.projectileDuration || Math.min(120 + dist * 45, 550) * speedMultiplier;
  if (abilityProfile.travelSfx) playSfx(abilityProfile.travelSfx, boardPanFor(fromX));

  // Ângulo/posição calculados no espaço de TELA já projetado (não no
  // espaço de tile) — com câmera 3D rotacionada (Fase 6), uma linha reta
  // no tabuleiro não vira necessariamente uma linha reta no mesmo ângulo
  // na tela, então recalcular a partir de onde os dois pontos realmente
  // caem na tela é o que faz o projétil apontar pro alvo de verdade.
  const directionLength = dist || 1;
  const launchX = fromX + (dx / directionLength) * visualProfile.originAdvance;
  const launchY = fromY + (dy / directionLength) * visualProfile.originAdvance;
  const from = tileScreenPercent(launchX + 0.5, launchY + 0.5, visualProfile.projectileOriginHeight);
  const to = tileScreenPercent(toX + 0.5, toY + 0.5, 0.9);
  const angleDeg = Math.atan2(to.topPct - from.topPct, to.leftPct - from.leftPct) * (180 / Math.PI);

  const el = document.createElement("div");
  el.className = `projectile projectile-${kind}${visualProfile.accent ? ` projectile-${visualProfile.accent}` : ""} projectile-trajectory-${abilityProfile.trajectory} ability-vfx-${abilityProfile.id}`;
  el.style.setProperty("--visual-scale", visualProfile.visualScale);
  el.style.left = `${from.leftPct}%`;
  el.style.top = `${from.topPct}%`;
  el.style.setProperty("--angle", `${angleDeg}deg`);
  if (kind === "fireball") {
    // Núcleo quente como filha própria (ver .fireball-core em style.css):
    // precisa ficar fora do clip-path pra não recortar as brasas do rastro.
    const core = document.createElement("span");
    core.className = "fireball-core";
    el.appendChild(core);

    // Brasas se soltando durante o voo: nascem perto da cauda da bola e
    // se desprendem pra trás em loop curto, então a chama continua
    // largando fagulhas o trajeto inteiro, não só no instante do impacto.
    for (let i = 0; i < 4; i++) {
      const ember = document.createElement("span");
      ember.className = "fireball-trail-ember";
      ember.style.setProperty("--ember-dx", `${-18 - Math.random() * 20}px`);
      ember.style.setProperty("--ember-dy", `${(Math.random() - 0.5) * 26}px`);
      ember.style.setProperty("--ember-delay", `${i * 110 + Math.random() * 60}ms`);
      el.appendChild(ember);
    }
  }
  if (kind === "missile") {
    // Míssil Mágico (Maga): núcleo estruturado + 2-3 fragmentos geométricos
    // orbitando — não uma bolinha roxa/orb com trail (ver REGRA PRINCIPAL do
    // redesign, item 27). Filhos próprios (não pseudo-elementos) porque cada
    // fragmento precisa da própria órbita independente.
    const core = document.createElement("span");
    core.className = "missile-core";
    el.appendChild(core);
    for (let i = 0; i < 3; i++) {
      const frag = document.createElement("span");
      frag.className = "missile-fragment";
      frag.style.setProperty("--frag-angle", `${i * 120}deg`);
      frag.style.setProperty("--frag-delay", `${i * 70}ms`);
      el.appendChild(frag);
    }
  }
  boardOverlayEl.appendChild(el);
  // Força o navegador a "commitar" a posição inicial antes de mudar pra
  // final — sem isso, as duas mudanças de left/top podem cair no mesmo
  // frame e a transição nunca dispara (o projétil fica parado no conjurador
  // em vez de viajar até o alvo). Mesma técnica de playAttackAnimation.
  void el.offsetWidth;
  el.style.transitionDuration = `${durationMs}ms`;
  el.style.left = `${to.leftPct}%`;
  el.style.top = `${to.topPct}%`;
  setTimeout(() => el.remove(), durationMs + 80);
  return durationMs;
}

// Feixe instantâneo (Relâmpago, Raio de Gelo): uma linha que já nasce
// esticada de ponta a ponta e só pisca/desaparece — não "viaja" como um
// projétil físico.
function spawnBeam(fromX, fromY, toX, toY, kind) {
  const from = tileScreenPercent(fromX + 0.5, fromY + 0.5, 0.9);
  const to = tileScreenPercent(toX + 0.5, toY + 0.5, 0.9);
  const angleDeg = Math.atan2(to.topPct - from.topPct, to.leftPct - from.leftPct) * (180 / Math.PI);
  const lengthPct = Math.hypot(to.leftPct - from.leftPct, to.topPct - from.topPct);

  const el = document.createElement("div");
  el.className = `beam-effect beam-${kind}`;
  el.style.left = `${from.leftPct}%`;
  el.style.top = `${from.topPct}%`;
  el.style.width = `${lengthPct}%`;
  el.style.setProperty("--angle", `${angleDeg}deg`);
  boardOverlayEl.appendChild(el);
  setTimeout(() => el.remove(), 350);
}

// Raio de Gelo (Mago): feixe gelado em camadas — núcleo branco/ciano, corpo
// azul irregular, névoa fria nas bordas e cristais viajando na direção do
// alvo — NÃO um raio ciano reto com glow (ver REGRA PRINCIPAL do redesign,
// item 26). Mesmo cálculo de ângulo/comprimento do spawnBeam, então o
// comprimento sempre se adapta à distância sem esticar os cristais
// individuais (eles são filhos de tamanho fixo, só reposicionados por %).
function spawnIceBeam(fromX, fromY, toX, toY) {
  const from = tileScreenPercent(fromX + 0.5, fromY + 0.5, 0.9);
  const to = tileScreenPercent(toX + 0.5, toY + 0.5, 0.9);
  const angleDeg = Math.atan2(to.topPct - from.topPct, to.leftPct - from.leftPct) * (180 / Math.PI);
  const lengthPct = Math.hypot(to.leftPct - from.leftPct, to.topPct - from.topPct);

  const el = document.createElement("div");
  el.className = "ice-beam";
  el.style.left = `${from.leftPct}%`;
  el.style.top = `${from.topPct}%`;
  el.style.width = `${lengthPct}%`;
  el.style.setProperty("--angle", `${angleDeg}deg`);

  const frost = document.createElement("div");
  frost.className = "ice-beam-frost";
  const body = document.createElement("div");
  body.className = "ice-beam-body";
  const core = document.createElement("div");
  core.className = "ice-beam-core";
  el.appendChild(frost);
  el.appendChild(body);
  el.appendChild(core);

  for (let i = 0; i < 4; i++) {
    const crystal = document.createElement("span");
    crystal.className = "ice-beam-crystal";
    crystal.style.setProperty("--crystal-pos", `${12 + i * 24}%`);
    crystal.style.setProperty("--crystal-delay", `${i * 30}ms`);
    el.appendChild(crystal);
  }

  boardOverlayEl.appendChild(el);
  setTimeout(() => el.remove(), 400);
}

// Relâmpago (Maga): eletricidade se acumulando na conjuradora antes da
// liberação — arcos aparecem/quebram/reaparecem, não uma esfera elétrica
// genérica crescendo (item da spec: "CAST DA MAGA").
function spawnLightningCastCue(caster) {
  const pos = tileScreenPercent(caster.x + 0.5, caster.y + 0.5, 1.05);
  const el = document.createElement("div");
  el.className = "lightning-cast";
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  boardOverlayEl.appendChild(el);
  setTimeout(() => el.remove(), 300);
}

// Relâmpago: descarga elétrica quebrada/angular/ramificada — NÃO uma linha
// reta com glow (REGRA PRINCIPAL do redesign). Usa SVG de verdade (não
// clip-path) porque um zig-zag com ramificações reais precisa de um
// polyline; CSS puro só fingiria mal. Mesmo raciocínio de ângulo/comprimento
// de spawnBeam/spawnIceBeam, então o comprimento sempre se adapta à
// distância.
function spawnLightningBolt(fromX, fromY, toX, toY) {
  const from = tileScreenPercent(fromX + 0.5, fromY + 0.5, 0.9);
  const to = tileScreenPercent(toX + 0.5, toY + 0.5, 0.9);
  const dxPct = to.leftPct - from.leftPct;
  const dyPct = to.topPct - from.topPct;
  const lengthPct = Math.hypot(dxPct, dyPct) || 0.001;
  const angleDeg = Math.atan2(dyPct, dxPct) * (180 / Math.PI);

  const svgNS = "http://www.w3.org/2000/svg";
  const VB_LEN = 200;
  const VB_H = 40;
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "lightning-bolt");
  svg.setAttribute("viewBox", `0 0 ${VB_LEN} ${VB_H}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.style.left = `${from.leftPct}%`;
  svg.style.top = `${from.topPct}%`;
  svg.style.width = `${lengthPct}%`;
  svg.style.setProperty("--angle", `${angleDeg}deg`);

  // Caminho principal em zig-zag: pontas fixas em (0, meio) e (fim, meio),
  // pontos do meio com deslocamento vertical aleatório — "ângulos, mudanças
  // abruptas, pequenos desvios" em vez de MAGA=====ALVO.
  const segments = 7;
  const points = [{ x: 0, y: VB_H / 2 }];
  for (let i = 1; i < segments; i++) {
    points.push({ x: (VB_LEN / segments) * i, y: VB_H / 2 + (Math.random() - 0.5) * VB_H * 0.7 });
  }
  points.push({ x: VB_LEN, y: VB_H / 2 });
  const pointsStr = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  const glow = document.createElementNS(svgNS, "polyline");
  glow.setAttribute("points", pointsStr);
  glow.setAttribute("class", "lightning-glow");
  svg.appendChild(glow);

  const main = document.createElementNS(svgNS, "polyline");
  main.setAttribute("points", pointsStr);
  main.setAttribute("class", "lightning-main");
  svg.appendChild(main);

  const core = document.createElementNS(svgNS, "polyline");
  core.setAttribute("points", pointsStr);
  core.setAttribute("class", "lightning-core");
  svg.appendChild(core);

  // Poucas ramificações curtas saindo de pontos intermediários — "não uma
  // árvore inteira de eletricidade".
  for (let i = 0; i < 2; i++) {
    const origin = points[2 + Math.floor(Math.random() * (points.length - 4))];
    const branchLen = 18 + Math.random() * 18;
    const branchAngle = (Math.random() - 0.5) * Math.PI * 0.8;
    const endX = origin.x + Math.cos(branchAngle) * branchLen;
    const endY = origin.y + Math.sin(branchAngle) * branchLen;
    const midX = origin.x + (endX - origin.x) * 0.5 + (Math.random() - 0.5) * 8;
    const midY = origin.y + (endY - origin.y) * 0.5 + (Math.random() - 0.5) * 8;
    const branch = document.createElementNS(svgNS, "polyline");
    branch.setAttribute(
      "points",
      `${origin.x.toFixed(1)},${origin.y.toFixed(1)} ${midX.toFixed(1)},${midY.toFixed(1)} ${endX.toFixed(1)},${endY.toFixed(1)}`
    );
    branch.setAttribute("class", "lightning-branch");
    branch.style.animationDelay = `${i * 25}ms`;
    svg.appendChild(branch);
  }

  boardOverlayEl.appendChild(svg);
  setTimeout(() => svg.remove(), 260);
}

// Relâmpago: impacto — flash localizado, eletricidade se espalhando
// rapidamente pela silhueta (não explosão de fogo) e sparks saltando. Esta
// magia não aplica Paralyzed (só rouba CT — ver SPELLS.lightning), então o
// impacto termina limpo em vez de virar aura persistente (item 17 da spec).
function spawnLightningImpact(x, y) {
  const pos = tileScreenPercent(x + 0.5, y + 0.5, 0.5);
  const el = document.createElement("div");
  el.className = "lightning-impact";
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  boardOverlayEl.appendChild(el);
  spawnHitParticles(x, y, "#a8dfff", 6);
  setTimeout(() => el.remove(), 320);
}

// Raio de Gelo: impacto — cristais surgem no lado atingido, shards se
// desprendem, frost se espalha. A habilidade não aplica Frozen (só reduz
// agilidade — ver appliesSpeedReduction), então o gelo quebra/dissipa em vez
// de virar um status persistente.
function spawnIceImpactCrystals(x, y) {
  const pos = tileScreenPercent(x + 0.5, y + 0.5, 0.4);
  const el = document.createElement("div");
  el.className = "ice-impact-crystals";
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  boardOverlayEl.appendChild(el);
  spawnHitParticles(x, y, "#d8f3ff", 6);
  setTimeout(() => el.remove(), 480);
}

// Míssil Mágico: núcleo comprime, flash arcano, fragmentos se quebram —
// dissipação de mana em vez de uma explosão genérica (item 27).
function spawnMissileImpact(x, y) {
  const pos = tileScreenPercent(x + 0.5, y + 0.5, 0.4);
  const el = document.createElement("div");
  el.className = "missile-impact";
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  boardOverlayEl.appendChild(el);
  spawnHitParticles(x, y, "#c9a3ff", 5);
  setTimeout(() => el.remove(), 420);
}

// Explosão em área (Bola de Fogo, Congelamento): um círculo que nasce
// pequeno no centro do impacto e se expande até cobrir o raio de efeito.
function spawnAreaBurst(centerX, centerY, radiusTiles, kind, visualScale = 1) {
  const sizePct = (((radiusTiles * 2) + 1) / BOARD_SIZE) * 100 * visualScale;
  const el = document.createElement("div");
  el.className = `area-burst area-burst-${kind}`;
  const pos = tileScreenPercent(centerX + 0.5, centerY + 0.5, 0.1);
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  el.style.width = `${sizePct}%`;
  el.style.height = `${sizePct}%`;
  if (kind === "fire") {
    // Contato -> compressão: flash curto e nítido antes da chama se abrir.
    const flash = document.createElement("span");
    flash.className = "fire-impact-flash";
    el.appendChild(flash);

    // Brasas com trajetórias irregulares dão leitura de combustão ao impacto.
    // São filhas do VFX e não participam de colisão, dano ou temporização.
    for (let i = 0; i < 16; i++) {
      const ember = document.createElement("span");
      ember.className = "fire-impact-ember";
      const angle = (Math.PI * 2 * i) / 16 + Math.random() * 0.42;
      const distance = 34 + Math.random() * 58;
      ember.style.setProperty("--ember-x", `${Math.cos(angle) * distance}%`);
      ember.style.setProperty("--ember-y", `${Math.sin(angle) * distance - 18}%`);
      ember.style.setProperty("--ember-delay", `${Math.random() * 70}ms`);
      ember.style.setProperty("--ember-scale", `${0.55 + Math.random() * 0.8}`);
      el.appendChild(ember);
    }

  }
  boardOverlayEl.appendChild(el);
  setTimeout(() => el.remove(), 500);
  if (kind === "fire") {
    // Dissipação: fumaça leve subindo depois que a chama já expandiu,
    // fechando o ciclo em vez da explosão simplesmente sumir. Elemento
    // irmão do burst (não filho): o burst se apaga (opacity->0) bem antes
    // da fumaça terminar de subir, e opacity de pai multiplica na dos
    // filhos — dentro dele, a fumaça desapareceria junto, cedo demais.
    for (let i = 0; i < 2; i++) {
      const smoke = document.createElement("span");
      smoke.className = "fire-impact-smoke";
      smoke.style.left = `${pos.leftPct}%`;
      smoke.style.top = `${pos.topPct}%`;
      smoke.style.width = `${sizePct * 0.3}%`;
      smoke.style.height = `${sizePct * 0.3}%`;
      smoke.style.setProperty("--smoke-x", `${(i === 0 ? -1 : 1) * (10 + Math.random() * 14)}%`);
      smoke.style.setProperty("--smoke-delay", `${240 + Math.random() * 80}ms`);
      boardOverlayEl.appendChild(smoke);
      setTimeout(() => smoke.remove(), 820);
    }
  }
  spawnAmbientGlow(centerX, centerY, radiusTiles, kind);
}

// Clarão macio por trás do burst nítido de cima — dá a sensação da explosão
// iluminando o chão ao redor, não só um efeito colado no alvo. Puramente
// cosmético e silencioso quanto a `kind`: se não existir uma classe
// .area-glow-<kind> (ver style.css), cai no CSS genérico .area-glow (sem cor
// própria, mas ainda anima) — nunca quebra por causa de um kind novo.
function spawnAmbientGlow(centerX, centerY, radiusTiles, kind) {
  const sizePct = (((radiusTiles * 2) + 3) / BOARD_SIZE) * 100;
  const el = document.createElement("div");
  el.className = `area-glow area-glow-${kind}`;
  const pos = tileScreenPercent(centerX + 0.5, centerY + 0.5, 0.05);
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  el.style.width = `${sizePct}%`;
  el.style.height = `${sizePct}%`;
  boardOverlayEl.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

// Varredura em cone (Envenenamento, Ventania): reaproveita o flash de
// impacto já existente em cada tile do cone, com um atraso crescente
// conforme a distância do conjurador — dá a sensação de onda se espalhando
// em vez de tudo piscar ao mesmo tempo.
function spawnConeSweep(caster, tiles, sfxKey) {
  for (const t of tiles) {
    const delay = manhattan(caster, t) * 35;
    setTimeout(() => spawnImpactEffect(t.x, t.y, sfxKey), delay);
  }
}

// Ventania: correntes de ar girando na conjuradora (cast) — bem breve, só
// pra ler "o ar está se concentrando" antes da rajada sair.
function spawnWindGustCast(caster) {
  const pos = tileScreenPercent(caster.x + 0.5, caster.y + 0.5, 1.05);
  const el = document.createElement("div");
  el.className = "wind-cast-swirl";
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  boardOverlayEl.appendChild(el);
  setTimeout(() => el.remove(), 300);
}

// Ventania: a rajada de vento varrendo o cone de verdade — correntes de ar
// curvas (não uma linha reta) + poeira/folhas levadas pelo vento, com o
// mesmo atraso crescente por distância do spawnConeSweep, orientadas na
// direção real do cone (dir). Cobre TODOS os tiles do cone (não só quem foi
// atingido), pra dar leitura de vento passando pelo terreno inteiro.
function spawnWindGustSweep(caster, tiles, dir) {
  const angleDeg = Math.atan2(dir.dy, dir.dx) * (180 / Math.PI);
  for (const t of tiles) {
    const delay = manhattan(caster, t) * 35;
    setTimeout(() => {
      const pos = tileScreenPercent(t.x + 0.5, t.y + 0.5, 0.5);
      const el = document.createElement("div");
      el.className = "wind-gust";
      el.style.left = `${pos.leftPct}%`;
      el.style.top = `${pos.topPct}%`;
      el.style.setProperty("--gust-angle", `${angleDeg}deg`);
      boardOverlayEl.appendChild(el);
      for (let i = 0; i < 3; i++) {
        const mote = document.createElement("span");
        mote.className = "wind-gust-mote";
        mote.style.setProperty("--mote-angle", `${angleDeg}deg`);
        mote.style.setProperty("--mote-offset", `${(i - 1) * 30}%`);
        mote.style.setProperty("--mote-delay", `${i * 40}ms`);
        el.appendChild(mote);
      }
      setTimeout(() => el.remove(), 420);
    }, delay);
  }
}

// Destruição Rastejante (Xamã): energia entra no chão do conjurador — pulso
// escuro no próprio tile, antes das rachaduras saírem em direção ao alvo.
function spawnGroundCrackCast(caster) {
  const pos = tileScreenPercent(caster.x + 0.5, caster.y + 0.5, 0.15);
  const el = document.createElement("div");
  el.className = "ground-crack-cast";
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  boardOverlayEl.appendChild(el);
  setTimeout(() => el.remove(), 320);
}

// Destruição Rastejante: a rachadura viajando pelo SOLO — segmentos
// orientados na direção real da faixa (dir) + debris de terra, com o mesmo
// atraso crescente por distância do spawnConeSweep. Cobre TODOS os tiles da
// faixa (não só quem foi atingido), pra dar leitura de destruição avançando
// pelo terreno inteiro, não só um flash no alvo.
function spawnGroundCrackSweep(caster, tiles, dir) {
  const angleRad = Math.atan2(dir.dy, dir.dx);
  const angleDeg = angleRad * (180 / Math.PI);
  for (const t of tiles) {
    const delay = manhattan(caster, t) * 35;
    setTimeout(() => {
      const pos = tileScreenPercent(t.x + 0.5, t.y + 0.5, 0.1);
      const el = document.createElement("div");
      el.className = "ground-crack-segment";
      el.style.left = `${pos.leftPct}%`;
      el.style.top = `${pos.topPct}%`;
      el.style.setProperty("--crack-angle", `${angleDeg}deg`);
      boardOverlayEl.appendChild(el);
      for (let i = 0; i < 2; i++) {
        const spread = angleRad + (i === 0 ? -0.6 : 0.6);
        const dist = 12 + Math.random() * 6;
        const debris = document.createElement("span");
        debris.className = "ground-crack-debris";
        debris.style.setProperty("--dx", `${Math.cos(spread) * dist}px`);
        debris.style.setProperty("--dy", `${Math.sin(spread) * dist - 6}px`);
        debris.style.setProperty("--debris-delay", `${i * 30}ms`);
        el.appendChild(debris);
      }
      setTimeout(() => el.remove(), 380);
    }, delay);
  }
}

// Destruição Rastejante: erupção no ponto de chegada — o solo reage com
// debris e ruptura visível, sincronizada com o mesmo cosmeticDelay do golpe
// (ver castCreepingDestruction). Reaproveita spawnHitParticles pros
// fragmentos de terra em vez de um segundo sistema de partículas.
function spawnGroundEruption(x, y) {
  const pos = tileScreenPercent(x + 0.5, y + 0.5, 0.1);
  const el = document.createElement("div");
  el.className = "ground-eruption";
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  boardOverlayEl.appendChild(el);
  spawnHitParticles(x, y, "#8a6a45", 7);
  setTimeout(() => el.remove(), 480);
}

// Destruição Rastejante: nuvem de poeira cobrindo a FAIXA INTEIRA conforme a
// rachadura avança (não só os tiles com alvo) — mesmo espírito do
// spawnToxicCloudSweep do Envenenamento, atraso crescente por distância.
function spawnGroundDustSweep(caster, tiles) {
  for (const t of tiles) {
    const delay = manhattan(caster, t) * 35;
    setTimeout(() => {
      const pos = tileScreenPercent(t.x + 0.5, t.y + 0.5, 0.2);
      const el = document.createElement("div");
      el.className = "ground-dust-puff";
      el.style.left = `${pos.leftPct}%`;
      el.style.top = `${pos.topPct}%`;
      el.style.setProperty("--puff-delay", `${Math.random() * 60}ms`);
      boardOverlayEl.appendChild(el);
      setTimeout(() => el.remove(), 540);
    }, delay);
  }
}

// Envenenamento (Xamã): toxina instável se formando no conjurador — líquido
// viscoso borbulhando e vapor subindo, antes do cone se espalhar (mesmo
// atraso crescente por distância de spawnConeSweep, ver castPoisonCone).
function spawnToxinCastCue(caster) {
  const pos = tileScreenPercent(caster.x + 0.5, caster.y + 0.5, 0.15);
  const el = document.createElement("div");
  el.className = "toxin-cast";
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  boardOverlayEl.appendChild(el);
  setTimeout(() => el.remove(), 380);
}

// Envenenamento: contato viscoso no alvo — respingo tóxico irregular +
// vapor, na paleta ácida do status Poisoned (ver .poison-layer/.poison-
// bubbles em style.css), pra conectar visualmente com a aura persistente que
// o addStatusEffect já aplicou, em vez de uma bola verde/roxa genérica.
function spawnToxicSplash(x, y) {
  const pos = tileScreenPercent(x + 0.5, y + 0.5, 0.3);
  const el = document.createElement("div");
  el.className = "toxic-splash";
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  boardOverlayEl.appendChild(el);
  spawnHitParticles(x, y, "#b7ef6c", 5);
  setTimeout(() => el.remove(), 460);
}

// Envenenamento: nuvem de fumaça tóxica cobrindo TODOS os tiles do cone (não
// só quem foi atingido) conforme ela se espalha — mesmo atraso crescente por
// distância do spawnConeSweep/spawnWindGustSweep, pra dar leitura de gás
// avançando pelo cone inteiro em vez de só aparecer em cima dos alvos.
function spawnToxicCloudSweep(caster, tiles) {
  for (const t of tiles) {
    const delay = manhattan(caster, t) * 35;
    setTimeout(() => {
      const pos = tileScreenPercent(t.x + 0.5, t.y + 0.5, 0.3);
      const el = document.createElement("div");
      el.className = "toxic-cloud-puff";
      el.style.left = `${pos.leftPct}%`;
      el.style.top = `${pos.topPct}%`;
      el.style.setProperty("--puff-delay", `${Math.random() * 60}ms`);
      boardOverlayEl.appendChild(el);
      setTimeout(() => el.remove(), 560);
    }, delay);
  }
}

// Tiro Explosivo (Químico): detonação concentrada no ponto de impacto — não
// reaproveita a explosão da Bomba (maior/mais lenta) nem a da Bola de Fogo;
// núcleo quente pequeno + poucos fragmentos, disparada só depois do contato
// normal (ver revealHitFx em resolveSingleHit), nunca antes.
function spawnExplosiveShotDetonation(x, y) {
  const pos = tileScreenPercent(x + 0.5, y + 0.5, 0.4);
  const el = document.createElement("div");
  el.className = "explosive-shot-burst";
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  boardOverlayEl.appendChild(el);
  spawnHitParticles(x, y, "#ff8a2d", 6);
  setTimeout(() => el.remove(), 380);
}

// Antídoto (Químico): química medicinal — ciano/verde claro/branco, bolhas
// controladas, reação organizada. Contrasta de propósito com a toxina ácida/
// viscosa do Xamã (spawnToxinCastCue/spawnToxicSplash acima).
function spawnAntidoteCastCue(caster) {
  const pos = tileScreenPercent(caster.x + 0.5, caster.y + 0.5, 0.15);
  const el = document.createElement("div");
  el.className = "antidote-cast";
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  boardOverlayEl.appendChild(el);
  setTimeout(() => el.remove(), 360);
}

// Antídoto: a solução limpa sendo transferida/aplicada no alvo — gota +
// bolhas pequenas, antes da reação com a toxina (ver spawnAntidoteReaction).
function spawnAntidoteTransfer(x, y) {
  const pos = tileScreenPercent(x + 0.5, y + 0.5, 0.35);
  const el = document.createElement("div");
  el.className = "antidote-transfer";
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  boardOverlayEl.appendChild(el);
  setTimeout(() => el.remove(), 420);
}

// Antídoto: neutralização — brilho ciano/branco no alvo; mais intenso
// quando havia veneno de verdade (a reação com a toxina), mais discreto
// quando só havia paralisia (sem toxina pra neutralizar).
function spawnAntidoteReaction(x, y, wasPoisoned) {
  const pos = tileScreenPercent(x + 0.5, y + 0.5, 0.4);
  const el = document.createElement("div");
  el.className = `antidote-reaction${wasPoisoned ? " antidote-reaction-toxin" : ""}`;
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  boardOverlayEl.appendChild(el);
  if (wasPoisoned) spawnHitParticles(x, y, "#d8f7ff", 5);
  setTimeout(() => el.remove(), 440);
}

// Flecha (Arqueiro): contato seco físico — spark/fragmentos de madeira, sem
// glow/magia, distinto do flash azulado genérico de playAttackFx (ver
// item 24). Curto de propósito: não pode virar explosão.
function spawnArrowImpactSpark(x, y) {
  const pos = tileScreenPercent(x + 0.5, y + 0.5, 0.35);
  const el = document.createElement("div");
  el.className = "arrow-impact-spark";
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  boardOverlayEl.appendChild(el);
  spawnHitParticles(x, y, "#d8c48a", 4);
  setTimeout(() => el.remove(), 260);
}

// Decide (a partir do próprio item) se um ataque de alvo único merece um
// projétil/feixe visual, dispara o efeito quando merece, e devolve por
// quantos ms o flash de impacto/número de dano devem esperar pra aparecer
// "junto" com a chegada do efeito. Ataques corpo a corpo (maxRange 1) ou sem
// campo `projectile` continuam 100% instantâneos, como sempre foram.
function spawnAttackProjectile(attacker, defender, item, options = {}) {
  if (!item.projectile || !item.maxRange || item.maxRange <= 1) return 0;
  // Flecha de Fogo (Arqueiro): mesma flecha física de sempre, só que com a
  // ponta em chamas — ver .projectile-fire-arrow em style.css. O chamador
  // precisa passar options.fireArrow explicitamente porque o flag real
  // (attacker.burnNextAttackAlwaysTurns) já foi zerado antes desta função
  // rodar (ver resolveSingleHit).
  // Tiro Explosivo (Químico): mesma munição física de sempre, só que com
  // núcleo/rastro incandescente — ver .projectile-bullet-explosive em
  // style.css. Mesmo raciocínio do fireArrow acima: o chamador precisa
  // passar options.explosiveShot porque o flag real (burnNextAttackTurns) já
  // foi zerado antes desta função rodar (ver resolveSingleHit).
  const visualKind =
    options.fireArrow && item.projectile === "arrow"
      ? "fire-arrow"
      : options.explosiveShot && item.projectile === "bullet"
        ? "bullet-explosive"
        : item.projectile;
  // Mesmo critério de "é magia?" usado no resolveSingleHit (hit-stop/shake):
  // tem mpCost = magia, sem mpCost = arma (mesmo que pareça mágico, como o
  // Raio de Gelo do Mago, que é o ataque básico dele sem custo de MP).
  const isMagic = item.mpCost !== undefined;
  const speedMultiplier = isMagic ? MAGIC_TRAVEL_MULTIPLIER : 1;
  const baseProfile = combatVfxProfile(attacker);
  const visualProfile = {
    ...baseProfile,
    visualScale: baseProfile.visualScale * baseProfile.spriteVfxScale * actionVisualIntensity(item),
  };
  const abilityProfile = abilityVfxProfile(item);
  spawnCastCue(attacker, abilityProfile);
  if (abilityProfile.castSfx) playSfx(abilityProfile.castSfx, boardPanFor(attacker.x));
  if (item.projectile === "beam") {
    setTimeout(() => {
      if (abilityProfile.travelSfx) playSfx(abilityProfile.travelSfx, boardPanFor(attacker.x));
      // Raio de Gelo: feixe em camadas (núcleo/corpo/frost/cristais), não o
      // raio reto genérico — ver spawnIceBeam. Relâmpago/outros continuam no
      // spawnBeam de sempre (redesign próprio ainda pendente).
      if (item.beamTint === "ice") {
        spawnIceBeam(attacker.x, attacker.y, defender.x, defender.y);
      } else {
        spawnBeam(attacker.x, attacker.y, defender.x, defender.y, item.beamTint || "arcane");
      }
    }, abilityProfile.castDelay);
    return abilityProfile.castDelay + (abilityProfile.projectileDuration || 150 * speedMultiplier);
  }
  const travelMs = abilityProfile.projectileDuration || Math.min(120 + Math.hypot(defender.x - attacker.x, defender.y - attacker.y) * 45, 550) * speedMultiplier;
  setTimeout(() => spawnProjectile(attacker.x, attacker.y, defender.x, defender.y, visualKind, speedMultiplier, visualProfile, abilityProfile), abilityProfile.castDelay);
  return abilityProfile.castDelay + travelMs;
}

// --- Som (sintetizado via Web Audio API, sem arquivos externos) ---
// Barramento: toda fonte (tom ou ruído) passa por um painner estéreo (posição
// no tabuleiro, esquerda=time do Guerreiro / direita=time do Goblin) e se
// divide em duas vias — seco (direto pro compressor) e "molhado" (por um
// reverb curto, dá sensação de arena em vez de som "colado no ouvido").
// O compressor no final evita estourar quando várias fontes tocam juntas
// (ex: uma magia em área acertando 5 unidades de uma vez).
let audioCtx = null;
let masterGain = null;
let reverbSend = null;
// Barramentos separados do masterGain (pedido do usuário: Master/Music/SFX
// independentes) — efeitos de combate continuam em sfxGain (com reverb),
// a trilha ambiente entra à parte em musicGain, então dá pra abaixar/
// silenciar só a música sem mexer nos efeitos. Ver getAudioCtx.
let sfxGain = null;
let musicGain = null;

function buildImpulseResponse(ctx, duration, decay) {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * duration));
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

function getAudioCtx() {
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    audioCtx = new AudioCtx();

    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 24;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;
    compressor.connect(audioCtx.destination);

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.9;
    masterGain.connect(compressor);

    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = 1.0;
    sfxGain.connect(masterGain);

    musicGain = audioCtx.createGain();
    musicGain.gain.value = 0; // começa mudo; startBackgroundMusic() dá o fade-in
    musicGain.connect(masterGain);

    const reverb = audioCtx.createConvolver();
    reverb.buffer = buildImpulseResponse(audioCtx, 1.3, 2.4);
    reverbSend = audioCtx.createGain();
    reverbSend.gain.value = 0.24;
    reverbSend.connect(reverb);
    reverb.connect(sfxGain);
  }
  if (audioCtx.state === "suspended") {
    // Política de autoplay do navegador: resume() só resolve de verdade
    // depois de uma interação real do usuário (clique/tecla) — é esse
    // resolve que dispara o fade-in da trilha, nunca antes disso (ver
    // startBackgroundMusic). Não há tentativa de contornar a política.
    audioCtx.resume().then(() => {
      if (!musicStarted) startBackgroundMusic();
    });
  } else if (audioCtx.state === "running" && !musicStarted) {
    startBackgroundMusic();
  }
  return audioCtx;
}

// Painner comum a toda fonte sonora: junta o nó num só lugar (seco + envio
// pro reverb) pra playTone/playNoise não duplicarem essa fiação. Efeitos vão
// pro barramento sfxGain (não direto no masterGain) — ver comentário de
// sfxGain/musicGain acima.
function connectToBus(node, pan) {
  const ctx = audioCtx;
  if (ctx.createStereoPanner && pan) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(panner);
    panner.connect(sfxGain);
    panner.connect(reverbSend);
  } else {
    node.connect(sfxGain);
    node.connect(reverbSend);
  }
}

// --- Trilha ambiente de fundo -----------------------------------------
// Sintetizada ao vivo com o MESMO motor de osciladores/ruído dos efeitos
// acima (sem nenhum arquivo de áudio — o jogo não usa nenhum) — um pad
// lento em Lá menor (progressão i-VI-III-VII: Am-F-C-G), melodia esparsa e
// percussão bem leve, pensados pra ficar claramente em segundo plano atrás
// dos efeitos de combate. Toca 1x por sessão (musicStarted trava reinício),
// entra em fade suave só depois da primeira interação real do usuário (ver
// getAudioCtx) e depois disso continua rodando continuamente — reiniciar a
// partida (resetGame) ou fechar modais NÃO reinicia/corta a faixa, já que
// esta é uma SPA sem troca de tela de verdade; só existe fade-out mesmo se
// o jogador silenciar pelo botão (setMusicMuted).
// Revisão pedida pelo usuário depois de ouvir a v1 (pad lento/atmosférico
// demais): manter o mesmo teto de volume (15%-25%) e a mesma arquitetura de
// scheduler, mas trocar o CONTEÚDO musical por algo que realmente soe
// "música de batalha" — acorde mais curto (mais urgência), baixo pulsante
// constante (não só um swell a cada 2 voltas), tambor de guerra num pulso
// estável, e um "stab" curto de metal na virada de cada acorde.
const MUSIC_TARGET_VOLUME = 0.2; // ~20% do volume máximo (pedido: 15%-25%)
const MUSIC_CHORDS = [
  { notes: [220.0, 261.63, 329.63], root: 110.0 }, // Am
  { notes: [174.61, 220.0, 261.63], root: 87.31 }, // F
  { notes: [261.63, 329.63, 392.0], root: 130.81 }, // C
  { notes: [196.0, 246.94, 293.66], root: 98.0 }, // G
];
const MUSIC_CHORD_DURATION = 3.2; // segundos por acorde — bem mais rápido/urgente que a v1 (era 6.0)
const MUSIC_MELODY_POOL = [440.0, 523.25, 587.33, 659.25, 392.0, 349.23];
const MUSIC_BASS_PULSES_PER_CHORD = 4; // baixo em quarter-note, não só um swell ocasional
const MUSIC_DRUM_INTERVAL = MUSIC_CHORD_DURATION / 4; // tambor de guerra no mesmo pulso do baixo
const MUSIC_SCHEDULE_LOOKAHEAD = 1.0; // segundos adiantados a cada tick do scheduler
const MUSIC_SCHEDULE_INTERVAL_MS = 250;

let musicStarted = false;
let musicMuted = false;
let musicChordIndex = 0;
let musicNextChordTime = 0;
let musicNextMelodyTime = 0;
let musicNextDrumTime = 0;

// Pad do acorde atual (3 senoides sustentadas) — agora dura só
// MUSIC_CHORD_DURATION (3.2s, era 6s), então a progressão anda bem mais
// rápido/urgente. Um "stab" curto de metal (dente de serra + passa-faixa,
// ataque quase instantâneo) pontua a virada de cada acorde — a fanfarra
// dramática que faltava na v1 atmosférica.
function scheduleMusicPad(startTime, chord) {
  for (const freq of chord.notes) {
    const osc = audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = audioCtx.createGain();
    const peak = 0.05;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(peak, startTime + 0.5);
    gain.gain.setValueAtTime(peak, startTime + MUSIC_CHORD_DURATION - 0.6);
    gain.gain.linearRampToValueAtTime(0, startTime + MUSIC_CHORD_DURATION);
    osc.connect(gain);
    gain.connect(musicGain);
    osc.start(startTime);
    osc.stop(startTime + MUSIC_CHORD_DURATION + 0.05);
  }

  const stabOsc = audioCtx.createOscillator();
  stabOsc.type = "sawtooth";
  stabOsc.frequency.value = chord.notes[0];
  const stabFilter = audioCtx.createBiquadFilter();
  stabFilter.type = "bandpass";
  stabFilter.frequency.value = chord.notes[0] * 2;
  stabFilter.Q.value = 4;
  const stabGain = audioCtx.createGain();
  const stabPeak = 0.05;
  stabGain.gain.setValueAtTime(0, startTime);
  stabGain.gain.linearRampToValueAtTime(stabPeak, startTime + 0.03);
  stabGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);
  stabOsc.connect(stabFilter);
  stabFilter.connect(stabGain);
  stabGain.connect(musicGain);
  stabOsc.start(startTime);
  stabOsc.stop(startTime + 0.55);
}

// Baixo pulsante: 4 pulsos por acorde (quarter-note), dente de serra filtrado
// em passa-baixa, envelope curto/percussivo — a "caminhada" constante que
// uma trilha de batalha precisa, em vez do swell ocasional da v1.
function scheduleMusicBassPulse(startTime, chord) {
  const osc = audioCtx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = chord.root;
  const filter = audioCtx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 380;
  const gain = audioCtx.createGain();
  const peak = 0.055;
  const dur = (MUSIC_CHORD_DURATION / MUSIC_BASS_PULSES_PER_CHORD) * 0.85;
  gain.gain.setValueAtTime(peak, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(musicGain);
  osc.start(startTime);
  osc.stop(startTime + dur + 0.05);
}

// Tambor de guerra: estouro de ruído grave + "boom" senoidal curto por baixo
// — pulso estável (mesmo tempo do baixo), textura de batalha de verdade em
// vez do tique de percussão quase inaudível da v1.
function scheduleMusicDrumHit(startTime) {
  const bufferSize = Math.max(1, Math.floor(audioCtx.sampleRate * 0.12));
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  const filter = audioCtx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  const noiseGain = audioCtx.createGain();
  const noisePeak = 0.05;
  noiseGain.gain.setValueAtTime(noisePeak, startTime);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);
  src.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(musicGain);
  src.start(startTime);

  const boom = audioCtx.createOscillator();
  boom.type = "sine";
  boom.frequency.setValueAtTime(90, startTime);
  boom.frequency.exponentialRampToValueAtTime(45, startTime + 0.15);
  const boomGain = audioCtx.createGain();
  const boomPeak = 0.06;
  boomGain.gain.setValueAtTime(boomPeak, startTime);
  boomGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);
  boom.connect(boomGain);
  boomGain.connect(musicGain);
  boom.start(startTime);
  boom.stop(startTime + 0.2);
}

// Melodia: timbre triangular, mas agora com ataque quase instantâneo
// (0.08s, era 0.35s) e notas mais curtas — soa como uma frase tocada, não um
// floating pad. Continua sem tocar toda "batida" (ver musicSchedulerTick) e
// escolhida de um punhado de notas da escala pra nunca soar dissonante em
// cima de nenhum dos 4 acordes do pad.
function scheduleMusicMelodyNote(startTime) {
  const freq = MUSIC_MELODY_POOL[Math.floor(Math.random() * MUSIC_MELODY_POOL.length)];
  const osc = audioCtx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq;
  const gain = audioCtx.createGain();
  const peak = 0.05;
  const dur = 0.9 + Math.random() * 0.8;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peak, startTime + 0.08);
  gain.gain.linearRampToValueAtTime(0, startTime + dur);
  osc.connect(gain);
  gain.connect(musicGain);
  osc.start(startTime);
  osc.stop(startTime + dur + 0.05);
}

// Scheduler por "lookahead" (técnica padrão de sequenciamento em Web Audio):
// um intervalo leve (250ms, não por frame — pedido do usuário) só decide O
// QUE vai tocar no próximo segundo; o TIMING de verdade de cada nota é
// sample-accurate via ctx.currentTime, não depende da precisão do
// setInterval. Osciladores/buffers são descartáveis por natureza da própria
// Web Audio API (mesmo padrão já usado por playTone/playNoise acima) — o que
// é reutilizado de verdade é o barramento (musicGain) e o próprio scheduler.
// Baixo e tambor de guerra andam no MESMO pulso (MUSIC_DRUM_INTERVAL),
// dando uma "caminhada" rítmica constante — é isso que faz soar como música
// de batalha em vez de atmosfera flutuante.
function musicSchedulerTick() {
  if (!audioCtx) return;
  const horizon = audioCtx.currentTime + MUSIC_SCHEDULE_LOOKAHEAD;
  while (musicNextChordTime < horizon) {
    const chord = MUSIC_CHORDS[musicChordIndex];
    scheduleMusicPad(musicNextChordTime, chord);
    for (let i = 0; i < MUSIC_BASS_PULSES_PER_CHORD; i++) {
      scheduleMusicBassPulse(musicNextChordTime + i * MUSIC_DRUM_INTERVAL, chord);
    }
    musicChordIndex = (musicChordIndex + 1) % MUSIC_CHORDS.length;
    musicNextChordTime += MUSIC_CHORD_DURATION;
  }
  while (musicNextMelodyTime < horizon) {
    if (Math.random() < 0.7) scheduleMusicMelodyNote(musicNextMelodyTime);
    musicNextMelodyTime += 1.5 + Math.random() * 1.1;
  }
  while (musicNextDrumTime < horizon) {
    scheduleMusicDrumHit(musicNextDrumTime);
    musicNextDrumTime += MUSIC_DRUM_INTERVAL;
  }
}

function startBackgroundMusic() {
  if (musicStarted) return;
  musicStarted = true;
  const now = audioCtx.currentTime;
  musicNextChordTime = now;
  musicNextMelodyTime = now + 1.6;
  musicNextDrumTime = now + MUSIC_DRUM_INTERVAL;
  musicSchedulerTick();
  setInterval(musicSchedulerTick, MUSIC_SCHEDULE_INTERVAL_MS);
  // Silêncio -> fade-in gradual (pedido do usuário: ~1-3s).
  musicGain.gain.setValueAtTime(0, now);
  musicGain.gain.linearRampToValueAtTime(musicMuted ? 0 : MUSIC_TARGET_VOLUME, now + 2.0);
}

// Único controle exposto ao jogador (pedido: silenciar/abaixar a música sem
// afetar os efeitos) — fade suave, nunca corte abrupto.
function setMusicMuted(muted) {
  musicMuted = muted;
  if (!audioCtx || !musicGain) return;
  const now = audioCtx.currentTime;
  musicGain.gain.cancelScheduledValues(now);
  musicGain.gain.setValueAtTime(musicGain.gain.value, now);
  musicGain.gain.linearRampToValueAtTime(muted ? 0 : MUSIC_TARGET_VOLUME, now + 1.2);
}

// `pan`: -1 (esquerda/time do Guerreiro) a 1 (direita/time do Goblin) — ver
// boardPanFor(x), que converte a coluna do tabuleiro nesse valor.
function playTone({ freq = 440, endFreq = null, duration = 0.2, type = "sine", volume = 0.2, delay = 0, pan = 0 }) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), start + duration);
  }
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain);
  connectToBus(gain, pan);
  osc.start(start);
  osc.stop(start + duration);
}

function playNoise(duration, volume, filterFreq, pan = 0, filterType = "lowpass") {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  src.connect(filter);
  filter.connect(gain);
  connectToBus(gain, pan);
  src.start(now);
}

// Converte a coluna X de uma unidade (0 a BOARD_SIZE-1) num valor de
// panorama estéreo (-1 esquerda a 1 direita) — dá noção de lado do
// tabuleiro sem precisar passar `pan` manualmente em toda chamada.
function boardPanFor(x) {
  if (typeof x !== "number") return 0;
  return Math.max(-1, Math.min(1, (x / (BOARD_SIZE - 1)) * 2 - 1));
}

// Um "som" por família de golpe. Chamado junto com spawnImpactEffect em
// playAttackFx, pra cada golpe ter feedback visual e sonoro combinados.
// Ruído filtrado com o próprio filtro "varrendo" de uma frequência a outra —
// dá o "whoosh" de algo passando voando ou de um golpe cortando o ar, coisa
// que playNoise (filtro parado) não consegue sozinho.
function playFilterSweep(duration, volume, fromFreq, toFreq, pan = 0, filterType = "bandpass", q = 1) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.Q.value = q;
  const now = ctx.currentTime;
  filter.frequency.setValueAtTime(Math.max(fromFreq, 1), now);
  filter.frequency.exponentialRampToValueAtTime(Math.max(toFreq, 1), now + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  src.connect(filter);
  filter.connect(gain);
  connectToBus(gain, pan);
  src.start(now);
}

// Um "som" por família de golpe/efeito. Cada entrada recebe `pan` (-1 a 1,
// ver boardPanFor) pra tocar do lado certo do tabuleiro — quem chama sem
// passar nada continua funcionando (pan vira 0, centro).
const SFX = {
  melee: (pan = 0) => {
    playNoise(0.07, 0.25, 1400, pan);
    playTone({ freq: 180, endFreq: 90, duration: 0.12, type: "square", volume: 0.15, pan });
  },
  ranged: (pan = 0) => {
    playTone({ freq: 950, endFreq: 320, duration: 0.16, type: "sine", volume: 0.15, pan });
  },
  fire: (pan = 0) => {
    playNoise(0.35, 0.3, 500, pan);
    playTone({ freq: 150, endFreq: 50, duration: 0.4, type: "sawtooth", volume: 0.2, pan });
  },
  arcane: (pan = 0) => {
    playTone({ freq: 1100, duration: 0.07, type: "square", volume: 0.12, pan });
    playTone({ freq: 1450, duration: 0.09, type: "square", volume: 0.12, delay: 0.08, pan });
  },
  lightning: (pan = 0) => {
    playNoise(0.12, 0.3, 5000, pan);
    playTone({ freq: 2200, endFreq: 200, duration: 0.18, type: "sawtooth", volume: 0.18, pan });
  },
  heal: (pan = 0) => {
    playTone({ freq: 520, duration: 0.14, type: "sine", volume: 0.15, pan });
    playTone({ freq: 660, duration: 0.16, type: "sine", volume: 0.15, delay: 0.1, pan });
    playTone({ freq: 780, duration: 0.2, type: "sine", volume: 0.15, delay: 0.2, pan });
  },
  poison: (pan = 0) => {
    playTone({ freq: 260, endFreq: 130, duration: 0.3, type: "triangle", volume: 0.15, pan });
  },
  nature: (pan = 0) => {
    playTone({ freq: 130, endFreq: 80, duration: 0.35, type: "square", volume: 0.15, pan });
  },
  miss: (pan = 0) => {
    playTone({ freq: 320, endFreq: 220, duration: 0.12, type: "sine", volume: 0.08, pan });
  },
  crit: (pan = 0) => {
    playTone({ freq: 900, duration: 0.09, type: "square", volume: 0.2, pan });
    playTone({ freq: 1300, duration: 0.14, type: "square", volume: 0.2, delay: 0.07, pan });
  },
  telegraph: (pan = 0) => {
    playTone({ freq: 300, endFreq: 500, duration: 0.3, type: "sine", volume: 0.08, pan });
  },
  // Golpe voando (lançamento de projétil): sweep curto de ruído filtrado.
  whoosh: (pan = 0) => {
    playFilterSweep(0.22, 0.16, 500, 2400, pan, "bandpass", 1.1);
  },
  bowRelease: (pan = 0) => { playNoise(0.05, 0.11, 2400, pan); playTone({ freq: 720, endFreq: 380, duration: 0.09, type: "triangle", volume: 0.08, pan }); },
  arrowTravel: (pan = 0) => playFilterSweep(0.16, 0.08, 1800, 700, pan, "bandpass", 1.5),
  crossbowRelease: (pan = 0) => { playNoise(0.04, 0.15, 1700, pan); playTone({ freq: 240, endFreq: 120, duration: 0.08, type: "square", volume: 0.08, pan }); },
  boltTravel: (pan = 0) => playFilterSweep(0.12, 0.07, 1500, 500, pan, "bandpass", 1.4),
  slingRelease: (pan = 0) => playFilterSweep(0.18, 0.09, 500, 1900, pan, "bandpass", 1.2),
  stoneTravel: (pan = 0) => playFilterSweep(0.24, 0.07, 900, 350, pan, "lowpass", 0.8),
  firearmRelease: (pan = 0) => { playNoise(0.07, 0.2, 2600, pan); playTone({ freq: 150, endFreq: 60, duration: 0.11, type: "square", volume: 0.12, pan }); },
  bladeRelease: (pan = 0) => playFilterSweep(0.18, 0.13, 700, 2600, pan, "bandpass", 1.8),
  bladeTravel: (pan = 0) => playTone({ freq: 620, endFreq: 420, duration: 0.22, type: "triangle", volume: 0.07, pan }),
  arcaneCast: (pan = 0) => { playTone({ freq: 440, endFreq: 880, duration: 0.18, type: "sine", volume: 0.08, pan }); playTone({ freq: 660, duration: 0.16, type: "triangle", volume: 0.06, delay: 0.06, pan }); },
  arcaneTravel: (pan = 0) => playTone({ freq: 980, endFreq: 620, duration: 0.3, type: "sine", volume: 0.07, pan }),
  lightCast: (pan = 0) => { playTone({ freq: 1050, duration: 0.12, type: "sine", volume: 0.07, pan }); playTone({ freq: 1420, duration: 0.14, type: "sine", volume: 0.06, delay: 0.05, pan }); },
  iceCast: (pan = 0) => { playTone({ freq: 1250, endFreq: 1900, duration: 0.18, type: "sine", volume: 0.07, pan }); playNoise(0.1, 0.04, 5000, pan); },
  iceTravel: (pan = 0) => playFilterSweep(0.28, 0.07, 4200, 1800, pan, "highpass", 1.4),
  fireCast: (pan = 0) => { playTone({ freq: 210, endFreq: 480, duration: 0.2, type: "triangle", volume: 0.08, pan }); playNoise(0.15, 0.05, 700, pan); },
  fireTravel: (pan = 0) => playFilterSweep(0.34, 0.1, 350, 1100, pan, "lowpass", 0.9),
  soundCast: (pan = 0) => playTone({ freq: 320, endFreq: 760, duration: 0.16, type: "sine", volume: 0.08, pan }),
  soundTravel: (pan = 0) => { playTone({ freq: 520, endFreq: 260, duration: 0.3, type: "sine", volume: 0.08, pan }); playTone({ freq: 780, endFreq: 390, duration: 0.28, type: "sine", volume: 0.05, pan }); },
  flaskThrow: (pan = 0) => { playNoise(0.05, 0.08, 1200, pan); playTone({ freq: 460, endFreq: 700, duration: 0.11, type: "triangle", volume: 0.06, pan }); },
  flaskTravel: (pan = 0) => playTone({ freq: 700, endFreq: 520, duration: 0.24, type: "sine", volume: 0.045, pan }),
  // Gelo (Congelamento, Raio de Gelo): tons cristalinos, agudos e curtos.
  freeze: (pan = 0) => {
    playTone({ freq: 1900, duration: 0.14, type: "sine", volume: 0.14, pan });
    playTone({ freq: 2500, duration: 0.12, type: "sine", volume: 0.1, delay: 0.05, pan });
    playNoise(0.1, 0.08, 6000, pan);
  },
  // Atordoado/paralisado: dois blipes quadrados descendo, tipo "tontura".
  stun: (pan = 0) => {
    playTone({ freq: 520, endFreq: 300, duration: 0.09, type: "square", volume: 0.16, pan });
    playTone({ freq: 420, endFreq: 220, duration: 0.09, type: "square", volume: 0.13, delay: 0.1, pan });
  },
  // Ofuscado: um "poof" abafado de ruído.
  blind: (pan = 0) => {
    playNoise(0.16, 0.16, 900, pan);
  },
  // Esquiva/evasão: sweep rápido e agudo caindo, tipo um "swish".
  dodge: (pan = 0) => {
    playFilterSweep(0.12, 0.14, 2000, 500, pan, "bandpass", 1.6);
  },
  // Contra-ataque/ataque de oportunidade: mais seco e agressivo que o melee normal.
  counter: (pan = 0) => {
    playNoise(0.05, 0.3, 2200, pan);
    playTone({ freq: 260, endFreq: 90, duration: 0.11, type: "square", volume: 0.22, pan });
  },
  // Unidade derrotada: ruído grave abafado + tom descendo devagar.
  death: (pan = 0) => {
    playNoise(0.3, 0.22, 280, pan);
    playTone({ freq: 220, endFreq: 55, duration: 0.5, type: "sawtooth", volume: 0.18, pan });
  },
  // Passo/movimento: baque curto e discreto, bem mais baixo que um golpe.
  move: (pan = 0) => {
    playNoise(0.05, 0.1, 700, pan);
    playTone({ freq: 110, endFreq: 65, duration: 0.07, type: "sine", volume: 0.07, pan });
  },
  // Início de turno: sininho de duas notas, suave — sempre no centro.
  turnStart: () => {
    playTone({ freq: 660, duration: 0.12, type: "sine", volume: 0.1 });
    playTone({ freq: 880, duration: 0.16, type: "sine", volume: 0.1, delay: 0.09 });
  },
  victory: () => {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => playTone({ freq, duration: 0.28, type: "triangle", volume: 0.22, delay: i * 0.16 }));
  },
  // Ressurreição bem-sucedida: arpejo curto subindo, mais brilhante e rápido
  // que a Cura comum — pra marcar que é o momento mais raro/importante do
  // jogo, não só mais uma cura.
  revive: (pan = 0) => {
    const notes = [523, 784, 1047, 1319];
    notes.forEach((freq, i) => playTone({ freq, duration: 0.22, type: "triangle", volume: 0.18, delay: i * 0.09, pan }));
    playNoise(0.3, 0.06, 4000, pan);
  },
  // Ressurreição falhou: mais grave e triste que o "miss" genérico — a
  // tentativa mais cara do jogo não devia soar igual a errar um golpe comum.
  reviveFail: (pan = 0) => {
    playTone({ freq: 300, endFreq: 120, duration: 0.5, type: "sine", volume: 0.14, pan });
    playTone({ freq: 220, endFreq: 90, duration: 0.55, type: "sine", volume: 0.1, delay: 0.15, pan });
  },
  // Alma sendo coletada (ver applySoulPickups): tilintar etéreo, diferente
  // do "heal" comum (poção/magia) — mais alto e "vazio", tipo um sino de
  // vidro, não um tom quente.
  soulPickup: (pan = 0) => {
    playTone({ freq: 900, duration: 0.3, type: "sine", volume: 0.12, pan });
    playTone({ freq: 1350, duration: 0.35, type: "sine", volume: 0.1, delay: 0.12, pan });
    playNoise(0.3, 0.05, 3500, pan);
  },
  // Corpo se dissipando em alma (ver decayCorpses): sopro subindo, sem tom
  // definido — só o "vento" de algo se desfazendo.
  soulRise: (pan = 0) => {
    playFilterSweep(0.5, 0.1, 300, 1800, pan, "bandpass", 0.8);
  },
  defeat: () => {
    const notes = [400, 340, 280, 200];
    notes.forEach((freq, i) =>
      playTone({ freq, endFreq: freq * 0.8, duration: 0.4, type: "sawtooth", volume: 0.2, delay: i * 0.28 })
    );
  },
};

function playSfx(key, pan = 0) {
  const fn = SFX[key];
  if (fn) fn(pan);
}

// Paleta por "família" do golpe (mesma lógica de cor dos .impact-* no CSS)
// — reaproveitada tanto pro flash de tela quanto pras partículas, pra tudo
// no impacto (tile, tela, faíscas) combinar na mesma cor.
const SFX_FLASH_COLORS = {
  melee: "#ffe08a",
  ranged: "#8ec6ff",
  fire: "#ff8a3d",
  arcane: "#c9a3ff",
  lightning: "#fff27a",
  heal: "#6fe08a",
  poison: "#c77dff",
  nature: "#8fbf6f",
  freeze: "#bfe9ff",
};

// Dispara junto todo o "impacto" visual e sonoro de um golpe (flash no
// tile, faíscas, flash de tela, som). Usado nos momentos de acerto/cura/
// status de cada arma ou magia.
function playAttackFx(x, y, sfxKey, isCrit) {
  const profile = consumeCombatVfxProfile(x, y);
  const color = SFX_FLASH_COLORS[sfxKey] || SFX_FLASH_COLORS.melee;
  const impactScale = Math.min(profile.visualScale * (isCrit ? ACTION_VISUAL_INTENSITY.exceptional : 1), 1.8);
  spawnImpactEffect(x, y, sfxKey || "melee", impactScale);
  spawnHitParticles(x, y, profile.particleColor || color, isCrit ? 10 : 6 + profile.particleCount, profile.accent);
  if (profile.accent) spawnCombatVfxAccent(x, y, profile.accent);
  flashScreen(color, isCrit);
  const pan = boardPanFor(x);
  playSfx(sfxKey || "melee", pan);
  if (isCrit) {
    playSfx("crit", pan);
  }
}

// "Hit-stop": congela por alguns ms as animações que já estão tocando
// (lunge do atacante, hit-shake anterior, projéteis) bem no instante do
// impacto, antes do flash/shake de verdade aparecerem — é o freeze-frame
// clássico de FFT/FE que faz o golpe "pesar". Usa um contador em vez de um
// simples add/remove porque magias em área resolvem vários alvos com
// pequenos atrasos entre si (cosmeticDelay); sem o contador, o hit-stop do
// segundo alvo podia terminar cedo demais e cortar o do primeiro.
let hitStopDepth = 0;
function hitStop(ms) {
  hitStopDepth++;
  document.body.classList.add("hit-stop");
  setTimeout(() => {
    hitStopDepth = Math.max(hitStopDepth - 1, 0);
    if (hitStopDepth === 0) document.body.classList.remove("hit-stop");
  }, ms);
}

// Screen shake de verdade (a tela de batalha inteira, não só o token).
// Magia é mais lenta e "pesada" que arma equivalente (amplitude maior,
// dura mais) — ver SHAKE_KINDS abaixo. Remove todas as classes antes de
// reaplicar (com reflow forçado) pra golpes em sequência rápida sempre
// reiniciarem a animação do zero, mesmo trocando de intensidade.
const SHAKE_KINDS = {
  light: { cls: "shake-light", duration: 300 },
  heavy: { cls: "shake-heavy", duration: 450 },
  "magic-light": { cls: "shake-magic-light", duration: 420 },
  "magic-heavy": { cls: "shake-magic-heavy", duration: 620 },
};
const ALL_SHAKE_CLASSES = Object.values(SHAKE_KINDS).map((k) => k.cls);
function screenShake(kind) {
  if (!boardWrapperEl) return;
  const { cls, duration } = SHAKE_KINDS[kind] || SHAKE_KINDS.light;
  boardWrapperEl.classList.remove(...ALL_SHAKE_CLASSES);
  void boardWrapperEl.offsetWidth;
  boardWrapperEl.classList.add(cls);
  setTimeout(() => boardWrapperEl.classList.remove(cls), duration);
}

// Flash de tela colorido no instante do impacto — "cor da família do golpe"
// em acerto normal, mais brilhante/branco e um pouco mais longo em
// crítico. Vive dentro de .board-wrapper (ver index.html) pra sacudir
// junto quando shake e flash tocam ao mesmo tempo.
function flashScreen(color, isCrit) {
  if (!screenFlashEl) return;
  screenFlashEl.style.background = color;
  screenFlashEl.classList.remove("flash-active", "flash-crit");
  void screenFlashEl.offsetWidth;
  screenFlashEl.classList.add("flash-active");
  const duration = isCrit ? 550 : 350;
  if (isCrit) screenFlashEl.classList.add("flash-crit");
  setTimeout(() => screenFlashEl.classList.remove("flash-active", "flash-crit"), duration);
}

// Punhado de faíscas que voam pra fora do ponto de impacto e somem —
// direção/distância de cada uma são só cosméticas (levemente aleatórias em
// cima de um leque uniforme), então nunca duas explosões parecem idênticas.
function spawnHitParticles(x, y, color, count, accent = null) {
  const pos = tileScreenPercent(x + 0.5, y + 0.5, 0.9);
  const cx = pos.leftPct;
  const cy = pos.topPct;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = `impact-particle${accent ? ` impact-particle-${accent}` : ""}`;
    el.style.left = `${cx}%`;
    el.style.top = `${cy}%`;
    el.style.background = color;
    el.style.boxShadow = `0 0 6px ${color}`;
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const dist = 16 + Math.random() * 16;
    el.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    el.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
    boardOverlayEl.appendChild(el);
    setTimeout(() => el.remove(), 550);
  }
}

// Acento curto no ponto de impacto. É uma única camada DOM por golpe e usa
// classes CSS; não introduz partículas persistentes nem modifica o timing do
// dano. Cada perfil já tem sua assinatura: peso, corte rápido, mira, magia
// ou reação química.
function spawnCombatVfxAccent(x, y, accent, visualScale = 1) {
  const el = document.createElement("div");
  el.className = `combat-vfx-accent combat-vfx-${accent}`;
  el.style.setProperty("--visual-scale", visualScale);
  const pos = tileScreenPercent(x + 0.5, y + 0.5, 0.9);
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  boardOverlayEl.appendChild(el);
  setTimeout(() => el.remove(), 520);
}

// Menus contextuais ancorados perto do personagem no tabuleiro: primeiro
// Mover/Atacar, depois (se Atacar) a lista de armas, depois o alcance da
// arma escolhida fica destacado no tabuleiro esperando o clique no alvo.
// Um único elemento (#context-menu) é reaproveitado para as duas etapas de
// menu; ele some sozinho a qualquer clique no tabuleiro ou troca de turno.
function closeContextMenu() {
  const existing = document.getElementById("context-menu");
  if (existing) existing.remove();
}

function closeAllMenus() {
  closeContextMenu();
  pendingBackAction = null;
}

function positionMenuNear(menu, unit) {
  const pos = tileScreenPercent(unit.x + 0.5, unit.y + 0.5, 1.6);
  menu.style.left = `${pos.leftPct}%`;
  menu.style.top = `${pos.topPct}%`;
}

// "Voltar" e "Encerrar Turno" ficam fixos no topo (não mais flutuando perto
// do personagem) pra não cobrir os tiles do tabuleiro — isso atrapalhava
// clicar em quem atacar ou no tile logo abaixo do personagem.
function renderTurnControls() {
  const canAct = isHumanControlled(currentActor.team) && isBattleOngoing();
  endTurnBtn.disabled = !canAct;
  topBackBtn.classList.toggle("hidden", !canAct || !pendingBackAction);
}

function createMenuActionButton(label, onClick) {
  const btn = document.createElement("button");
  btn.className = "weapon-btn";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function requestEndTurnConfirmation() {
  closeContextMenu();
  attackConfirmTitleEl.textContent = "Encerrar Turno";
  attackConfirmBodyEl.innerHTML = `<div>Tem certeza que quer encerrar o turno de ${currentActor.name} agora?</div>`;
  attackConfirmOkBtn.textContent = "Encerrar Turno";
  pendingConfirmation = { onConfirm: endCurrentTurn };
  attackConfirmModalEl.classList.remove("hidden");
}

// Etapa 1: escolher entre Mover e Atacar (só mostra o que ainda não foi
// usado neste turno).
function openActionMenu(unit) {
  closeAllMenus();
  const menu = document.createElement("div");
  menu.id = "context-menu";
  menu.className = "weapon-menu action-menu";
  positionMenuNear(menu, unit);

  if (!unit.hasMoved && !isRooted(unit)) {
    menu.appendChild(
      createMenuActionButton("🏃 Mover", () => {
        closeContextMenu();
        startMovementMode(unit);
      })
    );
  }
  if (!unit.hasActed) {
    menu.appendChild(
      createMenuActionButton("⚔️ Atacar", () => {
        closeContextMenu();
        openItemSelectMenu(unit, unit.weapons, () => openActionMenu(unit));
      })
    );
    if (unit.spells && unit.spells.length > 0) {
      // "Magia" só faz sentido pros conjuradores de verdade (Xamã, Fada,
      // Maga) — o resto (Guerreiro, Arqueiro, Ladino, Químico, Troll) usa
      // "spells" internamente por reaproveitar o mesmo esquema de dados,
      // mas na UI isso é "Habilidade" (golpes/itens especiais, não magia).
      const isSpellcaster = SPELLCASTER_SPRITE_KEYS.has(unit.spriteKey);
      const label = isSpellcaster ? "🔮 Magia" : "🌀 Habilidade";
      menu.appendChild(
        createMenuActionButton(label, () => {
          closeContextMenu();
          openItemSelectMenu(unit, unit.spells, () => openActionMenu(unit));
        })
      );
    }
  }

  menu.appendChild(createMenuActionButton("⏹ Encerrar turno", requestEndTurnConfirmation));
  boardOverlayEl.appendChild(menu);
}

// Etapa 2: escolher a arma ou magia (sem alvo ainda, então o alcance/acerto
// exato só é confirmado na etapa seguinte, quando o alvo é clicado).
// onBack define pra onde o botão "Voltar" desse menu leva (sempre o menu
// Mover/Atacar, já que tanto armas quanto magias partem dali).
function openItemSelectMenu(unit, items, onBack) {
  closeAllMenus();
  const menu = document.createElement("div");
  menu.id = "context-menu";
  menu.className = "weapon-menu item-menu";
  positionMenuNear(menu, unit);

  for (const item of items) {
    menu.appendChild(createItemSelectButton(unit, item, () => openItemSelectMenu(unit, items, onBack)));
  }
  menu.appendChild(
    createMenuActionButton("↩ Voltar", () => {
      closeContextMenu();
      onBack();
    })
  );

  boardOverlayEl.appendChild(menu);
}

function createItemSelectButton(unit, item, onBackToThisMenu) {
  const wrapper = document.createElement("div");
  wrapper.className = "weapon-wrapper";

  const lacksMp = item.mpCost !== undefined && unit.mp < item.mpCost;
  const blockedBySingleAbility =
    unit.singleSelfAbilityPerTurn &&
    unit.abilityUsedThisTurn &&
    item.targetMode === "self" &&
    !isSelfAbilityComboAllowed(unit, item);

  const btn = document.createElement("button");
  btn.className = "weapon-btn";
  btn.textContent = `${item.icon} ${item.name}`;
  btn.disabled = lacksMp || blockedBySingleAbility;
  if (!lacksMp && !blockedBySingleAbility) {
    btn.addEventListener("click", () => {
      closeContextMenu();
      if (item.targetMode === "self") {
        // Habilidades em si mesmo (Invisibilidade, Ataque Poderoso, Tiro
        // Certeiro, Agilidade, Fúria, Regeneração) não precisam de alvo no
        // tabuleiro — o clique no menu já lança direto.
        castSelfAbility(unit, item);
      } else if (item.targetMode === "self-attack") {
        // Ataca automaticamente ao redor de si mesmo (Crescimento do Troll) —
        // também não precisa de alvo no tabuleiro.
        castGrowthAttack(unit, item);
      } else {
        startAttackTargeting(unit, item, onBackToThisMenu);
      }
    });
  }

  const tooltip = document.createElement("div");
  tooltip.className = "weapon-tooltip";
  tooltip.innerHTML =
    weaponTooltipHtml(unit, item, null) +
    (lacksMp ? "<br><em>MP insuficiente</em>" : "") +
    (blockedBySingleAbility ? "<br><em>Só uma habilidade por turno</em>" : "");

  wrapper.appendChild(btn);
  wrapper.appendChild(tooltip);
  return wrapper;
}

// Versão só de consulta do botão acima, usada no popup do cartão do roster
// (ver openUnitInfoModal): mesmo visual e mesma tooltip ao passar o mouse,
// mas sem nenhum listener de clique — nunca inicia mira nem gasta nada.
function createItemDisplayButton(unit, item) {
  const wrapper = document.createElement("div");
  wrapper.className = "weapon-wrapper";

  const btn = document.createElement("button");
  btn.className = "weapon-btn";
  btn.textContent = `${item.icon} ${item.name}`;

  const tooltip = document.createElement("div");
  tooltip.className = "weapon-tooltip";
  tooltip.innerHTML = weaponTooltipHtml(unit, item, null);

  wrapper.appendChild(btn);
  wrapper.appendChild(tooltip);
  return wrapper;
}

// Popup informativo do cartão do roster: mostra as armas/magias da unidade
// pra consulta (passe o mouse pra ver o tooltip com dano/acerto/custo), sem
// nenhuma ação de verdade — clicar num item aqui não faz nada, diferente do
// menu real que só aparece clicando na unidade NO tabuleiro no turno dela.
function openUnitInfoModal(unit) {
  unitInfoTitleEl.innerHTML = `<span class="${unit.iconTint || ""}">${unit.icon}</span> ${unit.name}`;
  unitInfoBodyEl.innerHTML = "";

  const portraitUrl = portraitUrlFor(unit);
  if (portraitUrl) {
    const portraitImg = document.createElement("img");
    portraitImg.className = "unit-info-portrait";
    portraitImg.src = portraitUrl;
    portraitImg.alt = "";
    portraitImg.onerror = () => portraitImg.remove();
    unitInfoBodyEl.appendChild(portraitImg);
  }

  const addSection = (label, items) => {
    const heading = document.createElement("div");
    heading.className = "unit-info-section-label";
    heading.textContent = label;
    unitInfoBodyEl.appendChild(heading);

    const row = document.createElement("div");
    row.className = "unit-info-row";
    if (!items || items.length === 0) {
      row.innerHTML = `<span class="unit-info-empty">Nenhuma</span>`;
    } else {
      for (const item of items) {
        row.appendChild(createItemDisplayButton(unit, item));
      }
    }
    unitInfoBodyEl.appendChild(row);
  };

  const statusHeading = document.createElement("div");
  statusHeading.className = "unit-info-section-label";
  statusHeading.textContent = "Status ativos";
  unitInfoBodyEl.appendChild(statusHeading);

  const statusRow = document.createElement("div");
  statusRow.className = "unit-info-row unit-info-status-row";
  const displayEffects = displayStatusEffects(unit);
  if (displayEffects.length === 0) {
    statusRow.innerHTML = `<span class="unit-info-empty">Nenhum</span>`;
  } else {
    for (const effect of displayEffects) {
      const entry = document.createElement("div");
      entry.className = "unit-info-status-entry";
      const description = statusEffectDescription(effect.type);
      // Submerso (turnsLeft null, ver submergedPseudoEffect) não tem
      // duração pra mostrar — só o nome, já que some sozinho ao sair da água.
      const remaining = statusEffectRemainingTurns(effect);
      const durationText = remaining == null ? "" : ` — ${remaining} turno(s) restante(s)`;
      entry.innerHTML =
        `<span class="unit-info-status-icon">${statusEffectIcon(effect.type)}</span> <strong>${statusEffectLabel(effect.type)}</strong>${durationText}${statusEffectDetail(effect)}` +
        (description ? `<div class="unit-info-status-desc">${description}</div>` : "");
      statusRow.appendChild(entry);
    }
  }
  unitInfoBodyEl.appendChild(statusRow);

  addSection("Armas", unit.weapons);
  addSection(SPELLCASTER_SPRITE_KEYS.has(unit.spriteKey) ? "Magias" : "Habilidades", unit.spells);

  unitInfoModalEl.classList.remove("hidden");
}

unitInfoCloseBtn.addEventListener("click", () => {
  unitInfoModalEl.classList.add("hidden");
});

// Texto fixo de cada tipo de terreno pro popup abaixo.
const TERRAIN_INFO = {
  water: {
    icon: "🌊",
    name: "Rio",
    desc: "Custa 2 pontos de movimento pra atravessar 1 quadrado (em vez de 1). Quem está na água tem +10% de chance de SER acertado e -10% de chance de acertar com os próprios golpes.",
  },
  // Também não é um `type` próprio — mesmo tile "water" do WATERFALL_TILE,
  // só o popup troca de nome (ver openTerrainInfoModal).
  waterfall: {
    icon: "💦",
    name: "Cachoeira",
    desc: "Custa 2 pontos de movimento pra atravessar 1 quadrado (em vez de 1). Quem está na cachoeira tem +10% de chance de SER acertado e -10% de chance de acertar com os próprios golpes.",
  },
  tree: {
    icon: "🌳",
    name: "Árvore",
    desc: "Bloqueia o caminho por completo. Ninguém consegue atravessar nem parar aqui. Tem 10 de HP: ataques em área que passarem por cima dela causam dano, e ao chegar a 0 ela é destruída, liberando o quadrado.",
  },
  house: {
    icon: "🏠",
    name: "Casa",
    desc: "Bloqueia o caminho, mas dá pra subir nela (ocupar o mesmo quadrado). Quem está em cima tem +10% de chance de acertar os próprios golpes. Tem 30 de HP: pode ser destruída por qualquer tipo de ataque, mesmo vazia, virando escombros e liberando o quadrado.",
  },
  tent: {
    icon: "⛺",
    name: "Tenda",
    desc: "Bloqueia o caminho por completo. Ninguém consegue atravessar nem parar aqui. Tem 20 de HP: pode ser destruída por qualquer tipo de ataque, mesmo vazia, virando escombros e liberando o quadrado.",
  },
  stump: {
    icon: "🪵",
    name: "Galhos no chão",
    desc: "Restos de uma árvore destruída. Só decoração, não bloqueia nem tem nenhum efeito.",
  },
  "house-rubble": {
    icon: "🧱",
    name: "Escombros",
    desc: "Restos de uma casa destruída. Só decoração, não bloqueia nem tem nenhum efeito.",
  },
  "tent-rubble": {
    icon: "🧱",
    name: "Escombros",
    desc: "Restos de uma tenda destruída. Só decoração, não bloqueia nem tem nenhum efeito.",
  },
  flower: {
    icon: "🌼",
    name: "Flor",
    desc: "Só decoração — não bloqueia movimento nem linha de mira de ataques à distância, não tem HP nem nenhum efeito de jogo.",
  },
};

// Popup de terreno: clicar num quadrado vazio (sem unidade) que tenha
// árvore/água/casa/tenda, fora de um clique de movimento/ataque em
// andamento, mostra o que é aquilo e qual a regra dele — mesmo modal de
// unit-info-modal, só com conteúdo de terreno em vez de personagem (mesmo
// título/corpo/botão Fechar, sem precisar de HTML/CSS novo). x/y só servem
// pra identificar o tile exato da cachoeira (ver WATERFALL_TILE) — o resto
// do terreno usa terrain.type.
function openTerrainInfoModal(terrain, x, y) {
  const infoKey =
    x === WATERFALL_TILE.x && y === WATERFALL_TILE.y ? "waterfall" : terrain.variant || terrain.type;
  const info = TERRAIN_INFO[infoKey];
  if (!info) return;
  const hpNote = DESTRUCTIBLE_TILE_TYPES[terrain.type] ? ` (HP: ${Math.max(terrain.hp, 0)}/${terrain.maxHp})` : "";
  unitInfoTitleEl.innerHTML = `<span>${info.icon}</span> ${info.name}${hpNote}`;
  unitInfoBodyEl.innerHTML = `<div class="unit-info-row">${info.desc}</div>`;
  unitInfoModalEl.classList.remove("hidden");
}

// Texto fixo do Castelo/Montanha pro popup — mesmo modal de unit-info-modal.
const STRUCTURE_INFO = {
  castle: {
    icon: "🏰",
    name: "Castelo",
    desc: "Só heróis podem entrar (bloqueia o caminho pra qualquer inimigo por completo, nem passar). Dá pra ocupar os 9 quadrados como se fosse 1 só, no máximo 1 unidade por vez. Um herói lá dentro tem +20% de chance de acertar os próprios golpes, e quem ataca esse herói tem -10% de chance de acertar. Regenera 1 HP e 1 MP do ocupante a cada turno que passa, de qualquer personagem. Pode ser destruído por qualquer tipo de ataque, mesmo vazio.",
  },
  mountain: {
    icon: "⛰",
    name: "Montanha",
    desc: "Só inimigos podem entrar (bloqueia o caminho pra qualquer herói por completo, nem passar). Dá pra ocupar os 9 quadrados como se fosse 1 só, no máximo 1 unidade por vez. Um inimigo lá dentro tem +20% de chance de acertar os próprios golpes, e quem ataca esse inimigo tem -10% de chance de acertar. Regenera 1 HP e 1 MP do ocupante a cada turno que passa, de qualquer personagem. Pode ser destruída por qualquer tipo de ataque, mesmo vazia.",
  },
};

function openStructureInfoModal(structure) {
  const info = STRUCTURE_INFO[structure.type];
  if (!info) return;
  if (structure.destroyed) {
    // Escombros: mesmo popup, mas sem HP (não tem mais estrutura de pé) e
    // descrição própria em vez do texto de regras de quando ela funcionava.
    unitInfoTitleEl.innerHTML = `<span>${info.icon}</span> ${info.name} (destruíd${structure.type === "castle" ? "o" : "a"})`;
    unitInfoBodyEl.innerHTML = `<div class="unit-info-row">Restos d${structure.type === "castle" ? "o Castelo" : "a Montanha"}, destruíd${structure.type === "castle" ? "o" : "a"} em combate. Só decoração agora — não bloqueia mais movimento nem dá nenhum dos bônus de quando estava de pé.</div>`;
  } else {
    unitInfoTitleEl.innerHTML = `<span>${info.icon}</span> ${info.name} (HP: ${structure.hp}/${structure.maxHp})`;
    unitInfoBodyEl.innerHTML = `<div class="unit-info-row">${info.desc}</div>`;
  }
  unitInfoModalEl.classList.remove("hidden");
}

// Etapa 3: mostra os quadrados de movimento no tabuleiro, com um botão de
// Voltar (que cancela o movimento e reabre o menu Mover/Atacar).
function startMovementMode(unit) {
  pendingWeapon = null;
  aoePreviewTarget = null;
  aoePreviewTiles = [];
  reachableTiles = computeReachable(unit);
  attackableTiles = [];
  pendingBackAction = () => {
    reachableTiles = [];
    render();
    openActionMenu(unit);
  };
  render();
}

// Etapa 3 (caminho de ataque/magia): mostra todo o alcance do item escolhido
// no tabuleiro — não só os tiles com inimigo — e espera o clique no alvo.
// O botão de Voltar aqui volta para a lista de armas/magias, não para o
// menu inicial, já que "mudar de ideia" nessa etapa é sobre o item escolhido.
function startAttackTargeting(unit, item, onBackToMenu) {
  pendingWeapon = item;
  reachableTiles = [];
  aoePreviewTarget = null;
  aoePreviewTiles = [];
  if (item.targetMode === "line-aoe") {
    attackableTiles = computeLineTargetTiles(unit, item);
  } else if (item.targetMode === "creeping-line" || item.targetMode === "cardinal-blast") {
    // Mostra a cruz inteira (as 4 direções possíveis) como "alcance" ANTES
    // do clique, usando os MESMOS item.bandLength/item.bandWidth que
    // computeAoeAreaTiles usa pra montar o efeito de UMA direção (ver ali).
    // Clicar escolhe qual das 4 vira o efeito de verdade; como os dois vêm
    // da mesma fonte, o alcance nunca mostra clicável um tile que não faria
    // parte do efeito se escolhido, e o efeito nunca vai além do mostrado.
    attackableTiles = computeCardinalCrossTiles(unit, item.bandLength, item.bandWidth);
  } else if (item.targetMode === "pierce-line" || item.targetMode === "trample") {
    attackableTiles = computeLineTargetTiles(unit, item, true);
  } else if (item.targetMode === "cone-poison" || item.targetMode === "cone-windstorm") {
    attackableTiles = computeAllConeTiles(unit, item.maxRange);
  } else if (item.targetMode === "charge") {
    attackableTiles = computeChargeTargets(unit);
  } else if (item.cardinalOnly) {
    // Arremessar Espada (Guerreiro): alcance normal, mas só nas 4 direções
    // cardeais — não é uma área "livre" em diamante como o Arco.
    attackableTiles = computeLineTargetTiles(unit, item, true);
  } else {
    attackableTiles = computeRangeTiles(unit, item);
  }
  pendingBackAction = () => {
    // Se já havia uma prévia de área ativa, o primeiro Voltar só cancela a
    // prévia (deixa escolher outro alvo); um segundo Voltar aí sim sai pro
    // menu de armas/magias.
    if (aoePreviewTarget) {
      aoePreviewTarget = null;
      aoePreviewTiles = [];
      render();
      return;
    }
    pendingWeapon = null;
    attackableTiles = [];
    render();
    onBackToMenu();
  };
  render();
}

// Faixa retangular numa direção cardeal, a partir do tile adjacente ao
// conjurador: `length` tiles na direção escolhida por `width` tiles de
// espessura (perpendicular). Compartilhada por Destruição Rastejante
// (6x3) e Tacar Tronco (6x2) — largura par fica levemente assimétrica
// (não tem como centralizar 2 tiles num eixo de tiles inteiros).
function computeCardinalRectTiles(caster, targetTile, length, width) {
  const dx = Math.sign(targetTile.x - caster.x);
  const dy = Math.sign(targetTile.y - caster.y);
  const perpX = -dy;
  const perpY = dx;
  const half = Math.floor(width / 2);
  const offsets = [];
  for (let i = 0; i < width; i++) offsets.push(i - half);
  const tiles = [];
  for (let d = 1; d <= length; d++) {
    const baseX = caster.x + dx * d;
    const baseY = caster.y + dy * d;
    for (const offset of offsets) {
      const x = baseX + perpX * offset;
      const y = baseY + perpY * offset;
      if (inBounds(x, y)) tiles.push({ x, y });
    }
  }
  return tiles;
}

// Mesma faixa retangular de computeCardinalRectTiles, só que nas 4 direções
// cardeais AO MESMO TEMPO a partir do conjurador (as 4 faixas coladas,
// formando uma cruz). Nem a Destruição Rastejante nem o Tacar Tronco
// acertam nas 4 de uma vez de verdade (cada um escolhe só UMA no clique —
// ver computeAoeAreaTiles) — esta função é usada só pra desenhar o
// "alcance" (attackableTiles em startAttackTargeting) ANTES do clique,
// mostrando as 4 faixas possíveis de uma vez pro jogador escolher entre
// elas, sempre com o mesmo bandLength/bandWidth que o efeito de verdade vai
// usar depois de escolhida a direção. Perto do conjurador os braços
// perpendiculares podem se sobrepor num canto (width > 1); dx/dy no
// retorno (não usado hoje, mantido por se um empurrão em cruz voltar a
// existir) marca de qual braço aquele tile "venceu" a sobreposição.
function computeCardinalCrossTilesWithDir(caster, length, width) {
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ];
  const seen = new Map();
  for (const [dx, dy] of dirs) {
    const rect = computeCardinalRectTiles(caster, { x: caster.x + dx, y: caster.y + dy }, length, width);
    for (const t of rect) {
      const key = `${t.x},${t.y}`;
      if (seen.has(key)) continue;
      seen.set(key, { x: t.x, y: t.y, dx, dy });
    }
  }
  return [...seen.values()];
}

function computeCardinalCrossTiles(caster, length, width) {
  return computeCardinalCrossTilesWithDir(caster, length, width).map(({ x, y }) => ({ x, y }));
}

// Calcula quais quadrados serão afetados se o alvo `targetTile` for
// confirmado, pro modo de mira do item — usado pra pré-visualização de 2
// cliques das magias de área (bola de fogo, relâmpago, cone de veneno).
// Retorna null se o modo do item não tiver uma área diferente do próprio tile.
function computeAoeAreaTiles(caster, item, targetTile) {
  const mode = item.targetMode || "enemy";
  if (mode === "point-aoe") {
    const impact = resolveObstructedTarget(caster, targetTile);
    const tiles = [];
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (manhattan({ x, y }, impact) <= item.areaRadius) {
          tiles.push({ x, y });
        }
      }
    }
    return tiles;
  }
  if (mode === "line-aoe") {
    const dx = Math.sign(targetTile.x - caster.x);
    const dy = Math.sign(targetTile.y - caster.y);
    const length = Math.max(
      Math.abs(targetTile.x - caster.x),
      Math.abs(targetTile.y - caster.y)
    );
    const tiles = [];
    for (let d = 1; d <= length; d++) {
      tiles.push({ x: caster.x + dx * d, y: caster.y + dy * d });
    }
    return tiles;
  }
  // Destruição Rastejante e Tacar Tronco: a linha/faixa NÃO pára no tile
  // clicado — o clique só escolhe UMA das 4 direções cardeais, e o efeito
  // cobre spell.bandLength x spell.bandWidth NESSA direção (ver
  // attackableTiles em startAttackTargeting, que mostra a cruz das 4
  // direções possíveis ANTES do clique usando os MESMOS bandLength/
  // bandWidth — por vir da mesma fonte, "alcance" mostrado e "efeito" real
  // nunca divergem: nenhum tile acende como clicável sem fazer parte do
  // efeito se escolhido).
  if (mode === "creeping-line" || mode === "cardinal-blast") {
    return computeCardinalRectTiles(caster, targetTile, item.bandLength, item.bandWidth);
  }
  if (mode === "cone-poison" || mode === "cone-windstorm") {
    const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
    ];
    for (const [dx, dy] of dirs) {
      const tiles = computeConeTilesForDir(caster, dx, dy, item.maxRange);
      if (tiles.some((t) => t.x === targetTile.x && t.y === targetTile.y)) {
        return tiles;
      }
    }
    return null;
  }
  if (mode === "freeze-aoe") {
    // Mesmo formato do Antídoto/Armadilha: losango fixo ao redor do ponto
    // clicado, sem redirecionar por obstrução.
    const tiles = [];
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (manhattan({ x, y }, targetTile) <= item.areaRadius) {
          tiles.push({ x, y });
        }
      }
    }
    return tiles;
  }
  if (mode === "cure-aoe" || mode === "heal-aoe" || mode === "regen-aoe") {
    // Igual ao point-aoe, mas sem redirecionar por obstrução — Antídoto,
    // Cura e Regeneração em Área não têm essa restrição.
    const tiles = [];
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (manhattan({ x, y }, targetTile) <= item.areaRadius) {
          tiles.push({ x, y });
        }
      }
    }
    return tiles;
  }
  if (mode === "pierce-line") {
    // Diferente do Relâmpago: o Tiro Penetrante sempre vai até o alcance
    // máximo fixo (item.maxRange), não até onde foi clicado.
    const dx = Math.sign(targetTile.x - caster.x);
    const dy = Math.sign(targetTile.y - caster.y);
    const tiles = [];
    for (let d = 1; d <= item.maxRange; d++) {
      const x = caster.x + dx * d;
      const y = caster.y + dy * d;
      if (!inBounds(x, y)) break;
      tiles.push({ x, y });
    }
    return tiles;
  }
  if (mode === "trap") {
    // Igual ao Antídoto: área fixa em raio ao redor do ponto clicado, sem
    // redirecionar por obstrução (não é um projétil).
    const tiles = [];
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (manhattan({ x, y }, targetTile) <= item.areaRadius) {
          tiles.push({ x, y });
        }
      }
    }
    return tiles;
  }
  return null;
}

// Tiles inimigos alcançáveis pela Investida do Orc: só nas 4 direções
// cardeais (como a torre do xadrez), até 2x o próprio deslocamento; pára no
// primeiro ocupante do caminho — só vira alvo clicável se for inimigo (um
// aliado no meio do caminho bloqueia a investida sem virar alvo).
function computeChargeTargets(unit) {
  const maxDist = unit.moveRange * 2;
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ];
  const targets = [];
  for (const [dx, dy] of dirs) {
    for (let d = 1; d <= maxDist; d++) {
      const x = unit.x + dx * d;
      const y = unit.y + dy * d;
      if (!inBounds(x, y)) break;
      // Cadáver ainda ressuscitável é um bloqueio físico: a Investida não
      // pode atravessá-lo nem escolher um alvo que exigiria parar sobre ele.
      if (deadUnitAt(x, y)) break;
      const occupant = unitAt(x, y);
      if (occupant) {
        if (occupant.team !== unit.team) targets.push({ x, y });
        break;
      }
    }
  }
  return targets;
}

function computeRangeTiles(unit, item) {
  // Tiro Longo (Arqueiro): dobra só o maxRange pra esse cálculo — minRange
  // e o resto do item ficam intactos, então o alcance mínimo não muda.
  let effectiveItem = unit.doubleRangeNextAttack ? { ...item, maxRange: item.maxRange * 2 } : item;
  // Terreno elevado dá +1 de alcance a ataques à distância (maxRange > 1 —
  // arma corpo a corpo, maxRange 1, nunca ganha esse bônus). Aplicado depois
  // do dobro do Tiro Longo, então soma em cima do alcance já dobrado.
  if (effectiveItem.maxRange > 1 && isUnitElevated(unit)) {
    effectiveItem = { ...effectiveItem, maxRange: effectiveItem.maxRange + 1 };
  }
  const result = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (
        isInWeaponRange(effectiveItem, manhattan(unit, { x, y })) &&
        (item.ignoresTerrainLineOfSight || hasLineOfSight(unit.x, unit.y, x, y))
      ) {
        result.push({ x, y });
      }
    }
  }
  return result;
}

// Linha de visão por elevação: um tile intermediário da linha reta
// (bresenhamLine) só tapa a mira quando está ACIMA da maior das duas
// elevações envolvidas (de quem mira e do alvo) — dá pra mirar por cima de
// terreno na mesma altura ou mais baixo que qualquer um dos dois lados, só
// uma colina/montanha que se ergue acima dos dois de fato bloqueia. Não
// interpola altura ao longo do trajeto (um perfil 3D completo seria mais
// "realista", mas custa bem mais pra um ganho marginal aqui). Tiles
// adjacentes (ou o próprio tile, ex: poção em si mesmo) nunca têm
// intermediário, então sempre têm linha de visão livre.
function hasLineOfSight(fromX, fromY, toX, toY) {
  const path = bresenhamLine(fromX, fromY, toX, toY);
  if (path.length <= 2) return true;
  const eyeLevel = Math.max(elevationAt(fromX, fromY), elevationAt(toX, toY));
  for (let i = 1; i < path.length - 1; i++) {
    if (elevationAt(path[i].x, path[i].y) > eyeLevel) return false;
  }
  return true;
}

// Tiles válidos pro Relâmpago: só as 8 direções retas/diagonais, até o
// alcance máximo do feitiço (pára antes se sair do tabuleiro).
function computeLineTargetTiles(unit, spell, cardinalOnly = false) {
  const dirs = cardinalOnly
    ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
    : [
        [1, 0], [-1, 0], [0, 1], [0, -1],
        [1, 1], [1, -1], [-1, 1], [-1, -1],
      ];
  const result = [];
  for (const [dx, dy] of dirs) {
    for (let dist = 1; dist <= spell.maxRange; dist++) {
      const x = unit.x + dx * dist;
      const y = unit.y + dy * dist;
      if (!inBounds(x, y)) break;
      result.push({ x, y });
    }
  }
  return result;
}

// Algoritmo de Bresenham: lista os tiles que uma linha reta entre dois
// pontos atravessa, usado pra checar obstrução no caminho da Bola de Fogo.
function bresenhamLine(x0, y0, x1, y1) {
  const points = [];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  while (true) {
    points.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return points;
}

// Abre o menu de Mover/Atacar quando o jogador clica no próprio personagem,
// mostrando só as ações que ele ainda não usou neste turno.
function promptNextAction(unit) {
  if (battleEnded) return;
  if (unit.hasMoved && unit.hasActed) return;
  openActionMenu(unit);
}

function tileKey(x, y) {
  return `${x},${y}`;
}

function inBounds(x, y) {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

// --- Terreno estático (árvore/água/casa/tenda) ------------------------------
// Fixo entre partidas (ao contrário de traps/souls abaixo, que são
// plantados/gerados durante o combate) — mesmo formato "lista de objetos
// numa struct simples" que traps/souls já usam, só que construído uma vez
// no load em vez de mutado turno a turno. Rio corta as colunas 6/7 de cima
// a baixo sem nenhum vão de travessia — atravessar é só entrar na água
// normalmente (custo 2, penalidade de acerto). Árvore e tenda usam a mesma
// regra de bloqueio total (ver BLOCKING_TERRAIN_TYPES) — um punhado no meio
// do cenário (x 4/8) e perto das bordas inferiores, tendas espalhadas perto
// do meio também. As bordas SUPERIORES (linhas/colunas 0-2 dos dois cantos)
// não têm mais árvore ali — viraram Castelo/Montanha (ver
// STRUCTURES_LAYOUT logo abaixo de terrainAt). Nunca nas colunas 2/10 (onde
// os times começam — ver createGuerreiroState..createTrollState), e nunca
// fechando mais de 1 dos 4 vizinhos cardeais de qualquer tile inicial —
// conferido à mão pra ninguém ficar preso. Duas casas, uma de cada lado
// (espelhadas em x=3/x=9) pra não favorecer um time só no bônus de terreno
// alto.
const TERRAIN_LAYOUT = {
  water: [
    { x: 6, y: 0 }, { x: 6, y: 1 }, { x: 6, y: 2 },
    { x: 7, y: 2 }, // preenche a curva do rio perto do castelo (era um salto na diagonal)
    { x: 7, y: 3 }, { x: 7, y: 4 },
    { x: 6, y: 5 }, { x: 7, y: 5 }, { x: 8, y: 5 },
    { x: 7, y: 6 },
    { x: 6, y: 6 }, // preenche a curva do rio (era um salto na diagonal)
    { x: 6, y: 7 }, { x: 6, y: 8 },
    { x: 5, y: 9 }, { x: 6, y: 9 }, { x: 7, y: 9 },
    { x: 6, y: 10 },
    // Fim do rio: continua reto na mesma coluna até a última linha do
    // tabuleiro, sem alargar em lago.
    { x: 6, y: 11 }, { x: 6, y: 12 },
  ],
  tree: [
    { x: 0, y: 4 }, { x: 1, y: 4 }, { x: 0, y: 6 },
    { x: 0, y: 9 }, { x: 1, y: 9 },
    { x: 0, y: 11 }, { x: 0, y: 12 }, { x: 1, y: 12 },
    { x: 12, y: 4 }, { x: 11, y: 4 }, { x: 12, y: 6 },
    { x: 12, y: 9 }, { x: 11, y: 9 },
    { x: 12, y: 11 }, { x: 12, y: 12 }, { x: 11, y: 12 },
    // Reforço no meio do cenário (entre as colunas iniciais e o rio).
    { x: 4, y: 2 }, { x: 8, y: 2 },
    { x: 4, y: 10 }, { x: 8, y: 10 },
  ],
  house: [
    { x: 9, y: 1 },
    { x: 3, y: 1 },
  ],
  tent: [
    { x: 4, y: 6 },
    { x: 10, y: 7 }, // era (9,7)
  ],
};

// Cachoeira: puramente estética, sobreposta ao primeiro (mais ao norte)
// quadrado de água do rio — não é um novo `type` de terreno, só decoração
// extra em cima do tile "water" que já existe (ver render()).
const WATERFALL_TILE = { x: 6, y: 0 };

// Flores: puramente decorativas (sem bloqueio, sem custo, sem popup de
// regra) — layout fixo (não sorteado) igual TERRAIN_LAYOUT, só pra nunca
// colidir com árvore/casa/tenda/água/castelo/montanha/colunas
// iniciais dos times (2 e 10).
// (3,3) e (5,9), não (4,3)/(5,8) como antes: essas duas coincidiam com
// HILL_TILES (Fase 5) — a flor decorativa em cima de uma colina fazia
// parecer que ELA bloqueava a mira à distância quando na verdade era a
// altura do terreno por baixo (flor nunca bloqueou nada, ver hasLineOfSight
// — só lê elevationAt, nunca terreno decorativo).
const FLOWER_LAYOUT = [
  { x: 3, y: 3, art: "flower1.png" },
  { x: 8, y: 5, art: "flower2.png" },
  { x: 3, y: 7, art: "flower3.png" },
  { x: 5, y: 9, art: "flower1.png" },
  { x: 9, y: 9, art: "flower2.png" },
  { x: 4, y: 9, art: "flower3.png" },
];

// Árvore e tenda: obstáculo total, ninguém atravessa nem "para" em cima —
// mesma regra pros dois (ver computeReachable), só a arte que muda.
const BLOCKING_TERRAIN_TYPES = new Set(["tree", "tent"]);
const TREE_MAX_HP = 10;
// Casa: destrutível por qualquer tipo de ataque (igual castelo/montanha),
// mas continua sendo terreno de 1 tile só (ver terrainMap), não uma
// STRUCTURES_LAYOUT de 9 — por isso reaproveita o mesmo modelo de HP por
// tile da árvore (ver damageTree) em vez do HP compartilhado de structures[].
const HOUSE_MAX_HP = 30;
// Tenda: mesmo modelo, mas ao ser destruída vira "tent-rubble" (decorativo,
// igual stump/house-rubble) — não some sozinha, precisa ser derrubada.
const TENT_MAX_HP = 20;

const TREE_ART_VARIANTS = ["tree1.png", "tree2.png", "tree3.png", "tree4.png", "tree5.png"];
const TENT_ART_VARIANTS = ["tent1.png", "tent2.png"];

// Construído numa função (não só um loop solto no load) porque precisa
// rodar de novo em CADA resetGame() — árvores destruídas numa partida
// precisam "voltar a crescer" quando a partida reinicia, senão um "stump"
// (ver damageTree) ficaria permanente entre partidas diferentes, o que não
// faz sentido pra um layout que é "fixo" (mesma posição sempre), não
// "permanentemente danificado".
const terrainMap = new Map();
function buildTerrainMap() {
  terrainMap.clear();
  for (const [type, tiles] of Object.entries(TERRAIN_LAYOUT)) {
    for (const t of tiles) {
      const entry = { type };
      // Sorteado de novo a cada chamada — cada partida pode variar QUAL
      // variante de árvore/tenda aparece em cada tile, sem efeito nenhum
      // no gameplay (só estética).
      if (type === "tree") {
        entry.art = TREE_ART_VARIANTS[Math.floor(Math.random() * TREE_ART_VARIANTS.length)];
        // Árvore tem HP próprio — magia/ataque em área que passar por cima
        // dela causa dano (ver damageTree/damageTreesInTiles); ao chegar a
        // 0 vira "stump" (galhos no chão), que não está em
        // BLOCKING_TERRAIN_TYPES — o tile é liberado pra movimento
        // sozinho, só trocando o type.
        entry.hp = TREE_MAX_HP;
        entry.maxHp = TREE_MAX_HP;
      } else if (type === "tent") {
        entry.art = TENT_ART_VARIANTS[Math.floor(Math.random() * TENT_ART_VARIANTS.length)];
        entry.hp = TENT_MAX_HP;
        entry.maxHp = TENT_MAX_HP;
      } else if (type === "house") {
        // Casa também é destrutível agora (qualquer tipo de ataque, igual
        // Castelo/Montanha) — mesmo modelo de HP por tile da árvore (ver
        // damageTree), não o HP compartilhado de structures[], porque cada
        // casa é só 1 tile.
        entry.hp = HOUSE_MAX_HP;
        entry.maxHp = HOUSE_MAX_HP;
      }
      terrainMap.set(tileKey(t.x, t.y), entry);
    }
  }
}
buildTerrainMap();

function terrainAt(x, y) {
  return terrainMap.get(tileKey(x, y)) || null;
}

// Apresentação 2D: a máscara só lê água já existente no mapa. O grid e todas
// as regras continuam usando terrainAt()/terrainMap exatamente como antes.
function waterNeighborMask(x, y) {
  const hasWater = (nx, ny) => inBounds(nx, ny) && terrainAt(nx, ny)?.type === "water";
  return {
    top: hasWater(x, y - 1),
    right: hasWater(x + 1, y),
    bottom: hasWater(x, y + 1),
    left: hasWater(x - 1, y),
    topLeft: hasWater(x - 1, y - 1),
    topRight: hasWater(x + 1, y - 1),
    bottomRight: hasWater(x + 1, y + 1),
    bottomLeft: hasWater(x - 1, y + 1),
  };
}

function terrainVariant(x, y, variants) {
  return variants[(x * 17 + y * 31 + x * y * 7) % variants];
}

// Castelo (heróis) e Montanha (inimigos): blocos 3x3 (9 tiles) com UM HP
// compartilhado pra estrutura inteira, não HP por tile como a árvore — por
// isso viram um array próprio (`structures`), não entram em terrainMap.
// Cada canto do tabuleiro (colunas/linhas 0-2) tinha árvores do TERRAIN_LAYOUT
// nesses exatos tiles; foram removidas de lá pra não colidir.
const STRUCTURES_LAYOUT = [
  {
    type: "castle",
    team: "player",
    tiles: [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
      { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 },
      { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 },
    ],
  },
  {
    type: "mountain",
    team: "enemy",
    tiles: [
      { x: 10, y: 0 }, { x: 11, y: 0 }, { x: 12, y: 0 },
      { x: 10, y: 1 }, { x: 11, y: 1 }, { x: 12, y: 1 },
      { x: 10, y: 2 }, { x: 11, y: 2 }, { x: 12, y: 2 },
    ],
  },
];
const STRUCTURE_MAX_HP = 100;

// Reconstruído em CADA resetGame() (igual buildTerrainMap) — estrutura
// destruída numa partida não deve continuar destruída na próxima.
let structures = [];
function buildStructures() {
  structures = STRUCTURES_LAYOUT.map((s) => ({
    ...s,
    tiles: s.tiles.map((t) => ({ ...t })),
    hp: STRUCTURE_MAX_HP,
    maxHp: STRUCTURE_MAX_HP,
    destroyed: false,
  }));
}
buildStructures();

function structureAt(x, y) {
  return structures.find((s) => !s.destroyed && s.tiles.some((t) => t.x === x && t.y === y)) || null;
}

// Igual structureAt, mas só encontra as JÁ destruídas — usado só pro popup
// de identificação dos escombros (ver onTileClick/openStructureInfoModal);
// em todo o resto do jogo (movimento, mira, IA) o destino continua sendo
// structureAt normal, que ignora escombros de propósito (tile liberado).
function destroyedStructureAt(x, y) {
  return structures.find((s) => s.destroyed && s.tiles.some((t) => t.x === x && t.y === y)) || null;
}

// --- Elevação (mecânica de altura, estilo FFT) -----------------------------
// Nível inteiro por tile (0 = padrão/plano). O rio agora corre num vale
// (água = -1). Castelo/Montanha ganham altura própria (2/3) coerente com
// serem a fortificação/formação rochosa de cada time — mas ficam ISENTOS
// do bloqueio de escalada abaixo (ver computeReachable): entrar neles já é
// regido pelas próprias regras de exclusividade de time/ocupante único,
// então altura não pode impedir o próprio dono de entrar na sua base.

const CASTLE_ELEVATION = 2;
const MOUNTAIN_ELEVATION = 3;
// Diferença de altura acima disso bloqueia movimento pra quem não voa —
// subir/descer 1 nível é sempre livre, mas um segundo nível de uma vez
// exige contornar (ou voar).
const MAX_CLIMB_HEIGHT = 1;

const elevationMap = new Map(); // tileKey(x,y) -> nível inteiro (só água — Castelo/Montanha são consultados ao vivo abaixo)
function buildElevationMap() {
  elevationMap.clear();
  for (const t of TERRAIN_LAYOUT.water) elevationMap.set(tileKey(t.x, t.y), -1);
}
buildElevationMap();

// Castelo/Montanha consultam a estrutura AO VIVO (não o mapa estático) —
// uma vez destruída (ver damageStructure), viram escombros passáveis, não
// uma "colina" de altura 2/3 que ninguém mais consegue escalar.
function elevationAt(x, y) {
  const structure = structureAt(x, y);
  if (structure) return structure.type === "castle" ? CASTLE_ELEVATION : MOUNTAIN_ELEVATION;
  return elevationMap.get(tileKey(x, y)) || 0;
}

// Só 1 unidade por vez ocupa a estrutura inteira (os 9 tiles contam como 1
// vaga só) — usado tanto pra bloquear movimento de uma segunda unidade
// quanto pra decidir quem recebe bônus de acerto/regeneração.
function structureOccupant(structure) {
  return aliveUnits().find((u) => structure.tiles.some((t) => t.x === u.x && t.y === u.y)) || null;
}

// Aplica dano de ataque a UMA estrutura — chamada por damageStructuresInTiles/
// damageStructuresInRadius (ataque em área) e por performStructureAttack
// (ataque de alvo único mirado na construção). Sem chance de acerto própria:
// quem decide atacar a estrutura sempre acerta (ver performStructureAttack).
// Dano de queda: casa/castelo/montanha são "terreno alto" (dá pra ocupar em
// cima) — se a construção desmorona com alguém lá em cima, essa unidade cai
// e se machuca. Chamada tanto por damageStructure (Castelo/Montanha) quanto
// por damageTree (casa — árvore/tenda nunca têm ocupante, são bloqueio
// total, então a checagem é inofensiva pra elas).
const FALL_DAMAGE = 5;
function applyFallDamage(unit) {
  if (!unit || unit.hp <= 0) return;
  unit.hp -= FALL_DAMAGE;
  log(`${unit.name} cai com o desmoronamento e sofre ${FALL_DAMAGE} de dano de queda!`);
  spawnFloatingText(unit.x, unit.y, `-${FALL_DAMAGE}`, "hit");
  if (unit.hp <= 0) {
    unit.hp = 0;
    log(`${unit.name} foi derrotado!`);
    playSfx("death", boardPanFor(unit.x));
  }
}

function damageStructure(structure, damageMin, damageMax) {
  if (structure.destroyed) return;
  const dmg = Math.floor(Math.random() * (damageMax - damageMin + 1)) + damageMin;
  structure.hp -= dmg;
  const anchor = structure.tiles[4];
  spawnFloatingText(anchor.x, anchor.y, `-${dmg}`, "hit");
  const label = structure.type === "castle" ? "O Castelo" : "A Montanha";
  if (structure.hp <= 0) {
    structure.hp = 0;
    structure.destroyed = true;
    log(`${label} é destruída pelo ataque!`);
    applyFallDamage(structureOccupant(structure));
  } else {
    log(`${label} leva ${dmg} de dano (${structure.hp}/${structure.maxHp}).`);
  }
  render();
}

// Ataque em ÁREA que pega Castelo/Montanha causa o DOBRO de dano nela (pedido
// do usuário) — só as duas funções abaixo (damageStructuresInTiles/
// damageStructuresInRadius), que só são chamadas por magias/armas em área;
// ataque de alvo único mirado na estrutura (performStructureAttack ->
// damageStructure direto) continua com o dano normal, sem dobrar.
const AREA_STRUCTURE_DAMAGE_MULTIPLIER = 2;

function damageStructuresInTiles(tiles, damageMin, damageMax) {
  const hit = new Set();
  for (const t of tiles) {
    const s = structureAt(t.x, t.y);
    if (s && !hit.has(s)) {
      hit.add(s);
      damageStructure(s, damageMin * AREA_STRUCTURE_DAMAGE_MULTIPLIER, damageMax * AREA_STRUCTURE_DAMAGE_MULTIPLIER);
    }
  }
}

function damageStructuresInRadius(center, radius, damageMin, damageMax) {
  for (const s of structures) {
    if (s.destroyed) continue;
    if (s.tiles.some((t) => manhattan(t, center) <= radius)) {
      damageStructure(s, damageMin * AREA_STRUCTURE_DAMAGE_MULTIPLIER, damageMax * AREA_STRUCTURE_DAMAGE_MULTIPLIER);
    }
  }
}

// Chamada uma vez por TROCA DE TURNO GLOBAL (ver advanceToNextTurn), não só
// nos turnos próprios de quem está ocupando — por isso não usa
// applyStatusEffectsAtTurnStart/beginTurnFor, que só rodam pro dono do turno.
function tickStructureRegen() {
  for (const s of structures) {
    if (s.destroyed) continue;
    const occupant = structureOccupant(s);
    if (!occupant || occupant.team !== s.team) continue;
    occupant.hp = Math.min(occupant.hp + 1, occupant.maxHp);
    if (occupant.maxMp !== undefined) occupant.mp = Math.min(occupant.mp + 1, occupant.maxMp);
  }
}

// Árvore/casa/tenda: terreno "destrutível por tile" (HP próprio no Map
// entry, ao contrário do HP compartilhado de structures[] do Castelo/
// Montanha). Config compartilhada por damageTree/damageTreesInTiles/
// damageTreesInRadius abaixo — nomes mantidos "Tree" por serem os já usados
// nas ~8 chamadas de magia de área, mesmo cobrindo os outros 2 tipos agora.
const DESTRUCTIBLE_TILE_TYPES = {
  tree: { maxHp: TREE_MAX_HP, ruinType: "stump", label: "árvore" },
  house: { maxHp: HOUSE_MAX_HP, ruinType: "house-rubble", label: "casa" },
  tent: { maxHp: TENT_MAX_HP, ruinType: "tent-rubble", label: "tenda" },
};

// Subconjunto de DESTRUCTIBLE_TILE_TYPES que também aceita ataque de ALVO
// ÚNICO (não só dano em área) — árvore fica de fora de propósito, só recebe
// dano quando pega de raspão numa área (nunca foi pedido mirar nela direto).
const SINGLE_TARGET_TERRAIN_TYPES = new Set(["house", "tent"]);

// Aplica dano de ataque em área a UMA árvore/casa específica — chamada pelas
// funções damageTreesInTiles/damageTreesInRadius abaixo, uma vez por tile
// atingido. Ao zerar o HP, vira "stump"/"house-rubble": troca só o `type`
// no MESMO Map entry — como nenhum dos dois ruinTypes está em
// BLOCKING_TERRAIN_TYPES, o tile já sai liberado pra movimento na próxima
// vez que computeReachable rodar, sem precisar de nenhuma lógica extra.
function damageTree(x, y, damageMin, damageMax) {
  const key = tileKey(x, y);
  const terrain = terrainMap.get(key);
  const config = terrain && DESTRUCTIBLE_TILE_TYPES[terrain.type];
  if (!config) return;
  const dmg = Math.floor(Math.random() * (damageMax - damageMin + 1)) + damageMin;
  terrain.hp -= dmg;
  spawnFloatingText(x, y, `-${dmg}`, "hit");
  if (terrain.hp <= 0) {
    terrainMap.set(key, { type: config.ruinType });
    log(`Uma ${config.label} em (${x}, ${y}) é destruída pelo ataque!`);
    applyFallDamage(unitAt(x, y));
  } else {
    log(`Uma ${config.label} em (${x}, ${y}) leva ${dmg} de dano (${Math.max(terrain.hp, 0)}/${config.maxHp}).`);
  }
  render();
}

// Dano em área que já tem uma lista de tiles pronta (linha, cruz, cone
// etc.) — chamada pelas magias/armas de área depois de resolver os alvos
// de verdade (unidades), pra árvore/casa na mesma área também sofrerem.
function damageTreesInTiles(tiles, damageMin, damageMax) {
  for (const t of tiles) {
    const terrain = terrainAt(t.x, t.y);
    if (!terrain || !DESTRUCTIBLE_TILE_TYPES[terrain.type]) continue;
    damageTree(t.x, t.y, damageMin, damageMax);
  }
}

// Versão pra explosões em raio (Bola de Fogo) — não tem uma lista de tiles
// pronta (só um centro + raio), então varre terrainMap direto em vez de
// montar uma lista de BOARD_SIZE² tiles só pra achar árvore/casa.
function damageTreesInRadius(center, radius, damageMin, damageMax) {
  for (const [key, terrain] of terrainMap) {
    if (!DESTRUCTIBLE_TILE_TYPES[terrain.type]) continue;
    const [tx, ty] = key.split(",").map(Number);
    if (manhattan({ x: tx, y: ty }, center) > radius) continue;
    damageTree(tx, ty, damageMin, damageMax);
  }
}

function aliveUnits() {
  return units.filter((u) => u.hp > 0);
}

function unitAt(x, y) {
  return aliveUnits().find((u) => u.x === x && u.y === y) || null;
}

// Ocupação física do tabuleiro: cadáveres que ainda podem ser ressuscitados
// continuam reservando o tile. Ataques seguem usando unitAt() para nunca
// mirar um morto por engano; movimento e deslocamentos usam occupantAt().
function occupantAt(x, y) {
  return unitAt(x, y) || deadUnitAt(x, y);
}

function findCorpseSafeSideTile(unit, origin, preferredDx = 0, preferredDy = 0) {
  const directions = [
    [preferredDx, preferredDy],
    [preferredDy, -preferredDx],
    [-preferredDy, preferredDx],
    [-preferredDx, -preferredDy],
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ].filter(([dx, dy], index, all) => (dx || dy) && all.findIndex(([ax, ay]) => ax === dx && ay === dy) === index);
  for (const [dx, dy] of directions) {
    const x = origin.x + dx;
    const y = origin.y + dy;
    if (!inBounds(x, y) || occupantAt(x, y)) continue;
    const terrain = terrainAt(x, y);
    if (terrain && BLOCKING_TERRAIN_TYPES.has(terrain.type)) continue;
    const structure = structureAt(x, y);
    if (structure && structure.team !== unit.team) continue;
    return { x, y };
  }
  return null;
}

// Rede de segurança para estados excepcionais (ex.: morte durante uma ação
// agendada): uma unidade viva nunca permanece sobre um cadáver ressuscitável.
function separateLivingUnitFromCorpse(unit, previousTile, preferredDx = 0, preferredDy = 0) {
  if (!unit || unit.hp <= 0 || !deadUnitAt(unit.x, unit.y)) return true;
  const side = findCorpseSafeSideTile(unit, { x: unit.x, y: unit.y }, preferredDx, preferredDy);
  if (side) {
    unit.x = side.x;
    unit.y = side.y;
    log(`${unit.name} é desviado(a) para o lado para não ocupar um cadáver.`);
    return true;
  }
  if (previousTile && !occupantAt(previousTile.x, previousTile.y)) {
    unit.x = previousTile.x;
    unit.y = previousTile.y;
  }
  return false;
}

function opposingTeamOf(unit) {
  return unit.team === "player" ? enemyTeam : playerTeam;
}

function isBattleOngoing() {
  return playerTeam.some((u) => u.hp > 0) && enemyTeam.some((u) => u.hp > 0);
}

// Tipos que causam dano/cura POR TURNO (ver applyStatusEffectsAtTurnStart).
// Reaplicar o MESMO tipo nesse grupo (ex: já envenenado e leva outro golpe
// venenoso) estende a duração da instância já ativa em vez de empilhar uma
// segunda simultânea — senão a unidade sofreria os dois tiques no mesmo
// turno. Tipos DIFERENTES continuam coexistindo livremente (queimado E
// envenenado ao mesmo tempo funciona normal, cada um com seu próprio tique).
const DOT_HOT_TYPES = new Set(["poison", "bleed", "root", "burned", "regenBoost", "regen", "weakened"]);

// Perfis exclusivamente visuais dos status reais. A ordem numérica só
// decide qual aura aparece primeiro; não altera duração ou efeito lógico.
const STATUS_VFX_PROFILES = {
  paralyzed: { cls: "electric-body", glyph: "", priority: 100, position: "body", tone: "debuff" },
  root: { cls: "rooted", glyph: "", priority: 95, position: "base", tone: "debuff" },
  dazed: { cls: "stun-orbit", glyph: "", priority: 90, position: "head", tone: "debuff" },
  burned: { cls: "fire", glyph: "▲", priority: 85, position: "base", tone: "debuff" },
  poison: { cls: "poison", glyph: "●", priority: 80, position: "body", tone: "debuff" },
  bleed: { cls: "bleed", glyph: "◆", priority: 75, position: "body", tone: "debuff" },
  blinded: { cls: "blinded-eyes", glyph: "", priority: 70, position: "head", tone: "debuff" },
  slowed: { cls: "drag", glyph: "", priority: 65, position: "base", tone: "debuff" },
  weakened: { cls: "drained", glyph: "", priority: 60, position: "body", tone: "debuff" },
  guarding: { cls: "guard-barrier", glyph: "", priority: 55, position: "body", tone: "buff" },
  fury: { cls: "fury-power", glyph: "", priority: 50, position: "body", tone: "buff" },
  regen: { cls: "regen-life", glyph: "", priority: 45, position: "body", tone: "buff" },
  regenBoost: { cls: "regen-life", glyph: "", priority: 44, position: "body", tone: "buff" },
  invisible: { cls: "optical-cloak", glyph: "", priority: 40, position: "body", tone: "buff" },
  evasive: { cls: "evasive-shift", glyph: "", priority: 35, position: "body", tone: "buff" },
  swiftFeet: { cls: "swift", glyph: "»", priority: 30, position: "base", tone: "buff" },
  submerged: { cls: "water", glyph: "≈", priority: 20, position: "base", tone: "neutral" },
};
// STATUS_VFX_ROTATION_INTERVAL do redesign (item 29): 1,0s por status
// quando há 2+ simultâneos, com um fade curtíssimo (100-150ms) na virada —
// mecanicamente todos continuam ativos ao mesmo tempo, só a exibição
// alterna (ver activeStatusVfx).
const STATUS_VFX_SLOT_MS = 1000;
const STATUS_VFX_FADE_MS = 140;

function activeStatusVfx(unit, now = performance.now()) {
  if (!unit || unit.hp <= 0) return null;
  const effects = displayStatusEffects(unit)
    .filter((effect) => STATUS_VFX_PROFILES[effect.type])
    .sort((a, b) => STATUS_VFX_PROFILES[b.type].priority - STATUS_VFX_PROFILES[a.type].priority || a.type.localeCompare(b.type));
  if (!effects.length) return null;
  const index = effects.length === 1 ? 0 : Math.floor(now / STATUS_VFX_SLOT_MS) % effects.length;
  const phase = effects.length === 1 ? 0.5 : (now % STATUS_VFX_SLOT_MS) / STATUS_VFX_SLOT_MS;
  const edge = STATUS_VFX_FADE_MS / STATUS_VFX_SLOT_MS;
  const opacity = effects.length === 1 ? 1 : Math.min(phase / edge, (1 - phase) / edge, 1);
  const effect = effects[index];
  return { effect, profile: STATUS_VFX_PROFILES[effect.type], index, count: effects.length, opacity };
}

function addStatusEffect(unit, effect) {
  if (!unit.statusEffects) unit.statusEffects = [];
  if (DOT_HOT_TYPES.has(effect.type)) {
    const existing = unit.statusEffects.find((e) => e.type === effect.type);
    if (existing) {
      // Duração SOMA (não pega só a maior) — levar queimadura da Flecha de
      // Fogo e depois do Tiro Explosivo, por exemplo, deve resultar num
      // único status com os turnos das duas fontes somados, não travar no
      // valor da mais longa das duas. Todo o resto (dano, drain de CT,
      // bônus de cura...) vem da aplicação nova, que é a mais "atual".
      const turnsLeft = existing.turnsLeft + effect.turnsLeft;
      // Debilitado (weakened) é exceção: moveReduction precisa SOMAR junto
      // (não só pegar o valor mais novo) — o moveRange já foi reduzido pela
      // soma das DUAS aplicações no ponto de chamada (ver appliesSlow/
      // weakeningStrike), então o status também precisa lembrar da soma
      // cheia pra devolver tudo certo quando expirar (ver
      // applyStatusEffectsAtTurnStart) — senão a unidade ficava lenta pra
      // sempre depois de ser debilitada 2x.
      const mergedMoveReduction =
        effect.type === "weakened" ? existing.moveReduction + effect.moveReduction : undefined;
      Object.assign(existing, effect, { turnsLeft });
      if (mergedMoveReduction !== undefined) existing.moveReduction = mergedMoveReduction;
      return;
    }
  }
  unit.statusEffects.push(effect);
}

function isRooted(unit) {
  return !!(unit.statusEffects && unit.statusEffects.some((e) => e.type === "root"));
}

function isPoisoned(unit) {
  return !!(unit.statusEffects && unit.statusEffects.some((e) => e.type === "poison"));
}

// Nome legível de cada tipo de status, usado no tooltip (title) do badge de
// contador no tabuleiro — pra saber o motivo do número sem precisar adivinhar.
function statusEffectLabel(type) {
  switch (type) {
    case "poison":
      return "Veneno";
    case "root":
      return "Raízes";
    case "invisible":
      return "Invisibilidade";
    case "blinded":
      return "Ofuscado";
    case "paralyzed":
      return "Paralisado";
    case "fury":
      return "Fúria";
    case "regenBoost":
      return "Regeneração aumentada";
    case "swiftFeet":
      return "Pés Ágeis";
    case "bleed":
      return "Sangramento";
    case "burned":
      return "Queimando";
    case "regen":
      return "Regenerando";
    case "dazed":
      return "Atordoado(a) pelo Som";
    case "evasive":
      return "Evasiva";
    case "weakened":
      return "Debilitado";
    case "slowed":
      return "Lento";
    case "guarding":
      return "Defendendo";
    case "submerged":
      return "Submerso(a)";
    default:
      return type;
  }
}

// Explicação em texto simples do que cada status FAZ — usada no popup de
// informação da unidade (ver openUnitInfoModal), que abre ao clicar no
// cartão do personagem. O nome+ícone já aparecem no badge do tabuleiro, mas
// só ali fica claro o que "Debilitado" ou "Atordoado(a) pelo Som" realmente
// significam pra quem tá vendo.
function statusEffectDescription(type) {
  switch (type) {
    case "poison":
      return `Perde ${STATUS_DOT_DAMAGE.poison.damageMin}-${STATUS_DOT_DAMAGE.poison.damageMax} de vida por turno.`;
    case "burned":
      return `Perde ${STATUS_DOT_DAMAGE.burned.damageMin} de vida por turno.`;
    case "bleed":
      return "Perde 1 de vida por turno.";
    case "root":
      return "Não pode se mover no próprio turno.";
    case "paralyzed":
      return "Perde a vez por completo neste turno.";
    case "invisible":
      return "Ataques normais (arma/magia de alvo único) sempre erram; só magia em área consegue atingir.";
    case "blinded":
      return "-10% de chance de acerto nos próprios ataques.";
    case "dazed":
      return "-10% de chance de acerto nos próprios ataques (empilha com Ofuscado).";
    case "fury":
      return "+dano nos ataques e +agilidade.";
    case "regenBoost":
      return "Cura vida extra a cada turno, além da regeneração normal.";
    case "regen":
      return "Cura vida a cada turno.";
    case "swiftFeet":
      return "+deslocamento neste turno.";
    case "evasive":
      return "Mais difícil de ser acertado (bônus de esquiva).";
    case "weakened":
      return "Deslocamento reduzido.";
    case "slowed":
      return "Agilidade reduzida.";
    case "guarding":
      return "Reduz o dano recebido enquanto durar.";
    case "submerged":
      return "-10% de chance de acerto nos próprios ataques; quem te ataca tem +10% de chance de acerto; apaga e impede queimadura. Some assim que sai da água — quem voa (ex: Fada) nunca fica submerso(a).";
    default:
      return "";
  }
}

// Complemento opcional pro tooltip de status — só os tipos onde vale a pena
// dizer QUANTO por turno além de nome+duração (ex: Regenerando sozinho não
// diz se cura muito ou pouco).
function statusEffectDetail(effect) {
  if (effect.type === "regen") return ` (cura ${effect.healMin}-${effect.healMax}/turno)`;
  if (effect.type === "regenBoost") return ` (cura +${effect.bonus}/turno)`;
  return "";
}

// Símbolo de cada tipo de status, usado no badge compacto do cartão (fora do
// tabuleiro) — o cartão só mostra o ícone; a lista completa com nome e turnos
// restantes aparece no modal ao clicar nele (ver getOrCreateUnitCard/openUnitInfoModal).
function statusEffectIcon(type) {
  switch (type) {
    case "poison":
      return "☠️";
    case "root":
      return "🌿";
    case "invisible":
      return "👻";
    case "blinded":
      return "🙈";
    case "paralyzed":
      return "💫";
    case "fury":
      return "😡";
    case "regenBoost":
      return "🌱";
    case "swiftFeet":
      return "🦶";
    case "bleed":
      return "🩸";
    case "burned":
      return "🔥";
    case "regen":
      return "💚";
    case "dazed":
      return "😵‍💫";
    case "evasive":
      return "🍃";
    case "weakened":
      return "⛓️";
    case "slowed":
      return "🐌";
    case "guarding":
      return "🛡️";
    case "submerged":
      return "🌊";
    default:
      return "❔";
  }
}

// Status "vivo": ao contrário do resto (statusEffects, com duração em
// turnos), Submerso não fica guardado em nenhuma lista — é só um reflexo
// direto de isOnWater(unit) no momento de desenhar a tela, aparece e some
// sozinho conforme a unidade entra/sai da água. Usado só nos dois lugares
// que MOSTRAM status (badge do tabuleiro e popup de informação); as regras
// de verdade (custo de movimento, +-10% de acerto, apagar queimadura)
// já existiam antes disso e continuam em isOnWater/getEffectiveHitChance/
// stepCost — isso aqui só deixa visível o que já acontecia por baixo.
function submergedPseudoEffect(unit) {
  return isOnWater(unit) ? { type: "submerged", turnsLeft: null } : null;
}

// turnsLeft null = pseudo-status sem duração (ver submergedPseudoEffect),
// tratado igual nos 3 lugares que mostram status: sem contador, só ícone/nome.
// Centraliza esse null-check + clamp; cada call site ainda formata o texto
// à sua própria maneira (modal vs. badge compacto vs. tooltip do badge).
function statusEffectRemainingTurns(effect) {
  return effect.turnsLeft == null ? null : Math.max(effect.turnsLeft, 0);
}

// Junta os status "de verdade" (com duração) com o pseudo-status Submerso
// (sem duração) — usado nos dois pontos de exibição pra não duplicar essa
// lógica de "colar" os dois.
function displayStatusEffects(unit) {
  const real = unit.statusEffects || [];
  const submerged = submergedPseudoEffect(unit);
  return submerged ? [...real, submerged] : real;
}

function isInvisible(unit) {
  return !!(unit.statusEffects && unit.statusEffects.some((e) => e.type === "invisible"));
}

const AOE_TARGET_MODES = ["point-aoe", "line-aoe", "cone-poison", "freeze-aoe", "cone-windstorm"];

// Só magias de área "cobrem o terreno" o bastante pra achar quem está
// invisível — armas e magias de alvo único (qualquer alcance) não acertam.
function bypassesInvisibility(item) {
  return item.mpCost !== undefined && AOE_TARGET_MODES.includes(item.targetMode);
}

// Usado por castRootSpell/castParalysis, que rolam acerto por conta própria
// (não passam por resolveSingleHit) mas precisam da mesma regra.
function blockedByInvisibility(item, target) {
  return !bypassesInvisibility(item) && isInvisible(target);
}

// Ofuscado (Luz da Fada): reduz a própria chance de acerto de quem foi
// atingido, não a de quem o ataca (ver getEffectiveHitChance).
function isBlinded(unit) {
  return !!(unit.statusEffects && unit.statusEffects.some((e) => e.type === "blinded"));
}

// Atordoado por som (Explosão Sonora da Fada): -10 pontos percentuais de
// chance de acerto pros próprios ataques, igual Ofuscado — ver
// getEffectiveHitChance, onde os dois descontam e empilham em vez de um
// travar a chance num valor fixo.
function isDazed(unit) {
  return !!(unit.statusEffects && unit.statusEffects.some((e) => e.type === "dazed"));
}

// Água apaga fogo: quem está molhado não pega (nem continua) queimando —
// voando não conta como "estar na água de verdade" (mesmo critério já usado
// em stepCost/getEffectiveHitChance pros outros efeitos de água).
function isOnWater(unit) {
  if (unit.flying) return false;
  const terrain = terrainAt(unit.x, unit.y);
  return !!(terrain && terrain.type === "water");
}

// Paralisado (Paralisia da Fada): consumido inteiro no início do próprio
// turno da unidade (ver beginTurnFor), fazendo-a perder a vez uma única vez.
function isParalyzed(unit) {
  return !!(unit.statusEffects && unit.statusEffects.some((e) => e.type === "paralyzed"));
}

// Chamado no início do turno de uma unidade, antes de qualquer outra coisa:
// aplica o dano de cada efeito ativo, mostra o número em roxo, atualiza o
// contador e remove os que zeraram. Se isso matar a unidade, quem chamou
// (beginTurnFor) percebe pelo hp <= 0 e pula o turno dela.
function applyStatusEffectsAtTurnStart(unit) {
  if (!unit.statusEffects || unit.statusEffects.length === 0) return;

  for (const effect of [...unit.statusEffects]) {
    if (effect.type === "invisible") {
      effect.turnsLeft -= 1;
      if (effect.turnsLeft <= 0) {
        log(`${unit.name} não está mais invisível.`);
      }
      continue;
    }
    if (effect.type === "blinded") {
      effect.turnsLeft -= 1;
      if (effect.turnsLeft <= 0) {
        log(`${unit.name} não está mais ofuscado(a).`);
      }
      continue;
    }
    if (effect.type === "dazed") {
      effect.turnsLeft -= 1;
      if (effect.turnsLeft <= 0) {
        log(`${unit.name} não está mais atordoado(a) pelo som.`);
      }
      continue;
    }
    if (effect.type === "paralyzed") {
      // Não decrementa turnsLeft aqui — quem faz isso é beginTurnFor, logo
      // depois desta função rodar, ao consumir a perda de turno. O dano é
      // opcional: o Choque paralisa sem dano (sem damageMin/damageMax), já o
      // Congelamento da Fada machuca a cada turno perdido.
      if (effect.damageMin !== undefined) {
        const damage = Math.floor(Math.random() * (effect.damageMax - effect.damageMin + 1)) + effect.damageMin;
        unit.hp -= damage;
        log(`${unit.name} sofre ${damage} de dano por causa do Congelamento.`);
        spawnFloatingText(unit.x, unit.y, `-${damage} PV`, "poison");
        if (unit.hp <= 0) {
          unit.hp = 0;
          log(`${unit.name} foi derrotado!`);
          playSfx("death", boardPanFor(unit.x));
        }
      }
      continue;
    }
    if (effect.type === "fury") {
      // Fúria/Berserk (Orc) tem preço: perde HP por turno enquanto durar,
      // igual um DOT normal (mesmo checagem de morte no final do bloco).
      if (effect.hpDrainPerTurn) {
        unit.hp -= effect.hpDrainPerTurn;
        log(`${unit.name} perde ${effect.hpDrainPerTurn} de HP por causa da fúria!`);
        spawnFloatingText(unit.x, unit.y, `-${effect.hpDrainPerTurn} PV`, "poison");
      }
      effect.turnsLeft -= 1;
      if (effect.turnsLeft <= 0) {
        unit.speed -= effect.speedBonus;
        log(`${unit.name} não está mais em fúria.`);
      }
      if (unit.hp <= 0) {
        unit.hp = 0;
        log(`${unit.name} foi derrotado!`);
        playSfx("death", boardPanFor(unit.x));
      }
      continue;
    }
    if (effect.type === "swiftFeet") {
      effect.turnsLeft -= 1;
      if (effect.turnsLeft <= 0) {
        unit.moveRange -= effect.moveBonus;
        log(`${unit.name} não está mais com os pés ágeis.`);
      }
      continue;
    }
    if (effect.type === "regenBoost") {
      unit.hp = Math.min(unit.hp + effect.bonus, unit.maxHp);
      effect.turnsLeft -= 1;
      log(`${unit.name} regenera +${effect.bonus} de vida extra (${Math.max(effect.turnsLeft, 0)} turno(s) restante(s)).`);
      spawnFloatingText(unit.x, unit.y, `+${effect.bonus} PV`, "heal");
      triggerRegenVisualPulse(unit);
      if (effect.turnsLeft <= 0) {
        log(`${unit.name} não está mais com regeneração aumentada.`);
      }
      continue;
    }
    // Regeneração em Área (Xamã/Fada/Químico): cura um valor ALEATÓRIO
    // (healMin-healMax) a cada turno, diferente de regenBoost (Troll), que
    // é um bônus fixo — mesmo espírito de veneno/queimadura, só que curando
    // em vez de causando dano.
    if (effect.type === "regen") {
      const heal = Math.floor(Math.random() * (effect.healMax - effect.healMin + 1)) + effect.healMin;
      unit.hp = Math.min(unit.hp + heal, unit.maxHp);
      effect.turnsLeft -= 1;
      log(`${unit.name} regenera ${heal} de vida (${Math.max(effect.turnsLeft, 0)} turno(s) restante(s)).`);
      spawnFloatingText(unit.x, unit.y, `+${heal} PV`, "heal");
      triggerRegenVisualPulse(unit);
      if (effect.turnsLeft <= 0) {
        log(`${unit.name} não está mais regenerando.`);
      }
      continue;
    }
    // Golpe Debilitante (Ladino) e afins: turnos somam em vez de empilhar
    // instâncias separadas (ver DOT_HOT_TYPES/addStatusEffect) — o
    // moveReduction acumulado já vem somado desde lá, então devolve tudo de
    // uma vez só quando o status (já combinado) chega no fim.
    if (effect.type === "weakened") {
      effect.turnsLeft -= 1;
      if (effect.turnsLeft <= 0) {
        unit.moveRange += effect.moveReduction;
        log(`${unit.name} não está mais lento por causa do Golpe Debilitante.`);
      }
      continue;
    }
    if (effect.type === "guarding") {
      effect.turnsLeft -= 1;
      if (effect.turnsLeft <= 0) {
        log(`${unit.name} não está mais na postura defensiva.`);
      }
      continue;
    }
    if (effect.type === "evasive") {
      effect.turnsLeft -= 1;
      if (effect.turnsLeft <= 0) {
        log(`${unit.name} não está mais evasivo(a).`);
      }
      continue;
    }
    if (effect.type === "slowed") {
      effect.turnsLeft -= 1;
      if (effect.turnsLeft <= 0) {
        unit.speed += effect.speedReduction;
        log(`${unit.name} não está mais lento(a) de agilidade.`);
      }
      continue;
    }

    const damage = Math.floor(Math.random() * (effect.damageMax - effect.damageMin + 1)) + effect.damageMin;
    unit.hp -= damage;
    effect.turnsLeft -= 1;
    // damage pode ser 0 (Destruição Rastejante usa "root" só pra imobilizar,
    // sem dano nenhum) — nesse caso não faz sentido logar/piscar "sofre 0
    // de dano", só a imobilização em si já é o efeito.
    if (damage > 0) {
      const label =
        effect.type === "poison"
          ? "veneno"
          : effect.type === "bleed"
          ? "sangramento"
          : effect.type === "burned"
          ? "queimadura"
          : "raízes";
      log(`${unit.name} sofre ${damage} de dano de ${label} (${Math.max(effect.turnsLeft, 0)} turno(s) restante(s)).`);
      spawnFloatingText(unit.x, unit.y, `-${damage} PV`, effect.type === "burned" ? "burn" : "poison");
      playSfx(effect.type === "root" ? "nature" : effect.type === "burned" ? "fire" : "poison", boardPanFor(unit.x));
      if (effect.type === "poison") triggerPoisonVisualTick(unit);
      if (effect.type === "bleed") triggerBleedVisualTick(unit);
    } else if (effect.type === "root") {
      log(`${unit.name} continua imobilizado(a) (${Math.max(effect.turnsLeft, 0)} turno(s) restante(s)).`);
    }

    // Veneno da Espada Curta do Goblin também drena CT a cada turno do efeito.
    if (effect.ctDrainPerTurn) {
      unit.ct = Math.max(unit.ct - effect.ctDrainPerTurn, 0);
      log(`${unit.name} perde ${effect.ctDrainPerTurn} de CT por causa do veneno!`);
    }

    if (unit.hp <= 0) {
      unit.hp = 0;
      log(`${unit.name} foi derrotado!`);
      playSfx("death", boardPanFor(unit.x));
    }
  }

  unit.statusEffects = unit.statusEffects.filter((e) => e.turnsLeft > 0);
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// Advances every living unit's Charge Time (by its Agilidade/speed) tick by
// tick until someone crosses the CT threshold, then returns that unit.
// Faster units cross the threshold more often, so they act more frequently
// (and can even act twice before a slower unit acts once) — same idea as
// the CT/ATB system in Final Fantasy Tactics. O CT nunca passa de 100: se a
// unidade estava em 96 e ganharia +8, ela trava em 100 (perde o excedente).
// Cadáveres NÃO entram nessa corrida de CT (pedido do usuário): a contagem
// regressiva de ressurreição deles avança por RODADA (ver
// noteUnitActedThisRound/advanceCorpseDecayForRound), não pela agilidade de
// quem já morreu.
function advanceCTUntilReady() {
  while (true) {
    const ready = aliveUnits().filter((u) => u.ct >= CT_THRESHOLD);
    if (ready.length > 0) {
      ready.sort((a, b) => b.ct - a.ct || b.speed - a.speed);
      return ready[0];
    }
    for (const u of aliveUnits()) {
      u.ct = Math.min(u.ct + u.speed, CT_THRESHOLD);
    }
  }
}

// BFS to find tiles reachable within moveRange, blocked by occupied tiles —
// exceto pra quem tem flying (status de voo, ex: a Fada), que pode
// atravessar tiles ocupados por inimigos (mas nunca aliados) sem poder
// parar neles. Custo de dar um passo pra dentro do tile (x,y): 2 se for
// parte de uma armadilha inimiga (ver `traps`), 1 caso contrário. Times
// aliados ao dono da armadilha nunca pagam esse custo extra (nem a
// acionam — ver applyTrapCrossings).
function trapStepCost(unit, x, y) {
  // Quem voa passa por cima de armadilhas sem nem encostar nelas — imune
  // ao custo extra e ao gatilho (ver applyTrapCrossings).
  if (unit.flying) return 1;
  for (const trap of traps) {
    if (trap.ownerTeam === unit.team) continue;
    if (trap.tiles.some((t) => t.x === x && t.y === y)) return 2;
  }
  return 1;
}

// Água custa 2 pra entrar (a metade do alcance normal por tile) — árvore
// nunca chega aqui, já é filtrada como bloqueio total antes do cálculo de
// custo (ver loop de vizinhos em computeReachable). Quem tem flying passa
// voando por cima, sem o custo extra.
function waterStepCost(unit, x, y) {
  if (unit.flying) return 1;
  const terrain = terrainAt(x, y);
  return terrain && terrain.type === "water" ? 2 : 1;
}

// Custo total de dar um passo pra dentro de (x,y), somando TODAS as fontes
// de custo extra: armadilha inimiga (+1) e água (+1) — os dois SOMAM se
// coincidirem (ex: Ladino planta armadilha em cima de água = custo 3). Não
// é cenário do layout padrão (rio e armadilhas nunca coincidem por
// desenho), mas nada impede de acontecer durante a partida.
function stepCost(unit, x, y) {
  return trapStepCost(unit, x, y) + waterStepCost(unit, x, y) - 1;
}

// Dijkstra (não BFS puro) porque atravessar uma armadilha inimiga custa 2 em
// vez de 1 — com custo uniforme isso se comporta exatamente como o BFS
// antigo. O tabuleiro é pequeno (13x13), então a busca linear pelo menor
// custo não visitado a cada passo é rápida o bastante sem precisar de heap.
// Guarda cameFrom/custos em lastReachableCameFrom/lastReachableCosts pra
// quem for executar o movimento de fato poder reconstruir o caminho (ver
// performMove) — necessário pra saber por quais armadilhas a unidade passou.
function computeReachable(unit) {
  const dist = new Map();
  const cameFrom = new Map();
  const visited = new Set();
  const startKey = tileKey(unit.x, unit.y);
  dist.set(startKey, 0);
  const result = [];

  while (true) {
    let currentKey = null;
    let currentDist = Infinity;
    for (const [key, d] of dist) {
      if (!visited.has(key) && d < currentDist) {
        currentDist = d;
        currentKey = key;
      }
    }
    if (currentKey === null || currentDist > unit.moveRange) break;
    visited.add(currentKey);
    const [cx, cy] = currentKey.split(",").map(Number);

    // Só entra no resultado (pode "parar aqui") se o tile estiver vazio —
    // mesmo um tile atravessado voando não é um destino válido.
    if (currentDist > 0 && !occupantAt(cx, cy)) result.push({ x: cx, y: cy });

    // Casa: pode ser destino (já entrou no result acima, se vazia), mas não
    // dá pra atravessar pra continuar o caminho — beco sem saída, igual
    // tile ocupado por unidade. currentDist > 0 é obrigatório aqui: sem
    // essa guarda, uma unidade que já COMEÇOU o turno em cima de uma casa
    // (subiu nela num turno anterior) ficaria presa lá pra sempre, incapaz
    // de sair.
    const terrainHere = terrainAt(cx, cy);
    if (currentDist > 0 && terrainHere && terrainHere.type === "house") continue;

    // Castelo/Montanha: mesma regra "pode parar, não atravessa" da casa —
    // mas só quando a única vaga da estrutura (ver structureOccupant) já é
    // a própria unidade ou está livre. Se outra unidade já ocupa, o bloqueio
    // total acontece no loop de vizinhos abaixo, antes disso ser alcançado.
    const structureHere = structureAt(cx, cy);
    if (currentDist > 0 && structureHere) continue;

    const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
    ];
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(nx, ny)) continue;
      const key = tileKey(nx, ny);
      if (visited.has(key)) continue;
      // Cadáver: pode ser atravessado normalmente (não bloqueia rota nem
      // custa movimento extra — só o custo do terreno embaixo dele conta,
      // via stepCost abaixo), mas nunca pode ser o destino final. Isso já é
      // garantido separadamente pelo "!occupantAt(cx, cy)" lá em cima (que
      // inclui cadáveres, ver occupantAt) — aqui só deixamos o BFS seguir
      // por cima dele em vez de barrar a passagem inteira.
      const occupant = unitAt(nx, ny);
      if (occupant) {
        // Aliado nunca bloqueia PASSAGEM (só não pode ser destino final —
        // isso já é garantido acima, pelo "if (!unitAt(cx, cy)) result.push"
        // só adicionar tiles vazios como parada válida). Inimigo continua
        // bloqueando, a menos que a unidade voe por cima dele.
        const sameTeam = occupant.team === unit.team;
        if (!sameTeam && !unit.flying) continue; // bloqueia passagem
      }
      // Árvore/tenda: obstáculo puro, ninguém atravessa nem "para" nela —
      // mesmo quem tem flying (esse status só cobre unidade inimiga
      // ocupando o tile, nunca terreno). Árvore destruída vira
      // "stump" (ver damageTree) — não está em BLOCKING_TERRAIN_TYPES, então
      // libera o tile automaticamente, sem precisar de nenhum código aqui.
      const terrain = terrainAt(nx, ny);
      if (terrain && BLOCKING_TERRAIN_TYPES.has(terrain.type)) continue;
      // Castelo/Montanha: exclusivo do time dono — inimigo nunca pisa no
      // castelo, herói nunca pisa na montanha, não importa se está vazio ou
      // não (bloqueio total, nem como destino de passagem). Só depois dessa
      // checagem é que a vaga única (1 unidade por vez, do próprio time) do
      // bloco de 9 tiles entra em jogo — se já tem outra unidade (do mesmo
      // time, a única que poderia estar ali) lá dentro, bloqueio total
      // também. Sem ocupante (ou é a própria unidade se movendo dentro do
      // bloco), cai no tratamento de "pode parar, não atravessa" acima
      // quando esse tile virar o "current" da vez.
      const structure = structureAt(nx, ny);
      if (structure) {
        if (structure.team !== unit.team) continue;
        const structOccupant = structureOccupant(structure);
        if (structOccupant && structOccupant !== unit) continue;
      }
      // Altura (ver elevationAt acima): só se aplica a terreno aberto —
      // Castelo/Montanha já têm suas próprias regras de acesso (checadas
      // logo acima) e não devem ficar inacessíveis pro próprio dono só
      // porque a estrutura é "alta". Precisa isentar os dois lados da
      // transição (origem OU destino sendo estrutura), não só o destino —
      // isentar só o destino deixava a unidade ENTRAR no castelo
      // normalmente mas travada lá dentro pra sempre, porque toda tentativa
      // de SAIR via um vizinho comum (destino sem estrutura, origem com
      // elevação 2/3) era barrada pelo corte de altura.
      if (!structure && !structureAt(cx, cy) && !unit.flying) {
        const heightDelta = Math.abs(elevationAt(nx, ny) - elevationAt(cx, cy));
        if (heightDelta > MAX_CLIMB_HEIGHT) continue;
      }
      const newDist = currentDist + stepCost(unit, nx, ny);
      if (newDist > unit.moveRange) continue;
      if (!dist.has(key) || newDist < dist.get(key)) {
        dist.set(key, newDist);
        cameFrom.set(key, { x: cx, y: cy });
      }
    }
  }

  lastReachableCameFrom = cameFrom;
  lastReachableCosts = dist;
  return result;
}

// Reconstrói o caminho (sem incluir o tile de partida) até (destX,destY)
// usando o cache do último computeReachable — só é confiável logo após essa
// chamada, antes de qualquer outro computeReachable rodar (é exatamente
// assim que o jogo usa: calcula, mostra os tiles, espera UM clique/decisão).
function reconstructPath(destX, destY) {
  const path = [];
  let curKey = tileKey(destX, destY);
  while (lastReachableCameFrom.has(curKey)) {
    const [x, y] = curKey.split(",").map(Number);
    path.unshift({ x, y });
    const prev = lastReachableCameFrom.get(curKey);
    curKey = tileKey(prev.x, prev.y);
  }
  return path;
}

// Aplica o efeito de armadilhas inimigas cruzadas durante um movimento: dano
// (uma vez por armadilha distinta, não por tile) e revelação da área inteira
// no primeiro gatilho. Aliados do dono nunca acionam (ver o `continue` logo
// no início do loop).
function applyTrapCrossings(unit, pathTiles) {
  if (unit.flying) return;
  const triggeredNow = new Set();
  for (const step of pathTiles) {
    for (const trap of traps) {
      if (trap.ownerTeam === unit.team || triggeredNow.has(trap)) continue;
      if (trap.tiles.some((t) => t.x === step.x && t.y === step.y)) {
        triggeredNow.add(trap);
      }
    }
  }
  for (const trap of triggeredNow) {
    const damage = Math.floor(Math.random() * 3) + 1;
    unit.hp -= damage;
    log(`${unit.name} pisa numa armadilha escondida e sofre ${damage} de dano!`);
    spawnFloatingText(unit.x, unit.y, `-${damage}`, "hit");
    playAttackFx(unit.x, unit.y, "nature", false);
    if (!trap.triggered) {
      trap.triggered = true;
      trap.turnsLeft = 3;
      log("A armadilha é revelada!");
    }
  }
  if (unit.hp <= 0) {
    unit.hp = 0;
    log(`${unit.name} foi derrotado!`);
    playSfx("death", boardPanFor(unit.x));
  }
}

// Água apaga queimadura: atravessar QUALQUER quadrado de água no caminho
// (não só terminar nele) já apaga o fogo — voando não conta (ver isOnWater,
// mesmo critério de sempre pra "tocar" a água de verdade).
function extinguishBurnOnWaterCrossing(unit, pathTiles) {
  if (unit.flying) return;
  if (!unit.statusEffects || !unit.statusEffects.some((e) => e.type === "burned")) return;
  const crossedWater = pathTiles.some((t) => {
    const terrain = terrainAt(t.x, t.y);
    return terrain && terrain.type === "water";
  });
  if (!crossedWater) return;
  unit.statusEffects = unit.statusEffects.filter((e) => e.type !== "burned");
  log(`${unit.name} atravessa a água e apaga o fogo!`);
  spawnFloatingText(unit.x, unit.y, "Fogo apagado!", "heal");
}

// Item genérico do ataque de oportunidade do Ladino — nunca aparece em
// nenhum menu, só é usado internamente por applyOpportunityAttacks.
const OPPORTUNITY_ATTACK_ITEM = {
  name: "Ataque de Oportunidade",
  icon: "🗡",
  damageMin: 1,
  damageMax: 4,
  critMultiplier: 2,
  critChance: 0,
  hitChance: 0.5,
  minRange: 1,
  maxRange: 1,
  sfx: "melee",
};

// Ataque de oportunidade (Ladino): fora do próprio turno dele, se um inimigo
// passar por um quadrado adjacente a ele (incluindo diagonais — "tangente"),
// o Ladino ataca de surpresa uma vez por movimento, mesmo sem ser sua vez.
// Reaproveita resolveSingleHit, então invisibilidade e contra-ataques do
// alvo continuam funcionando normalmente.
function applyOpportunityAttacks(unit, pathTiles) {
  const sentinels = aliveUnits().filter(
    (u) => u.hasOpportunityAttack && u !== unit && u.team !== unit.team && !isParalyzed(u)
  );
  for (const sentinel of sentinels) {
    const passesBy = pathTiles.some(
      (t) => Math.max(Math.abs(t.x - sentinel.x), Math.abs(t.y - sentinel.y)) <= 1
    );
    if (!passesBy || unit.hp <= 0) continue;
    // Mesma espera do contra-ataque (ver REACTION_ATTACK_DELAY): deixa o
    // deslize do movimento terminar de acontecer na tela antes do golpe de
    // oportunidade começar, em vez de os dois parecerem ao mesmo tempo.
    setTimeout(() => {
      if (unit.hp <= 0 || sentinel.hp <= 0) return;
      log(`${sentinel.name} aproveita a brecha e ataca ${unit.name} de surpresa!`);
      playSfx("counter", boardPanFor(sentinel.x));
      resolveSingleHit(sentinel, unit, OPPORTUNITY_ATTACK_ITEM);
      // O golpe de oportunidade pode matar quem se moveu DEPOIS do check de
      // fim de turno original (que já rodou antes desse atraso) — refaz o
      // check agora, senão o turno de um `currentActor` morto ficava travado.
      render();
      checkBattleOutcome();
      if (isHumanControlled(currentActor.team) && !battleEnded) {
        checkEndCurrentTurn();
      }
    }, REACTION_ATTACK_DELAY);
  }
  if (unit.hp <= 0) {
    unit.hp = 0;
  }
}

// Executa o movimento de fato (usado tanto pelo clique do jogador quanto
// pela IA): reconstrói o caminho de verdade (não só a distância em linha
// reta) pra cobrar o custo certo de CT e checar armadilhas no percurso.
function performMove(unit, dest) {
  const path = reconstructPath(dest.x, dest.y);
  const cost = lastReachableCosts.get(tileKey(dest.x, dest.y)) ?? manhattan(unit, dest);
  setFacingTowards(unit, dest);
  unit.x = dest.x;
  unit.y = dest.y;
  unit.hasMoved = true;
  unit.ct -= moveCtCost(unit, cost);
  log(`${unit.name} se moveu para (${dest.x}, ${dest.y}).`);
  playSfx("move", boardPanFor(dest.x));
  applyTrapCrossings(unit, path);
  extinguishBurnOnWaterCrossing(unit, path);
  if (unit.hp > 0) applySoulPickups(unit, path);
  if (unit.hp > 0) applyOpportunityAttacks(unit, path);
}

// Tiles são caros de recriar (createElement + addEventListener + appendChild
// pros 169 quadrados do tabuleiro, toda vez que render() rodava) — isso
// causava a gagueira visível bem no instante de um ataque, já que
// finalizeAction chama render() de novo assim que a arma resolve. Como o
// grid é fixo (só x/y mudam de dono, nunca a posição do próprio <div>),
// cada tile é criado e tem seu listener ligado UMA vez só (ver
// getOrCreateTile) e reaproveitado entre renders — só o conteúdo (classe e
// filhos) é recalculado a cada chamada, igual antes.
const tileEls = new Map();
function getOrCreateTile(x, y) {
  const key = `${x},${y}`;
  let tile = tileEls.get(key);
  if (tile) return tile;
  tile = document.createElement("div");
  tile.dataset.x = x;
  tile.dataset.y = y;
  tile.addEventListener("click", () => onTileClick(x, y));
  boardEl.appendChild(tile);
  tileEls.set(key, tile);
  return tile;
}

function render() {
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const tile = getOrCreateTile(x, y);
      tile.className = `tile grass-${terrainVariant(x, y, 4) + 1}`;
      tile.innerHTML = "";

      if (reachableTiles.some((t) => t.x === x && t.y === y)) {
        tile.classList.add("movable");
      }
      if (attackableTiles.some((t) => t.x === x && t.y === y)) {
        tile.classList.add("attackable");
      }
      if (telegraphTiles.some((t) => t.x === x && t.y === y)) {
        tile.classList.add("telegraph");
      }
      if (aoePreviewTiles.some((t) => t.x === x && t.y === y)) {
        tile.classList.add("aoe-preview");
        // Faixas cardeais em cruz (Destruição Rastejante e Tacar Tronco, ambas 3 de largura até a borda) são
        // bem maiores que um raio de explosão normal — marca com uma classe
        // à parte pra poder estilizar diferente (ver style.css) e o jogador
        // não confundir com uma área pequena centrada num ponto.
        const bandMode = pendingWeapon && (pendingWeapon.targetMode === "creeping-line" || pendingWeapon.targetMode === "cardinal-blast");
        if (bandMode) {
          tile.classList.add("aoe-preview-band");
        }
      }
      // Armadilha (Ladino): só desenha os tiles dela depois de acionada — ver
      // applyTrapCrossings. Enquanto não pisada, fica de propósito invisível.
      if (traps.some((trap) => trap.triggered && trap.tiles.some((t) => t.x === x && t.y === y))) {
        tile.classList.add("trap-tile");
      }
      // Alma (ver decayCorpses/applySoulPickups): sempre visível, ninguém
      // precisa "descobrir" ela como as armadilhas.
      if (souls.some((s) => s.x === x && s.y === y)) {
        tile.classList.add("soul-tile");
      }
      // Terreno estático (árvore/água/casa) — ver terrainMap/TERRAIN_LAYOUT.
      // Um <div> filho de verdade, não ::before/::after (esses dois já são
      // usados por trap-tile/soul-tile/status), e não a própria background
      // do .tile (que .movable/.attackable/.current-turn resetam via
      // shorthand `background`) — assim o ícone nunca some quando o tile
      // também está em destaque de movimento/ataque.
      const terrain = terrainAt(x, y);
      const structure = structureAt(x, y);
      if (terrain) {
        tile.classList.add(`terrain-${terrain.type}`);
        if (terrain.type === "water") {
          const mask = waterNeighborMask(x, y);
          for (const [edge, connected] of Object.entries(mask)) {
            if (!connected) tile.classList.add(`water-edge-${edge}`);
          }
          tile.classList.add(`water-shape-${terrainVariant(x, y, 4) + 1}`);
          if (x === WATERFALL_TILE.x && y === WATERFALL_TILE.y) {
            tile.classList.add("waterfall-tile");
          }
          tile.style.setProperty("--water-phase-x", `${x * -19}px`);
          tile.style.setProperty("--water-phase-y", `${y * -13}px`);
        }
        const icon = document.createElement("div");
        icon.className = "terrain-icon";
        if (terrain.type === "tree" || terrain.type === "tent") {
          icon.style.backgroundImage = `url("assets/tiles/${terrain.art}")`;
        } else if (terrain.type === "house") {
          icon.style.backgroundImage = `url("assets/tiles/house.png")`;
        } else if (terrain.type === "stump") {
          icon.style.backgroundImage = `url("assets/tiles/stump.png")`;
        } else if (terrain.type === "house-rubble" || terrain.type === "tent-rubble") {
          icon.style.backgroundImage = `url("assets/tiles/rubble-castle.png")`;
        }
        // A cachoeira já contém toda a água necessária no próprio asset e
        // nos seus efeitos animados. Não desenha o quadrado genérico do rio
        // por baixo dela, pois ele ofusca a queda d'água no primeiro tile.
        const isWaterTile = terrain.type === "water";
        // O rio 2D agora é uma faixa SVG única e contínua. Manter os antigos
        // ícones quadrados de água por tile por baixo dela criava retângulos
        // escuros nas curvas e emendas. O terreno continua sendo `water` em
        // toda a lógica; removemos somente essa representação visual antiga.
        if (!isWaterTile) tile.appendChild(icon);
      }

// Flor: puramente decorativa (sem bloqueio, sem popup, sem efeito de
      // jogo) — por isso não entra em terrainMap/TERRAIN_LAYOUT, só decide
      // a arte por cima da grama normal quando o tile está livre de tudo.
      if (!terrain && !structure) {
        const flower = FLOWER_LAYOUT.find((f) => f.x === x && f.y === y);
        if (flower) {
          const flowerIcon = document.createElement("div");
          flowerIcon.className = "flower-icon";
          flowerIcon.style.backgroundImage = `url("assets/tiles/${flower.art}")`;
          tile.appendChild(flowerIcon);
        }
      }

      const occupant = unitAt(x, y);
      if (occupant) {
        // O ícone/seta/badge da unidade em si vive no token persistente (ver
        // renderUnitTokens) — aqui só o realce do CHÃO embaixo dela.
        if (occupant === currentActor) {
          tile.classList.add("current-turn");
        }
        if (selectedUnit === occupant) {
          tile.classList.add("selected");
        }
        if (isPoisoned(occupant)) {
          tile.classList.add("poisoned");
        }
        if (isRooted(occupant)) {
          tile.classList.add("status-rooted");
        }
        if (isParalyzed(occupant)) {
          tile.classList.add("status-paralyzed");
        }
      }

      // Castelo/Montanha: o sprite em si é desenhado uma vez só por cima
      // (ver renderStructures/#structure-layer, não por tile) — aqui só
      // marca o tile como parte da estrutura pra cursor/hover ficarem
      // consistentes com árvore/casa.
      if (structure) {
        tile.classList.add("structure-tile");
      }
    }
  }

  renderStructures();
  renderUnitTokens();
  renderWaterForeground();
  updateHud();
  renderTurnControls();
}

// Castelo/Montanha: sprite único cobrindo o bloco 3x3 inteiro, numa camada
// própria (não filho de nenhum .tile) — assim não corre risco de ser cortado
// se um dia o .tile ganhar um clip-path (ver plano do tabuleiro isométrico).
function renderStructures() {
  structureLayerEl.innerHTML = "";
  for (const s of structures) {
    const el = document.createElement("div");
    el.className = `structure structure-${s.type}${s.destroyed ? " destroyed" : ""}`;
    const minX = Math.min(...s.tiles.map((t) => t.x));
    const minY = Math.min(...s.tiles.map((t) => t.y));
    el.style.left = `${(minX / BOARD_SIZE) * 100}%`;
    el.style.top = `${(minY / BOARD_SIZE) * 100}%`;
    el.style.width = `${(3 / BOARD_SIZE) * 100}%`;
    el.style.height = `${(3 / BOARD_SIZE) * 100}%`;
    structureLayerEl.appendChild(el);
  }

  // A cachoeira vive nesta camada, acima do SVG contínuo do rio. Quando era
  // filha do tile, o traçado azul do rio (camada irmã superior) passava por
  // cima do sprite e formava um quadrado azul sobre a queda d'água.
  const waterfallIcon = document.createElement("div");
  waterfallIcon.className = "waterfall-icon waterfall-world-icon";
  waterfallIcon.style.backgroundImage = `url("assets/tiles/waterfall.png")`;
  waterfallIcon.style.left = `${((WATERFALL_TILE.x - 0.08) / BOARD_SIZE) * 100}%`;
  waterfallIcon.style.top = `${((WATERFALL_TILE.y - 1.15) / BOARD_SIZE) * 100}%`;
  waterfallIcon.style.width = `${(1.16 / BOARD_SIZE) * 100}%`;
  waterfallIcon.style.height = `${(2.2 / BOARD_SIZE) * 100}%`;
  const waterfallFlow = document.createElement("span");
  waterfallFlow.className = "waterfall-flow";
  const waterfallRunoff = document.createElement("span");
  waterfallRunoff.className = "waterfall-runoff";
  waterfallIcon.append(waterfallFlow, waterfallRunoff);
  structureLayerEl.appendChild(waterfallIcon);
}

// Cria (se ainda não existir) o token persistente de uma unidade e devolve o
// elemento — reaproveitado em todo render enquanto ela estiver viva, pra que
// a transição de CSS em left/top anime o movimento suavemente.
function getOrCreateUnitToken(unit) {
  let el = unitTokenEls.get(unit);
  if (el) return el;

  el = document.createElement("div");
  el.className = "unit-token";
  el.innerHTML = `
    <div class="unit-token-inner">
      <div class="status-vfx" aria-hidden="true">
        <i class="burn-layer burn-layer-back"></i>
        <i class="burn-layer burn-layer-front"></i>
        <i class="burn-embers"></i>
        <i class="frozen-layer frozen-layer-back"></i>
        <i class="frozen-layer frozen-layer-front"></i>
        <i class="frozen-shards"></i>
        <i class="regen-layer regen-layer-back"></i>
        <i class="regen-layer regen-layer-front"></i>
        <i class="regen-motes"></i>
        <i class="regen-pulse"></i>
        <i class="invisible-layer invisible-layer-back"></i>
        <i class="invisible-layer invisible-layer-front"></i>
        <i class="invisible-fragments"></i>
        <i class="stun-layer stun-layer-back"></i>
        <i class="stun-layer stun-layer-front"></i>
        <i class="stun-sparks"></i>
        <i class="fury-layer fury-layer-back"></i>
        <i class="fury-layer fury-layer-front"></i>
        <i class="fury-fragments"></i>
        <i class="fury-pulse"></i>
        <i class="blind-shadow"></i>
        <i class="electric-arcs"></i>
        <i class="drain-wisps"></i>
        <i class="root-layer root-layer-back"></i>
        <i class="root-layer root-layer-front"></i>
        <i class="drag-lines"></i>
        <i class="evasive-lines"></i>
        <i class="guarding-barrier"></i>
        <i class="poison-layer poison-layer-back"></i>
        <i class="poison-layer poison-layer-front"></i>
        <i class="poison-bubbles"></i>
        <i class="poison-burst"></i>
        <i class="bleed-drops"></i>
        <i class="bleed-splash"></i>
        <span class="status-vfx-glyph"></span>
      </div>
      <div class="unit-legs"></div>
      <div class="unit-body"></div>
      <span class="unit-token-icon"></span>
      <span class="facing-arrow"></span>
      <div class="status-badge"></div>
    </div>
  `;
  if (unit.bodyColor) {
    el.style.setProperty("--body-color", unit.bodyColor);
  }
  // Atraso negativo aleatório na animação de "respiração" (unit-idle, ver
  // CSS) — sem isso todo mundo balançaria em sincronia perfeita, o que
  // parece menos "vivo", não mais.
  el.querySelector(".unit-token-inner").style.animationDelay = `-${Math.random() * 2.4}s`;
  unitLayerEl.appendChild(el);
  unitTokenEls.set(unit, el);
  unitLastPos.set(unit, { x: unit.x, y: unit.y });
  el.style.left = `${((unit.x + 0.5) / BOARD_SIZE) * 100}%`;
  el.style.top = `${((unit.y + 0.5) / BOARD_SIZE) * 100}%`;

  // Se existir um sprite de verdade pra essa unidade (ver SPRITE_MANIFEST),
  // troca o "bonequinho" de CSS por ele assim que os frames carregarem — sem
  // travar a criação do token nem quebrar nada se os arquivos não existirem
  // (loadSpriteFrames devolve null e nada muda, mantendo o visual de CSS de
  // sempre). Se existir mais de um frame de idle, começa o ciclo de
  // "respiração" de verdade (ver startIdleCycle) em vez do leve balanço de
  // CSS; com só 1 frame, fica parado ali mesmo (idêntico ao comportamento
  // antigo, só trocando de função internamente).
  loadSpriteFrames(unit).then((frames) => {
    if (!frames || !unitTokenEls.has(unit)) return;
    const inner = el.querySelector(".unit-token-inner");
    const sprite = document.createElement("img");
    sprite.className = "unit-sprite-img";
    // Pose parada já na direção que a unidade nasce virada (ver
    // pickIdleDirectionUrl) — não o frame de frente fixo de antes.
    sprite.src = pickIdleDirectionUrl(unit, frames);
    sprite.alt = "";
    inner.insertBefore(sprite, inner.querySelector(".unit-token-icon"));
    inner.classList.add("has-sprite");
    // Marca especificamente quem tem frames de morte de verdade — só esses
    // devem desligar a queda/pose deitada de CSS (ver .has-death-frames no
    // CSS); quem só tem idle (ex: Xamã, por enquanto) continua caindo com o
    // efeito de sempre, sem regressão.
    if (frames.death.length > 0) inner.classList.add("has-death-frames");
    unitSpriteState.set(unit, { frames, idleTimer: null, actionPlaying: false });
    startIdleCycle(unit);
  });

  return el;
}

// Atualiza o conteúdo visual (ícone, tinta, invisibilidade, seta de direção,
// badge de status) de um token já existente — chamado todo render.
function updateUnitTokenContent(unit, el) {
  // Unidades voadoras passam visualmente acima da lâmina frontal da água;
  // elas não ficam submersas nem recebem a máscara aquática.
  el.classList.toggle("flying-unit", !!unit.flying);
  const iconSpan = el.querySelector(".unit-token-icon");
  iconSpan.textContent = unit.icon;
  iconSpan.className = `unit-token-icon ${unit.iconTint || ""}`;
  iconSpan.classList.toggle("stealth-icon", isInvisible(unit));
  const tokenInner = el.querySelector(".unit-token-inner");
  tokenInner.dataset.statusFacing = unit.facing || "down";
  tokenInner.classList.toggle("optical-cloaked", isInvisible(unit));
  tokenInner.classList.toggle("visually-dazed", isDazed(unit));
  tokenInner.classList.toggle("visually-furious", !!unit.statusEffects?.some((effect) => effect.type === "fury"));
  for (const type of ["slowed", "evasive", "guarding", "paralyzed", "weakened"]) {
    tokenInner.classList.toggle(`visually-${type}`, !!unit.statusEffects?.some((effect) => effect.type === type));
  }

  const arrowSpan = el.querySelector(".facing-arrow");
  if (unit.facing) {
    arrowSpan.textContent = facingArrowSymbol(unit.facing);
    arrowSpan.classList.remove("hidden-arrow");
  } else {
    arrowSpan.classList.add("hidden-arrow");
  }

  // Conecta a pose parada com a direção que a unidade ficou virada (ver
  // setFacingTowards, chamado depois de mover/atacar/lançar magia) — só
  // fora de uma ação em andamento, senão pisaria nos frames de andar/
  // atacar/dano/morte que playSpriteAction está tocando (ver
  // state.actionPlaying) ou num cadáver ainda não ressuscitado.
  const spriteState = unitSpriteState.get(unit);
  if (spriteState && !spriteState.actionPlaying && unit.hp > 0) {
    setIdlePose(unit);
  }

  const badge = el.querySelector(".status-badge");
  const displayEffects = displayStatusEffects(unit);
  if (displayEffects.length > 0) {
    // Submerso (turnsLeft null, ver submergedPseudoEffect) mostra o ícone
    // em vez de contador — não tem "quantos turnos faltam", já que some
    // sozinho ao sair da água.
    badge.textContent = displayEffects
      .map((e) => {
        const remaining = statusEffectRemainingTurns(e);
        return remaining == null ? statusEffectIcon(e.type) : remaining;
      })
      .join(",");
    badge.title = displayEffects
      .map((e) => {
        const remaining = statusEffectRemainingTurns(e);
        return remaining == null
          ? `${statusEffectLabel(e.type)}${statusEffectDetail(e)}`
          : `${statusEffectLabel(e.type)}: ${remaining} turno(s)${statusEffectDetail(e)}`;
      })
      .join(" | ");
    badge.classList.remove("hidden-badge");
  } else {
    // Limpa o texto/tooltip (não só esconde) — sem isso, um contador de
    // morte (💀N, setado direto por applyCorpseDecayTick) ficava "gravado"
    // no badge até a próxima vez que algum statusEffect de verdade o
    // sobrescrevesse, mesmo depois de ressuscitado.
    badge.textContent = "";
    badge.title = "";
    badge.classList.add("hidden-badge");
  }
  updateStatusVfxElement(unit, el, performance.now());
}

// Rastro de poeira: acompanha a posição REAL do token (via
// getBoundingClientRect a cada frame) enquanto ele desliza pela transição
// de left/top, largando uma faísca de poeira a cada ~70ms. Segue a
// trajetória de verdade em vez de recalcular o caminho pelo tabuleiro, então
// funciona igual não importa se o movimento é reto ou em L.
function spawnMoveTrail(el, durationSec) {
  const totalMs = durationSec * 1000;
  const startTime = performance.now();
  let lastSpawn = -Infinity;
  function step(now) {
    const elapsed = now - startTime;
    if (elapsed - lastSpawn >= 70 && elapsed < totalMs - 40) {
      lastSpawn = elapsed;
      const rect = el.getBoundingClientRect();
      const overlayRect = boardOverlayEl.getBoundingClientRect();
      if (overlayRect.width > 0 && overlayRect.height > 0) {
        const xPct = ((rect.left + rect.width / 2 - overlayRect.left) / overlayRect.width) * 100;
        const yPct = ((rect.top + rect.height - overlayRect.top) / overlayRect.height) * 100;
        spawnDustPuff(xPct, yPct);
      }
    }
    if (elapsed < totalMs) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function spawnDustPuff(xPct, yPct) {
  const el = document.createElement("div");
  el.className = "dust-puff";
  el.style.left = `${xPct}%`;
  el.style.top = `${yPct}%`;
  boardOverlayEl.appendChild(el);
  setTimeout(() => el.remove(), 420);
}

// Sincroniza os tokens com o estado atual de todas as unidades: reposiciona
// (com transição — duração maior quanto mais longe o passo, pra um deslize
// mais natural em movimentos longos), atualiza o conteúdo, e inicia o
// desaparecimento de quem acabou de morrer (por qualquer causa: combate,
// veneno, armadilha etc. — não só ataques resolvidos por resolveSingleHit).
function renderUnitTokens() {
  for (const unit of units) {
    if (unit.hp <= 0) continue;
    const el = getOrCreateUnitToken(unit);
    // "corpse" some daqui — não só "dying" — pra cobrir a Ressurreição:
    // sem isso, o token de quem voltou à vida ficava deitado/acinzentado
    // pra sempre (a classe .corpse não se remove sozinha, ver CSS).
    const wasDeadToken = el.classList.contains("dying") || el.classList.contains("corpse");
    el.classList.remove("dying", "corpse");
    // Quem tem sprite de verdade ficou com o <img> travado no último frame
    // de morte (playSpriteAction usa holdLastFrame:true pra isso, ver
    // renderUnitTokens mais abaixo) — remover a classe não muda o src da
    // imagem sozinho, então sem isso a ressurreição continuava "deitada" na
    // tela mesmo já de pé por baixo (ver isCriticallyHurt/castResurrect).
    if (wasDeadToken) {
      const state = unitSpriteState.get(unit);
      if (state && state.frames) {
        state.actionPlaying = false;
        setIdlePose(unit);
        startIdleCycle(unit);
      }
    }

    const last = unitLastPos.get(unit);
    const dist = Math.abs(last.x - unit.x) + Math.abs(last.y - unit.y);
    if (dist > 0) {
      const moveDirectionX = Math.sign(unit.x - last.x) || (unit.facing === "left" ? -1 : 1);
      const durationSec = Math.min(0.15 + dist * 0.07, 0.6);
      el.style.transitionDuration = `${durationSec}s`;
      el.style.left = `${((unit.x + 0.5) / BOARD_SIZE) * 100}%`;
      el.style.top = `${((unit.y + 0.5) / BOARD_SIZE) * 100}%`;
      unitLastPos.set(unit, { x: unit.x, y: unit.y });
      spawnMoveTrail(el, durationSec);
      playSpriteAction(unit, "walk", durationSec * 1000);
      const inner = el.querySelector(".unit-token-inner");
      inner.style.setProperty("--status-trail-x", `${-moveDirectionX}`);
      inner.classList.add("status-motion-active");
      setTimeout(() => inner.classList.remove("status-motion-active"), durationSec * 1000 + 80);
    }

    updateUnitTokenContent(unit, el);
  }

  for (const [unit, el] of unitTokenEls) {
    if (unit.hp <= 0 && !el.classList.contains("dying") && !el.classList.contains("corpse")) {
      el.classList.add("dying");
      // Marca o instante da morte — decayCorpses() (chamado em
      // advanceToNextTurn, uma vez por troca de turno global) conta a
      // partir daqui até o corpo sumir de vez, e é a mesma janela que a
      // Ressurreição usa pra saber se ainda dá tempo de trazer alguém de
      // volta (ver deadUnitAt).
      unit.turnsSinceDeath = 0;
      spawnDeathParticles(unit.x, unit.y);
      // Quem tem sprite de verdade toca a sequência de frames de morte (ver
      // .has-sprite no CSS, que desliga a queda/deitada de CSS pra esse
      // caso) — holdLastFrame:true trava no último frame (o cadáver
      // deitado desenhado de propósito) em vez de voltar a "respirar".
      playSpriteAction(unit, "death", 700, true);
      setTimeout(() => {
        // Se a unidade "reviveu" (reinício de partida, ou de verdade via
        // Ressurreição antes do corpo terminar de cair) antes da animação
        // terminar, só cancela a queda em vez de virar cadáver.
        if (unit.hp > 0) {
          el.classList.remove("dying");
          return;
        }
        // Vira cadáver: fica deitado e visível no campo (não some mais
        // sozinho) até decayCorpses() removê-lo de vez, 3 turnos depois.
        el.classList.remove("dying");
        el.classList.add("corpse");
        const badge = el.querySelector(".status-badge");
        if (badge) {
          badge.textContent = "💀3";
          badge.title = "3 turno(s) restante(s) pra ressuscitar";
          badge.classList.remove("hidden-badge");
        }
      }, 700);
    }
  }
}

// Rastreia quem já "jogou" na rodada atual (ver beginTurnFor) — quando
// todo mundo que está vivo agora já tiver aparecido aqui uma vez, uma
// RODADA completa aconteceu e todo cadáver ainda na janela de ressurreição
// avança 1 na contagem regressiva (ver advanceCorpseDecayForRound). Isso é
// de propósito independente da agilidade/CT de quem já morreu — antes o
// cadáver tinha seu próprio "turno" correndo na mesma corrida de CT de
// quem está vivo, o que fazia cadáveres de unidades rápidas decair mais
// rápido que os de unidades lentas; agora todo cadáver decai no mesmo
// ritmo, ditado só por quantas vezes o time inteiro já jogou.
const roundActedUnits = new Set();
function noteUnitActedThisRound(unit) {
  roundActedUnits.add(unit);
  const currentlyAlive = aliveUnits();
  if (currentlyAlive.length === 0 || !currentlyAlive.every((u) => roundActedUnits.has(u))) return;
  roundActedUnits.clear();
  advanceCorpseDecayForRound();
}

// Chamado por noteUnitActedThisRound quando uma rodada completa termina —
// roda uma vez pra CADA cadáver ainda na janela de ressurreição (podem ser
// vários ao mesmo tempo, todos avançam juntos). O contador mostrado
// (badge) vai de 3 até 0 — o 0 também é uma rodada de verdade, exibida
// antes do corpo virar alma; só na PRÓXIMA rodada (a 4ª) é que ele se
// dissipa de vez.
function advanceCorpseDecayForRound() {
  for (const unit of units) {
    if (unit.hp > 0 || unit.turnsSinceDeath === undefined) continue;
    applyCorpseDecayTick(unit);
  }
}

function applyCorpseDecayTick(unit) {
  unit.turnsSinceDeath += 1;
  log(`${unit.name} está morto(a) e perde mais uma rodada de ressurreição!`);
  const el = unitTokenEls.get(unit);
  if (unit.turnsSinceDeath > 3) {
    if (el) {
      el.remove();
      unitTokenEls.delete(unit);
    }
    unitLastPos.delete(unit);
    unit.turnsSinceDeath = undefined;
    // O corpo não foi ressuscitado a tempo — vira alma. Se por acaso já
    // tiver alguém exatamente naquele tile agora (corpos não bloqueiam
    // movimento, então isso é possível), cura na hora em vez de deixar
    // uma alma "por baixo" de quem já está ali.
    const occupant = unitAt(unit.x, unit.y);
    if (occupant) {
      const healed = Math.min(10, occupant.maxHp - occupant.hp);
      occupant.hp = Math.min(occupant.hp + 10, occupant.maxHp);
      let text = `+${healed}`;
      if (occupant.maxMp !== undefined) {
        const restoredMp = Math.min(5, occupant.maxMp - occupant.mp);
        occupant.mp = Math.min(occupant.mp + 5, occupant.maxMp);
        text += ` / +${restoredMp} MP`;
      }
      log(`A alma de ${unit.name} se dissipa em ${occupant.name}, que recupera ${healed} de vida${occupant.maxMp !== undefined ? " e MP" : ""}.`);
      spawnFloatingText(occupant.x, occupant.y, text, "heal");
      spawnImpactEffect(occupant.x, occupant.y, "heal");
      spawnHitParticles(occupant.x, occupant.y, "#6fe08a", 8);
      playSfx("soulPickup", boardPanFor(occupant.x));
    } else {
      souls.push({ x: unit.x, y: unit.y });
      log(`O corpo de ${unit.name} se dissipa, deixando uma alma pra trás.`);
      playSfx("soulRise", boardPanFor(unit.x));
    }
    return;
  }
  const badge = el && el.querySelector(".status-badge");
  if (badge) {
    const turnsLeft = 3 - unit.turnsSinceDeath;
    badge.textContent = `💀${turnsLeft}`;
    badge.title = `${turnsLeft} turno(s) restante(s) pra ressuscitar`;
  }
}

// Alma cura 10 HP de quem passar por ela OU parar em cima (mesmo espírito
// de applyTrapCrossings, chamada junto dela em performMove) — some depois
// de curar uma vez, não é reutilizável.
function applySoulPickups(unit, pathTiles) {
  const collected = souls.filter((s) => pathTiles.some((t) => t.x === s.x && t.y === s.y));
  if (collected.length === 0) return;
  souls = souls.filter((s) => !collected.includes(s));
  for (const soul of collected) {
    const healed = Math.min(10, unit.maxHp - unit.hp);
    unit.hp = Math.min(unit.hp + 10, unit.maxHp);
    let text = `+${healed}`;
    if (unit.maxMp !== undefined) {
      const restoredMp = Math.min(5, unit.maxMp - unit.mp);
      unit.mp = Math.min(unit.mp + 5, unit.maxMp);
      text += ` / +${restoredMp} MP`;
    }
    log(`${unit.name} encontra uma alma no campo de batalha e recupera ${healed} de vida${unit.maxMp !== undefined ? " e MP" : ""}.`);
    spawnFloatingText(soul.x, soul.y, text, "heal");
    spawnImpactEffect(soul.x, soul.y, "heal");
    spawnHitParticles(soul.x, soul.y, "#6fe08a", 8);
    playSfx("soulPickup", boardPanFor(soul.x));
  }
}

// Quem pode ser alvo da Ressurreição: morto há menos de 3 turnos (o cadáver
// ainda está visível no campo). Separado de unitAt/aliveUnits de propósito
// — aqueles dois continuam só-vivos em todo o resto do jogo (movimento,
// mira, IA...), então nada preexistente muda de comportamento por causa
// dos cadáveres agora ficarem no tabuleiro.
function deadUnitAt(x, y) {
  return units.find((u) => u.hp <= 0 && u.turnsSinceDeath !== undefined && u.x === x && u.y === y) || null;
}

// Punhado de "cinzas" subindo e se dissolvendo no instante da morte — igual
// espírito de spawnHitParticles, mas com deriva pra cima (em vez de explodir
// pros lados) e vida mais longa, pra combinar com o unit-dying mais lento.
function spawnDeathParticles(x, y) {
  const pos = tileScreenPercent(x + 0.5, y + 0.5, 0.9);
  const cx = pos.leftPct;
  const cy = pos.topPct;
  const count = 12;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "death-particle";
    const size = 4 + Math.random() * 4;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.left = `${cx}%`;
    el.style.top = `${cy}%`;
    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 26;
    const dx = Math.cos(angle) * dist * 0.6;
    const dy = -Math.abs(Math.sin(angle) * dist) - 14;
    el.style.setProperty("--dx", `${dx}px`);
    el.style.setProperty("--dy", `${dy}px`);
    boardOverlayEl.appendChild(el);
    setTimeout(() => el.remove(), 800);
  }
}

// Zera todos os tokens instantaneamente (sem transição) — usado só no início
// de uma nova partida, pra unidades reaparecerem direto na posição sorteada
// em vez de "deslizarem" pelo tabuleiro inteiro vindas da partida anterior.
function resetUnitTokens() {
  unitLayerEl.innerHTML = "";
  unitTokenEls.clear();
  unitLastPos.clear();
}

// Ataque Giratório etc. usam translate(0,0) porque atacam ao redor de si
// mesmo, sem um alvo único — nesses casos o "lunge" não se aplica; só armas
// corpo a corpo de alvo único avançam de verdade, o resto (à distância/magia)
// recebe um pulso de escala no lugar.
// Toca uma animação de ação (lunge/cast-pulse/hit-shake) e agenda a
// remoção da classe no fim — sem isso ela ficaria pra sempre no elemento
// (CSS não some sozinho) e, por ter mais especificidade que a regra base,
// travaria a animação de "respiração" (unit-idle) naquela unidade pro
// resto da partida depois do primeiro golpe.
function playTransientAnimation(inner, className, durationMs) {
  inner.classList.remove(className);
  inner.style.animationDuration = durationMs + "ms";
  void inner.offsetWidth; // força reflow pra poder tocar a mesma animação de novo em sequência
  inner.classList.add(className);
  setTimeout(() => {
    inner.classList.remove(className);
    inner.style.animationDuration = "";
  }, durationMs);
}

// Cada "família" de arma corpo a corpo tem seu próprio golpe (ver
// @keyframes unit-attack-slash/stab/blunt no CSS) em vez de todo mundo usar
// o mesmo "lunge" genérico — talho (espadas) arqueia bem mais que estocada
// (adagas/punhal), que é rápida e quase sem rotação; concussão (machados,
// tacape, cajado) tem um preparo maior e um "peso" no final. Arma sem
// `swing` marcado (ver campo em WEAPONS) cai no lunge genérico de sempre.
// trailDelay ~= o instante do "impacto" dentro de cada @keyframes (o pico
// de translate/rotate lá no CSS) — é quando spawnWeaponTrail() deve disparar
// pra parecer que a arma de verdade passou ali, não antes nem depois.
const MELEE_SWING_CLASSES = {
  slash: { cls: "swing-slash", duration: 400, trailDelay: 170 },
  stab: { cls: "swing-stab", duration: 300, trailDelay: 110 },
  blunt: { cls: "swing-blunt", duration: 500, trailDelay: 260 },
};
const ATTACK_PLAYBACK_RATE = 0.3;
const scaledAttackDuration = (durationMs) => Math.round(durationMs / ATTACK_PLAYBACK_RATE);

// Contra-ataque e ataque de oportunidade não podem começar "em cima" do
// golpe/movimento que os disparou — dá tempo de ver o golpe original (maior
// swing dura 500ms) ou o deslize do movimento (até 600ms, ver renderUnitTokens)
// acontecer antes da reação começar a própria animação.
const REACTION_ATTACK_DELAY = 650;
// Todo nome de classe de golpe corpo a corpo possível (as 3 acima + o lunge
// genérico) — limpos todos ANTES de tocar um novo golpe. Sem isso, dois
// ataques corpo a corpo em sequência rápida (ex: contra-ataque logo depois
// do próprio golpe) podiam deixar a classe do golpe anterior "grudada" no
// elemento até seu próprio timer (mais longo) terminar, mesmo depois do
// golpe novo já ter acabado.
// "lunge"/draw-release entram na mesma lista de limpeza que os swings —
// qualquer classe de movimento de ataque precisa ser removida antes de uma
// nova começar, não só as 3 de corpo a corpo.
const ALL_ATTACK_MOTION_CLASSES = [...Object.values(MELEE_SWING_CLASSES).map((s) => s.cls), "lunge", "draw-release"];

function attackSpriteActionKey(unit, item) {
  // `cast` continua suportado como fallback opcional em playSpriteAction,
  // mas todos os assets atuais já usam a sequência real de attack para
  // preparar, executar e recuperar a ação — inclusive Mago e Químico.
  return "attack";
}

// Uma única camada visual na frente dos tokens, criada a cada render do
// tabuleiro (no máximo os poucos tiles de água). Ela não é filha de casa,
// tenda ou estrutura: por isso somente unidades que cruzam água ficam
// parcialmente cobertas. Como o token já possui transition de posição, ele
// atravessa essa máscara de forma contínua ao entrar/sair do rio.
function renderWaterForeground() {
  waterForegroundLayerEl.innerHTML = "";
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (terrainAt(x, y)?.type !== "water") continue;
      // A máscara frontal serve para submergir unidades no rio, mas no tile
      // da cachoeira ela também cobria o sprite da queda. A regra do terreno
      // continua sendo água; somente essa camada visual é omitida.
      if (x === WATERFALL_TILE.x && y === WATERFALL_TILE.y) continue;
      // Não desenha uma máscara retangular em cada pedaço vazio do rio. Ela
      // só é necessária quando existe uma unidade terrestre naquele tile;
      // assim o curso SVG permanece contínuo e sem blocos/sombras nas curvas.
      const corpse = deadUnitAt(x, y);
      if (corpse) break;
      const occupant = unitAt(x, y);
      if (!occupant || occupant.hp <= 0 || occupant.flying) continue;
      const front = document.createElement("div");
      front.className = "water-foreground";
      front.style.left = `${(x / BOARD_SIZE) * 100}%`;
      front.style.top = `${(y / BOARD_SIZE) * 100}%`;
      front.style.width = `${100 / BOARD_SIZE}%`;
      front.style.height = `${100 / BOARD_SIZE}%`;
      front.style.setProperty("--water-phase-x", `${x * -19}px`);
      front.style.setProperty("--water-phase-y", `${y * -13}px`);
      waterForegroundLayerEl.appendChild(front);
    }
  }
}

function playAttackAnimation(attacker, defender, item) {
  rememberCombatVfxProfile(attacker, defender, item);
  const el = unitTokenEls.get(attacker);
  if (!el) return;
  const inner = el.querySelector(".unit-token-inner");
  // maxRange===1 cobre o golpe de alvo único de sempre; item.swing cobre a
  // exceção (Tronco do Troll: mesma arma física, mas maxRange 2 porque
  // acerta em linha) — se a arma foi marcada com um swing, ela SEMPRE
  // merece o golpe de verdade em vez do cast-pulse genérico, não importa o
  // alcance.
  const isMeleeAttack = item.mpCost === undefined && !item.aerial && defender && (item.maxRange === 1 || item.swing);
  // Arma à distância "de verdade" (arco, besta, funda, arma de fogo, Raio
  // de Gelo do Mago): sem custo de MP, alcance >1 e sem swing marcado —
  // ganha o próprio "puxar e soltar" em vez de compartilhar o cast-pulse
  // genérico com magia de verdade.
  const isRangedWeaponAttack = !isMeleeAttack && item.mpCost === undefined && item.maxRange > 1 && defender;
  const spriteActionKey = attackSpriteActionKey(attacker, item);

  // Quem tem sprite de verdade toca os frames de ATACAR por cima do
  // movimento de CSS (lunge/swing continuam dando o "impulso" pro golpe; os
  // frames trocam a pose em cima disso) — se não tiver frame de ataque
  // (playSpriteAction devolve false), o golpe de CSS sozinho já cobre.
  if (isMeleeAttack) {
    const dx = Math.sign(defender.x - attacker.x) || 0;
    const dy = Math.sign(defender.y - attacker.y) || 0;
    inner.style.setProperty("--lunge-x", `${dx * 35}%`);
    inner.style.setProperty("--lunge-y", `${dy * 35}%`);
    inner.classList.remove(...ALL_ATTACK_MOTION_CLASSES);
    const swing = MELEE_SWING_CLASSES[item.swing];
    if (swing) {
      const duration = scaledAttackDuration(swing.duration);
      playTransientAnimation(inner, swing.cls, duration);
      setTimeout(() => spawnWeaponTrail(attacker, defender, item.swing), scaledAttackDuration(swing.trailDelay));
      playSpriteAction(attacker, spriteActionKey, duration);
    } else {
      const duration = scaledAttackDuration(420);
      playTransientAnimation(inner, "lunge", duration);
      playSpriteAction(attacker, spriteActionKey, duration);
    }
  } else if (isRangedWeaponAttack) {
    const dx = Math.sign(defender.x - attacker.x) || 0;
    const dy = Math.sign(defender.y - attacker.y) || 0;
    inner.style.setProperty("--lunge-x", `${dx * 35}%`);
    inner.style.setProperty("--lunge-y", `${dy * 35}%`);
    inner.classList.remove(...ALL_ATTACK_MOTION_CLASSES);
    const duration = scaledAttackDuration(380);
    playTransientAnimation(inner, "draw-release", duration);
    playSpriteAction(attacker, spriteActionKey, duration);
  } else {
    const duration = scaledAttackDuration(480);
    playTransientAnimation(inner, "cast-pulse", duration);
    playSpriteAction(attacker, spriteActionKey, duration);
  }
}

function updateStatusVfxElement(unit, el, now) {
  const vfx = el.querySelector(".status-vfx");
  if (!vfx) return;
  const active = activeStatusVfx(unit, now);
  if (!active) {
    if (vfx.dataset.status === "paralyzed" && !vfx.classList.contains("status-vfx-frozen-exit")) {
      vfx.className = "status-vfx status-vfx-frozen-exit";
      vfx.dataset.status = "";
      vfx.style.opacity = "1";
      setTimeout(() => {
        if (!vfx.dataset.status) {
          vfx.className = "status-vfx hidden-status-vfx";
          vfx.style.opacity = "0";
        }
      }, 380);
      return;
    }
    if (vfx.classList.contains("status-vfx-frozen-exit")) return;
    if ((vfx.dataset.status === "regen" || vfx.dataset.status === "regenBoost") && !vfx.classList.contains("status-vfx-regen-exit")) {
      vfx.className = "status-vfx status-vfx-regen-exit";
      vfx.dataset.status = "";
      vfx.style.opacity = "1";
      setTimeout(() => {
        if (!vfx.dataset.status) {
          vfx.className = "status-vfx hidden-status-vfx";
          vfx.style.opacity = "0";
        }
      }, 460);
      return;
    }
    if (vfx.classList.contains("status-vfx-regen-exit")) return;
    if (vfx.dataset.status === "invisible" && !vfx.classList.contains("status-vfx-cloak-exit")) {
      vfx.className = "status-vfx status-vfx-cloak-exit";
      vfx.dataset.status = "";
      vfx.style.opacity = "1";
      setTimeout(() => {
        if (!vfx.dataset.status) {
          vfx.className = "status-vfx hidden-status-vfx";
          vfx.style.opacity = "0";
        }
      }, 430);
      return;
    }
    if (vfx.classList.contains("status-vfx-cloak-exit")) return;
    if (vfx.dataset.status === "dazed" && !vfx.classList.contains("status-vfx-stun-exit")) {
      vfx.className = "status-vfx status-vfx-stun-exit";
      vfx.dataset.status = "";
      vfx.style.opacity = "1";
      setTimeout(() => {
        if (!vfx.dataset.status) {
          vfx.className = "status-vfx hidden-status-vfx";
          vfx.style.opacity = "0";
        }
      }, 430);
      return;
    }
    if (vfx.classList.contains("status-vfx-stun-exit")) return;
    if (vfx.dataset.status === "fury" && !vfx.classList.contains("status-vfx-fury-exit")) {
      vfx.className = "status-vfx status-vfx-fury-exit";
      vfx.dataset.status = "";
      vfx.style.opacity = "1";
      setTimeout(() => {
        if (!vfx.dataset.status) {
          vfx.className = "status-vfx hidden-status-vfx";
          vfx.style.opacity = "0";
        }
      }, 460);
      return;
    }
    if (vfx.classList.contains("status-vfx-fury-exit")) return;
    if (vfx.dataset.status === "poison" && !vfx.classList.contains("status-vfx-poison-exit")) {
      vfx.className = "status-vfx status-vfx-poison-exit";
      vfx.dataset.status = "";
      vfx.style.opacity = "1";
      setTimeout(() => {
        if (!vfx.dataset.status) {
          vfx.className = "status-vfx hidden-status-vfx";
          vfx.style.opacity = "0";
        }
      }, 420);
      return;
    }
    if (vfx.classList.contains("status-vfx-poison-exit")) return;
    if (vfx.dataset.status === "bleed" && !vfx.classList.contains("status-vfx-bleed-exit")) {
      vfx.className = "status-vfx status-vfx-bleed-exit";
      vfx.dataset.status = "";
      vfx.style.opacity = "1";
      setTimeout(() => {
        if (!vfx.dataset.status) {
          vfx.className = "status-vfx hidden-status-vfx";
          vfx.style.opacity = "0";
        }
      }, 380);
      return;
    }
    if (vfx.classList.contains("status-vfx-bleed-exit")) return;
    // Prisão de Vinhas: retrai/quebra em vez de sumir na hora — ver
    // .status-vfx-rooted-exit em style.css.
    if (vfx.dataset.status === "root" && !vfx.classList.contains("status-vfx-rooted-exit")) {
      vfx.className = "status-vfx status-vfx-rooted-exit";
      vfx.dataset.status = "";
      vfx.style.opacity = "1";
      setTimeout(() => {
        if (!vfx.dataset.status) {
          vfx.className = "status-vfx hidden-status-vfx";
          vfx.style.opacity = "0";
        }
      }, 360);
      return;
    }
    if (vfx.classList.contains("status-vfx-rooted-exit")) return;
    vfx.className = "status-vfx hidden-status-vfx";
    vfx.style.opacity = "0";
    return;
  }
  vfx.className = `status-vfx status-vfx-${active.profile.cls} status-vfx-${active.profile.position} status-vfx-${active.profile.tone}`;
  vfx.style.opacity = active.opacity.toFixed(2);
  vfx.querySelector(".status-vfx-glyph").textContent = active.profile.glyph;
  vfx.dataset.status = active.effect.type;
}

function triggerRegenVisualPulse(unit) {
  const token = unitTokenEls.get(unit);
  const pulse = token?.querySelector(".regen-pulse");
  if (!pulse) return;
  pulse.classList.remove("regen-pulse-active");
  void pulse.offsetWidth;
  pulse.classList.add("regen-pulse-active");
  setTimeout(() => pulse.classList.remove("regen-pulse-active"), 420);
}

// Tique do Envenenado: uma bolha estoura (flash curto), sincronizado com o
// dano periódico real (ver applyStatusEffectsAtTurnStart) — mesmo espírito
// de triggerRegenVisualPulse.
function triggerPoisonVisualTick(unit) {
  const token = unitTokenEls.get(unit);
  const burst = token?.querySelector(".poison-burst");
  if (!burst) return;
  burst.classList.remove("poison-burst-active");
  void burst.offsetWidth;
  burst.classList.add("poison-burst-active");
  setTimeout(() => burst.classList.remove("poison-burst-active"), 380);
}

// Tique do Sangramento: um pequeno respingo extra sincronizado com o dano
// periódico real, além das gotas contínuas do loop (ver .bleed-drops).
function triggerBleedVisualTick(unit) {
  const token = unitTokenEls.get(unit);
  const splash = token?.querySelector(".bleed-splash");
  if (!splash) return;
  splash.classList.remove("bleed-splash-active");
  void splash.offsetWidth;
  splash.classList.add("bleed-splash-active");
  setTimeout(() => splash.classList.remove("bleed-splash-active"), 360);
}

function retriggerStatusMotionClass(unit, className, duration) {
  const inner = unitTokenEls.get(unit)?.querySelector(".unit-token-inner");
  if (!inner) return;
  inner.classList.remove(className);
  void inner.offsetWidth;
  inner.classList.add(className);
  setTimeout(() => inner.classList.remove(className), duration);
}

function triggerGuardImpactVisual(unit) {
  retriggerStatusMotionClass(unit, "guard-impact", 360);
}

function triggerEvasiveDodgeVisual(unit) {
  retriggerStatusMotionClass(unit, "evasive-dodge", 300);
}

// Um único relógio global atualiza a alternância; não há timer por unidade.
setInterval(() => {
  const now = performance.now();
  for (const unit of units) {
    const el = unitTokenEls.get(unit);
    if (el) updateStatusVfxElement(unit, el, now);
  }
}, 80);

// Fase 2 do golpe corpo a corpo: além do TOKEN se mover (playAttackAnimation
// acima), a ARMA em si deixa um rastro cosmético entre atacante e alvo —
// um arco de brilho pro talho, um risco reto e rápido pra estocada, uma
// onda de choque circular pra concussão. Só existe pros 3 swings marcados
// (nada acontece pra quem usa o lunge genérico, sem `swing`). Vive no mesmo
// overlay dos outros efeitos (spawnImpactEffect etc.), então some sozinho.
const WEAPON_TRAIL_TILE_PCT = (1 / BOARD_SIZE) * 100;
function spawnWeaponTrail(attacker, defender, swingType) {
  // 75% do caminho de atacante até alvo — perto o bastante do alvo pra
  // parecer o ponto de impacto, sem grudar exatamente no centro do tile.
  const px = attacker.x + (defender.x - attacker.x) * 0.75;
  const py = attacker.y + (defender.y - attacker.y) * 0.75;
  const posAttacker = tileScreenPercent(attacker.x + 0.5, attacker.y + 0.5, 0.9);
  const posDefender = tileScreenPercent(defender.x + 0.5, defender.y + 0.5, 0.9);
  const pos = tileScreenPercent(px + 0.5, py + 0.5, 0.9);
  const angleDeg = Math.atan2(posDefender.topPct - posAttacker.topPct, posDefender.leftPct - posAttacker.leftPct) * (180 / Math.PI);

  const el = document.createElement("div");
  const profile = combatVfxProfile(attacker);
  el.className = `weapon-trail weapon-trail-${swingType}${profile.accent ? ` weapon-trail-${profile.accent}` : ""}`;
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  const trailScale = profile.visualScale * profile.spriteVfxScale * (profile.accent === "warrior" ? 1.16 : profile.accent === "rogue" ? 1.08 : 1);
  el.style.width = `${WEAPON_TRAIL_TILE_PCT * 1.5 * trailScale}%`;
  el.style.height = `${WEAPON_TRAIL_TILE_PCT * 1.5 * trailScale}%`;
  el.style.setProperty("--angle", `${angleDeg}deg`);
  boardOverlayEl.appendChild(el);
  setTimeout(() => el.remove(), 320);
}

// Marca de corte no ALVO (diferente de spawnWeaponTrail, que aparece entre
// atacante e alvo — isso aqui é a "ferida" em si) — só pra armas brancas de
// verdade (talho/estocada); concussão não corta nada, então não gera marca
// (o baque dela já vem do weapon-trail-blunt). Ângulo levemente aleatório
// pra dois golpes seguidos no mesmo alvo não parecerem cópia um do outro.
function spawnCutMark(x, y, swingType) {
  if (swingType !== "slash" && swingType !== "stab") return;
  const el = document.createElement("div");
  el.className = `cut-mark cut-mark-${swingType}`;
  const pos = tileScreenPercent(x + 0.5, y + 0.5, 0.9);
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  if (swingType === "slash") {
    el.style.width = `${WEAPON_TRAIL_TILE_PCT * 1.3}%`;
    el.style.setProperty("--cut-angle", `${-40 + Math.random() * 30}deg`);
  } else {
    el.style.width = `${WEAPON_TRAIL_TILE_PCT * 0.7}%`;
    el.style.height = `${WEAPON_TRAIL_TILE_PCT * 0.7}%`;
  }
  boardOverlayEl.appendChild(el);
  setTimeout(() => el.remove(), 300);
}

// Reação visual de quem levou o golpe (chacoalhar + flash vermelho) — no
// token do tabuleiro E no portrait do card no roster, quando ele existir.
// Só funciona no portrait porque os cards agora são persistentes
// (unitCardEls/getOrCreateUnitCard) — antes eram recriados do zero a cada
// updateHud() e a animação nunca sobrevivia até o fim.
function playHitReaction(unit) {
  const el = unitTokenEls.get(unit);
  if (el) {
    const inner = el.querySelector(".unit-token-inner");
    playTransientAnimation(inner, "hit-shake", 400);
    playSpriteAction(unit, "hit", 400);
  }

  const card = unitCardEls.get(unit);
  const portrait = card && card.querySelector(".card-portrait");
  if (portrait) {
    playTransientAnimation(portrait, "portrait-hit", 400);
  }
}

// Cria o card na primeira vez (esqueleto fixo com os nós que mudam de
// render pra render já nomeados) e devolve o mesmo elemento nas próximas
// chamadas — quem quiser atualizar os números/barras usa
// updateUnitCardContent, que nunca recria o <img> do portrait (é nele que
// a reação de dano anima, ver playHitReaction).
function getOrCreateUnitCard(unit, isEnemy) {
  let card = unitCardEls.get(unit);
  if (card) return card;

  card = document.createElement("div");
  card.className = `unit-card ${isEnemy ? "enemy" : "player"}`;

  const portraitUrl = portraitUrlFor(unit);
  const portraitHtml = portraitUrl
    ? `<img class="card-portrait" src="${portraitUrl}" alt="" onerror="this.remove()">`
    : "";
  // Ícone + barra com o valor por cima dela (em vez de "HP: 35/35" numa
  // linha e a barra embaixo) — mesma informação em menos altura, e a barra
  // fica maior/mais fácil de ler de relance.
  const mpHtml =
    unit.maxMp !== undefined
      ? `<div class="stat-row">
           <span class="stat-icon" title="MP">MP</span>
           <div class="mpbar"><div class="mpfill"></div><span class="mp-value"></span></div>
         </div>`
      : "";

  card.innerHTML = `
    <div class="card-main-row">
      ${portraitHtml}
      <div class="card-core">
        <div class="card-header-row">
          <strong><span class="${unit.iconTint || ""}">${unit.icon}</span> ${unit.name}</strong>
        </div>
        <div class="stat-row">
          <span class="stat-icon" title="HP">HP</span>
          <div class="hpbar"><div class="hp-chip"></div><div class="hpfill ${isEnemy ? "enemy-fill" : ""}"></div><span class="hp-value"></span></div>
        </div>
        ${mpHtml}
        <div class="stat-row">
          <span class="stat-icon" title="CT">CT</span>
          <div class="ctbar"><div class="ctfill ${isEnemy ? "enemy-ctfill" : ""}"></div><span class="ct-value"></span></div>
        </div>
      </div>
    </div>
    <div class="card-detail-row">
      <div class="card-mini-row">
        <span class="mini-stat" title="Movimento">🏃<span class="mov-value"></span></span>
        <span class="mini-stat" title="Agilidade">💨<span class="agi-value"></span></span>
      </div>
      <div class="card-passive-row"></div>
      <div class="card-status-row"></div>
    </div>
  `;
  // O cartão fica fora do tabuleiro, então clicar nele nunca inicia uma ação
  // de verdade (isso só acontece clicando na unidade NO tabuleiro) — aqui é
  // só uma consulta às armas/magias dela (ver openUnitInfoModal).
  card.addEventListener("click", () => openUnitInfoModal(unit));

  // Passivas são fixas por personagem (não mudam durante a partida), então
  // só precisam ser desenhadas uma vez aqui, não a cada updateUnitCardContent.
  const passiveRow = card.querySelector(".card-passive-row");
  passiveRow.innerHTML = getPassiveBadges(unit)
    .map((b) => `<span class="card-passive-badge" title="${b.title}">${b.icon}</span>`)
    .join("");

  unitCardEls.set(unit, card);
  return card;
}

// Descreve as passivas sempre-ativas de cada personagem (sem depender de
// statusEffects, que são temporários) pra exibir como selo fixo no cartão do
// roster — cada badge lê um campo já usado alhures na lógica de combate, não
// duplica número nenhum (se o balanceamento mudar o campo, o texto acompanha).
function getPassiveBadges(unit) {
  const badges = [];
  if (unit.passiveDamageReduction) {
    badges.push({ icon: "🛡️", title: `Redução de dano passiva: -${unit.passiveDamageReduction}` });
  }
  if (unit.flying) {
    badges.push({ icon: "🕊️", title: "Voo: só pode ser atingida à distância ou por magia" });
  }
  if (unit.innateEvasion) {
    badges.push({ icon: "💫", title: `Esquiva inata: -${Math.round(unit.innateEvasion * 100)}% de chance de ser acertado` });
  }
  if (unit.hpRegenPerTurn) {
    badges.push({ icon: "💚", title: `Regeneração: +${unit.hpRegenPerTurn} HP por turno` });
  }
  if (unit.counterAttackChance) {
    badges.push({ icon: "🔁", title: `Contra-ataque: ${Math.round(unit.counterAttackChance * 100)}% de chance ao ser atingido corpo a corpo` });
  }
  if (unit.hasOpportunityAttack) {
    badges.push({ icon: "👁️", title: "Ataque de oportunidade: pode atacar inimigos que passem ao lado dele" });
  }
  return badges;
}

function updateUnitCardContent(unit, card) {
  card.classList.toggle("defeated", unit.hp <= 0);
  card.classList.toggle("active-turn", unit === currentActor);

  const hp = Math.max(unit.hp, 0);
  const hpPct = (hp / unit.maxHp) * 100;
  card.querySelector(".hpfill").style.width = `${hpPct}%`;
  card.querySelector(".hp-value").textContent = `${hp}/${unit.maxHp}`;

  // "Dano residual": só quando o HP CAIU desde o último render. Nasce
  // grudado (sem transição) no valor de onde caiu, aí solta a transição
  // (definida no CSS) pra encolher devagar até o valor novo — cura não
  // dispara isso, só volta a acompanhar o fill na hora.
  const hpChipEl = card.querySelector(".hp-chip");
  const prevHp = unitLastCardHp.has(unit) ? unitLastCardHp.get(unit) : hp;
  if (hp < prevHp) {
    hpChipEl.style.transition = "none";
    hpChipEl.style.width = `${(prevHp / unit.maxHp) * 100}%`;
    void hpChipEl.offsetWidth;
    hpChipEl.style.transition = "";
    hpChipEl.style.width = `${hpPct}%`;
  } else {
    hpChipEl.style.transition = "none";
    hpChipEl.style.width = `${hpPct}%`;
  }
  unitLastCardHp.set(unit, hp);

  const ct = Math.min(unit.ct, CT_THRESHOLD);
  card.querySelector(".ctfill").style.width = `${(Math.max(ct, 0) / CT_THRESHOLD) * 100}%`;
  card.querySelector(".ct-value").textContent = `${ct}/100`;

  if (unit.maxMp !== undefined) {
    const mp = Math.max(unit.mp, 0);
    card.querySelector(".mpfill").style.width = `${(mp / unit.maxMp) * 100}%`;
    card.querySelector(".mp-value").textContent = `${mp}/${unit.maxMp}`;
  }

  card.querySelector(".mov-value").textContent = unit.moveRange;
  card.querySelector(".agi-value").textContent = unit.speed;

  const statusRow = card.querySelector(".card-status-row");
  statusRow.innerHTML =
    unit.statusEffects && unit.statusEffects.length > 0
      ? unit.statusEffects.map((e) => `<span class="card-status-icon">${statusEffectIcon(e.type)}</span>`).join("")
      : "";
}

// Contraparte de resetUnitTokens() pros cards do roster — chamado só em
// resetGame(), pra cada partida nova começar com cards frescos (nenhuma
// classe/animação sobrando de reação de dano da partida anterior).
function resetUnitCards() {
  playerRosterEl.innerHTML = "";
  enemyRosterEl.innerHTML = "";
  unitCardEls.clear();
  unitLastCardHp.clear();
}

// Prevê a ordem dos próximos `count` turnos usando o mesmo algoritmo de CT de
// advanceCTUntilReady (maior CT primeiro, empate por Agilidade), mas numa
// cópia dos dados — nunca mexe no estado real. Como o custo de CT de cada
// ação varia (arma/magia usada, ações bônus etc.), assume-se que cada turno
// "gasta" o limiar inteiro (100) na hora de simular o próximo — é uma
// previsão aproximada, não uma garantia perfeita do que vai acontecer.
function computeTurnOrderPreview(count) {
  // Cadáveres não entram na corrida de CT (ver advanceCTUntilReady), então
  // também não aparecem nessa prévia — a contagem regressiva deles avança
  // por rodada, não por uma "vez" na fila de turnos.
  const clones = aliveUnits().map((u) => ({
    name: u.name,
    icon: u.icon,
    iconTint: u.iconTint,
    team: u.team,
    ct: u.ct,
    speed: u.speed,
  }));
  if (clones.length === 0) return [];

  const order = [];
  let guard = 0;
  while (order.length < count && guard < count * 200) {
    guard += 1;
    const ready = clones.filter((u) => u.ct >= CT_THRESHOLD);
    if (ready.length > 0) {
      ready.sort((a, b) => b.ct - a.ct || b.speed - a.speed);
      const winner = ready[0];
      order.push(winner);
      winner.ct -= CT_THRESHOLD;
    } else {
      for (const u of clones) u.ct = Math.min(u.ct + u.speed, CT_THRESHOLD);
    }
  }
  return order;
}

function renderTurnOrder() {
  // FLIP (First/Last/Invert/Play): a lista inteira é recriada do zero a
  // cada chamada (mais simples que manter identidade persistente pra 10
  // itens), mas isso faria os itens "pularem" pra nova posição sem
  // transição nenhuma quando a ordem muda. Pra disfarçar, guarda a posição
  // (First) de cada item ANTES de recriar, casando pelo par nome+ocorrência
  // — precisa da ocorrência porque a mesma unidade pode aparecer mais de
  // uma vez nas próximas 10 jogadas (ex: unidade rápida agindo duas vezes).
  const firstRects = new Map();
  turnOrderEl.querySelectorAll(".turn-order-entry[data-flip-key]").forEach((el) => {
    firstRects.set(el.dataset.flipKey, el.getBoundingClientRect());
  });

  turnOrderEl.innerHTML = "";

  const heading = document.createElement("div");
  heading.className = "turn-order-heading";
  heading.textContent = "Ordem dos turnos";
  turnOrderEl.appendChild(heading);

  const preview = computeTurnOrderPreview(10);
  const occurrenceCount = new Map();
  const flipTargets = [];
  preview.forEach((entry, index) => {
    const occurrence = occurrenceCount.get(entry.name) || 0;
    occurrenceCount.set(entry.name, occurrence + 1);
    const flipKey = `${entry.name}#${occurrence}`;

    const item = document.createElement("div");
    item.className = `turn-order-entry ${entry.team === "player" ? "player" : "enemy"}`;
    item.dataset.flipKey = flipKey;
    if (index === 0) item.classList.add("current");
    item.innerHTML = `
      <span class="turn-order-index">${index + 1}</span>
      <span class="turn-order-icon ${entry.iconTint || ""}">${entry.icon}</span>
      <span class="turn-order-name">${entry.name}</span>
    `;
    turnOrderEl.appendChild(item);
    flipTargets.push({ el: item, flipKey });
  });

  // Invert + Play: quem já existia antes (achou par no Map) nasce deslocado
  // de volta pra onde estava (Invert) e, no frame seguinte, relaxa pra
  // posição real com transição (Play) — dá a ilusão de ter deslizado até
  // lá. Quem é novo na janela de 10 não tem par; esses só ganham um "pop"
  // de entrada via classe "entering" (ver CSS) em vez de tentar simular
  // de onde "viriam".
  for (const { el, flipKey } of flipTargets) {
    const firstRect = firstRects.get(flipKey);
    if (!firstRect) {
      el.classList.add("entering");
      continue;
    }
    const lastRect = el.getBoundingClientRect();
    const deltaY = firstRect.top - lastRect.top;
    if (Math.abs(deltaY) < 1) continue;
    el.style.transition = "none";
    el.style.transform = `translateY(${deltaY}px)`;
    requestAnimationFrame(() => {
      el.style.transition = "";
      el.style.transform = "";
    });
  }
}

function updateHud() {
  for (const u of playerTeam) {
    const card = getOrCreateUnitCard(u, false);
    if (!card.isConnected) playerRosterEl.appendChild(card);
    updateUnitCardContent(u, card);
  }
  for (const u of enemyTeam) {
    const card = getOrCreateUnitCard(u, true);
    if (!card.isConnected) enemyRosterEl.appendChild(card);
    updateUnitCardContent(u, card);
  }
  renderTurnOrder();

  document.getElementById("turn-indicator").textContent = `Turno: ${currentActor.name}`;
  document.getElementById("global-turn-counter").textContent = `Turno global: ${Math.min(globalTurnCount, MAX_GLOBAL_TURNS)}/${MAX_GLOBAL_TURNS}`;
  announceTurnChange();
  updateBackgroundTint();
}

// updateHud() roda depois de QUALQUER render() (mover, atacar, abrir menu
// etc.), não só quando o turno de fato muda — por isso guarda quem foi o
// último anunciado e só dispara o banner quando currentActor é uma unidade
// diferente da vez passada.
let lastAnnouncedActor = null;
function announceTurnChange() {
  if (currentActor === lastAnnouncedActor) return;
  lastAnnouncedActor = currentActor;
  if (!turnBannerEl) return;
  turnBannerEl.classList.remove("show", "team-player", "team-enemy");
  void turnBannerEl.offsetWidth;
  turnBannerEl.innerHTML = `<span class="${currentActor.iconTint || ""}">${currentActor.icon}</span> Turno de ${currentActor.name}`;
  turnBannerEl.classList.add("show", `team-${currentActor.team}`);
}

// Tinge a metade esquerda da tela de azul no turno do time do Guerreiro, e a
// metade direita de vermelho no turno do time do Goblin.
function updateBackgroundTint() {
  bgLeftEl.classList.toggle("active", currentActor.team === "player");
  bgRightEl.classList.toggle("active", currentActor.team === "enemy");
}

function onTileClick(x, y) {
  // Defesa extra: o overlay da cena de batalha já cobre a tela inteira
  // (pointer-events:auto, inset:0) e bloqueia clique por baixo sozinho, mas
  // isso garante que nem durante a transição de ~250ms de entrada/saída dê
  // pra clicar num tile.
  if (battleSceneActive) return;
  if (!isHumanControlled(currentActor.team) || !isBattleOngoing()) return;

  const clickedUnit = unitAt(x, y);

  // Attacking/casting: an item (weapon or spell) has already been chosen and
  // its range is shown on the board. Checked BEFORE the "click own unit"
  // cancel below, so self-targeting (ex: curar a si mesmo) funciona; se o
  // clique não for um alvo válido pro modo atual, nada fica "handled" e a
  // execução cai nos checks de cancelar/mover abaixo.
  if (pendingWeapon && attackableTiles.some((t) => t.x === x && t.y === y)) {
    const mode = pendingWeapon.targetMode || "enemy";
    let handled = false;

    if (mode === "enemy") {
      // Castelo/Montanha/Casa/Tenda: se o tile mirado tem UNIDADE
      // inimiga válida E uma construção destrutível ao mesmo tempo — só pra
      // itens que causam dano de verdade (magia de suporte nunca mira
      // construção). Castelo/Montanha (`structure`) acerta os dois de uma
      // vez, sem perguntar (ver ramo abaixo); Casa/Tenda (terreno de
      // tile único, `secondary`) continuam perguntando qual dos dois é o
      // alvo. Os dois nunca coincidem no mesmo tile, então só um dos dois
      // casos vale por vez. Árvore fica de fora de propósito (só dano em
      // área, nunca mira único — não pedido pro caso dela).
      const structure = structureAt(x, y);
      const targetableTerrain = terrainAt(x, y);
      const isTargetableTerrain = targetableTerrain && SINGLE_TARGET_TERRAIN_TYPES.has(targetableTerrain.type);
      const canDamage = pendingWeapon.damageMin !== undefined;
      let secondary = null;
      if (structure && canDamage) {
        const structureInfo = STRUCTURE_INFO[structure.type];
        secondary = {
          icon: structureInfo.icon,
          name: structureInfo.name,
          onChoose: () => openStructureAttackConfirmation(currentActor, structure, { x, y }, pendingWeapon),
        };
      } else if (isTargetableTerrain && canDamage) {
        const info = TERRAIN_INFO[targetableTerrain.type];
        secondary = {
          icon: info.icon,
          name: info.name,
          onChoose: () => openTerrainAttackConfirmation(currentActor, targetableTerrain, { x, y }, pendingWeapon),
        };
      }
      const validUnit = clickedUnit && clickedUnit.team !== currentActor.team;
      if (validUnit && structure && canDamage) {
        // Castelo/Montanha ocupado: acerta os dois de uma vez, sem pedir
        // pra escolher (pedido do usuário).
        openCombinedUnitStructureAttackConfirmation(currentActor, clickedUnit, structure, pendingWeapon);
        handled = true;
      } else if (validUnit && isTargetableTerrain && canDamage) {
        // Casa ocupada: mesma ideia (Tenda nunca ocupada, ver comentário
        // de openCombinedUnitTerrainAttackConfirmation).
        openCombinedUnitTerrainAttackConfirmation(currentActor, clickedUnit, targetableTerrain, { x, y }, pendingWeapon);
        handled = true;
      } else if (validUnit) {
        openAttackConfirmation(currentActor, clickedUnit, pendingWeapon);
        handled = true;
      } else if (secondary) {
        secondary.onChoose();
        handled = true;
      }
    } else if (mode === "ally-clearpath" && clickedUnit && clickedUnit.team === currentActor.team) {
      const item = pendingWeapon;
      pendingWeapon = null;
      castSupplyItem(currentActor, clickedUnit, item);
      handled = true;
    } else if (mode === "root" && clickedUnit && clickedUnit.team !== currentActor.team) {
      const item = pendingWeapon;
      pendingWeapon = null;
      castRootSpell(currentActor, clickedUnit, item);
      handled = true;
    } else if (mode === "paralyze" && clickedUnit && clickedUnit.team !== currentActor.team) {
      const item = pendingWeapon;
      pendingWeapon = null;
      castParalysis(currentActor, clickedUnit, item);
      handled = true;
    } else if (mode === "charge" && clickedUnit && clickedUnit.team !== currentActor.team) {
      const item = pendingWeapon;
      pendingWeapon = null;
      castCharge(currentActor, clickedUnit, item);
      handled = true;
    } else if (mode === "resurrect") {
      // Não usa clickedUnit (unitAt exclui mortos de propósito) — o alvo
      // válido aqui é um cadáver ainda no campo (ver deadUnitAt), do MESMO
      // time do conjurador.
      const deadTarget = deadUnitAt(x, y);
      if (deadTarget && deadTarget.team === currentActor.team) {
        const item = pendingWeapon;
        pendingWeapon = null;
        castResurrect(currentActor, deadTarget, item);
        handled = true;
      }
    } else if (mode === "trample") {
      // Diferente da Investida, não precisa clicar num inimigo — o clique só
      // escolhe a direção; qualquer tile da linha cardeal serve.
      const item = pendingWeapon;
      pendingWeapon = null;
      castTrample(currentActor, item, { x, y });
      handled = true;
    } else if (mode === "point-aoe" || mode === "line-aoe" || mode === "creeping-line" || mode === "cardinal-blast" || mode === "pierce-line" || mode === "cone-poison" || mode === "cure-aoe" || mode === "heal-aoe" || mode === "regen-aoe" || mode === "trap" || mode === "freeze-aoe" || mode === "cone-windstorm") {
      // Magias de área pedem 2 cliques: o primeiro clique num alvo válido só
      // acende a área que será afetada (aoePreviewTiles); um segundo clique
      // no MESMO alvo confirma e lança a magia. Clicar em outro alvo válido
      // apenas atualiza a prévia pro novo alvo, sem precisar de Voltar.
      const isConfirming = aoePreviewTarget && aoePreviewTarget.x === x && aoePreviewTarget.y === y;
      if (isConfirming) {
        openAoeConfirmation(currentActor, pendingWeapon, mode, { x, y });
      } else {
        const areaTiles = computeAoeAreaTiles(currentActor, pendingWeapon, { x, y });
        if (areaTiles) {
          aoePreviewTarget = { x, y };
          aoePreviewTiles = areaTiles;
          render();
        }
      }
      handled = true;
    }

    if (handled) return;
  }

  // Clicking your own unit again cancels whatever sub-menu/mode is active
  // and reopens the Mover/Atacar menu.
  if (clickedUnit === currentActor) {
    closeAllMenus();
    pendingWeapon = null;
    aoePreviewTarget = null;
    aoePreviewTiles = [];
    reachableTiles = [];
    attackableTiles = [];
    render();
    promptNextAction(currentActor);
    return;
  }

  // Clicando em qualquer outra unidade (aliada ou inimiga) fora do próprio
  // turno e sem estar mirando um ataque/magia: só mostra o nome dela, sem
  // abrir menu nem selecionar nada.
  if (clickedUnit && !pendingWeapon) {
    showUnitNamePopup(clickedUnit);
    return;
  }

  // Cadáver ainda no campo (ver deadUnitAt/decayCorpses) — unitAt não o
  // enxerga (só vivos), então precisa desse check à parte. Só identifica
  // quem é, igual o popup de nome de uma unidade viva.
  if (!clickedUnit && !pendingWeapon) {
    const deadTarget = deadUnitAt(x, y);
    if (deadTarget) {
      showUnitNamePopup(deadTarget, true);
      return;
    }
  }

  // Terreno (árvore/água/casa/tenda): só quando o clique NÃO for um destino
  // de movimento válido agora — se for (ex: água/casa dentro do alcance),
  // o clique continua movendo pra lá normalmente (bloco abaixo), senão
  // nunca seria possível entrar na água ou subir na casa clicando nela.
  // Fora de um movimento em andamento (reachableTiles vazio, navegação
  // livre) ou num tile bloqueado que nunca seria um destino (árvore/tenda),
  // mostra as informações em vez de tentar mover.
  if (!clickedUnit && !pendingWeapon && !reachableTiles.some((t) => t.x === x && t.y === y)) {
    const structure = structureAt(x, y);
    if (structure) {
      openStructureInfoModal(structure);
      return;
    }
    // Castelo/Montanha já destruído: structureAt ignora de propósito (tile
    // liberado pra movimento), mas o jogador ainda pode querer saber o que
    // são aqueles escombros ali.
    const ruinedStructure = destroyedStructureAt(x, y);
    if (ruinedStructure) {
      openStructureInfoModal(ruinedStructure);
      return;
    }
    const terrain = terrainAt(x, y);
    if (terrain) {
      openTerrainInfoModal(terrain, x, y);
      return;
    }
    // Flor: não entra em terrainMap (só decoração, ver FLOWER_LAYOUT), mas
    // ainda merece o mesmo popup de identificação ao clicar.
    const flower = FLOWER_LAYOUT.find((f) => f.x === x && f.y === y);
    if (flower) {
      openTerrainInfoModal({ type: "flower" }, x, y);
      return;
    }
  }

  // Moving: a tile within the shown movement range was clicked.
  if (!clickedUnit && reachableTiles.some((t) => t.x === x && t.y === y)) {
    performMove(currentActor, { x, y });
    reachableTiles = [];
    render();
    checkEndCurrentTurn();
  }
}

// Resolve o acerto/erro/crítico/dano de UM alvo, sem mexer em CT/MP/hasActed
// do atacante — isso deixa a função reutilizável tanto pra ataques normais
// (um alvo) quanto pra magias em área (vários alvos, mas o custo da magia é
// pago uma única vez, em finalizeAction).
// Retorna true/false pra quem chamou saber se o golpe realmente acertou
// (usado, por exemplo, pra só envenenar com a Zarabatana quando ela acerta).
function resolveSingleHit(attacker, defender, item, isCounterAttack = false, explicitCosmeticDelay = null, onOutcome = null) {
  // Invisibilidade (Ladino) só é furada por magias de área — armas e magias
  // de alvo único (qualquer alcance) erram automaticamente. Um item é "arma"
  // quando não tem mpCost (toda magia tem).
  const isWeaponAttack = item.mpCost === undefined;
  if (!bypassesInvisibility(item) && isInvisible(defender)) {
    log(`${attacker.name} ataca ${defender.name} com ${item.name}, mas ${defender.name} está invisível e o golpe não acerta nada!`);
    spawnFloatingText(defender.x, defender.y, "Invisível!", "miss");
    playSfx("miss");
    onOutcome?.(false);
    return false;
  }
  // Fada: só armas corpo a corpo (alcance 1) erram nela — à distância (ou
  // marcadas "aerial", como a Besta) e magias sempre podem atingi-la.
  const isMeleeWeapon = isWeaponAttack && item.maxRange === 1 && !item.aerial;
  if (isMeleeWeapon && defender.flying) {
    log(`${attacker.name} ataca ${defender.name} com ${item.name}, mas ${defender.name} só pode ser atingida por ataques à distância ou magia!`);
    spawnFloatingText(defender.x, defender.y, "Imune!", "miss");
    playSfx("miss");
    onOutcome?.(false);
    return false;
  }

  const distance = manhattan(attacker, defender);
  const attackAngle = getAttackAngle(attacker, defender);
  // Buffs de "próximo ataque" (Tiro Certeiro, Ataque Poderoso) são consumidos
  // aqui, na tentativa de ataque em si — acerte ou erre.
  const guaranteedHit = !!attacker.guaranteedNextHit;
  const critBonus = attacker.critBonusNextAttack || 0;
  const oneShotDamageBonus = attacker.oneShotDamageBonus || 0;
  const oneShotDamageBonusSource = attacker.oneShotDamageBonusSource || "habilidade";
  const weakeningStrike = !!attacker.weakeningStrikeNextAttack;
  // Tiro Explosivo (Químico): mesmo esquema de oneShotDamageBonus, mas pro
  // efeito de queimadura em vez de dano — guarda quantos turnos de
  // queimadura o PRÓXIMO golpe que acertar deve aplicar.
  const bonusBurnTurns = attacker.burnNextAttackTurns || 0;
  // Flecha de Fogo (Arqueiro): queima o alvo MESMO SE O GOLPE ERRAR — por
  // isso é aplicado logo abaixo, incondicionalmente, em vez de junto do
  // bonusBurnTurns (que só entra depois do golpe confirmadamente acertar).
  const bonusAlwaysBurnTurns = attacker.burnNextAttackAlwaysTurns || 0;
  // Flecha de Fogo + Tiro Rápido (Arqueiro, combo liberado em
  // castSelfAbility): se ainda sobra um disparo bônus DEPOIS deste (checado
  // ANTES de finalizeAction decrementar bonusAttacksRemaining — ver
  // finalizeAction), o buff da Flecha de Fogo não reseta ainda, pra também
  // valer no disparo bônus — as 2 flechas saem em chamas, não só a
  // primeira. Qualquer outra fonte de oneShotDamageBonus (Ataque Poderoso,
  // Tiro Explosivo) reseta normal, mesmo com disparo bônus pendente.
  const keepFireArrowForBonusShot =
    oneShotDamageBonusSource === "Flecha de Fogo" && (attacker.bonusAttacksRemaining || 0) > 0;
  attacker.guaranteedNextHit = false;
  attacker.critBonusNextAttack = 0;
  if (!keepFireArrowForBonusShot) {
    attacker.oneShotDamageBonus = 0;
    attacker.oneShotDamageBonusSource = null;
    attacker.burnNextAttackAlwaysTurns = 0;
  }
  attacker.doubleRangeNextAttack = false;
  attacker.weakeningStrikeNextAttack = false;
  attacker.burnNextAttackTurns = 0;

  if (bonusAlwaysBurnTurns > 0) {
    if (isOnWater(defender)) {
      log(`${defender.name} está na água — a Flecha de Fogo não consegue incendiá-lo(a)!`);
    } else {
      addStatusEffect(defender, { type: "burned", ...STATUS_DOT_DAMAGE.burned, turnsLeft: bonusAlwaysBurnTurns });
      log(`${defender.name} pega fogo com a Flecha de Fogo, acertando ou não!`);
      spawnFloatingText(defender.x, defender.y, "Em chamas!", "burn");
    }
  }

  const hitChance = guaranteedHit ? 1 : getEffectiveHitChance(attacker, defender, item, distance);
  const isHit = Math.random() < hitChance;
  playAttackAnimation(attacker, defender, item);
  // Ataques à distância/mágicos de alvo único disparam seu próprio
  // projétil/feixe aqui; magias em área já mandam o próprio efeito (e o
  // atraso correspondente) de fora, via explicitCosmeticDelay — nesse caso
  // não criamos um segundo projétil por alvo atingido.
  const cosmeticDelay =
    explicitCosmeticDelay !== null
      ? explicitCosmeticDelay
      : spawnAttackProjectile(attacker, defender, item, {
          fireArrow: bonusAlwaysBurnTurns > 0,
          explosiveShot: bonusBurnTurns > 0,
        });
  // Congela a posição do golpe agora — algumas magias (Ventania) empurram o
  // alvo logo depois de resolver o acerto, e o texto/flash atrasados não
  // podem "seguir" essa posição nova, senão aparecem no lugar errado.
  const hitX = defender.x;
  const hitY = defender.y;

  if (!isHit) {
    if (defender.statusEffects?.some((effect) => effect.type === "evasive")) triggerEvasiveDodgeVisual(defender);
    log(`${attacker.name} atacou ${defender.name} com ${item.name} e errou!`);
    if (cosmeticDelay > 0) {
      setTimeout(() => {
        spawnFloatingText(hitX, hitY, "Errou!", "miss");
        playSfx("miss");
        onOutcome?.(false);
      }, cosmeticDelay);
    } else {
      spawnFloatingText(hitX, hitY, "Errou!", "miss");
      playSfx("miss");
      onOutcome?.(false);
    }
    // Regra global (item 32): a chance de contra-ataque existe mesmo se o
    // ranged attack errar — o risco vem da tentativa em corpo a corpo.
    maybeTriggerRangedMeleeCounter(attacker, defender, item, distance, isCounterAttack, cosmeticDelay);
    return false;
  }

  const isCrit = Math.random() < Math.min(getCritChance(item, attackAngle) + critBonus, 1);
  const baseDamage = getWeaponDamage(item);
  // Ladino, Ataque Furtivo: +2 de dano quando o golpe vem de um ângulo que
  // não é a frente do alvo, e +2 de dano (sempre) se o próprio Ladino estiver
  // invisível ao atacar — os dois podem somar no mesmo golpe.
  const angleSneakBonus =
    attacker.backstabBonus && !isAttackFromFront(attacker, defender) ? attacker.backstabBonus : 0;
  const stealthSneakBonus =
    attacker.backstabBonus && isInvisible(attacker) ? attacker.backstabBonus : 0;
  const sneakAttackBonus = angleSneakBonus + stealthSneakBonus;
  const furyEffect = attacker.statusEffects && attacker.statusEffects.find((e) => e.type === "fury");
  const furyBonus = furyEffect ? furyEffect.damageBonus : 0;
  // Redução de dano recebido, aplicada por último (depois do crítico), sem
  // deixar o golpe virar cura — o Defender (Guerreiro) reduz temporariamente
  // por cima da redução passiva dele (passiveDamageReduction, sempre ativa,
  // ver createGuerreiroState — os dois somam). Só vale pra dano de golpe
  // direto (aqui em resolveSingleHit); dano de status por turno (queimadura,
  // veneno, etc.) roda num caminho totalmente separado
  // (applyStatusEffectsAtTurnStart), nunca passa por aqui.
  const guardEffect = defender.statusEffects && defender.statusEffects.find((e) => e.type === "guarding");
  const damageReduction = (guardEffect ? guardEffect.damageReduction : 0) + (defender.passiveDamageReduction || 0);
  const damage = Math.max(
    0,
    (baseDamage + sneakAttackBonus + oneShotDamageBonus + furyBonus) * (isCrit ? item.critMultiplier : 1) -
      damageReduction
  );
  defender.hp -= damage;
  const sneakNote = sneakAttackBonus > 0 ? " (Ataque Furtivo!)" : "";
  log(
    `${attacker.name} ataca ${defender.name} com ${item.name}${isCrit ? " (CRÍTICO!)" : ""}${sneakNote} causando ${damage} de dano.`
  );
  const revealHitFx = () => {
    // Freeze-frame primeiro, golpe "de verdade" (shake/flash/número) só
    // aparece depois — crítico congela mais tempo e sacode mais forte.
    // Magia é sempre um pouco mais lenta e pesada que arma equivalente
    // (congela mais, sacode com mais amplitude) pra parecer uma explosão de
    // energia em vez de um golpe físico rápido.
    const stopMs = isWeaponAttack ? (isCrit ? 130 : 70) : (isCrit ? 190 : 110);
    const shakeKind = isWeaponAttack
      ? isCrit
        ? "heavy"
        : "light"
      : isCrit
        ? "magic-heavy"
        : "magic-light";
    hitStop(stopMs);
    setTimeout(() => {
      playHitReaction(defender);
      // Tiro Explosivo (e qualquer outro golpe usando oneShotDamageBonus,
      // ex: Ataque Poderoso) mostra o dano da arma separado do bônus da
      // habilidade em vez de um número só somado — mais fácil de ver de
      // onde veio cada parte. weaponPortion escala com o crítico igual o
      // resto; bonusPortion pega o restante exato (mantém a soma batendo
      // com `damage`, mesmo com redução de dano/arredondamento).
      if (oneShotDamageBonus > 0) {
        const weaponPortion = Math.max(0, Math.round(baseDamage * (isCrit ? item.critMultiplier : 1)));
        const bonusPortion = damage - weaponPortion;
        spawnFloatingText(hitX, hitY, (isCrit ? `-${weaponPortion} Crítico!` : `-${weaponPortion}`), isCrit ? "crit" : "hit");
        spawnFloatingText(hitX, hitY, `-${bonusPortion} (${oneShotDamageBonusSource})`, "hit");
      } else {
        spawnFloatingText(
          hitX,
          hitY,
          (isCrit ? `-${damage} Crítico!` : `-${damage}`) + (sneakAttackBonus > 0 ? " Furtivo!" : ""),
          isCrit ? "crit" : "hit"
        );
      }
      playAttackFx(hitX, hitY, item.sfx, isCrit);
      spawnCutMark(hitX, hitY, item.swing);
      screenShake(shakeKind);
      // Flecha (normal e de fogo): contato seco físico — spark/fragmentos de
      // madeira em cima do flash genérico acima, sem virar explosão.
      if (item.projectile === "arrow") spawnArrowImpactSpark(hitX, hitY);
      // Raio de Gelo: cristais/shards no impacto em vez do flash circular
      // genérico sozinho.
      if (item.beamTint === "ice") spawnIceImpactCrystals(hitX, hitY);
      // Míssil Mágico: núcleo comprime + fragmentos se quebram, não a
      // explosão genérica sozinha.
      if (item.projectile === "missile") spawnMissileImpact(hitX, hitY);
      // Relâmpago: eletricidade se espalhando pela silhueta, não a explosão
      // genérica sozinha. Checa o item exato (não item.sfx — "lightning" é
      // reaproveitado como efeito sonoro por outra magia, a Explosão
      // Sonora, que não pode ganhar esse visual elétrico por engano).
      if (item === SPELLS.lightning) spawnLightningImpact(hitX, hitY);
      // Tiro Explosivo (Químico): primeiro o contato normal acima (impacto
      // seco, igual o Tiro Normal), só DEPOIS a detonação — pra não parecer
      // que a explosão "surgiu do nada" antes da bala sequer chegar.
      if (bonusBurnTurns > 0) {
        spawnExplosiveShotDetonation(hitX, hitY);
      } else if (item.projectile === "bullet") {
        // Tiro Normal (Químico): impacto seco também — só spark metálico,
        // nunca detona (diferencia do Tiro Explosivo acima).
        spawnHitParticles(hitX, hitY, "#e8e0c8", 4);
      }
      onOutcome?.(true);
    }, stopMs);
  };
  if (cosmeticDelay > 0) {
    setTimeout(revealHitFx, cosmeticDelay);
  } else {
    revealHitFx();
  }

  if (item.appliesPoison) {
    addStatusEffect(defender, {
      type: "poison",
      damageMin: item.appliesPoison.damageMin,
      damageMax: item.appliesPoison.damageMax,
      turnsLeft: item.appliesPoison.turns,
      ctDrainPerTurn: item.appliesPoison.ctDrainPerTurn,
    });
    log(`${defender.name} foi envenenado!`);
  }
  // Queimadura (Bola de Fogo): mesmo tique genérico de dano por turno do
  // veneno/sangramento/raízes (ver applyStatusEffectsAtTurnStart), só com
  // damageMin=damageMax=1 pra ser sempre exatamente 1 de dano por turno.
  if (item.appliesBurn) {
    if (isOnWater(defender)) {
      log(`${defender.name} está na água — não pega fogo!`);
    } else {
      addStatusEffect(defender, {
        type: "burned",
        damageMin: item.appliesBurn.damageMin,
        damageMax: item.appliesBurn.damageMax,
        turnsLeft: item.appliesBurn.turns,
      });
      log(`${defender.name} pegou fogo!`);
    }
  }
  if (item.appliesBlind) {
    addStatusEffect(defender, { type: "blinded", turnsLeft: item.appliesBlind.turns });
    log(`${defender.name} ficou ofuscado(a)! -10% de chance de acerto por ${item.appliesBlind.turns} turno(s).`);
    spawnFloatingText(defender.x, defender.y, "Ofuscado!", "miss");
    playSfx("blind", boardPanFor(defender.x));
  }
  // Explosão Sonora (Fada): mesmo desconto de Ofuscado (-10 pontos
  // percentuais), mas empilha com ele se o atacante tiver os dois ao mesmo
  // tempo (ver isDazed/getEffectiveHitChance) — não trava mais num valor fixo.
  if (item.appliesDaze) {
    addStatusEffect(defender, { type: "dazed", turnsLeft: item.appliesDaze.turns });
    log(`${defender.name} fica atordoado(a) pelo som! -10% de chance de acerto nos próprios ataques por ${item.appliesDaze.turns} turno(s).`);
    spawnFloatingText(defender.x, defender.y, "Atordoado!", "miss");
    playSfx("stun", boardPanFor(defender.x));
  }
  // ctDrainConfirmChance (Funda do Goblin) é uma SEGUNDA rolagem, além do
  // acerto do golpe em si — o golpe já acertou (isHit acima), mas o roubo
  // de CT só acontece se essa rolagem à parte também passar. Arma sem
  // ctDrainConfirmChance (a maioria) sempre confirma, como sempre foi.
  if (item.appliesCtDrain) {
    const ctDrainConfirmChance = item.ctDrainConfirmChance ?? 1;
    if (Math.random() < ctDrainConfirmChance) {
      defender.ct = Math.max(defender.ct - item.appliesCtDrain, 0);
      log(`${defender.name} perde ${item.appliesCtDrain} de CT!`);
    }
  }
  // Cajado (Mago): dreno de MP vampírico — o atacante rouba, não só tira.
  // Se o alvo tiver menos MP que o valor cheio, drena só o que existe (nunca
  // vai a negativo) e o atacante recebe exatamente essa quantia proporcional
  // (não o valor cheio do item). Só quem tem maxMp de verdade (não toda
  // unidade tem) perde/ganha MP; nas outras, incondicionalmente, não faz nada.
  if (item.appliesMpDrain && defender.maxMp !== undefined) {
    const drained = Math.min(item.appliesMpDrain, defender.mp);
    defender.mp -= drained;
    log(`${defender.name} perde ${drained} de MP!`);
    spawnFloatingText(defender.x, defender.y, `-${drained} MP`, "poison-status");
    if (drained > 0 && attacker.maxMp !== undefined) {
      attacker.mp = Math.min(attacker.mp + drained, attacker.maxMp);
      log(`${attacker.name} recupera ${drained} de MP roubado!`);
      spawnFloatingText(attacker.x, attacker.y, `+${drained} MP`, "heal");
    }
  }
  // Lentidão embutida na própria arma/magia (ex: Atropelar) — diferente do
  // Golpe Debilitante, que é um buff condicional no atacante; aqui é sempre
  // que o golpe acertar. Reaproveita o mesmo status "weakened".
  if (item.appliesSlow) {
    const slowAmount = Math.min(item.appliesSlow.moveReduction, defender.moveRange);
    defender.moveRange -= slowAmount;
    addStatusEffect(defender, {
      type: "weakened",
      turnsLeft: item.appliesSlow.turns,
      moveReduction: slowAmount,
    });
    log(`${defender.name} fica mais lento! -${slowAmount} de deslocamento por ${item.appliesSlow.turns} turno(s).`);
  }
  // Raio de Gelo (Mago): reduz agilidade (não deslocamento) — soma com usos
  // futuros em vez de substituir, e devolve exatamente o que tirou quando
  // expira (ver applyStatusEffectsAtTurnStart).
  if (item.appliesSpeedReduction && defender.hp > 0) {
    const amount = item.appliesSpeedReduction.amount;
    defender.speed -= amount;
    addStatusEffect(defender, {
      type: "slowed",
      turnsLeft: item.appliesSpeedReduction.turns,
      speedReduction: amount,
    });
    log(`${defender.name} fica mais lento(a)! -${amount} de agilidade por ${item.appliesSpeedReduction.turns} turno(s).`);
  }

  if (defender.hp <= 0) {
    defender.hp = 0;
    log(`${defender.name} foi derrotado!`);
    playSfx("death", boardPanFor(defender.x));
  }

  // Golpe Debilitante (Ladino): só aplica se o alvo sobreviveu ao golpe.
  // Cada uso empilha um novo sangramento + uma nova redução de deslocamento
  // (não renova os existentes) — de propósito, pra ser cumulativo.
  if (weakeningStrike && defender.hp > 0) {
    addStatusEffect(defender, { type: "bleed", damageMin: 1, damageMax: 1, turnsLeft: 3 });
    const moveReduction = Math.min(1, defender.moveRange);
    defender.moveRange -= moveReduction;
    addStatusEffect(defender, { type: "weakened", turnsLeft: 3, moveReduction });
    log(`${defender.name} está sangrando e mais lento por causa do Golpe Debilitante!`);
    spawnFloatingText(defender.x, defender.y, "Debilitado!", "poison-status");
  }

  // Tiro Explosivo (Químico): só queima se o golpe realmente acertou (o
  // bônus de dano dele já entrou na conta de "damage" lá em cima, junto
  // com oneShotDamageBonus — aqui só falta o efeito de queimadura).
  if (bonusBurnTurns > 0 && defender.hp > 0) {
    if (isOnWater(defender)) {
      log(`${defender.name} está na água — o Tiro Explosivo não consegue incendiá-lo(a)!`);
    } else {
      addStatusEffect(defender, { type: "burned", ...STATUS_DOT_DAMAGE.burned, turnsLeft: bonusBurnTurns });
      log(`${defender.name} pega fogo com o Tiro Explosivo!`);
    }
  }

  // Contra-ataque passivo (Troll): só dispara em quem levou o golpe original
  // (não no próprio contra-ataque, senão dois Trolls ficariam revidando um
  // ao outro pra sempre), só se sobreviveu, e só se quem bateu ainda está ao
  // alcance do contra-ataque (corpo a corpo).
  if (!isCounterAttack && defender.hp > 0 && defender.counterAttackChance && attacker !== defender) {
    const counterWeapon = defender.counterWeapon;
    if (counterWeapon && isInWeaponRange(counterWeapon, distance)) {
      // Espera o golpe original terminar de aparecer na tela (swing + hit-stop
      // + número de dano) antes de revidar — senão os dois ataques pareciam
      // simultâneos e ficava difícil acompanhar o que aconteceu.
      setTimeout(() => {
        if (defender.hp <= 0 || attacker.hp <= 0) return;
        if (Math.random() < defender.counterAttackChance) {
          log(`${defender.name} revida com um contra-ataque!`);
          playSfx("counter", boardPanFor(defender.x));
          resolveSingleHit(defender, attacker, counterWeapon, true);
          // O contra-ataque pode matar quem já tinha passado pelo check de
          // fim de turno original (que rodou antes desse atraso) — refaz o
          // check agora, senão o turno de um `currentActor` morto ficava
          // travado.
          render();
          checkBattleOutcome();
          if (isHumanControlled(currentActor.team) && !battleEnded) {
            checkEndCurrentTurn();
          }
        }
      }, REACTION_ATTACK_DELAY);
    }
  }

  // Regra global (item 32): ataque RANGED usado a distância de MELEE dá ao
  // defensor uma chance de contra-atacar, além (não em vez) de qualquer
  // contra-ataque passivo próprio acima.
  maybeTriggerRangedMeleeCounter(attacker, defender, item, distance, isCounterAttack, cosmeticDelay);

  return true;
}

// Acha o primeiro tile ocupado no caminho reto até targetTile (pra ataques
// que exigem linha limpa, como a Zarabatana e a Bola de Fogo); se nada
// bloquear, o impacto acontece no próprio targetTile.
function resolveObstructedTarget(caster, targetTile) {
  const path = bresenhamLine(caster.x, caster.y, targetTile.x, targetTile.y).slice(1);
  for (const tile of path) {
    const blocker = unitAt(tile.x, tile.y);
    const isFinal = tile.x === targetTile.x && tile.y === targetTile.y;
    if (blocker || isFinal) return tile;
  }
  return targetTile;
}

// Ataque à distância de alvo único que exige linha limpa (Zarabatana): se
// algo estiver no caminho, acerta aquilo em vez do alvo pretendido. Se
// acertar de verdade, aplica o veneno da arma (quando ela tiver um).
function performRangedAttackWithObstruction(caster, target, weapon) {
  setFacingTowards(caster, target);
  const impactTile = resolveObstructedTarget(caster, { x: target.x, y: target.y });
  const actualDefender = unitAt(impactTile.x, impactTile.y);

  if (!actualDefender) {
    log(`${caster.name} atira com ${weapon.name}, mas não atinge nada.`);
    finalizeAction(caster, weapon);
    return;
  }

  if (actualDefender !== target) {
    log(
      `${caster.name} mirou em ${target.name}, mas algo bloqueou o caminho — ${actualDefender.name} foi atingido no lugar!`
    );
  }

  if (shouldShowBattleScene(caster, actualDefender, weapon)) {
    runBattleScene(caster, actualDefender, weapon, () => finalizeAction(caster, weapon));
  } else {
    resolveSingleHit(caster, actualDefender, weapon);
    finalizeAction(caster, weapon);
  }
}

// Cura de Todos / Regeneração de Todos / Ressurreição: cada uma precisa de
// uma leitura visual própria (evento imediato vs. contínuo vs. retorno à
// vida) e, sendo magias de área com vários alvos possíveis, tudo aqui é
// LOCAL por alvo — nada de flashScreen cobrindo o campo inteiro.

// Cura: pulso de restauração imediata — motes convergem pro alvo e estouram
// num anel curto. Rápido e "cheio" pra não ser confundido com a Regeneração.
function spawnHealAbsorb(x, y) {
  const pos = tileScreenPercent(x + 0.5, y + 0.5, 0.5);
  const wrap = document.createElement("div");
  wrap.className = "heal-absorb";
  wrap.style.left = `${pos.leftPct}%`;
  wrap.style.top = `${pos.topPct}%`;
  for (let i = 0; i < 6; i++) {
    const mote = document.createElement("span");
    mote.className = "heal-absorb-mote";
    const angle = (Math.PI * 2 * i) / 6 + (Math.random() - 0.5) * 0.4;
    const dist = 20 + Math.random() * 8;
    mote.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    mote.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
    mote.style.setProperty("--mote-delay", `${i * 20}ms`);
    wrap.appendChild(mote);
  }
  boardOverlayEl.appendChild(wrap);
  setTimeout(() => wrap.remove(), 480);
}

// Regeneração: cue de aplicação mais lento e orgânico que a Cura — brotos
// sobem em vez de convergir num pulso — preparando a transição pro aura
// contínua do status "regen" (ver STATUS_VFX_PROFILES), que assume logo em
// seguida sem corte brusco.
function spawnRegenApplyCue(x, y) {
  const pos = tileScreenPercent(x + 0.5, y + 0.5, 0.2);
  const wrap = document.createElement("div");
  wrap.className = "regen-apply";
  wrap.style.left = `${pos.leftPct}%`;
  wrap.style.top = `${pos.topPct}%`;
  for (let i = 0; i < 4; i++) {
    const mote = document.createElement("span");
    mote.className = "regen-apply-mote";
    mote.style.setProperty("--mote-x", `${(i - 1.5) * 10}px`);
    mote.style.setProperty("--mote-delay", `${i * 70}ms`);
    wrap.appendChild(mote);
  }
  boardOverlayEl.appendChild(wrap);
  setTimeout(() => wrap.remove(), 640);
}

// Ressurreição: energia se forma no conjurador, um filete dourado se conecta
// ao corpo do alvo e a reconstrução sobe progressivamente (coluna de luz +
// pulso final) em vez de aparecer instantânea — ver castResurrect.
function spawnResurrectCastAura(caster) {
  const pos = tileScreenPercent(caster.x + 0.5, caster.y + 0.5, 1.05);
  const el = document.createElement("div");
  el.className = "resurrect-cast-aura";
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  boardOverlayEl.appendChild(el);
  setTimeout(() => el.remove(), 420);
}

function spawnResurrectTether(caster, target) {
  const from = tileScreenPercent(caster.x + 0.5, caster.y + 0.5, 0.5);
  const to = tileScreenPercent(target.x + 0.5, target.y + 0.5, 0.5);
  const dx = to.leftPct - from.leftPct;
  const dy = to.topPct - from.topPct;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const length = Math.hypot(dx, dy);
  const el = document.createElement("div");
  el.className = "resurrect-tether";
  el.style.left = `${from.leftPct}%`;
  el.style.top = `${from.topPct}%`;
  el.style.width = `${length}%`;
  el.style.transform = `rotate(${angle}deg)`;
  boardOverlayEl.appendChild(el);
  setTimeout(() => el.remove(), 380);
}

function spawnResurrectReconstruction(x, y) {
  const pos = tileScreenPercent(x + 0.5, y + 0.5, 1.1);
  const el = document.createElement("div");
  el.className = "resurrect-reconstruction";
  el.style.left = `${pos.leftPct}%`;
  el.style.top = `${pos.topPct}%`;
  boardOverlayEl.appendChild(el);
  setTimeout(() => el.remove(), 850);
}

// Cura: rola acerto (normalmente 100%) e recupera vida sem passar do máximo.
function resolveHeal(caster, target, spell) {
  const isHit = Math.random() < spell.hitChance;
  if (!isHit) {
    log(`${caster.name} tenta curar ${target.name} com ${spell.name}, mas falha!`);
    spawnFloatingText(target.x, target.y, "Falhou!", "miss");
    playSfx("miss");
    return;
  }
  const healAmount = Math.floor(Math.random() * (spell.healMax - spell.healMin + 1)) + spell.healMin;
  target.hp = Math.min(target.hp + healAmount, target.maxHp);
  log(`${caster.name} cura ${target.name} com ${spell.name}, recuperando ${healAmount} de vida.`);
  spawnFloatingText(target.x, target.y, `+${healAmount}`, "heal");
  consumeCombatVfxProfile(target.x, target.y);
  spawnHealAbsorb(target.x, target.y);
  playSfx("heal", boardPanFor(target.x));
}

// Regeneração em Área: igual resolveHeal (rola acerto do mesmo jeito), mas
// em vez de curar na hora aplica o status "regen" — a cura de verdade
// acontece aos poucos, no início dos próximos turnos de quem foi atingido
// (ver applyStatusEffectsAtTurnStart). Reaplicar em quem já está
// regenerando estende a duração em vez de empilhar (ver DOT_HOT_TYPES).
function resolveRegen(caster, target, spell) {
  const isHit = Math.random() < spell.hitChance;
  if (!isHit) {
    log(`${caster.name} tenta curar ${target.name} com ${spell.name}, mas falha!`);
    spawnFloatingText(target.x, target.y, "Falhou!", "miss");
    playSfx("miss");
    return;
  }
  addStatusEffect(target, {
    type: "regen",
    healMin: spell.healMin,
    healMax: spell.healMax,
    turnsLeft: spell.regenTurns,
  });
  log(`${caster.name} usa ${spell.name} em ${target.name}, que passa a regenerar vida.`);
  spawnFloatingText(target.x, target.y, "Regenerando!", "heal");
  spawnRegenApplyCue(target.x, target.y);
  playSfx("heal", boardPanFor(target.x));
}

// Poção de Mana (Químico): igual à cura, mas recupera MP em vez de HP.
function resolveManaRestore(caster, target, spell) {
  const isHit = Math.random() < spell.hitChance;
  if (!isHit) {
    log(`${caster.name} tenta usar ${spell.name} em ${target.name}, mas falha!`);
    spawnFloatingText(target.x, target.y, "Falhou!", "miss");
    playSfx("miss");
    return;
  }
  if (target.maxMp === undefined) {
    log(`${caster.name} usa ${spell.name} em ${target.name}, mas ${target.name} não usa MP.`);
    return;
  }
  const amount = Math.floor(Math.random() * (spell.manaMax - spell.manaMin + 1)) + spell.manaMin;
  target.mp = Math.min(target.mp + amount, target.maxMp);
  log(`${caster.name} usa ${spell.name} em ${target.name}, recuperando ${amount} de MP.`);
  spawnFloatingText(target.x, target.y, `+${amount} MP`, "heal");
  playAttackFx(target.x, target.y, "heal", false);
}

// Poção de Cura / Poção de Mana (Químico): como um ataque à distância que
// exige linha limpa — se algo estiver no caminho até o aliado escolhido, o
// item afeta quem bloqueou o caminho em vez do alvo pretendido.
function castSupplyItem(caster, target, item) {
  setFacingTowards(caster, target);
  const impactTile = resolveObstructedTarget(caster, { x: target.x, y: target.y });
  const actualTarget = unitAt(impactTile.x, impactTile.y);

  if (!actualTarget) {
    log(`${caster.name} usa ${item.name}, mas não havia ninguém no caminho.`);
    finalizeAction(caster, item);
    return;
  }
  if (actualTarget !== target) {
    log(
      `${caster.name} tentou usar ${item.name} em ${target.name}, mas algo bloqueou o caminho — ${actualTarget.name} foi afetado(a) no lugar!`
    );
  }

  // O frasco é só a leitura visual da ação existente; cura/MP continuam
  // sendo resolvidos imediatamente pelas mesmas funções abaixo.
  const profile = combatVfxProfile(caster);
  rememberCombatVfxProfile(caster, actualTarget, item);
  playAttackAnimation(caster, actualTarget, item);
  spawnProjectile(caster.x, caster.y, actualTarget.x, actualTarget.y, "flask", 1, profile);

  if (item.manaMin !== undefined) {
    resolveManaRestore(caster, actualTarget, item);
  } else {
    resolveHeal(caster, actualTarget, item);
  }
  finalizeAction(caster, item);
}

// Antídoto (Químico): em área, remove veneno e paralisia instantaneamente de
// qualquer um atingido (aliado ou inimigo) — sem rolagem de acerto, sem dano.
function castAntidote(caster, spell, tiles) {
  // Habilidade de área: remove veneno/paralisia de qualquer um na área,
  // aliado ou inimigo.
  const targets = tiles.map((t) => unitAt(t.x, t.y)).filter((u) => u);

  // Química medicinal (ciano/verde claro), não o reaproveitamento genérico
  // de Cura — ver spawnAntidoteCastCue/Transfer/Reaction.
  spawnAntidoteCastCue(caster);

  let curedAny = false;
  for (const u of targets) {
    const before = u.statusEffects;
    const wasPoisoned = before.some((e) => e.type === "poison");
    const after = before.filter((e) => e.type !== "poison" && e.type !== "paralyzed");
    if (after.length < before.length) {
      curedAny = true;
      u.statusEffects = after;
      log(`${u.name} foi curado(a) de veneno/paralisia por ${spell.name}.`);
      spawnFloatingText(u.x, u.y, "Curado!", "heal");
      spawnAntidoteTransfer(u.x, u.y);
      // O status já foi removido acima (lógica não espera cosmético, mesmo
      // padrão do resto do jogo) — só o brilho da reação/neutralização
      // espera um instante pra não competir com a gota de antídoto chegando
      // no mesmo frame.
      setTimeout(() => spawnAntidoteReaction(u.x, u.y, wasPoisoned), 160);
    } else {
      u.statusEffects = after;
    }
  }
  if (!curedAny) {
    log(`${spell.name} não encontrou nada para curar na área.`);
  }
  finalizeAction(caster, spell);
}

// Cura (Xamã/Fada): magia de área (losango de 5 quadrados, ver areaRadius)
// em vez de alvo único — cura qualquer um dentro da área, aliado ou
// inimigo (toda magia de área acerta todo mundo). Cada alvo rola acerto por
// conta própria via resolveHeal (hitChance:1 na Cura, então sempre acerta).
function castHealAoe(caster, spell, targetTile) {
  setFacingTowards(caster, targetTile);
  const tiles = computeAoeAreaTiles(caster, spell, targetTile) || [targetTile];
  const targets = tiles.map((t) => unitAt(t.x, t.y)).filter((u) => u);

  if (targets.length === 0) {
    log(`Não havia ninguém na área do ${spell.name}.`);
  }

  for (const u of targets) {
    resolveHeal(caster, u, spell);
  }

  finalizeAction(caster, spell);
}

// Regeneração em Área: mesmo formato de castHealAoe (mesma área, mesmo
// "acerta todo mundo dentro, aliado ou inimigo"), só troca resolveHeal por
// resolveRegen.
function castRegenAoe(caster, spell, targetTile) {
  setFacingTowards(caster, targetTile);
  const tiles = computeAoeAreaTiles(caster, spell, targetTile) || [targetTile];
  const targets = tiles.map((t) => unitAt(t.x, t.y)).filter((u) => u);

  if (targets.length === 0) {
    log(`Não havia ninguém na área do ${spell.name}.`);
  }

  for (const u of targets) {
    resolveRegen(caster, u, spell);
  }

  finalizeAction(caster, spell);
}

// Ressurreição (Xamã/Fada/Químico): alvo único, escolhido via deadUnitAt em
// onTileClick — só cadáveres ainda no campo (até 3 turnos após a morte, ver
// decayCorpses) do MESMO time do conjurador contam como alvo válido. Rola
// acerto como qualquer outra magia; se falhar, o corpo continua onde estava
// (a contagem de decayCorpses não é afetada, nada é "gasto" na tentativa
// além do próprio turno/CT/MP). CT zerado de propósito — sem isso a unidade
// podia voltar já com CT suficiente pra agir de novo na mesma rodada.
// Cor de destaque exclusiva da Ressurreição — dourado, igual ao flash de
// golpe corpo a corpo (impact-melee), mas usado aqui de propósito pra tudo
// (partícula, flash de tela) em vez da paleta verde padrão de cura, pra não
// parecer "só mais uma cura".
const REVIVE_GOLD = "#ffe08a";

function castResurrect(caster, target, spell) {
  setFacingTowards(caster, target);
  const isHit = Math.random() < spell.hitChance;
  if (!isHit) {
    log(`${caster.name} tenta ressuscitar ${target.name} com ${spell.name}, mas falha!`);
    spawnFloatingText(target.x, target.y, "Falhou!", "miss");
    playSfx("reviveFail", boardPanFor(target.x));
    finalizeAction(caster, spell);
    return;
  }
  const revivedHp = Math.round(target.maxHp / 2);
  target.hp = revivedHp;
  target.ct = 0;
  target.turnsSinceDeath = undefined;
  // Volta "limpo" — nenhum status (queimando, envenenado, regenerando etc.)
  // que tinha antes de morrer sobrevive à ressurreição. Alguns tipos mexem
  // direto num atributo do personagem (fury/swiftFeet somam, weakened/slowed
  // subtraem) em vez de só existir no array — precisa desfazer isso antes de
  // zerar, senão o atributo fica preso no valor alterado pra sempre.
  for (const effect of target.statusEffects) {
    if (effect.type === "fury") target.speed -= effect.speedBonus;
    else if (effect.type === "swiftFeet") target.moveRange -= effect.moveBonus;
    else if (effect.type === "weakened") target.moveRange += effect.moveReduction;
    else if (effect.type === "slowed") target.speed += effect.speedReduction;
  }
  target.statusEffects = [];
  log(`${caster.name} ressuscita ${target.name} com ${spell.name}! Volta com ${revivedHp} de vida.`);
  spawnFloatingText(target.x, target.y, "Ressuscitado!", "heal");
  // Sequência progressiva (não um flash global instantâneo): energia se
  // forma no conjurador, um filete dourado viaja até o corpo, e só então a
  // reconstrução sobe aos poucos — o pulso/faíscas/tremor batem no fim dessa
  // reconstrução, não no instante em que o acerto é decidido. É a ação mais
  // rara do jogo, então merece pesar mais que uma cura comum.
  spawnResurrectCastAura(caster);
  setTimeout(() => spawnResurrectTether(caster, target), 90);
  hitStop(180);
  setTimeout(() => {
    spawnResurrectReconstruction(target.x, target.y);
  }, 180);
  setTimeout(() => {
    spawnHitParticles(target.x, target.y, REVIVE_GOLD, 18);
    screenShake("magic-heavy");
    playSfx("revive", boardPanFor(target.x));
  }, 600);
  finalizeAction(caster, spell);
}

// Armadilha (Ladino): checa de novo (a validação do popup pode estar
// desatualizada se o alvo se moveu entre o clique e a confirmação) que
// nenhum tile da área está ocupado antes de instalar de verdade. Se estiver
// bloqueada, não gasta CT/MP nem consome a ação — como se o jogador nunca
// tivesse confirmado.
function castTrap(caster, item, targetTile) {
  const areaTiles = computeAoeAreaTiles(caster, item, targetTile) || [];
  const blocked = areaTiles.some((t) => unitAt(t.x, t.y));
  if (blocked) {
    log(`${caster.name} tenta armar ${item.name}, mas há alguém na área — a armadilha não foi instalada.`);
    attackableTiles = [];
    render();
    if (isHumanControlled(caster.team)) promptNextAction(caster);
    return;
  }
  traps.push({ tiles: areaTiles, ownerTeam: caster.team, triggered: false, turnsLeft: null });
  log(`${caster.name} instala uma ${item.name} escondida na área!`);
  spawnFloatingText(caster.x, caster.y, "Armadilha!", "root-status");
  finalizeAction(caster, item);
}

// Invisibilidade (Ladino): buff em si mesmo, sem rolagem de acerto — sempre
// funciona. Enquanto ativa, ataques de arma erram automaticamente contra o
// Ladino (ver resolveSingleHit); magias continuam acertando normalmente.
function castInvisibility(caster, spell) {
  addStatusEffect(caster, { type: "invisible", turnsLeft: spell.turns });
  log(`${caster.name} usa ${spell.name} e some de vista por ${spell.turns} turnos!`);
  spawnFloatingText(caster.x, caster.y, "Invisível!", "root-status");
  playAttackFx(caster.x, caster.y, "arcane", false);
  finalizeAction(caster, spell);
}

// Flecha de Fogo pode combinar com Tiro Rápido, Tiro Longo OU Tiro Certeiro
// (pedido do usuário) — furando o singleSelfAbilityPerTurn do Arqueiro só
// pra esses pares específicos, sempre 2 habilidades no máximo (nunca as 4
// juntas nem nenhuma outra combinação, ex: Tiro Certeiro + Tiro Longo sem
// Flecha de Fogo continua bloqueado — ver isSelfAbilityComboAllowed). Com
// Tiro Rápido, os DOIS disparos saem em chamas (ver keepFireArrowForBonusShot
// em resolveSingleHit); com Tiro Longo, o disparo único sai em chamas E com
// o dobro de alcance; com Tiro Certeiro, o disparo sai em chamas E com 100%
// de acerto (+10% de crítico) — em todos os casos os efeitos já são
// independentes um do outro (guaranteedNextHit/doubleRangeNextAttack/
// oneShotDamageBonus/burnNextAttackAlwaysTurns são flags separadas,
// consumidas juntas no mesmo golpe em resolveSingleHit), não precisou de
// nada extra pra empilhar.
const FIRE_ARROW_COMBO_KINDS = new Set(["haste-attack", "long-shot", "true-shot"]);
function isSelfAbilityComboAllowed(unit, item) {
  const used = unit.selfAbilityKindsUsedThisTurn;
  if (!used || used.size !== 1) return false;
  const [usedKind] = used;
  if (usedKind === "fire-arrow") return FIRE_ARROW_COMBO_KINDS.has(item.kind);
  if (FIRE_ARROW_COMBO_KINDS.has(usedKind)) return item.kind === "fire-arrow";
  return false;
}

// Ponto único de despacho pras habilidades com targetMode "self" — cada uma
// tem seu próprio efeito (ver castInvisibility/castPowerAttack/etc).
function castSelfAbility(caster, item) {
  if (
    caster.singleSelfAbilityPerTurn &&
    caster.abilityUsedThisTurn &&
    !isSelfAbilityComboAllowed(caster, item)
  ) {
    log(`${caster.name} já usou uma habilidade neste turno.`);
    return;
  }
  // Habilidades "livres" (ver finishFreeSelfAction) não marcam hasActed,
  // então sem isso dava pra clicar a MESMA duas vezes seguidas no mesmo
  // turno (gastando MP à toa, ou pra classes sem singleSelfAbilityPerTurn,
  // empilhando efeito sem limite). Rastreado por nome, não por classe
  // inteira — diferente de singleSelfAbilityPerTurn (Arqueiro: só UMA
  // habilidade de si mesmo no turno todo, salvo a combinação com Flecha de
  // Fogo acima), aqui outras habilidades diferentes continuam permitidas,
  // só a repetição da mesma é bloqueada.
  if (!caster.selfAbilitiesUsedThisTurn) caster.selfAbilitiesUsedThisTurn = new Set();
  if (caster.selfAbilitiesUsedThisTurn.has(item.name)) {
    log(`${caster.name} já usou ${item.name} neste turno.`);
    return;
  }
  caster.selfAbilitiesUsedThisTurn.add(item.name);
  if (!caster.selfAbilityKindsUsedThisTurn) caster.selfAbilityKindsUsedThisTurn = new Set();
  caster.selfAbilityKindsUsedThisTurn.add(item.kind);
  if (caster.singleSelfAbilityPerTurn) {
    caster.abilityUsedThisTurn = true;
  }
  switch (item.kind) {
    case "invisibility":
      return castInvisibility(caster, item);
    case "power-attack":
      return castPowerAttack(caster, item);
    case "true-shot":
      return castTrueShot(caster, item);
    case "long-shot":
      return castLongShot(caster, item);
    case "haste-attack":
      return castAgility(caster, item);
    case "swift-feet":
      return castSwiftFeet(caster, item);
    case "fury":
      return castFury(caster, item);
    case "regen-boost":
      return castRegenBoost(caster, item);
    case "weakening-strike":
      return castWeakeningStrike(caster, item);
    case "defend":
      return castDefend(caster, item);
    case "evasive":
      return castEvasiveManeuver(caster, item);
    case "explosive-shot":
      return castExplosiveShot(caster, item);
    case "fire-arrow":
      return castFireArrow(caster, item);
  }
}

// Habilidades "livres": não gastam CT nem marcam hasActed, só MP — a unidade
// continua o turno normalmente (mover/atacar) depois de ativar. Pra IA, só
// reabre o menu (promptNextAction) se o time for controlado por humano.
function finishFreeSelfAction(caster, item) {
  caster.mp = Math.max(caster.mp - (item.mpCost || 0), 0);
  render();
  if (isHumanControlled(caster.team)) {
    promptNextAction(caster);
  }
}

function castPowerAttack(caster, item) {
  caster.oneShotDamageBonus = (caster.oneShotDamageBonus || 0) + item.damageBonus;
  caster.oneShotDamageBonusSource = item.name;
  log(`${caster.name} usa ${item.name} e prepara um golpe mais forte (+${item.damageBonus} de dano no próximo ataque)!`);
  spawnFloatingText(caster.x, caster.y, `+${item.damageBonus} ATQ!`, "heal");
  finishFreeSelfAction(caster, item);
}

function castTrueShot(caster, item) {
  caster.guaranteedNextHit = true;
  caster.critBonusNextAttack = (caster.critBonusNextAttack || 0) + item.critBonus;
  log(`${caster.name} usa ${item.name}: próximo ataque com 100% de acerto e +${Math.round(item.critBonus * 100)}% de crítico!`);
  spawnFloatingText(caster.x, caster.y, "Mira!", "heal");
  finishFreeSelfAction(caster, item);
}

// Tiro Longo (Arqueiro): dobra o alcance só do PRÓXIMO ataque — a flag é
// lida em computeRangeTiles (não em resolveSingleHit, que só resolve um
// alvo já escolhido; alcance é filtro de MIRA, decidido antes disso) e
// resetada em resolveSingleHit junto com os outros bônus de "próximo
// ataque" (guaranteedNextHit, oneShotDamageBonus etc.), pro ciclo de vida
// ficar igual ao resto dessa família de habilidade.
function castLongShot(caster, item) {
  caster.doubleRangeNextAttack = true;
  log(`${caster.name} usa ${item.name}: o alcance do próximo ataque está dobrado!`);
  spawnFloatingText(caster.x, caster.y, "Alcance!", "heal");
  finishFreeSelfAction(caster, item);
}

// Tiro Explosivo (Químico): bônus de dano rolado JÁ na hora de ativar (não
// no momento do golpe) — mesma simplificação que powerAttack já usa com um
// valor fixo, só que aqui é uma faixa. A queimadura só "pega" se o próximo
// golpe realmente acertar (ver bonusBurnTurns em resolveSingleHit).
function castExplosiveShot(caster, item) {
  const bonus = item.bonusDamageMin + Math.floor(Math.random() * (item.bonusDamageMax - item.bonusDamageMin + 1));
  caster.oneShotDamageBonus = (caster.oneShotDamageBonus || 0) + bonus;
  caster.oneShotDamageBonusSource = item.name;
  caster.burnNextAttackTurns = item.burnTurns;
  log(`${caster.name} usa ${item.name}! Próximo ataque: +${bonus} de dano e queima o alvo se acertar.`);
  spawnFloatingText(caster.x, caster.y, `+${bonus} Explosivo!`, "crit");
  finishFreeSelfAction(caster, item);
}

// Flecha de Fogo (Arqueiro): diferente do Tiro Explosivo, a queimadura
// aplica MESMO SE ERRAR (ver burnNextAttackAlwaysTurns em resolveSingleHit)
// — só o bônus de dano extra depende de acertar.
function castFireArrow(caster, item) {
  const bonus = item.bonusDamageMin + Math.floor(Math.random() * (item.bonusDamageMax - item.bonusDamageMin + 1));
  caster.oneShotDamageBonus = (caster.oneShotDamageBonus || 0) + bonus;
  caster.oneShotDamageBonusSource = item.name;
  caster.burnNextAttackAlwaysTurns = item.burnTurns;
  log(`${caster.name} usa ${item.name}! Próxima flecha queima o alvo mesmo se errar, e causa +${bonus} de dano se acertar.`);
  spawnFloatingText(caster.x, caster.y, "Flecha em Chamas!", "crit");
  finishFreeSelfAction(caster, item);
}

function castWeakeningStrike(caster, item) {
  caster.weakeningStrikeNextAttack = true;
  log(`${caster.name} usa ${item.name}: se o próximo ataque acertar, vai debilitar o alvo!`);
  spawnFloatingText(caster.x, caster.y, "Debilitar!", "poison-status");
  finishFreeSelfAction(caster, item);
}

function castEvasiveManeuver(caster, item) {
  const existing = caster.statusEffects.find((e) => e.type === "evasive");
  if (existing) {
    existing.turnsLeft = item.turns;
  } else {
    caster.statusEffects.push({ type: "evasive", turnsLeft: item.turns, amount: 0.2 });
  }
  log(`${caster.name} usa ${item.name} e fica mais difícil de acertar por ${item.turns} turno(s)!`);
  spawnFloatingText(caster.x, caster.y, "Evasiva!", "root-status");
  finishFreeSelfAction(caster, item);
}

// Defender (Guerreiro): postura defensiva — reduz o dano recebido em si
// mesmo por algumas turnos (ver damageReduction em resolveSingleHit). Igual
// à Fúria/Regeneração, um segundo uso só renova a duração.
function castDefend(caster, item) {
  const existing = caster.statusEffects.find((e) => e.type === "guarding");
  if (existing) {
    existing.turnsLeft = item.turns;
  } else {
    caster.statusEffects.push({ type: "guarding", turnsLeft: item.turns, damageReduction: 2 });
  }
  log(`${caster.name} usa ${item.name} e reduz o dano recebido em 2 por ${item.turns} turno(s)!`);
  spawnFloatingText(caster.x, caster.y, "Defesa!", "heal");
  finishFreeSelfAction(caster, item);
}

function castAgility(caster, item) {
  caster.bonusAttacksRemaining = (caster.bonusAttacksRemaining || 0) + 1;
  // Tiro Rápido (Arqueiro) exige uma arma específica pro bônus (ver
  // finalizeAction); a Agilidade do Goblin não tem essa restrição
  // (restrictBonusToWeapon fica undefined nela).
  caster.bonusAttackWeaponRestriction = item.restrictBonusToWeapon || null;
  log(`${caster.name} usa ${item.name} e poderá atacar mais uma vez neste turno!`);
  spawnFloatingText(caster.x, caster.y, `${item.name}!`, "heal");
  finishFreeSelfAction(caster, item);
}

// Pés Ágeis (Goblin): dobra o deslocamento só até o início do próprio
// próximo turno da unidade (turnsLeft:1 — ver applyStatusEffectsAtTurnStart),
// que é exatamente quando moveRange volta a ser consultado pra mover.
function castSwiftFeet(caster, item) {
  const existing = caster.statusEffects.find((e) => e.type === "swiftFeet");
  if (existing) {
    existing.turnsLeft = 1;
  } else {
    caster.statusEffects.push({ type: "swiftFeet", turnsLeft: 1, moveBonus: caster.moveRange });
    caster.moveRange *= 2;
  }
  log(`${caster.name} usa ${item.name} e dobra seu deslocamento neste turno!`);
  spawnFloatingText(caster.x, caster.y, "Ágil!", "heal");
  finishFreeSelfAction(caster, item);
}

function castFury(caster, item) {
  const existing = caster.statusEffects.find((e) => e.type === "fury");
  if (existing) {
    // Já em fúria: só renova a duração, não soma o bônus de novo.
    existing.turnsLeft = item.turns;
  } else {
    caster.statusEffects.push({
      type: "fury",
      turnsLeft: item.turns,
      damageBonus: item.damageBonus,
      speedBonus: item.speedBonus,
      hpDrainPerTurn: item.hpDrainPerTurn,
    });
    caster.speed += item.speedBonus;
  }
  log(`${caster.name} entra em fúria! +${item.damageBonus} de dano e +${item.speedBonus} de agilidade por ${item.turns} turno(s).`);
  spawnFloatingText(caster.x, caster.y, "Fúria!", "crit");
  finishFreeSelfAction(caster, item);
}

// Regeneração (Troll): igual à Fúria, mas sem lado ruim — só aumenta a
// própria regeneração passiva por algumas turnos (ver applyStatusEffectsAtTurnStart).
// Habilidade "livre": não gasta CT nem consome a ação do turno, só MP.
function castRegenBoost(caster, item) {
  // addStatusEffect já cuida de estender a duração em vez de empilhar se
  // regenBoost já estiver ativo (ver DOT_HOT_TYPES).
  addStatusEffect(caster, { type: "regenBoost", turnsLeft: item.turns, bonus: item.regenBonus });
  log(`${caster.name} usa ${item.name} e aumenta a própria regeneração em +${item.regenBonus} por ${item.turns} turno(s)!`);
  spawnFloatingText(caster.x, caster.y, "Regeneração!", "heal");
  finishFreeSelfAction(caster, item);
}

// Crescimento (Troll): ataca as 8 casas ao redor (incluindo diagonais) de uma
// vez, sem precisar mirar — mesmo padrão de dano/crítico/acerto do Tronco.
function castGrowthAttack(caster, spell) {
  closeContextMenu();
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  const tiles = dirs
    .map(([dx, dy]) => ({ x: caster.x + dx, y: caster.y + dy }))
    .filter((t) => inBounds(t.x, t.y));
  log(`${caster.name} usa ${spell.name} e ataca tudo ao redor!`);
  // Habilidade de área: acerta qualquer um por perto, aliado ou inimigo.
  const hits = tiles.map((t) => unitAt(t.x, t.y)).filter((u) => u);
  if (hits.length === 0) {
    log("Não havia ninguém ao redor.");
  }
  for (const enemy of hits) {
    resolveSingleHit(caster, enemy, spell);
  }
  damageTreesInTiles(tiles, spell.damageMin, spell.damageMax);
  damageStructuresInTiles(tiles, spell.damageMin, spell.damageMax);
  finalizeAction(caster, spell);
}

// Paralisia (Fada): rola acerto; se acertar, o alvo perde a próxima vez
// inteira (ver isParalyzed/beginTurnFor), sem causar dano.
// Congelamento (Fada): área em losango ao redor do ponto escolhido — cada
// inimigo dentro rola acerto por conta própria; quem for atingido fica
// congelado (perde a próxima vez, com dano por turno — ver isParalyzed em
// beginTurnFor / applyStatusEffectsAtTurnStart). Um segundo golpe de
// Congelamento só renova a duração, não empilha.
function castFreezeAoe(caster, spell, targetTile) {
  setFacingTowards(caster, targetTile);
  const tiles = computeAoeAreaTiles(caster, spell, targetTile) || [targetTile];
  // Habilidade de área: acerta qualquer um na área, aliado ou inimigo.
  const targets = tiles.map((t) => unitAt(t.x, t.y)).filter((u) => u);

  // Mesmo esquema da Bola de Fogo: um orbe de gelo voa até o centro da área
  // antes do estouro/feedback aparecerem.
  const frostProfile = combatVfxProfile(caster);
  const travelMs = spawnProjectile(
    caster.x, caster.y, targetTile.x, targetTile.y, "frost", MAGIC_TRAVEL_MULTIPLIER,
    { ...frostProfile, visualScale: frostProfile.visualScale * actionVisualIntensity(spell) }
  );
  setTimeout(() => spawnAreaBurst(targetTile.x, targetTile.y, spell.areaRadius, "frost", 1 + (actionVisualIntensity(spell) - 1) * 0.35), travelMs);

  if (targets.length === 0) {
    log(`Não havia ninguém na área do ${spell.name}.`);
  }

  for (const u of targets) {
    if (blockedByInvisibility(spell, u)) {
      log(`${caster.name} tenta atingir ${u.name} com ${spell.name}, mas ${u.name} está invisível!`);
      setTimeout(() => {
        spawnFloatingText(u.x, u.y, "Invisível!", "miss");
        playSfx("miss");
      }, travelMs);
      continue;
    }
    const isHit = Math.random() < getEffectiveHitChance(caster, u, spell, manhattan(caster, u));
    if (!isHit) {
      log(`${caster.name} tenta congelar ${u.name} com ${spell.name}, mas erra!`);
      setTimeout(() => {
        spawnFloatingText(u.x, u.y, "Errou!", "miss");
        playSfx("miss");
      }, travelMs);
      continue;
    }
    const existing = u.statusEffects.find((e) => e.type === "paralyzed");
    if (existing) {
      existing.turnsLeft = 1;
      existing.damageMin = spell.damageMin;
      existing.damageMax = spell.damageMax;
    } else {
      addStatusEffect(u, { type: "paralyzed", turnsLeft: 1, damageMin: spell.damageMin, damageMax: spell.damageMax });
    }
    log(`${caster.name} congela ${u.name} com ${spell.name}!`);
    const hitX = u.x;
    const hitY = u.y;
    setTimeout(() => {
      spawnFloatingText(hitX, hitY, "Congelado!", "root-status");
      playAttackFx(hitX, hitY, spell.sfx, false);
    }, travelMs);
  }

  damageTreesInTiles(tiles, spell.damageMin, spell.damageMax);
  damageStructuresInTiles(tiles, spell.damageMin, spell.damageMax);
  finalizeAction(caster, spell);
}

// Empurra uma unidade em linha reta (dx,dy) até `distance` quadrados; pára
// antes se sair do tabuleiro ou esbarrar em alguém — nunca empurra pra cima
// de outra unidade nem pra fora da área jogável. Devolve se ela de fato se
// moveu, pra quem chamou (ex: applyPointBlastKnockback) saber se o empurrão
// foi bloqueado logo de cara.
function pushUnit(unit, dx, dy, distance) {
  let finalX = unit.x;
  let finalY = unit.y;
  for (let d = 1; d <= distance; d++) {
    const nx = unit.x + dx * d;
    const ny = unit.y + dy * d;
    if (!inBounds(nx, ny) || occupantAt(nx, ny)) break;
    finalX = nx;
    finalY = ny;
  }
  const moved = finalX !== unit.x || finalY !== unit.y;
  if (moved) {
    unit.x = finalX;
    unit.y = finalY;
    log(`${unit.name} é empurrado(a) para (${finalX}, ${finalY})!`);
  }
  return moved;
}

// Empurrão radial de explosão em área (Tacar Tronco): cada atingido vai 1
// quadrado pra LONGE do ponto de impacto (não numa direção fixa, já que uma
// explosão em área acerta gente em todo lado ao redor dela). Quem está bem
// em cima do ponto de impacto não tem direção nenhuma pra ir — tratado como
// bloqueado, igual quem tem o caminho physicamente barrado.
function applyPointBlastKnockback(defender, impact, knockback) {
  const dx = Math.sign(defender.x - impact.x);
  const dy = Math.sign(defender.y - impact.y);
  const moved = (dx !== 0 || dy !== 0) && pushUnit(defender, dx, dy, knockback.distance);
  if (!moved && knockback.blockedExtraDamage) {
    defender.hp = Math.max(defender.hp - knockback.blockedExtraDamage, 0);
    log(`${defender.name} está bloqueado(a) e não pode ser empurrado(a) — leva ${knockback.blockedExtraDamage} de dano extra!`);
    spawnFloatingText(defender.x, defender.y, `-${knockback.blockedExtraDamage}`, "hit");
  }
}

// Ventania (Fada): mesma área do Envenenamento (cone reto). Reaproveita
// resolveSingleHit pra acerto/dano/crítico/dreno de CT (appliesCtDrain já é
// genérico) e só cuida do empurrão por cima disso. A direção do empurrão sai
// do primeiro tile do cone (profundidade 1, sem espalhamento lateral), que é
// sempre exatamente a direção escolhida.
function castWindstorm(caster, spell, coneTiles) {
  if (coneTiles.length === 0) {
    finalizeAction(caster, spell);
    return;
  }
  setFacingTowards(caster, coneTiles[0]);
  const dir = {
    dx: Math.sign(coneTiles[0].x - caster.x),
    dy: Math.sign(coneTiles[0].y - caster.y),
  };
  spawnWindGustCast(caster);
  setTimeout(() => spawnWindGustSweep(caster, coneTiles, dir), 190);
  // Habilidade de área: acerta qualquer um no cone, aliado ou inimigo.
  const targets = coneTiles.map((t) => unitAt(t.x, t.y)).filter((u) => u);

  if (targets.length === 0) {
    log(`Não havia ninguém na área da ${spell.name}.`);
  }

  for (const u of targets) {
    // Atraso crescente com a distância do conjurador — dá a sensação de a
    // rajada varrendo o cone em vez de tudo reagir ao mesmo tempo.
    const delay = manhattan(caster, u) * 35;
    const wasHit = resolveSingleHit(caster, u, spell, false, delay);
    if (wasHit && u.hp > 0) {
      const pushDistance = Math.floor(Math.random() * 2) + 2; // 2 ou 3
      pushUnit(u, dir.dx, dir.dy, pushDistance);
    }
  }

  damageTreesInTiles(coneTiles, spell.damageMin, spell.damageMax);
  damageStructuresInTiles(coneTiles, spell.damageMin, spell.damageMax);
  finalizeAction(caster, spell);
}

// Prisão de Vinhas: rola acerto; se acertar, aplica raízes (imobiliza +
// dano por turno) em vez de causar dano na hora — o dano vem dos ticks em
// applyStatusEffectsAtTurnStart, igual ao veneno.
function castRootSpell(caster, target, spell) {
  setFacingTowards(caster, target);
  if (blockedByInvisibility(spell, target)) {
    log(`${caster.name} tenta atingir ${target.name} com ${spell.name}, mas ${target.name} está invisível!`);
    spawnFloatingText(target.x, target.y, "Invisível!", "miss");
    playSfx("miss");
    finalizeAction(caster, spell);
    return;
  }
  const isHit = Math.random() < getEffectiveHitChance(caster, target, spell, manhattan(caster, target));
  if (!isHit) {
    log(`${caster.name} lança ${spell.name} em ${target.name} e erra!`);
    spawnFloatingText(target.x, target.y, "Errou!", "miss");
    playSfx("miss");
  } else {
    addStatusEffect(target, {
      type: "root",
      damageMin: spell.damageMin,
      damageMax: spell.damageMax,
      turnsLeft: spell.turns,
    });
    log(`${caster.name} prende ${target.name} com ${spell.name}!`);
    spawnFloatingText(target.x, target.y, "Preso!", "root-status");
    playAttackFx(target.x, target.y, "nature", false);
  }
  finalizeAction(caster, spell);
}

// Tiles do cone do Envenenamento numa direção cardeal: largura 1, 3, 5, 7, 9
// nas profundidades 1 a 5 (maxRange do feitiço).
function computeConeTilesForDir(unit, dx, dy, maxDepth) {
  const result = [];
  for (let d = 1; d <= maxDepth; d++) {
    const half = d - 1;
    for (let o = -half; o <= half; o++) {
      const px = dx !== 0 ? unit.x + dx * d : unit.x + o;
      const py = dy !== 0 ? unit.y + dy * d : unit.y + o;
      if (inBounds(px, py)) result.push({ x: px, y: py });
    }
  }
  return result;
}

// União dos 4 cones (uma direção cardeal cada) — usado pra destacar no
// tabuleiro todas as opções de mira do Envenenamento de uma vez, quando é um
// jogador humano escolhendo a direção (em vez da IA, que já sabe a direção).
function computeAllConeTiles(unit, maxDepth) {
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ];
  const seen = new Set();
  const result = [];
  for (const [dx, dy] of dirs) {
    for (const t of computeConeTilesForDir(unit, dx, dy, maxDepth)) {
      const key = tileKey(t.x, t.y);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(t);
      }
    }
  }
  return result;
}

// Envenenamento: acerta qualquer um dentro do cone (aliado ou inimigo,
// habilidade de área), cada um com sua própria rolagem de acerto; quem for
// atingido recebe veneno (independente de qualquer veneno que já tenha).
function castPoisonCone(caster, spell, coneTiles) {
  if (coneTiles.length > 0) {
    setFacingTowards(caster, coneTiles[0]);
  }
  const targets = coneTiles.map((t) => unitAt(t.x, t.y)).filter((u) => u);

  if (targets.length === 0) {
    log("Não havia ninguém na área do Envenenamento.");
  }

  // Toxina instável se formando no conjurador (líquido viscoso, bolhas,
  // vapor) antes do cone se espalhar — ver spawnToxinCastCue.
  spawnToxinCastCue(caster);
  // Nuvem de fumaça tóxica preenchendo o CONE INTEIRO conforme se espalha —
  // sem isso o cone ficava "vazio" nos tiles sem alvo, só dava pra ver gás
  // em cima de quem foi atingido (ver spawnToxicCloudSweep).
  setTimeout(() => spawnToxicCloudSweep(caster, coneTiles), 120);

  for (const u of targets) {
    // Mesma ideia da Ventania: quanto mais longe do conjurador, mais tarde o
    // veneno "chega" — dá sensação de onda em vez de tudo instantâneo.
    const delay = manhattan(caster, u) * 35;
    const isHit = Math.random() < getEffectiveHitChance(caster, u, spell, manhattan(caster, u));
    if (!isHit) {
      log(`${caster.name} tenta envenenar ${u.name} com ${spell.name}, mas erra!`);
      setTimeout(() => {
        spawnFloatingText(u.x, u.y, "Errou!", "miss");
        playSfx("miss");
      }, delay);
      continue;
    }
    addStatusEffect(u, {
      type: "poison",
      damageMin: spell.damageMin,
      damageMax: spell.damageMax,
      turnsLeft: spell.turns,
    });
    log(`${caster.name} envenena ${u.name} com ${spell.name}!`);
    const hitX = u.x;
    const hitY = u.y;
    setTimeout(() => {
      spawnFloatingText(hitX, hitY, "Envenenado!", "poison-status");
      // Contato viscoso + respingo tóxico + vapor, na paleta ácida do status
      // (não a bola roxa genérica de playAttackFx/impact-poison) — conecta
      // visualmente com a aura persistente que o addStatusEffect acima já
      // aplicou, em vez de Poisoned simplesmente "aparecer do nada".
      spawnToxicSplash(hitX, hitY);
      playSfx("poison", boardPanFor(hitX));
    }, delay);
  }

  finalizeAction(caster, spell);
}

// Paga o custo (CT sempre, MP quando o item tiver) e fecha o turno/checa a
// batalha — chamado uma vez só por ação, não por alvo atingido.
function finalizeAction(attacker, item) {
  // Agilidade (Goblin): se sobrar ataque bônus, consome ele em vez de marcar
  // a ação como feita — assim o jogador/IA pode atacar de novo no turno.
  // Tiro Rápido (Arqueiro) é a mesma ideia, mas com uma arma exigida
  // (bonusAttackWeaponRestriction): usar qualquer outra arma enquanto a
  // restrição estiver ativa não concede o disparo extra — só encerra a
  // rodada de ataque ali mesmo, sem desfazer o golpe que já aconteceu.
  const restriction = attacker.bonusAttackWeaponRestriction;
  if (restriction) {
    if (item !== restriction) {
      attacker.bonusAttacksRemaining = 0;
      attacker.bonusAttackWeaponRestriction = null;
      attacker.hasActed = true;
    } else if (attacker.bonusAttacksRemaining > 0) {
      attacker.bonusAttacksRemaining -= 1;
    } else {
      attacker.hasActed = true;
      attacker.bonusAttackWeaponRestriction = null;
    }
  } else if (attacker.bonusAttacksRemaining > 0) {
    attacker.bonusAttacksRemaining -= 1;
  } else {
    attacker.hasActed = true;
  }
  attacker.ct -= item.ctCost;
  if (item.mpCost) {
    attacker.mp = Math.max(attacker.mp - item.mpCost, 0);
  }
  attackableTiles = [];
  reachableTiles = [];

  render();
  checkBattleOutcome();
  if (isHumanControlled(attacker.team) && !battleEnded) {
    checkEndCurrentTurn();
  }
}

function performAttack(attacker, defender, item) {
  // Capturado ANTES de finalizeAction porque ele pode limpar a restrição
  // assim que o bônus acabar (ver finalizeAction) — precisamos saber se ESSE
  // golpe em especial usou a arma exigida pelo Tiro Rápido.
  const wasRestrictedBonusWeapon = attacker.bonusAttackWeaponRestriction === item;
  setFacingTowards(attacker, defender);
  // finalizeAction (e a reabertura de mira do Tiro Rápido logo abaixo) só
  // pode rodar DEPOIS que a cena de batalha (se estiver ativa) fechar —
  // senão o turno avançaria/o próximo disparo abriria com a cena ainda na
  // tela. Ver runBattleScene: quando não mostra cena, chama afterHit() na
  // hora, igual ao comportamento de sempre.
  const afterHit = () => {
    finalizeAction(attacker, item);
    // Tiro Rápido (Arqueiro): depois do primeiro disparo válido (ainda
    // sobrou ação — hasActed continua false), já reabre a mira do Arco pro
    // segundo disparo, sem o jogador precisar reabrir o menu.
    if (wasRestrictedBonusWeapon && !attacker.hasActed && !battleEnded && isHumanControlled(attacker.team)) {
      startAttackTargeting(attacker, item, () => openActionMenu(attacker));
    }
  };
  if (shouldShowBattleScene(attacker, defender, item)) {
    runBattleScene(attacker, defender, item, afterHit);
  } else {
    resolveSingleHit(attacker, defender, item);
    afterHit();
  }
}

// Monta as linhas de texto do popup de confirmação: chance de acerto real
// (com o bônus de flanco/costas e o malus de ofuscado já explicados),
// intervalo de dano com qualquer bônus ativo somado (Ataque Poderoso, Fúria,
// Ataque Furtivo do Ladino), crítico, e casos especiais que fariam o ataque
// errar sempre (Fada só atingível à distância/magia, alvo invisível).
function describeAttackOutcome(attacker, defender, item) {
  const title = `${item.icon} ${item.name} em ${defender.name}`;
  const isWeaponAttack = item.mpCost === undefined;

  if (!bypassesInvisibility(item) && isInvisible(defender)) {
    return {
      title,
      lines: [`<span class="attack-confirm-blocked">${defender.name} está invisível — esse ataque vai errar com certeza!</span>`],
    };
  }

  const isMeleeWeapon = isWeaponAttack && item.maxRange === 1 && !item.aerial;
  if (isMeleeWeapon && defender.flying) {
    return {
      title,
      lines: [`<span class="attack-confirm-blocked">${defender.name} só pode ser atingida à distância ou por magia — esse golpe corpo a corpo vai errar sempre!</span>`],
    };
  }

  const distance = manhattan(attacker, defender);
  const angle = getAttackAngle(attacker, defender);
  const fromFront = angle === "front";
  const baseHitChance = getHitChance(item, distance);
  const guaranteedHit = !!attacker.guaranteedNextHit;

  const lines = [];

  if (guaranteedHit) {
    lines.push(`Acerto: <strong>100%</strong> (Tiro Certeiro)`);
  } else if (baseHitChance != null) {
    const effective = getEffectiveHitChance(attacker, defender, item, distance);
    const modifiers = [];
    if (angle === "side") modifiers.push("+10% por atacar pelo lado");
    if (angle === "back") modifiers.push("+20% por atacar pelas costas");
    if (isBlinded(attacker)) modifiers.push("-10% por estar ofuscado");
    if (isDazed(attacker)) modifiers.push("-10% por estar atordoado(a) pelo som");
    // Mesmos termos de terreno de getEffectiveHitChance, só como texto —
    // pra quem vai confirmar o ataque ver DE ONDE vem o número final, não
    // só o resultado já somado.
    const attackerTerrainNote = terrainAt(attacker.x, attacker.y);
    if (attacker.flying) {
      modifiers.push("+10% por estar voando (sempre elevado)");
    } else if (attackerTerrainNote && attackerTerrainNote.type === "house") {
      modifiers.push("+10% por atacar do alto de uma casa");
    }
    if (!attacker.flying && attackerTerrainNote && attackerTerrainNote.type === "water") modifiers.push("-10% por estar na água");
    const defenderTerrainNote = terrainAt(defender.x, defender.y);
    if (!defender.flying && defenderTerrainNote && defenderTerrainNote.type === "water") modifiers.push("+10% porque o alvo está na água");
    const attackerStructureNote = structureAt(attacker.x, attacker.y);
    if (attackerStructureNote && attackerStructureNote.team === attacker.team) {
      modifiers.push(`+20% por atacar de dentro d${attackerStructureNote.type === "castle" ? "o Castelo" : "a Montanha"}`);
    }
    const defenderStructureNote = structureAt(defender.x, defender.y);
    if (defenderStructureNote && defenderStructureNote.team === defender.team) {
      modifiers.push(`-10% porque o alvo está protegido pel${defenderStructureNote.type === "castle" ? "o Castelo" : "a Montanha"}`);
    }
    // Faltavam na explicação (mas já contavam pro número final em
    // getEffectiveHitChance — o texto não batia com o percentual mostrado
    // quando o alvo tinha esquiva): esquiva inata (Goblin) e Evasiva ativa.
    if (defender.innateEvasion) {
      modifiers.push(`-${Math.round(defender.innateEvasion * 100)}% pela esquiva inata d${defender.team === "enemy" ? "o" : "a"} ${defender.name}`);
    }
    const defenderEvasiveEffect = defender.statusEffects && defender.statusEffects.find((e) => e.type === "evasive");
    if (defenderEvasiveEffect) {
      modifiers.push(`-${Math.round(defenderEvasiveEffect.amount * 100)}% porque o alvo está evasivo`);
    }
    if (item.mpCost !== undefined && defender.magicEvasion) {
      modifiers.push(`-${Math.round(defender.magicEvasion * 100)}% porque ${defender.name} esquiva melhor de magia`);
    }
    // Regra global (item 32): ataque à distância usado em alcance de corpo a
    // corpo — mesmo breakdown que os outros modificadores, "Ranged in Melee".
    if (isRangedAttack(item) && distance <= 1) {
      modifiers.push(`-${Math.round(RANGED_MELEE_HIT_PENALTY * 100)}% por usar ataque à distância em alcance corpo a corpo (Ranged in Melee)`);
    }
    const modifierText = modifiers.length ? ` (base ${Math.round(baseHitChance * 100)}%, ${modifiers.join(", ")})` : "";
    lines.push(`Acerto: <strong>${Math.round(effective * 100)}%</strong>${modifierText}`);
  }

  if (!item.noDamage) {
    const oneShotDamageBonus = attacker.oneShotDamageBonus || 0;
    const furyEffect = attacker.statusEffects && attacker.statusEffects.find((e) => e.type === "fury");
    const furyBonus = furyEffect ? furyEffect.damageBonus : 0;
    const angleSneakBonus = attacker.backstabBonus && !fromFront ? attacker.backstabBonus : 0;
    const stealthSneakBonus = attacker.backstabBonus && isInvisible(attacker) ? attacker.backstabBonus : 0;
    const sneakAttackBonus = angleSneakBonus + stealthSneakBonus;
    const totalBonus = oneShotDamageBonus + furyBonus + sneakAttackBonus;

    let damageLine = `Dano: <strong>${getDamageRangeText(item)}</strong>`;
    if (totalBonus > 0) {
      damageLine += ` <span class="attack-confirm-bonus">+${totalBonus} = ${item.damageMin + totalBonus}-${item.damageMax + totalBonus}</span>`;
    }
    lines.push(damageLine);

    const bonusNotes = [];
    if (oneShotDamageBonus > 0) bonusNotes.push(`+${oneShotDamageBonus} Ataque Poderoso`);
    if (furyBonus > 0) bonusNotes.push(`+${furyBonus} Fúria`);
    if (sneakAttackBonus > 0) {
      const angleLabel = angle === "back" ? "pelas costas" : "pelo lado";
      const sneakSource =
        angleSneakBonus && stealthSneakBonus
          ? `${angleLabel} + invisível`
          : angleSneakBonus
          ? angleLabel
          : "invisível";
      bonusNotes.push(`+${sneakAttackBonus} Ataque Furtivo (${sneakSource})`);
    }
    if (bonusNotes.length) {
      const sneakSuffix = sneakAttackBonus > 0 ? " — <em>será um Ataque Furtivo!</em>" : "";
      lines.push(`Bônus: ${bonusNotes.join(", ")}${sneakSuffix}`);
    }

    const critChance = Math.min(getCritChance(item, angle) + (attacker.critBonusNextAttack || 0), 1);
    lines.push(`Crítico: x${item.critMultiplier} (${Math.round(critChance * 100)}%)`);
  }

  if (item.appliesPoison) lines.push(`Se acertar: aplica veneno por ${item.appliesPoison.turns} turno(s)`);
  if (item.appliesBurn) lines.push(`Se acertar: pega fogo (1 de dano por turno) por ${item.appliesBurn.turns} turno(s)`);
  if (item.appliesBlind) lines.push(`Se acertar: ofusca por ${item.appliesBlind.turns} turno(s) (-10% de acerto)`);
  if (item.appliesCtDrain) {
    lines.push(
      item.ctDrainConfirmChance !== undefined
        ? `Se acertar: ${Math.round(item.ctDrainConfirmChance * 100)}% de chance de roubar ${item.appliesCtDrain} de CT`
        : `Se acertar: rouba ${item.appliesCtDrain} de CT`
    );
  }
  if (item.appliesSpeedReduction) lines.push(`Se acertar: -${item.appliesSpeedReduction.amount} de agilidade por ${item.appliesSpeedReduction.turns} turno(s)`);

  return { title, lines };
}

// Etapa 4 (ataques de alvo único, mode "enemy"): antes de resolver o golpe de
// fato, mostra um popup com as condições reais daquele ataque específico
// (acerto, dano, bônus ativos, imunidades) e só executa quando confirmado.
// Cancelar não desfaz a mira — o jogador pode escolher outro alvo na hora.
function openAttackConfirmation(attacker, clickedTarget, item) {
  let actualDefender = clickedTarget;
  let obstructionNote = null;

  if (item.requiresClearPath) {
    const impact = resolveObstructedTarget(attacker, { x: clickedTarget.x, y: clickedTarget.y });
    const blocker = unitAt(impact.x, impact.y);
    actualDefender = blocker;
    if (blocker && blocker !== clickedTarget) {
      obstructionNote = `Algo bloqueia o caminho até ${clickedTarget.name} — o ataque vai atingir ${blocker.name} no lugar!`;
    }
  }

  const warningHtml = obstructionNote ? `<div class="attack-confirm-warning">${obstructionNote}</div>` : "";
  if (!actualDefender) {
    attackConfirmTitleEl.textContent = `${item.icon} ${item.name}`;
    attackConfirmBodyEl.innerHTML = `${warningHtml}<div><em>Não há nada no caminho para atingir.</em></div>`;
  } else {
    const info = describeAttackOutcome(attacker, actualDefender, item);
    attackConfirmTitleEl.textContent = info.title;
    attackConfirmBodyEl.innerHTML = warningHtml + info.lines.map((l) => `<div>${l}</div>`).join("");
  }

  attackConfirmOkBtn.textContent = "Confirmar Ataque";
  pendingConfirmation = {
    onConfirm: () => {
      pendingWeapon = null;
      if (item.requiresClearPath) {
        performRangedAttackWithObstruction(attacker, clickedTarget, item);
      } else {
        performAttack(attacker, clickedTarget, item);
      }
    },
  };
  attackConfirmModalEl.classList.remove("hidden");
}

// Castelo/Montanha com alguém ocupando: em vez de perguntar "personagem ou
// construção?" (ver antigo openTargetChoiceModal), o golpe atinge os dois de
// uma vez — a construção sempre leva o dano cheio (nunca esquiva, mesma
// regra de sempre), e o personagem lá dentro é resolvido pelo ataque normal
// (chance de acerto, crítico etc., incluindo o próprio bônus/penalidade de
// estar dentro do Castelo/Montanha).
function openCombinedUnitStructureAttackConfirmation(attacker, defender, structure, item) {
  const info = describeAttackOutcome(attacker, defender, item);
  const structureInfo = STRUCTURE_INFO[structure.type];
  attackConfirmTitleEl.textContent = `${item.icon} ${item.name} em ${defender.name} + ${structureInfo.name}`;
  attackConfirmBodyEl.innerHTML =
    info.lines.map((l) => `<div>${l}</div>`).join("") +
    `<div>${structureInfo.icon} ${structureInfo.name} sempre leva ${getDamageRangeText(item)} de dano (HP atual: ${structure.hp}/${structure.maxHp})</div>`;
  attackConfirmOkBtn.textContent = "Confirmar Ataque";
  pendingConfirmation = {
    onConfirm: () => {
      pendingWeapon = null;
      damageStructure(structure, item.damageMin, item.damageMax);
      performAttack(attacker, defender, item);
    },
  };
  attackConfirmModalEl.classList.remove("hidden");
}

// Ataque de alvo único mirado direto no Castelo/Montanha (não no personagem
// que porventura esteja lá dentro — ver openCombinedUnitStructureAttackConfirmation
// pro caso dos dois juntos no mesmo tile). Reaproveita o mesmo modal de
// confirmação de ataque. Diferente de um ataque contra unidade: a estrutura
// não esquiva, então SEMPRE acerta (ver decisão registrada no plano) — só o
// dano varia.
function openStructureAttackConfirmation(attacker, structure, tile, item) {
  const info = STRUCTURE_INFO[structure.type];
  attackConfirmTitleEl.textContent = `${item.icon} ${item.name} em ${info.name}`;
  attackConfirmBodyEl.innerHTML = [
    `<div>Acerto: <strong>100%</strong> (construções não esquivam)</div>`,
    `<div>Dano: <strong>${getDamageRangeText(item)}</strong></div>`,
    `<div>HP atual: ${structure.hp}/${structure.maxHp}</div>`,
  ].join("");
  attackConfirmOkBtn.textContent = "Confirmar Ataque";
  pendingConfirmation = {
    onConfirm: () => {
      pendingWeapon = null;
      performStructureAttack(attacker, structure, tile, item);
    },
  };
  attackConfirmModalEl.classList.remove("hidden");
}

function performStructureAttack(attacker, structure, tile, item) {
  setFacingTowards(attacker, tile);
  damageStructure(structure, item.damageMin, item.damageMax);
  finalizeAction(attacker, item);
}

// Casa/Tenda (ver SINGLE_TARGET_TERRAIN_TYPES): mesmo fluxo de
// openStructureAttackConfirmation/performStructureAttack acima, só que
// mirando 1 tile só do terrainMap (ver damageTree, que cobre os 2 tipos)
// em vez de um structures[] com HP compartilhado. Também sempre acerta —
// construção não esquiva, só o dano varia.
function openTerrainAttackConfirmation(attacker, targetTerrain, tile, item) {
  const info = TERRAIN_INFO[targetTerrain.type];
  attackConfirmTitleEl.textContent = `${item.icon} ${item.name} em ${info.name}`;
  attackConfirmBodyEl.innerHTML = [
    `<div>Acerto: <strong>100%</strong> (construções não esquivam)</div>`,
    `<div>Dano: <strong>${getDamageRangeText(item)}</strong></div>`,
    `<div>HP atual: ${Math.max(targetTerrain.hp, 0)}/${targetTerrain.maxHp}</div>`,
  ].join("");
  attackConfirmOkBtn.textContent = "Confirmar Ataque";
  pendingConfirmation = {
    onConfirm: () => {
      pendingWeapon = null;
      performTerrainAttack(attacker, tile, item);
    },
  };
  attackConfirmModalEl.classList.remove("hidden");
}

function performTerrainAttack(attacker, tile, item) {
  setFacingTowards(attacker, tile);
  damageTree(tile.x, tile.y, item.damageMin, item.damageMax);
  finalizeAction(attacker, item);
}

// Casa ocupada (Tenda nunca — bloqueia movimento por completo, ver
// "Tenda bloqueia movimento igual árvore", então nunca coexiste com uma
// unidade em cima): mesma ideia do Castelo/Montanha ocupado — acerta os
// dois de uma vez, sem perguntar qual é o alvo (ver
// openCombinedUnitStructureAttackConfirmation).
function openCombinedUnitTerrainAttackConfirmation(attacker, defender, targetTerrain, tile, item) {
  const info = describeAttackOutcome(attacker, defender, item);
  const terrainInfo = TERRAIN_INFO[targetTerrain.type];
  attackConfirmTitleEl.textContent = `${item.icon} ${item.name} em ${defender.name} + ${terrainInfo.name}`;
  attackConfirmBodyEl.innerHTML =
    info.lines.map((l) => `<div>${l}</div>`).join("") +
    `<div>${terrainInfo.icon} ${terrainInfo.name} sempre leva ${getDamageRangeText(item)} de dano (HP atual: ${Math.max(targetTerrain.hp, 0)}/${targetTerrain.maxHp})</div>`;
  attackConfirmOkBtn.textContent = "Confirmar Ataque";
  pendingConfirmation = {
    onConfirm: () => {
      pendingWeapon = null;
      damageTree(tile.x, tile.y, item.damageMin, item.damageMax);
      performAttack(attacker, defender, item);
    },
  };
  attackConfirmModalEl.classList.remove("hidden");
}

// Segunda confirmação pras magias em área (Bola de Fogo, Relâmpago,
// Envenenamento, Antídoto): o primeiro clique só acende a prévia da área
// (aoePreviewTiles, ver onTileClick); o segundo clique no mesmo alvo chama
// isto aqui, que lista quem realmente está dentro do "quadradinho de efeito"
// antes de lançar a magia de verdade.
function openAoeConfirmation(caster, item, mode, targetTile) {
  let effectNote = "";
  let obstructionNote = null;
  let targets = [];

  // Toda habilidade de área acerta qualquer um dentro dela, aliado ou
  // inimigo — nenhum dos ramos abaixo filtra por time (ver também
  // castFireball/castLightning/castPierceShot/castFreezeAoe/castPoisonCone/
  // castWindstorm/castAntidote, que aplicam o efeito de verdade).
  if (mode === "point-aoe") {
    const impact = resolveObstructedTarget(caster, targetTile);
    if (impact.x !== targetTile.x || impact.y !== targetTile.y) {
      obstructionNote = `Algo bloqueia o caminho — a explosão vai acontecer em (${impact.x}, ${impact.y}) em vez do alvo escolhido!`;
    }
    effectNote = `Quadrado de efeito: (${impact.x}, ${impact.y}), raio ${item.areaRadius}`;
    targets = aliveUnits().filter((u) => manhattan(u, impact) <= item.areaRadius);
  } else if (mode === "line-aoe") {
    const dx = Math.sign(targetTile.x - caster.x);
    const dy = Math.sign(targetTile.y - caster.y);
    const length = Math.max(Math.abs(targetTile.x - caster.x), Math.abs(targetTile.y - caster.y));
    effectNote = `Linha de ${length} quadrado(s) na direção escolhida`;
    const lineTiles = [];
    for (let d = 1; d <= length; d++) lineTiles.push({ x: caster.x + dx * d, y: caster.y + dy * d });
    targets = lineTiles.map((t) => unitAt(t.x, t.y)).filter((u) => u);
  } else if (mode === "creeping-line") {
    const lineTiles = computeAoeAreaTiles(caster, item, targetTile) || [];
    effectNote = `Linha até a borda do tabuleiro (${lineTiles.length} quadrado(s)) na direção escolhida`;
    targets = lineTiles.map((t) => unitAt(t.x, t.y)).filter((u) => u);
  } else if (mode === "cardinal-blast") {
    const lineTiles = computeAoeAreaTiles(caster, item, targetTile) || [];
    effectNote = `Faixa de ${lineTiles.length} quadrado(s) (${item.bandLength}x${item.bandWidth}) na direção escolhida`;
    targets = lineTiles.map((t) => unitAt(t.x, t.y)).filter((u) => u);
  } else if (mode === "cone-poison") {
    const coneTiles = computeAoeAreaTiles(caster, item, targetTile) || [];
    effectNote = `Cone com ${coneTiles.length} quadrado(s) de largura crescente`;
    targets = coneTiles.map((t) => unitAt(t.x, t.y)).filter((u) => u);
  } else if (mode === "cure-aoe" || mode === "heal-aoe" || mode === "regen-aoe") {
    const tiles = computeAoeAreaTiles(caster, item, targetTile) || [];
    effectNote = `Área de raio ${item.areaRadius}`;
    targets = tiles.map((t) => unitAt(t.x, t.y)).filter((u) => u);
  } else if (mode === "pierce-line") {
    const lineTiles = computeAoeAreaTiles(caster, item, targetTile) || [];
    effectNote = `Linha reta fixa de ${item.maxRange} quadrado(s) (perfura todo mundo no caminho)`;
    targets = lineTiles.map((t) => unitAt(t.x, t.y)).filter((u) => u);
  } else if (mode === "trap") {
    const trapTiles = computeAoeAreaTiles(caster, item, targetTile) || [];
    const blockers = trapTiles.map((t) => unitAt(t.x, t.y)).filter((u) => u);
    effectNote = `Área de raio ${item.areaRadius} — fica invisível até um inimigo passar por ela`;
    if (blockers.length > 0) {
      obstructionNote = `Não é possível instalar: ${blockers.map((u) => u.name).join(", ")} está(ão) na área.`;
    }
  } else if (mode === "freeze-aoe") {
    const tiles = computeAoeAreaTiles(caster, item, targetTile) || [];
    effectNote = `Área de raio ${item.areaRadius}`;
    targets = tiles.map((t) => unitAt(t.x, t.y)).filter((u) => u);
  } else if (mode === "cone-windstorm") {
    const coneTiles = computeAoeAreaTiles(caster, item, targetTile) || [];
    effectNote = `Cone com ${coneTiles.length} quadrado(s) de largura crescente`;
    targets = coneTiles.map((t) => unitAt(t.x, t.y)).filter((u) => u);
  }

  const lines = [effectNote];
  if (mode === "trap") {
    if (!obstructionNote) lines.push(`<em>Área livre — pronta para ser instalada.</em>`);
  } else if (targets.length === 0) {
    lines.push(`<em>Nenhum alvo dentro da área.</em>`);
  } else {
    for (const u of targets) {
      const teamNote = u.team === caster.team ? "aliado" : "inimigo";
      if (mode === "cure-aoe") {
        lines.push(`${u.name} (${teamNote}): remove veneno/paralisia na hora`);
        continue;
      }
      if (mode === "heal-aoe") {
        lines.push(`${u.name} (${teamNote}): cura ${item.healMin}-${item.healMax} de vida`);
        continue;
      }
      if (mode === "regen-aoe") {
        const regenHitChance = Math.round(item.hitChance * 100);
        lines.push(
          `${u.name} (${teamNote}): ${regenHitChance}% de chance — se acertar, regenera ${item.healMin}-${item.healMax} de vida por turno, por ${item.regenTurns} turno(s)`
        );
        continue;
      }
      const hitChance = getEffectiveHitChance(caster, u, item, manhattan(caster, u));
      const hitText = hitChance != null ? `${Math.round(hitChance * 100)}%` : "—";
      if (mode === "cone-poison") {
        lines.push(`${u.name} (${teamNote}): ${hitText} de acerto — se acertar, envenena por ${item.turns} turno(s)`);
      } else if (mode === "freeze-aoe") {
        lines.push(`${u.name} (${teamNote}): ${hitText} de acerto — se acertar, congela por 1 turno (1-3 de dano)`);
      } else if (mode === "cone-windstorm") {
        lines.push(`${u.name} (${teamNote}): ${hitText} de acerto, dano ${getDamageRangeText(item)} — se acertar, tira 15 de CT e empurra 2-3 quadrados`);
      } else if (mode === "creeping-line") {
        lines.push(
          `${u.name} (${teamNote}): perde 15 de CT e fica imóvel no próximo turno (sempre) — ${hitText} de acerto pra também causar ${getDamageRangeText(item)} de dano`
        );
      } else {
        lines.push(`${u.name} (${teamNote}): ${hitText} de acerto, dano ${getDamageRangeText(item)}`);
      }
    }
  }

  const warningHtml = obstructionNote ? `<div class="attack-confirm-warning">${obstructionNote}</div>` : "";
  attackConfirmTitleEl.textContent = `${item.icon} ${item.name}`;
  attackConfirmBodyEl.innerHTML = warningHtml + lines.map((l) => `<div>${l}</div>`).join("");

  attackConfirmOkBtn.textContent = "Confirmar Ataque";
  pendingConfirmation = {
    onConfirm: () => {
      pendingWeapon = null;
      aoePreviewTarget = null;
      aoePreviewTiles = [];
      if (mode === "point-aoe") {
        castFireball(caster, item, targetTile);
      } else if (mode === "line-aoe") {
        castLightning(caster, item, targetTile);
      } else if (mode === "creeping-line") {
        castCreepingDestruction(caster, item, targetTile);
      } else if (mode === "cardinal-blast") {
        castThrowLog(caster, item, targetTile);
      } else if (mode === "pierce-line") {
        castPierceShot(caster, item, targetTile);
      } else if (mode === "cure-aoe") {
        castAntidote(caster, item, computeAoeAreaTiles(caster, item, targetTile));
      } else if (mode === "heal-aoe") {
        castHealAoe(caster, item, targetTile);
      } else if (mode === "regen-aoe") {
        castRegenAoe(caster, item, targetTile);
      } else if (mode === "trap") {
        castTrap(caster, item, targetTile);
      } else if (mode === "freeze-aoe") {
        castFreezeAoe(caster, item, targetTile);
      } else if (mode === "cone-windstorm") {
        castWindstorm(caster, item, computeAoeAreaTiles(caster, item, targetTile));
      } else {
        castPoisonCone(caster, item, computeAoeAreaTiles(caster, item, targetTile));
      }
    },
  };
  attackConfirmModalEl.classList.remove("hidden");
}

function closeConfirmation() {
  attackConfirmModalEl.classList.add("hidden");
  pendingConfirmation = null;
}

attackConfirmCancelBtn.addEventListener("click", () => {
  closeConfirmation();
});

attackConfirmOkBtn.addEventListener("click", () => {
  const pending = pendingConfirmation;
  if (!pending) return;
  closeConfirmation();
  pending.onConfirm();
});

// Bola de Fogo: viaja em linha reta até o tile clicado; se qualquer unidade
// estiver no caminho antes de chegar lá, explode nela em vez do alvo
// pretendido. Depois disso, atinge todo inimigo dentro do raio de área ao
// redor do ponto de impacto (não só quem estava exatamente no tile).
function castFireball(caster, spell, targetTile) {
  setFacingTowards(caster, targetTile);
  const impact = resolveObstructedTarget(caster, targetTile);
  const blockedEarly = impact.x !== targetTile.x || impact.y !== targetTile.y;
  log(
    `${caster.name} lança ${spell.name} em (${impact.x}, ${impact.y})${
      blockedEarly ? " — bloqueada antes do alvo!" : ""
    }.`
  );
  // A bola de fogo em si voa do Mago até o ponto de impacto; só quando ela
  // "chega" (travelMs depois) é que a explosão e o dano ficam visíveis —
  // o dano em si já foi decidido agora, só o feedback visual espera.
  // projectileKind/burstKind são opcionais — sem eles, cai no visual de
  // fogo de sempre (Bola de Fogo, Tacar Tronco); Explosão Sonora usa os
  // próprios ("soundwave"/"sound") pra não parecer outra bola de fogo.
  const abilityProfile = abilityVfxProfile(spell);
  spawnCastCue(caster, abilityProfile);
  if (abilityProfile.castSfx) playSfx(abilityProfile.castSfx, boardPanFor(caster.x));
  const projectileProfile = { ...combatVfxProfile(caster), visualScale: combatVfxProfile(caster).visualScale * actionVisualIntensity(spell) };
  setTimeout(() => spawnProjectile(
    caster.x,
    caster.y,
    impact.x,
    impact.y,
    spell.projectileKind || "fireball",
    MAGIC_TRAVEL_MULTIPLIER,
    projectileProfile,
    abilityProfile
  ), abilityProfile.castDelay);
  const travelMs = abilityProfile.castDelay + (abilityProfile.projectileDuration || 550 * MAGIC_TRAVEL_MULTIPLIER);
  setTimeout(() => {
    spawnFloatingText(impact.x, impact.y, "💥", "impact");
    spawnAreaBurst(impact.x, impact.y, spell.areaRadius, spell.burstKind || "fire", 1 + (actionVisualIntensity(spell) - 1) * 0.35);
    playSfx(spell.sfx);
  }, travelMs);

  // Habilidade de área: a explosão acerta qualquer um dentro dela, aliado
  // ou inimigo — cuidado onde o Mago mira.
  const hits = aliveUnits().filter((u) => manhattan(u, impact) <= spell.areaRadius);
  if (hits.length === 0) {
    log("Não havia ninguém na área da explosão.");
  }
  for (const enemy of hits) {
    const wasHit = resolveSingleHit(caster, enemy, spell, false, travelMs);
    if (wasHit && enemy.hp > 0 && spell.knockback) {
      applyPointBlastKnockback(enemy, impact, spell.knockback);
    }
  }

  damageTreesInRadius(impact, spell.areaRadius, spell.damageMin, spell.damageMax);
  damageStructuresInRadius(impact, spell.areaRadius, spell.damageMin, spell.damageMax);
  finalizeAction(caster, spell);
}

// Relâmpago: percorre a linha reta/diagonal clicada, do primeiro tile até o
// tile clicado, acertando todo inimigo encontrado no caminho.
function castLightning(caster, spell, targetTile) {
  setFacingTowards(caster, targetTile);
  const dx = Math.sign(targetTile.x - caster.x);
  const dy = Math.sign(targetTile.y - caster.y);
  const length = Math.max(Math.abs(targetTile.x - caster.x), Math.abs(targetTile.y - caster.y));

  const lineTiles = [];
  for (let d = 1; d <= length; d++) {
    lineTiles.push({ x: caster.x + dx * d, y: caster.y + dy * d });
  }

  log(`${caster.name} lança ${spell.name}, atingindo ${length} quadrado(s) em linha.`);

  // Essa função é reaproveitada tanto pelo Relâmpago (magia) quanto pelo
  // Tronco do Troll (arma física, mesmo targetMode "line-aoe") — só a magia
  // ganha o feixe visual e o atraso dobrado (ver MAGIC_TRAVEL_MULTIPLIER);
  // o Tronco não "atira" nada, é a arma golpeando cada um na linha, então o
  // swing do token + o rastro dela (spawnWeaponTrail) já vendem o golpe
  // sozinhos, sem precisar de feixe nem atraso extra.
  const isMagic = spell.mpCost !== undefined;
  let cosmeticDelay;
  if (isMagic) {
    // Descarga elétrica quebrada/ramificada (não a linha reta genérica) —
    // ver spawnLightningCastCue/Bolt. O raio já nasce esticado (instantâneo,
    // sem "voar"), então o atraso do feedback é só o tempo do próprio
    // flash, não de percurso.
    spawnLightningCastCue(caster);
    setTimeout(() => spawnLightningBolt(caster.x, caster.y, targetTile.x, targetTile.y), 90);
    cosmeticDelay = 90 + 150 * MAGIC_TRAVEL_MULTIPLIER;
  } else {
    cosmeticDelay = 0;
  }

  // Habilidade de área: o raio atravessa qualquer um na linha, aliado ou inimigo.
  const hits = lineTiles.map((t) => unitAt(t.x, t.y)).filter((u) => u);
  if (hits.length === 0) {
    log("Não havia ninguém na linha do relâmpago.");
  }
  for (const enemy of hits) {
    resolveSingleHit(caster, enemy, spell, false, cosmeticDelay);
  }

  damageTreesInTiles(lineTiles, spell.damageMin, spell.damageMax);
  damageStructuresInTiles(lineTiles, spell.damageMin, spell.damageMax);
  finalizeAction(caster, spell);
}

// Destruição Rastejante (Xamã): diferente do Relâmpago, a linha vai até a
// BORDA do tabuleiro na direção escolhida (uma só — ver attackableTiles em
// startAttackTargeting, que mostra as 4 possíveis antes do clique, mas só
// UMA vira efeito), não só até onde clicou (ver computeAoeAreaTiles). O
// roubo de CT e a imobilização são INCONDICIONAIS — acontecem em todo mundo
// na linha mesmo que o dano (rolado à parte, via resolveSingleHit) erre. Por
// isso não usa appliesCtDrain nem addStatusEffect direto no item: esses dois
// campos são hit-gated dentro de resolveSingleHit, o que não serviria aqui.
function castCreepingDestruction(caster, spell, targetTile) {
  setFacingTowards(caster, targetTile);
  const lineTiles = computeAoeAreaTiles(caster, spell, targetTile) || [];
  const dir = { dx: Math.sign(targetTile.x - caster.x), dy: Math.sign(targetTile.y - caster.y) };

  log(`${caster.name} conjura ${spell.name}, cobrindo uma faixa de 3 tiles de largura até a borda do tabuleiro na direção escolhida.`);
  // "Rastejante" de verdade: a energia entra no chão do conjurador e a
  // rachadura se espalha tile a tile na direção escolhida (mesmo truque de
  // spawnConeSweep — atraso crescente com a distância), em vez de um feixe
  // instantâneo (Relâmpago) ou projétil aéreo. O golpe de cada alvo espera
  // exatamente até a rachadura "chegar" nele (cosmeticDelay abaixo soma o
  // atraso do cast), não um tempo fixo igual pra todo mundo na linha.
  const CAST_DELAY = 120;
  spawnGroundCrackCast(caster);
  setTimeout(() => spawnGroundCrackSweep(caster, lineTiles, dir), CAST_DELAY);
  // Nuvem de poeira cobrindo a FAIXA INTEIRA conforme a rachadura avança —
  // sem isso os tiles sem alvo ficavam "vazios", só dava pra ver terra se
  // deslocando em cima de quem foi atingido (mesmo ajuste do Envenenamento,
  // ver spawnToxicCloudSweep/spawnGroundDustSweep).
  setTimeout(() => spawnGroundDustSweep(caster, lineTiles), CAST_DELAY);

  const hits = lineTiles.map((t) => unitAt(t.x, t.y)).filter((u) => u);
  if (hits.length === 0) {
    log("Não havia ninguém na linha da Destruição Rastejante.");
  }
  for (const target of hits) {
    target.ct = Math.max(target.ct - 15, 0);
    // "root" com dano zerado = só imobiliza, sem tique de dano (ver o
    // guard damage>0 em applyStatusEffectsAtTurnStart) — 1 turno só.
    addStatusEffect(target, { type: "root", damageMin: 0, damageMax: 0, turnsLeft: 1 });
    log(`${target.name} perde 15 de CT e fica imóvel no próximo turno, com a Destruição Rastejante!`);
    const cosmeticDelay = CAST_DELAY + manhattan(caster, target) * 35;
    setTimeout(() => spawnGroundEruption(target.x, target.y), cosmeticDelay);
    resolveSingleHit(caster, target, spell, false, cosmeticDelay);
  }

  damageTreesInTiles(lineTiles, spell.damageMin, spell.damageMax);
  damageStructuresInTiles(lineTiles, spell.damageMin, spell.damageMax);
  finalizeAction(caster, spell);
}

// Tacar Tronco (Troll): mesmo formato de faixa cardeal da Destruição
// Rastejante (ver computeCardinalRectTiles), só que spell.bandLength x
// spell.bandWidth (3x3 = 9 tiles) numa única direção — a escolhida no
// clique — e o dano/empurrão é hit-gated normal (não incondicional). O
// empurrão é na mesma direção do arremesso (não radial a partir de um ponto
// de impacto, já que aqui não existe um "ponto" — é a faixa inteira).
function castThrowLog(caster, spell, targetTile) {
  setFacingTowards(caster, targetTile);
  const dx = Math.sign(targetTile.x - caster.x);
  const dy = Math.sign(targetTile.y - caster.y);
  const lineTiles = computeAoeAreaTiles(caster, spell, targetTile) || [];

  log(`${caster.name} arremessa ${spell.name}, cobrindo uma faixa de ${spell.bandLength}x${spell.bandWidth} tiles na direção escolhida.`);
  spawnConeSweep(caster, lineTiles, "melee");

  const hits = lineTiles.map((t) => unitAt(t.x, t.y)).filter((u) => u);
  if (hits.length === 0) {
    log("Não havia ninguém na faixa do Tacar Tronco.");
  }
  for (const target of hits) {
    const cosmeticDelay = manhattan(caster, target) * 35;
    const wasHit = resolveSingleHit(caster, target, spell, false, cosmeticDelay);
    if (wasHit && target.hp > 0 && spell.knockback) {
      const moved = pushUnit(target, dx, dy, spell.knockback.distance);
      if (!moved && spell.knockback.blockedExtraDamage) {
        target.hp = Math.max(target.hp - spell.knockback.blockedExtraDamage, 0);
        log(`${target.name} está bloqueado(a) e não pode ser empurrado(a) — leva ${spell.knockback.blockedExtraDamage} de dano extra!`);
        spawnFloatingText(target.x, target.y, `-${spell.knockback.blockedExtraDamage}`, "hit");
      }
    }
  }

  damageTreesInTiles(lineTiles, spell.damageMin, spell.damageMax);
  damageStructuresInTiles(lineTiles, spell.damageMin, spell.damageMax);
  finalizeAction(caster, spell);
}

// Tiro Penetrante (Arqueiro): igual ao Relâmpago, mas sempre vai até o
// alcance máximo fixo do feitiço (não até onde foi clicado) e só nas 4
// direções cardeais — não dá pra "mirar mais perto".
function castPierceShot(caster, spell, targetTile) {
  setFacingTowards(caster, targetTile);
  const dx = Math.sign(targetTile.x - caster.x);
  const dy = Math.sign(targetTile.y - caster.y);

  const lineTiles = [];
  for (let d = 1; d <= spell.maxRange; d++) {
    const x = caster.x + dx * d;
    const y = caster.y + dy * d;
    if (!inBounds(x, y)) break;
    lineTiles.push({ x, y });
  }

  log(`${caster.name} atira ${spell.name}, perfurando ${lineTiles.length} quadrado(s) em linha reta.`);

  // Habilidade de área: perfura qualquer um na linha, aliado ou inimigo.
  const hits = lineTiles.map((t) => unitAt(t.x, t.y)).filter((u) => u);
  if (hits.length === 0) {
    log("Não havia ninguém na linha do Tiro Penetrante.");
  }
  for (const enemy of hits) {
    resolveSingleHit(caster, enemy, spell);
  }

  damageTreesInTiles(lineTiles, spell.damageMin, spell.damageMax);
  damageStructuresInTiles(lineTiles, spell.damageMin, spell.damageMax);
  finalizeAction(caster, spell);
}

// Investida (Orc): corre em linha reta (só nas 4 direções cardeais) até 2x o
// próprio deslocamento, pára ao lado do primeiro inimigo encontrado no
// caminho (ver computeChargeTargets) e ataca — conta como mover E atacar no
// mesmo turno, então marca hasMoved além do que finalizeAction já cuida.
function castCharge(caster, target, item) {
  const dx = Math.sign(target.x - caster.x);
  const dy = Math.sign(target.y - caster.y);
  const previousTile = { x: caster.x, y: caster.y };
  const landing = { x: target.x - dx, y: target.y - dy };
  if (occupantAt(landing.x, landing.y)) {
    log(`${caster.name} não pode executar Investida: o ponto de parada está ocupado por um corpo.`);
    return false;
  }
  caster.x = landing.x;
  caster.y = landing.y;
  caster.hasMoved = true;
  separateLivingUnitFromCorpse(caster, previousTile, dy, -dx);
  setFacingTowards(caster, target);
  log(`${caster.name} avança numa investida contra ${target.name}!`);
  resolveSingleHit(caster, target, item);
  finalizeAction(caster, item);
  return true;
}

// Atropelar (Troll): diferente da Investida, não pára no primeiro inimigo —
// passa por cima de todo mundo no caminho (cada um sofre o golpe) e só pára
// de verdade num aliado ou na borda do tabuleiro. Sempre move o máximo
// possível na direção escolhida.
function castTrample(caster, item, targetTile) {
  const dx = Math.sign(targetTile.x - caster.x);
  const dy = Math.sign(targetTile.y - caster.y);
  let finalX = caster.x;
  let finalY = caster.y;
  const previousTile = { x: caster.x, y: caster.y };
  const hits = [];
  const structureHits = [];

  for (let d = 1; d <= item.maxRange; d++) {
    const x = caster.x + dx * d;
    const y = caster.y + dy * d;
    if (!inBounds(x, y)) break;
    if (deadUnitAt(x, y)) break;
    // Castelo/Montanha do time adversário: intransponível (ver
    // computeReachable, mesma regra) — o atropelo para ANTES desse tile,
    // mas ainda acerta quem estiver nele (só o dono da estrutura pode estar
    // lá) e a própria estrutura, como se o Troll tivesse batido de frente
    // nela em vez de simplesmente parar sem efeito nenhum.
    const structure = structureAt(x, y);
    if (structure && structure.team !== caster.team) {
      const defender = unitAt(x, y);
      if (defender) hits.push(defender);
      structureHits.push(structure);
      break;
    }
    const occupant = unitAt(x, y);
    if (occupant && occupant.team === caster.team) break;
    finalX = x;
    finalY = y;
    if (occupant) hits.push(occupant);
  }

  // O Troll não pode ficar parado em cima de quem ele atropelou: se a última
  // casa do trajeto está ocupada, empurra pra uma das 4 casas livres ao lado
  // (preferindo continuar na mesma direção, depois os dois lados, depois voltar).
  const lastOccupant = unitAt(finalX, finalY);
  if (lastOccupant && lastOccupant !== caster) {
    const pushOptions = [
      { x: finalX + dx, y: finalY + dy },
      { x: finalX + dy, y: finalY + dx },
      { x: finalX - dy, y: finalY - dx },
      { x: finalX - dx, y: finalY - dy },
    ].filter((t) => {
      if (!inBounds(t.x, t.y) || occupantAt(t.x, t.y)) return false;
      // Nunca empurra o Troll pra dentro do castelo/montanha do time
      // adversário (mesma regra de bloqueio total do computeReachable).
      const pushStructure = structureAt(t.x, t.y);
      return !pushStructure || pushStructure.team === caster.team;
    });
    if (pushOptions.length > 0) {
      finalX = pushOptions[0].x;
      finalY = pushOptions[0].y;
    }
  }

  setFacingTowards(caster, { x: finalX, y: finalY });
  caster.x = finalX;
  caster.y = finalY;
  separateLivingUnitFromCorpse(caster, previousTile, dy, -dx);
  caster.hasMoved = true;
  log(`${caster.name} atropela em linha reta!`);

  if (hits.length === 0 && structureHits.length === 0) {
    log("Não havia ninguém no caminho do atropelo.");
  }
  for (const enemy of hits) {
    resolveSingleHit(caster, enemy, item);
  }
  for (const structure of structureHits) {
    damageStructure(structure, item.damageMin, item.damageMax);
  }

  finalizeAction(caster, item);
}

function checkBattleOutcome() {
  if (battleEnded) return true;
  // Castelo/Montanha destruído decide a batalha na hora, mesmo com
  // personagens de qualquer um dos dois lados ainda vivos — pedido do
  // usuário, a estrutura em si passa a ser um alvo estratégico tão
  // decisivo quanto zerar o time inteiro.
  const mountain = structures.find((s) => s.type === "mountain");
  if (mountain && mountain.destroyed) {
    log("Vitória! A Montanha inimiga foi destruída.");
    battleEnded = true;
    showBattleEndModal(true);
    return true;
  }
  const castle = structures.find((s) => s.type === "castle");
  if (castle && castle.destroyed) {
    log("Derrota... o Castelo foi destruído.");
    battleEnded = true;
    showBattleEndModal(false);
    return true;
  }
  if (!enemyTeam.some((u) => u.hp > 0)) {
    log("Vitória! O time do Guerreiro venceu o combate.");
    battleEnded = true;
    showBattleEndModal(true);
    return true;
  }
  if (!playerTeam.some((u) => u.hp > 0)) {
    log("Derrota... o time do Guerreiro foi derrotado.");
    battleEnded = true;
    showBattleEndModal(false);
    return true;
  }
  return false;
}

// Tela de fim de partida: mensagem, musiquinha (vitória/derrota) e botão
// pra reiniciar.
function showBattleEndModal(didWin) {
  battleEndTitleEl.textContent = didWin ? "VOCÊ VENCEU!" : "VOCÊ PERDEU!";
  battleEndTitleEl.className = didWin ? "victory" : "defeat";
  battleEndModalEl.classList.remove("hidden", "victory-flash", "defeat-flash");
  void battleEndModalEl.offsetWidth;
  battleEndModalEl.classList.add(didWin ? "victory-flash" : "defeat-flash");
  playSfx(didWin ? "victory" : "defeat");
}

function hideBattleEndModal() {
  battleEndModalEl.classList.add("hidden");
  battleEndModalEl.classList.remove("victory-flash", "defeat-flash");
}

// Retorna true quando o turno está acabando (batalha decidida ou as duas
// ações já usadas), para quem chamou saber se ainda deve reabrir o menu de
// ações ou não.
function checkEndCurrentTurn() {
  if (checkBattleOutcome()) return true;
  // Se o próprio ataque em área do turno matou o conjurador (ex: Tacar
  // Tronco/Bola de Fogo pegando quem lançou), o turno acaba na hora — não
  // espera hasMoved/hasActed, porque uma unidade morta nunca vai "terminar"
  // de se mover normalmente.
  if (currentActor.hp <= 0) {
    log(`${currentActor.name} não sobreviveu ao próprio ataque. Encerrando turno...`);
    scheduled(endCurrentTurn, 500);
    return true;
  }
  const movedOrCannotMove = currentActor.hasMoved || isRooted(currentActor);
  if (movedOrCannotMove && currentActor.hasActed) {
    log("Ações do turno concluídas. Encerrando turno...");
    scheduled(endCurrentTurn, 500);
    return true;
  }
  return false;
}

function endCurrentTurn() {
  if (!isHumanControlled(currentActor.team) || battleEnded) return;
  // Só pergunta a direção pra unidade que está de fato terminando o turno
  // AGORA (não pra quem já morreu no meio do próprio ataque em área, ver
  // checkEndCurrentTurn) — perguntar "pra onde ela vai olhar" de um cadáver
  // não faz sentido nenhum.
  if (currentActor.hp <= 0) {
    advanceToNextTurn();
    return;
  }
  promptFacingChoice(currentActor, advanceToNextTurn);
}

// Pergunta pra qual lado `unit` vai ficar olhando ao final do turno — ver
// endCurrentTurn, que é o único funil de "fim de turno" pra unidades
// controladas por humano (tanto o clique manual em "Encerrar Turno" quanto
// o fim automático de checkEndCurrentTurn passam por ali), então esse único
// gancho cobre os dois jeitos que o jogador tem de terminar o turno.
// `onDone` roda só depois de confirmar (ou na hora, se a unidade não tiver
// pose por direção pra escolher — ver hasDirectionalArt).
//
// Pedido do usuário: nada de modal grande cobrindo a tela (tampava o
// próprio personagem na maioria das vezes) — em vez disso, 4 setinhas
// soltas direto no tabuleiro ao redor do token + um botão de confirmar
// logo abaixo, criadas na hora em #board-overlay (mesmo padrão de
// spawnFloatingText/.weapon-menu) e removidas ao confirmar. #board-overlay
// é IRMÃO de #board, não filho — render() só recria #board (ver
// `boardEl.innerHTML = ""`), então essas setinhas sobrevivem normalmente
// aos re-renders disparados pelo próprio clique (preview ao vivo).
let pendingFacingChoice = null;
// Glyph de cada seta vem de facingArrowSymbol (mesma função que já desenha o
// indicador de direção no token) — nada de re-listar os símbolos aqui.
const FACING_ARROW_OPTIONS = [
  { dx: 0, dy: -1, dxOff: 0, dyOff: -0.8 },
  { dx: -1, dy: 0, dxOff: -0.8, dyOff: 0 },
  { dx: 1, dy: 0, dxOff: 0.8, dyOff: 0 },
  { dx: 0, dy: 1, dxOff: 0, dyOff: 0.8 },
];

function closeFacingChoicePicker() {
  if (!pendingFacingChoice) return;
  pendingFacingChoice.forEach((el) => el.remove());
  pendingFacingChoice = null;
}

function promptFacingChoice(unit, onDone) {
  const state = unitSpriteState.get(unit);
  const frames = state && state.frames;
  const hasDirectionalArt =
    frames &&
    (hasFrames(frames.idleLeft) ||
      hasFrames(frames.idleRight) ||
      hasFrames(frames.idleBack) ||
      hasFrames(frames.idleFront));
  if (!hasDirectionalArt) {
    onDone();
    return;
  }

  const current = unit.facing || { dx: 1, dy: 0 };
  const arrowBtns = [];

  FACING_ARROW_OPTIONS.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "facing-arrow-btn";
    btn.textContent = facingArrowSymbol({ dx: opt.dx, dy: opt.dy });
    btn.classList.toggle("selected", opt.dx === current.dx && opt.dy === current.dy);
    const pos = tileScreenPercent(unit.x + 0.5 + opt.dxOff, unit.y + 0.5 + opt.dyOff);
    btn.style.left = `${pos.leftPct}%`;
    btn.style.top = `${pos.topPct}%`;
    btn.addEventListener("click", () => {
      unit.facing = { dx: opt.dx, dy: opt.dy };
      arrowBtns.forEach((b) => b.classList.toggle("selected", b === btn));
      // Preview ao vivo: o token já vira na hora, sem esperar confirmar.
      render();
    });
    boardOverlayEl.appendChild(btn);
    arrowBtns.push(btn);
  });

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "facing-confirm-btn";
  confirmBtn.textContent = "✓ Confirmar";
  const confirmPos = tileScreenPercent(unit.x + 0.5, unit.y + 0.5 + 1.45);
  confirmBtn.style.left = `${confirmPos.leftPct}%`;
  confirmBtn.style.top = `${confirmPos.topPct}%`;
  confirmBtn.addEventListener("click", () => {
    closeFacingChoicePicker();
    onDone();
  });
  boardOverlayEl.appendChild(confirmBtn);

  pendingFacingChoice = [...arrowBtns, confirmBtn];
}

// Regra de custo: não fazer nada gasta 60. Atacar gasta o custo da arma usada
// (definido em WEAPONS). Mover gasta até 50, proporcional à distância
// percorrida (mover o alcance todo gasta 50 cheio, mover metade gasta 25).
const WAIT_COST = 60;
const MOVE_MAX_COST = 50;

function moveCtCost(unit, distance) {
  return Math.round((distance / unit.moveRange) * MOVE_MAX_COST);
}

function advanceToNextTurn() {
  const finishedUnit = currentActor;
  // Se a unidade não moveu nem atacou (esperou), ainda paga o custo de espera,
  // senão ela ficaria travada no limiar e agiria de novo na mesma hora.
  // Recompensa por descansar: não usar as duas ações dá +2 MP; não usar
  // nenhuma das duas (esperar o turno inteiro) dá +3 MP e +1 HP em vez disso
  // (não se somam — é a recompensa maior, não um bônus extra por cima).
  if (!finishedUnit.hasMoved && !finishedUnit.hasActed) {
    finishedUnit.ct -= WAIT_COST;
    if (finishedUnit.maxMp !== undefined) {
      finishedUnit.mp = Math.min(finishedUnit.mp + 3, finishedUnit.maxMp);
    }
    finishedUnit.hp = Math.min(finishedUnit.hp + 1, finishedUnit.maxHp);
    log(`${finishedUnit.name} descansou o turno inteiro e recupera 3 MP e 1 HP.`);
  } else if (!finishedUnit.hasMoved || !finishedUnit.hasActed) {
    if (finishedUnit.maxMp !== undefined) {
      finishedUnit.mp = Math.min(finishedUnit.mp + 2, finishedUnit.maxMp);
      log(`${finishedUnit.name} recupera 2 MP por não ter usado toda a ação do turno.`);
    }
  }

  // Regeneração — tanto a do Troll (regenBoost, buff em si mesmo) quanto a
  // Regeneração em Área (regen, Xamã/Fada/Químico) — além da cura por turno
  // (ver applyStatusEffectsAtTurnStart), quem está com qualquer uma das duas
  // ativa também ganha 10 de CT na hora, assim que o próprio turno termina —
  // acelera a volta dele à fila em vez de só curar.
  if (finishedUnit.statusEffects.some((e) => e.type === "regenBoost" || e.type === "regen")) {
    finishedUnit.ct = Math.min(finishedUnit.ct + 10, CT_THRESHOLD);
    log(`${finishedUnit.name} ganha 10 de CT pela Regeneração.`);
    spawnFloatingText(finishedUnit.x, finishedUnit.y, "+10 CT", "heal");
  }

  // Buffs de "só neste turno" (Ataque Poderoso, Tiro Certeiro) e ataques
  // bônus não usados (Agilidade) não sobrevivem pro próximo turno.
  finishedUnit.oneShotDamageBonus = 0;
  finishedUnit.oneShotDamageBonusSource = null;
  finishedUnit.guaranteedNextHit = false;
  finishedUnit.critBonusNextAttack = 0;
  finishedUnit.bonusAttacksRemaining = 0;

  // Armadilhas: a contagem de 3 turnos só começa quando a armadilha é
  // acionada (turnsLeft null até lá) — uma armadilha nunca pisada dura pra
  // sempre. Decrementa uma vez por troca de turno global, não por turno de
  // uma unidade específica.
  traps = traps.filter((trap) => {
    if (!trap.triggered) return true;
    trap.turnsLeft -= 1;
    if (trap.turnsLeft <= 0) {
      log("Uma armadilha se desfez.");
      return false;
    }
    return true;
  });

  // Castelo/Montanha: regenera quem estiver ocupando (do time certo) em
  // TODA troca de turno global, não só nos próprios turnos do ocupante —
  // por isso fica aqui, não em applyStatusEffectsAtTurnStart/beginTurnFor.
  tickStructureRegen();

  closeAllMenus();
  pendingWeapon = null;
  aoePreviewTarget = null;
  aoePreviewTiles = [];
  telegraphTiles = [];
  selectedUnit = null;
  reachableTiles = [];
  attackableTiles = [];
  render();

  scheduled(() => {
    if (battleEnded) return;
    const next = advanceCTUntilReady();
    beginTurnFor(next);
  }, 500);
}

// Time com mais HP total (unidades vivas + Castelo/Montanha, se ainda de
// pé) vence se a batalha não tiver terminado até MAX_GLOBAL_TURNS —
// desempate pra partidas que se arrastam sem ninguém conseguir a vitória
// "de verdade" (todo mundo morto ou construção destruída).
function totalTeamHp(team, structureType) {
  const unitsHp = team.filter((u) => u.hp > 0).reduce((sum, u) => sum + u.hp, 0);
  const structure = structures.find((s) => s.type === structureType);
  const structureHp = structure && !structure.destroyed ? structure.hp : 0;
  return unitsHp + structureHp;
}

function checkGlobalTurnLimit() {
  if (battleEnded || globalTurnCount < MAX_GLOBAL_TURNS) return false;
  const playerTotal = totalTeamHp(playerTeam, "castle");
  const enemyTotal = totalTeamHp(enemyTeam, "mountain");
  const playerWins = playerTotal >= enemyTotal; // empate favorece o time do Guerreiro, por convenção
  log(
    `Limite de ${MAX_GLOBAL_TURNS} turnos atingido! HP total: time do Guerreiro ${playerTotal}, time inimigo ${enemyTotal}. ${
      playerWins ? "O time do Guerreiro vence no total de HP!" : "O time inimigo vence no total de HP!"
    }`
  );
  battleEnded = true;
  showBattleEndModal(playerWins);
  return true;
}

function beginTurnFor(unit) {
  currentActor = unit;
  globalTurnCount += 1;
  if (checkGlobalTurnLimit()) {
    render();
    return;
  }
  pendingWeapon = null;
  aoePreviewTarget = null;
  aoePreviewTiles = [];
  telegraphTiles = [];
  reachableTiles = [];
  attackableTiles = [];

  // advanceCTUntilReady só devolve unidades vivas agora (cadáveres não
  // correm mais a corrida de CT) — cada turno real que começa aqui conta
  // como "esse jogador jogou" pra rodada de decaimento dos cadáveres (ver
  // noteUnitActedThisRound).
  noteUnitActedThisRound(unit);

  applyStatusEffectsAtTurnStart(unit);

  if (unit.hp <= 0) {
    // Essa unidade começou o turno VIVA, mas veneno/raízes/queimadura a
    // matou agora, no próprio applyStatusEffectsAtTurnStart —
    // turnsSinceDeath ainda nem existe (só é setado quando
    // renderUnitTokens detecta a morte no próximo render()), então ainda
    // não entra na contagem regressiva de ressurreição; só pula pra
    // próxima unidade.
    render();
    if (checkBattleOutcome()) return;
    scheduled(() => beginTurnFor(advanceCTUntilReady()), 500);
    return;
  }

  if (isParalyzed(unit)) {
    // Consome a vez inteira e não paga custo de espera normal — perder o
    // turno já É o custo. Decrementa aqui (não em applyStatusEffectsAtTurnStart)
    // pra durar exatamente o número de vezes perdidas, não de "ticks".
    const paralyzeEffect = unit.statusEffects.find((e) => e.type === "paralyzed");
    paralyzeEffect.turnsLeft -= 1;
    if (paralyzeEffect.turnsLeft <= 0) {
      unit.statusEffects = unit.statusEffects.filter((e) => e.type !== "paralyzed");
    }
    unit.ct -= WAIT_COST;
    log(`${unit.name} está paralisado(a) e perde a vez!`);
    render();
    if (checkBattleOutcome()) return;
    scheduled(() => beginTurnFor(advanceCTUntilReady()), 500);
    return;
  }

  if (unit.maxMp !== undefined) {
    unit.mp = Math.min(unit.mp + 1, unit.maxMp);
  }
  if (unit.hpRegenPerTurn) {
    unit.hp = Math.min(unit.hp + unit.hpRegenPerTurn, unit.maxHp);
  }

  unit.hasMoved = false;
  unit.hasActed = false;
  unit.abilityUsedThisTurn = false;
  if (unit.selfAbilitiesUsedThisTurn) unit.selfAbilitiesUsedThisTurn.clear();
  if (unit.selfAbilityKindsUsedThisTurn) unit.selfAbilityKindsUsedThisTurn.clear();
  log(`--- Turno: ${unit.name} ---`);
  playSfx("turnStart");

  if (isHumanControlled(unit.team)) {
    selectedUnit = unit;
  }

  render();

  if (!isHumanControlled(unit.team)) {
    scheduled(() => enemyAct(unit), 500);
  }
}

function pickNearestTarget(unit) {
  const opponents = opposingTeamOf(unit).filter((u) => u.hp > 0);
  if (opponents.length === 0) return null;
  // Prefere quem não está invisível — o alvo principal escolhido aqui vira
  // ataque/perseguição de arma e magias de alvo único (ver getAttackOptions/
  // enemyAttackThenAdvance), que SEMPRE erram contra invisibilidade (só
  // magia de área "cobre o terreno" o bastante pra achar quem tá invisível,
  // ver bypassesInvisibility). Só mira no invisível se não sobrar mais
  // ninguém visível pra perseguir.
  const visible = opponents.filter((u) => !isInvisible(u));
  // Nunca mira em quem está invisível (o golpe sempre erra, ver
  // resolveSingleHit) — mesmo se for o único adversário restante, a IA
  // prefere não atacar a desperdiçar o turno num golpe garantido de errar.
  if (visible.length === 0) return null;
  visible.sort((a, b) => manhattan(unit, a) - manhattan(unit, b));
  return visible[0];
}

// Entre as armas em alcance para a distância atual, escolhe a de maior
// chance de acerto (ex: prefere Espada corpo a corpo em vez de Funda, já
// que a Espada é bem mais precisa quando ambas estão disponíveis). Quando
// `target` voa (Fada), descarta de cara qualquer arma corpo a corpo (sem MP,
// alcance 1, não "aerial") — ela sempre erra contra voadores (ver
// resolveSingleHit), então a IA só considera ataque à distância ou magia.
function pickWeaponForDistance(weapons, distance, target) {
  let candidates = weapons.filter((w) => isInWeaponRange(w, distance));
  if (target && target.flying) {
    candidates = candidates.filter((w) => !(w.mpCost === undefined && w.maxRange === 1 && !w.aerial));
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => getHitChance(b, distance) - getHitChance(a, distance));
  return candidates[0];
}

// Cura (Xamã/Fada) virou magia de área (losango): escolhe como centro um
// aliado ferido dentro do alcance de conjuração, preferindo quem cura mais
// gente ferida ao redor — mesmo espírito do pickBestFreezeTarget.
function pickBestHealAoeSpot(caster, spell) {
  const allies = (caster.team === "player" ? playerTeam : enemyTeam).filter((u) => u.hp > 0);
  const enemies = opposingTeamOf(caster).filter((u) => u.hp > 0);
  const candidates = allies.filter(
    (u) =>
      u.hp < u.maxHp * 0.5 &&
      manhattan(caster, u) <= spell.maxRange &&
      manhattan(caster, u) >= spell.minRange
  );
  if (candidates.length === 0) return null;

  // Cada aliado ferido dentro do alcance vira um "spot" candidato (o próprio
  // tile dele) E também os 4 tiles adjacentes a ele: ele continua dentro do
  // raio de qualquer um deles, então dá pra centralizar do LADO em vez de
  // bem em cima, sobrando chance de deixar um inimigo vizinho de fora da
  // área. Antes isso só valia quando o alvo era o PRÓPRIO conjurador — pra
  // qualquer outro aliado ferido, a única opção era o tile exato dele, o
  // que pegava de brinde qualquer inimigo colado nele (bug real: a IA
  // "sabia" evitar inimigo ao se curar, mas não ao curar os outros).
  const spots = [];
  for (const c of candidates) {
    spots.push({ x: c.x, y: c.y });
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const spot = { x: c.x + dx, y: c.y + dy };
      if (
        inBounds(spot.x, spot.y) &&
        manhattan(caster, spot) <= spell.maxRange &&
        manhattan(caster, spot) >= spell.minRange
      ) {
        spots.push(spot);
      }
    }
  }

  let best = null;
  let bestScore = -Infinity;
  for (const spot of spots) {
    const woundedNearby = allies.filter((u) => u.hp < u.maxHp && manhattan(u, spot) <= spell.areaRadius).length;
    const enemiesCaught = enemies.filter((u) => manhattan(u, spot) <= spell.areaRadius).length;
    // Cada inimigo pego pela área pesa mais que um aliado a menos — só vale
    // incluir um inimigo na cura se não sobrar nenhum jeito de evitá-lo.
    const score = woundedNearby - enemiesCaught * 10;
    if (score > bestScore) {
      bestScore = score;
      best = spot;
    }
  }
  return best;
}

// Melhor alvo pra Ressurreição: entre os cadáveres aliados ainda no campo e
// dentro do alcance, prioriza quem tem MENOS turnos restantes (mais perto
// de virar alma e ficar fora de alcance de vez — ver decayCorpses).
function pickResurrectTarget(caster, spell) {
  const deadAllies = units.filter(
    (u) =>
      u.team === caster.team &&
      u.hp <= 0 &&
      u.turnsSinceDeath !== undefined &&
      manhattan(caster, u) <= spell.maxRange &&
      manhattan(caster, u) >= spell.minRange
  );
  if (deadAllies.length === 0) return null;
  deadAllies.sort((a, b) => b.turnsSinceDeath - a.turnsSinceDeath);
  return deadAllies[0];
}

// Melhor direção pro cone de Envenenamento: a que acerta mais unidades
// (aliadas ou inimigas) diferentes de quem já está com esse tipo de veneno.
// Fada (Ventania) / Xamã (Destruição Rastejante): direção que acerta MAIS
// Heróis SEM acertar NENHUM aliado. computeTilesForDir(dx,dy) devolve os
// tiles daquela direção (cone ou faixa, conforme a habilidade). Rejeita
// qualquer direção que pegue pelo menos 1 aliado, mesmo que pegue mais
// inimigos — "0 aliados atingidos" é obrigatório pra essa prioridade
// especial (ver enemyAct). Devolve null se nenhuma direção acerta ninguém
// ou se toda direção com inimigos também pega aliado.
function pickBestSafeAoeDirection(caster, computeTilesForDir) {
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ];
  let best = null;
  for (const [dx, dy] of dirs) {
    const tiles = computeTilesForDir(dx, dy);
    if (!tiles || tiles.length === 0) continue;
    let enemyCount = 0;
    let allyHit = false;
    for (const t of tiles) {
      const u = unitAt(t.x, t.y);
      if (!u) continue;
      if (u.team === caster.team) {
        allyHit = true;
        break;
      }
      enemyCount++;
    }
    if (allyHit || enemyCount === 0) continue;
    if (!best || enemyCount > best.enemyCount) {
      best = { dx, dy, tiles, enemyCount };
    }
  }
  return best;
}

function pickBestConeDirection(caster, spell) {
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ];
  let best = null;
  let bestCount = 0;
  for (const [dx, dy] of dirs) {
    const tiles = computeConeTilesForDir(caster, dx, dy, spell.maxRange);
    const count = tiles.filter((t) => {
      const u = unitAt(t.x, t.y);
      return u && u.team !== caster.team;
    }).length;
    if (count > bestCount) {
      bestCount = count;
      best = tiles;
    }
  }
  return best;
}

// Congelamento (Fada): mira o inimigo cujo losango ao redor pega mais gente;
// ignora quem já está congelado (não vale a pena gastar em cima de novo).
function pickBestFreezeTarget(caster, spell) {
  const candidates = opposingTeamOf(caster).filter(
    (u) => u.hp > 0 && manhattan(caster, u) <= spell.maxRange && !isParalyzed(u)
  );
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestCount = -1;
  for (const c of candidates) {
    const count = aliveUnits().filter((u) => u.team !== caster.team && manhattan(u, c) <= spell.areaRadius).length;
    if (count > bestCount) {
      bestCount = count;
      best = c;
    }
  }
  return { x: best.x, y: best.y };
}

// Melhor ponto de impacto pra uma explosão em área ofensiva (Bola de Fogo,
// Explosão Sonora, Bomba — qualquer magia targetMode "point-aoe"): maximiza
// quantos inimigos a área pega, mas NUNCA escolhe um ponto que também pegue
// um aliado (incluindo o próprio conjurador) — toda magia de área acerta
// todo mundo dentro dela (ver castFireball), então aqui é só a MIRA da IA
// que fica seletiva, pra ela não se explodir ou queimar os próprios aliados
// tentando acertar o inimigo. Se não sobrar nenhum ponto limpo, não lança.
function pickBestBlastSpot(caster, spell) {
  const enemies = opposingTeamOf(caster).filter((u) => u.hp > 0);
  const allies = (caster.team === "player" ? playerTeam : enemyTeam).filter((u) => u.hp > 0);
  const candidates = enemies.filter(
    (u) => manhattan(caster, u) <= spell.maxRange && manhattan(caster, u) >= spell.minRange
  );
  if (candidates.length === 0) return null;
  let best = null;
  let bestCount = 0;
  for (const c of candidates) {
    const spot = { x: c.x, y: c.y };
    const friendlyCaught = allies.some((u) => manhattan(u, spot) <= spell.areaRadius);
    if (friendlyCaught) continue;
    const enemiesCaught = enemies.filter((u) => manhattan(u, spot) <= spell.areaRadius).length;
    if (enemiesCaught > bestCount) {
      bestCount = enemiesCaught;
      best = spot;
    }
  }
  return best;
}

// Tiles pra "mostrar a mira" de um ataque de arma: pra armas de linha limpa,
// mostra o trajeto inteiro até o alvo (pra dar pra ver se algo no caminho
// vai bloquear); pras demais, só o tile do alvo mesmo.
function weaponAimTiles(unit, target, weapon) {
  if (weapon.requiresClearPath) {
    return bresenhamLine(unit.x, unit.y, target.x, target.y).slice(1);
  }
  return [{ x: target.x, y: target.y }];
}

// Opções de ataque pra IA escolher: as armas normais, mais qualquer magia de
// alvo único (targetMode "enemy", ex: Luz da Fada) que a unidade tenha MP pra
// pagar — deixa pickWeaponForDistance tratar tudo igual, pela distância.
function getAttackOptions(unit) {
  const spellAttacks = (unit.spells || []).filter(
    (s) => s.targetMode === "enemy" && unit.mp >= s.mpCost
  );
  return [...unit.weapons, ...spellAttacks];
}

// Executa um ataque (com telegraph) e, se sobrar ataque bônus (Agilidade do
// Goblin — hasActed continua false depois do golpe), tenta atacar de novo
// antes de passar o turno.
function enemyAttackThenAdvance(unit, target, weaponItem) {
  telegraphThenAct(weaponAimTiles(unit, target, weaponItem), () => {
    if (weaponItem.requiresClearPath) {
      performRangedAttackWithObstruction(unit, target, weaponItem);
    } else {
      performAttack(unit, target, weaponItem);
    }
    if (!unit.hasActed && unit.hp > 0 && target.hp > 0) {
      const nextWeapon = pickWeaponForDistance(getAttackOptions(unit), manhattan(unit, target), target);
      if (nextWeapon) {
        scheduled(() => enemyAttackThenAdvance(unit, target, nextWeapon), 500);
        return;
      }
    }
    scheduled(advanceToNextTurn, 600);
  });
}

function enemyAct(unit) {
  // Habilidades livres (não gastam CT, não consomem a ação): a IA ativa
  // automaticamente antes de decidir o resto do turno.
  if (unit.spells) {
    const furySpell = unit.spells.find((s) => s.kind === "fury");
    if (furySpell && unit.mp >= furySpell.mpCost && !unit.statusEffects.some((e) => e.type === "fury")) {
      castFury(unit, furySpell);
    }
    // Pes Ageis (Goblin) ANTES da Agilidade: as duas competem pelo MP do
    // Goblin, e quando o alvo mais próximo está fora do alcance normal de
    // movimento, o deslocamento extra vale mais que um 2º ataque que a
    // unidade nem consegue dar ainda.
    const swiftSpell = unit.spells.find((s) => s.kind === "swift-feet");
    let usedSwiftFeet = false;
    if (swiftSpell && unit.mp >= swiftSpell.mpCost && !unit.statusEffects.some((e) => e.type === "swiftFeet")) {
      const nearestForSwift = pickNearestTarget(unit);
      if (nearestForSwift && manhattan(unit, nearestForSwift) > unit.moveRange) {
        castSwiftFeet(unit, swiftSpell);
        usedSwiftFeet = true;
      }
    }
    const agilitySpell = unit.spells.find((s) => s.kind === "haste-attack");
    if (agilitySpell && !usedSwiftFeet && unit.mp >= agilitySpell.mpCost && !unit.bonusAttacksRemaining) {
      castAgility(unit, agilitySpell);
    }
    // Evasiva (Goblin): livre, renova sozinha quando expira.
    const evasiveSpell = unit.spells.find((s) => s.kind === "evasive");
    if (evasiveSpell && unit.mp >= evasiveSpell.mpCost && !unit.statusEffects.some((e) => e.type === "evasive")) {
      castEvasiveManeuver(unit, evasiveSpell);
    }
    // Troll: reforça a própria regeneração quando machucado — também é
    // "livre", então não custa a chance de mover/atacar nesse turno.
    const regenSpell = unit.spells.find((s) => s.kind === "regen-boost");
    if (
      regenSpell &&
      unit.mp >= regenSpell.mpCost &&
      unit.hp < unit.maxHp * 0.5 &&
      !unit.statusEffects.some((e) => e.type === "regenBoost")
    ) {
      castRegenBoost(unit, regenSpell);
    }
  }

  // IA do Xamã/Fada: ressuscita aliado morto (prioridade máxima — trazer
  // alguém de volta vale mais que qualquer cura), senão cura aliado ferido,
  // senão tenta prender/paralisar ou envenenar em área, senão cai no
  // comportamento padrão (atacar/se aproximar). Toda ação passa por
  // telegraphThenAct pra mostrar a área mirada 1s antes.
  if (unit.spells) {
    const resurrectSpell = unit.spells.find((s) => s.kind === "resurrect");
    if (resurrectSpell && unit.mp >= resurrectSpell.mpCost) {
      const target = pickResurrectTarget(unit, resurrectSpell);
      if (target) {
        telegraphThenAct([{ x: target.x, y: target.y }], () => {
          castResurrect(unit, target, resurrectSpell);
          scheduled(advanceToNextTurn, 600);
        });
        return;
      }
    }
    const healSpell = unit.spells.find((s) => s.kind === "heal-aoe");
    if (healSpell && unit.mp >= healSpell.mpCost) {
      const spot = pickBestHealAoeSpot(unit, healSpell);
      if (spot) {
        const areaTiles = computeAoeAreaTiles(unit, healSpell, spot) || [spot];
        telegraphThenAct(areaTiles, () => {
          castHealAoe(unit, healSpell, spot);
          scheduled(advanceToNextTurn, 600);
        });
        return;
      }
    }
    // Regeneração em Área: só entra se a Cura instantânea não deu conta de
    // achar um alvo válido (checado acima) — cura na hora é sempre
    // prioridade quando disponível, a cura ao longo do tempo é a segunda
    // opção.
    const regenAoeSpell = unit.spells.find((s) => s.kind === "regen-aoe");
    if (regenAoeSpell && unit.mp >= regenAoeSpell.mpCost) {
      const spot = pickBestHealAoeSpot(unit, regenAoeSpell);
      if (spot) {
        const areaTiles = computeAoeAreaTiles(unit, regenAoeSpell, spot) || [spot];
        telegraphThenAct(areaTiles, () => {
          castRegenAoe(unit, regenAoeSpell, spot);
          scheduled(advanceToNextTurn, 600);
        });
        return;
      }
    }
  }

  // Prioridade especial (Fada/Xamã): se Ventania/Destruição Rastejante puder
  // atingir >= 2 Heróis SEM atingir nenhum aliado, usa isso AGORA, antes de
  // qualquer outra decisão (exceto Ressurreição/Cura acima, que continuam
  // prioridade máxima de verdade — trazer alguém de volta ainda vale mais).
  // "0 aliados atingidos" é obrigatório: pickBestSafeAoeDirection já rejeita
  // qualquer direção que pegue 1 aliado que seja, mesmo pegando mais
  // inimigos.
  if (unit.spells) {
    if (unit.spriteKey === "fada") {
      const windstormSpell = unit.spells.find((s) => s.kind === "windstorm");
      if (windstormSpell && unit.mp >= windstormSpell.mpCost) {
        const best = pickBestSafeAoeDirection(unit, (dx, dy) =>
          computeConeTilesForDir(unit, dx, dy, windstormSpell.maxRange)
        );
        if (best && best.enemyCount >= 2) {
          telegraphThenAct(best.tiles, () => {
            castWindstorm(unit, windstormSpell, best.tiles);
            scheduled(advanceToNextTurn, 600);
          });
          return;
        }
      }
    }
    if (unit.spriteKey === "xama") {
      const creepSpell = unit.spells.find((s) => s.kind === "creeping-line");
      if (creepSpell && unit.mp >= creepSpell.mpCost) {
        const best = pickBestSafeAoeDirection(unit, (dx, dy) => {
          const probe = { x: unit.x + dx, y: unit.y + dy };
          if (!inBounds(probe.x, probe.y)) return [];
          return computeCardinalRectTiles(unit, probe, creepSpell.bandLength, creepSpell.bandWidth);
        });
        if (best && best.enemyCount >= 2) {
          const targetTile = { x: unit.x + best.dx, y: unit.y + best.dy };
          telegraphThenAct(best.tiles, () => {
            castCreepingDestruction(unit, creepSpell, targetTile);
            scheduled(advanceToNextTurn, 600);
          });
          return;
        }
      }
    }
  }

  const target = pickNearestTarget(unit);
  if (!target) {
    advanceToNextTurn();
    return;
  }

  if (unit.spells) {
    const rootSpell = unit.spells.find((s) => s.kind === "root");
    if (
      rootSpell &&
      unit.mp >= rootSpell.mpCost &&
      !isRooted(target) &&
      isInWeaponRange(rootSpell, manhattan(unit, target))
    ) {
      telegraphThenAct([{ x: target.x, y: target.y }], () => {
        castRootSpell(unit, target, rootSpell);
        scheduled(advanceToNextTurn, 600);
      });
      return;
    }

    // Magias de explosão em área (Bola de Fogo, Explosão Sonora, Bomba):
    // só lança se achar um ponto de impacto que pegue pelo menos 1 inimigo
    // sem pegar nenhum aliado (ver pickBestBlastSpot) — senão prefere cair
    // no ataque normal mais abaixo em vez de arriscar fogo amigo/suicídio.
    const blastSpell = unit.spells.find((s) => s.targetMode === "point-aoe" && unit.mp >= s.mpCost);
    if (blastSpell) {
      const spot = pickBestBlastSpot(unit, blastSpell);
      if (spot) {
        const areaTiles = computeAoeAreaTiles(unit, blastSpell, spot) || [spot];
        telegraphThenAct(areaTiles, () => {
          castFireball(unit, blastSpell, spot);
          scheduled(advanceToNextTurn, 600);
        });
        return;
      }
    }

    // Congelamento (Fada): agora em área — mira o inimigo cujo losango pega
    // mais gente, em vez de um alvo único.
    const freezeSpell = unit.spells.find((s) => s.kind === "freeze-aoe");
    if (freezeSpell && unit.mp >= freezeSpell.mpCost) {
      const spot = pickBestFreezeTarget(unit, freezeSpell);
      if (spot) {
        const areaTiles = computeAoeAreaTiles(unit, freezeSpell, spot) || [spot];
        telegraphThenAct(areaTiles, () => {
          castFreezeAoe(unit, freezeSpell, spot);
          scheduled(advanceToNextTurn, 600);
        });
        return;
      }
    }

    // Ventania (Fada): mesma lógica de mira do Envenenamento (melhor direção
    // de cone), só que empurra em vez de envenenar.
    const windstormSpell = unit.spells.find((s) => s.kind === "windstorm");
    if (windstormSpell && unit.mp >= windstormSpell.mpCost) {
      const coneTiles = pickBestConeDirection(unit, windstormSpell);
      if (coneTiles) {
        telegraphThenAct(coneTiles, () => {
          castWindstorm(unit, windstormSpell, coneTiles);
          scheduled(advanceToNextTurn, 600);
        });
        return;
      }
    }

    // Troll: se tiver 2+ inimigos adjacentes, prefere o Crescimento (acerta
    // as 8 direções de uma vez) em vez de atacar só um.
    const growthSpell = unit.spells.find((s) => s.kind === "growth-attack");
    if (growthSpell && unit.mp >= growthSpell.mpCost) {
      const dirs = [
        [1, 0], [-1, 0], [0, 1], [0, -1],
        [1, 1], [1, -1], [-1, 1], [-1, -1],
      ];
      const adjacentTiles = dirs
        .map(([dx, dy]) => ({ x: unit.x + dx, y: unit.y + dy }))
        .filter((t) => inBounds(t.x, t.y));
      const adjacentEnemyCount = adjacentTiles.filter((t) => {
        const u = unitAt(t.x, t.y);
        return u && u.team !== unit.team;
      }).length;
      if (adjacentEnemyCount >= 2) {
        telegraphThenAct(adjacentTiles, () => {
          castGrowthAttack(unit, growthSpell);
          scheduled(advanceToNextTurn, 600);
        });
        return;
      }
    }

    const coneSpell = unit.spells.find((s) => s.kind === "cone-poison");
    if (coneSpell && unit.mp >= coneSpell.mpCost) {
      const coneTiles = pickBestConeDirection(unit, coneSpell);
      if (coneTiles) {
        telegraphThenAct(coneTiles, () => {
          castPoisonCone(unit, coneSpell, coneTiles);
          scheduled(advanceToNextTurn, 600);
        });
        return;
      }
    }

    // Investida (Orc): mover + atacar num só golpe quando há um alvo no
    // alcance da investida — prioriza o inimigo mais próximo do alvo
    // principal (não necessariamente o mais próximo do próprio Orc).
    const chargeSpell = unit.spells.find((s) => s.kind === "charge");
    if (chargeSpell && unit.mp >= chargeSpell.mpCost) {
      const chargeTargets = computeChargeTargets(unit);
      if (chargeTargets.length > 0) {
        let chosen = chargeTargets[0];
        for (const t of chargeTargets) {
          if (manhattan(t, target) < manhattan(chosen, target)) chosen = t;
        }
        const victim = unitAt(chosen.x, chosen.y);
        telegraphThenAct([chosen], () => {
          castCharge(unit, victim, chargeSpell);
          scheduled(advanceToNextTurn, 600);
        });
        return;
      }
    }

    // Atropelar (Troll): escolhe a direção cardeal que atropela mais gente.
    const trampleSpell = unit.spells.find((s) => s.targetMode === "trample");
    if (trampleSpell && unit.mp >= trampleSpell.mpCost) {
      const dirs4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      let bestDir = null;
      let bestHits = 0;
      for (const [dx, dy] of dirs4) {
        let hits = 0;
        for (let d = 1; d <= trampleSpell.maxRange; d++) {
          const x = unit.x + dx * d;
          const y = unit.y + dy * d;
          if (!inBounds(x, y)) break;
          const occ = unitAt(x, y);
          if (occ && occ.team === unit.team) break;
          if (occ) hits++;
        }
        if (hits > bestHits) {
          bestHits = hits;
          bestDir = [dx, dy];
        }
      }
      if (bestDir) {
        const tile = { x: unit.x + bestDir[0], y: unit.y + bestDir[1] };
        telegraphThenAct([tile], () => {
          castTrample(unit, trampleSpell, tile);
          scheduled(advanceToNextTurn, 600);
        });
        return;
      }
    }
  }

  // Simple AI: attack with the best weapon (ou magia de ataque) em alcance.
  // Otherwise move closer.
  const weaponInRange = pickWeaponForDistance(getAttackOptions(unit), manhattan(unit, target), target);

  // Alma (ver souls/decayCorpses): com vida abaixo de 50%, prioridade MÁXIMA
  // — desvia pra cima dela mesmo abrindo mão de um ataque já garantido daqui
  // de onde está (só não desvia se não sobrar nenhuma alma alcançável). Com
  // vida alta, a busca por alma continua de prioridade baixa, só no fallback
  // de movimento logo abaixo — nunca troca um ataque já disponível por ela.
  const isCriticallyHurt = unit.hp < unit.maxHp * 0.5;
  if (isCriticallyHurt && !isRooted(unit)) {
    const reachable = computeReachable(unit);
    const soulTiles = reachable.filter((t) => souls.some((s) => s.x === t.x && s.y === t.y));
    if (soulTiles.length > 0) {
      const soulTile =
        soulTiles.find((t) => pickWeaponForDistance(getAttackOptions(unit), manhattan(t, target), target)) ||
        soulTiles[0];
      performMove(unit, soulTile);
      render();
      const followUpWeapon = pickWeaponForDistance(getAttackOptions(unit), manhattan(unit, target), target);
      if (followUpWeapon && target.hp > 0) {
        scheduled(() => enemyAttackThenAdvance(unit, target, followUpWeapon), 500);
      } else {
        scheduled(advanceToNextTurn, 500);
      }
      return;
    }
  }

  if (weaponInRange) {
    enemyAttackThenAdvance(unit, target, weaponInRange);
    return;
  }

  if (isRooted(unit)) {
    log(`${unit.name} está preso pelas raízes e não pode se mover.`);
  } else {
    const reachable = computeReachable(unit);
    // Sem alcance pra atacar esse turno mesmo (já checado acima) — antes de
    // só se aproximar do alvo, prefere desviar pra uma alma alcançável se
    // tiver algo a ganhar com ela (HP ou MP não cheios; a prioridade alta com
    // vida abaixo de 50% já foi tratada acima, antes até de checar ataque).
    const wantsSoul = unit.hp < unit.maxHp || (unit.maxMp !== undefined && unit.mp < unit.maxMp);
    let soulTile;
    if (wantsSoul) {
      const soulTiles = reachable.filter((t) => souls.some((s) => s.x === t.x && s.y === t.y));
      // Entre os tiles com alma alcançáveis, prioriza um que TAMBÉM já é uma
      // posição de ataque válida contra o alvo neste turno (ex: o lado dele
      // onde a alma está) — assim ataca e recupera vida no mesmo movimento,
      // em vez de simplesmente ir atrás de qualquer alma alcançável (só cai
      // nisso se nenhuma delas também servir de posição de ataque).
      soulTile =
        soulTiles.find((t) => pickWeaponForDistance(getAttackOptions(unit), manhattan(t, target), target)) ||
        soulTiles[0];
    }

    // Modo Sobrevivência: quando resta exatamente 1 personagem vivo no
    // PRÓPRIO time de quem está agindo (herói ou inimigo, qualquer lado —
    // regra genérica por time/contagem, não por nome de personagem), ele
    // prioriza se deslocar pra posição defensiva do próprio time (Castelo
    // pro time "player", Montanha pro "enemy") em vez de avançar contra o
    // inimigo. Maior prioridade que a preferência específica de Xamã/Fada
    // logo abaixo (que é só um "às vezes" oportunista, não sobrevivência).
    let survivalTile;
    const ownTeamAliveCount = (unit.team === "player" ? playerTeam : enemyTeam).filter((u) => u.hp > 0).length;
    if (!soulTile && ownTeamAliveCount === 1) {
      const homeStructure = structures.find((s) => s.team === unit.team && !s.destroyed);
      const alreadyHome = homeStructure && homeStructure.tiles.some((t) => t.x === unit.x && t.y === unit.y);
      if (homeStructure && !alreadyHome) {
        const occupant = structureOccupant(homeStructure);
        if (!occupant) {
          const homeTiles = reachable.filter((t) => homeStructure.tiles.some((ht) => ht.x === t.x && ht.y === t.y));
          if (homeTiles.length > 0) {
            survivalTile =
              homeTiles.find((t) => pickWeaponForDistance(getAttackOptions(unit), manhattan(t, target), target)) ||
              homeTiles[0];
          } else {
            // Não alcança a posição defensiva neste turno: foge
            // progressivamente na direção dela (nunca fica parado só
            // porque não chega de uma vez) — reavalia de novo no próximo
            // turno, já que essa mesma função roda a cada turno da unidade.
            const anchor = homeStructure.tiles[4] || homeStructure.tiles[0];
            let bestPartialDist = manhattan(unit, anchor);
            for (const tile of reachable) {
              const d = manhattan(tile, anchor);
              if (d < bestPartialDist) {
                bestPartialDist = d;
                survivalTile = tile;
              }
            }
          }
        }
      }
      // Se já estiver na posição defensiva (alreadyHome), não força
      // movimento — o fallback abaixo já tenta se aproximar do alvo pra
      // atacar dali mesmo, sem abandonar a posição sozinho.
    }

    // Xamã/Fada: a Montanha (terreno do próprio time) é uma posição boa pra
    // eles especificamente — +20% de acerto próprio, -10% pra quem tenta
    // acertar eles lá dentro, e regeneram 1 HP/1 MP a cada troca de turno
    // global (ver STRUCTURE_INFO.mountain). Sem prioridade sobre alma (já
    // tratada acima) nem sobre um ataque/cura já disponível neste turno (só
    // entra aqui, no fallback de movimento) — mas quando não tem nada
    // melhor pra fazer, a IA passa a considerar ir pra lá com mais
    // frequência, sempre quando só resta 1 adversário, ou quando algum
    // aliado próprio está com pouca vida.
    let mountainTile;
    if (!soulTile && !survivalTile && (unit.spriteKey === "xama" || unit.spriteKey === "fada")) {
      const mountain = structures.find((s) => s.type === "mountain" && !s.destroyed);
      const alreadyInMountain = mountain && mountain.tiles.some((t) => t.x === unit.x && t.y === unit.y);
      if (mountain && !alreadyInMountain) {
        const occupant = structureOccupant(mountain);
        if (!occupant) {
          const onlyOneEnemyLeft = opposingTeamOf(unit).filter((u) => u.hp > 0).length === 1;
          const allyLowHp = enemyTeam.some((u) => u !== unit && u.hp > 0 && u.hp < u.maxHp * 0.4);
          const wantsMountainOften = Math.random() < 0.35;
          if (onlyOneEnemyLeft || allyLowHp || wantsMountainOften) {
            const mountainTiles = reachable.filter((t) =>
              mountain.tiles.some((mt) => mt.x === t.x && mt.y === t.y)
            );
            mountainTile =
              mountainTiles.find((t) => pickWeaponForDistance(getAttackOptions(unit), manhattan(t, target), target)) ||
              mountainTiles[0];
          }
        }
      }
    }

    let best = soulTile || survivalTile || mountainTile || null;
    let bestDist = manhattan(unit, target);
    if (!best) {
      for (const tile of reachable) {
        const dist = manhattan(tile, target);
        if (dist < bestDist) {
          bestDist = dist;
          best = tile;
        }
      }
    }

    if (best) {
      performMove(unit, best);
    } else {
      log(`${unit.name} não pôde se mover.`);
    }
  }

  render();

  const followUpWeapon = pickWeaponForDistance(getAttackOptions(unit), manhattan(unit, target), target);
  if (followUpWeapon && target.hp > 0) {
    scheduled(() => enemyAttackThenAdvance(unit, target, followUpWeapon), 500);
  } else {
    scheduled(advanceToNextTurn, 500);
  }
}

// Embaralha as posições iniciais entre as unidades do mesmo time — a cada
// partida nova, quem fica em qual "linha" muda, mas o time continua do
// próprio lado do tabuleiro (mesma coluna/formação de sempre).
function shuffleTeamPositions(team) {
  const positions = team.map((u) => ({ x: u.x, y: u.y }));
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  team.forEach((u, i) => {
    u.x = positions[i].x;
    u.y = positions[i].y;
  });
}

function resetGame() {
  // Se um restart acontecer com o seletor de direção ainda aberto (turno
  // travado nele), as setinhas ficam presas em #board-overlay pra sempre,
  // com closures apontando pro estado antigo — ver promptFacingChoice.
  closeFacingChoicePicker();
  turnToken++;
  // Reconstrói o terreno do zero — árvores destruídas numa partida anterior
  // (viraram "stump", ver damageTree) voltam a crescer numa partida nova.
  buildTerrainMap();
  // Mesma lógica pro Castelo/Montanha — voltam a 100/100 HP numa partida nova.
  buildStructures();
  Object.assign(guerreiro, createGuerreiroState());
  Object.assign(arqueiro, createArqueiroState());
  Object.assign(mago, createMagoState());
  Object.assign(ladino, createLadinoState());
  Object.assign(quimico, createQuimicoState());
  Object.assign(goblin, createGoblinState());
  Object.assign(orc, createOrcState());
  Object.assign(xama, createXamaState());
  Object.assign(fada, createFadaState());
  Object.assign(troll, createTrollState());
  shuffleTeamPositions(playerTeam);
  shuffleTeamPositions(enemyTeam);
  battleEnded = false;
  globalTurnCount = 0;
  roundActedUnits.clear();
  selectedUnit = null;
  reachableTiles = [];
  attackableTiles = [];
  pendingWeapon = null;
  aoePreviewTarget = null;
  aoePreviewTiles = [];
  telegraphTiles = [];
  traps = [];
  souls = [];
  logEl.innerHTML = "";
  // Se a partida for reiniciada no meio de uma cena de batalha, força o
  // overlay a fechar na hora — sem isso o jogo ficava travado pra sempre
  // (battleSceneActive nunca voltava a false, ver onTileClick).
  battleSceneActive = false;
  battleSceneEls.overlay.classList.add("hidden");
  battleSceneEls.overlay.classList.remove("entering", "leaving");
  closeAllMenus();
  hideBattleEndModal();
  resetUnitTokens();
  resetUnitCards();
  // Sem isso, se por acaso a mesma unidade for sorteada pra abrir a partida
  // nova de novo, announceTurnChange() acha que "o turno não mudou" (mesma
  // referência de antes) e engole o banner do primeiro turno.
  lastAnnouncedActor = null;

  const first = advanceCTUntilReady();
  log("O combate começou!");
  beginTurnFor(first);
}

const restartConfirmModalEl = document.getElementById("restart-confirm-modal");
const restartConfirmCancelBtn = document.getElementById("restart-confirm-cancel-btn");
const restartConfirmOkBtn = document.getElementById("restart-confirm-ok-btn");

restartBtn.addEventListener("click", () => restartConfirmModalEl.classList.remove("hidden"));
restartConfirmCancelBtn.addEventListener("click", () => restartConfirmModalEl.classList.add("hidden"));
restartConfirmOkBtn.addEventListener("click", () => {
  restartConfirmModalEl.classList.add("hidden");
  resetGame();
});
// Fim de batalha (ver battle-end-modal): partida já acabou, não tem
// "progresso em andamento" pra perder — reinicia direto, sem confirmar.
battleEndRestartBtn.addEventListener("click", resetGame);
// Clique manual no botão sempre pede confirmação (diferente do fim de turno
// automático em checkEndCurrentTurn, que dispara sozinho quando as ações do
// turno já acabaram). Os dois caminhos convergem em endCurrentTurn, que por
// sua vez pergunta a direção (ver promptFacingChoice) antes de avançar.
endTurnBtn.addEventListener("click", requestEndTurnConfirmation);
topBackBtn.addEventListener("click", () => {
  const action = pendingBackAction;
  pendingBackAction = null;
  if (action) action();
});

// Alterna livremente quem controla o time vermelho. Só afeta o próximo
// turno de uma unidade desse time (ver beginTurnFor) — não interrompe um
// turno que já está em andamento.
function updateControlToggleButtons() {
  aiControlBtn.classList.toggle("active", enemyControlledByAI);
  player2ControlBtn.classList.toggle("active", !enemyControlledByAI);
  player1AiControlBtn.classList.toggle("active", playerControlledByAI);
  player1HumanControlBtn.classList.toggle("active", !playerControlledByAI);
}

aiControlBtn.addEventListener("click", () => {
  enemyControlledByAI = true;
  updateControlToggleButtons();
});

player2ControlBtn.addEventListener("click", () => {
  enemyControlledByAI = false;
  updateControlToggleButtons();
});

// Time azul pela IA: se já for a vez de uma unidade azul e ninguém tiver
// selecionado nada ainda (currentActor acabou de começar o turno), dispara
// enemyAct nela igual já acontece pro time vermelho — sem isso, ligar a IA
// no meio do turno de uma unidade azul não faria efeito até o PRÓXIMO turno
// (mesma ressalva que já existia pro toggle do time vermelho).
player1AiControlBtn.addEventListener("click", () => {
  playerControlledByAI = true;
  updateControlToggleButtons();
});

player1HumanControlBtn.addEventListener("click", () => {
  playerControlledByAI = false;
  updateControlToggleButtons();
});

battleSceneToggleBtn.addEventListener("click", () => {
  battleSceneEnabled = !battleSceneEnabled;
  battleSceneToggleBtn.classList.toggle("active", battleSceneEnabled);
  battleSceneToggleBtn.textContent = battleSceneEnabled ? "🎬 Ligada" : "🎬 Desligada";
});

// Único controle de música pedido: silenciar/religar sem afetar os efeitos
// (ver setMusicMuted). Clicar aqui também conta como a "primeira interação"
// que libera o áudio no navegador — se a trilha ainda não tinha começado,
// getAudioCtx() a inicia (com fade-in) na mesma hora.
musicToggleBtn.addEventListener("click", () => {
  getAudioCtx();
  setMusicMuted(!musicMuted);
  musicToggleBtn.classList.toggle("active", !musicMuted);
  musicToggleBtn.textContent = musicMuted ? "🎵 Desligada" : "🎵 Ligada";
});

updateControlToggleButtons();
resetGame();
