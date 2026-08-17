// Suite de regressão do jogo. Cada teste abre o jogo de verdade (index.html),
// força uma situação específica no tabuleiro e confere se o resultado é o
// esperado. Rodar com: node tests/run_tests.js
//
// Ao adicionar/alterar uma mecânica, adicione ou ajuste o teste correspondente
// aqui em vez de descartá-lo depois de verificar manualmente uma vez.
const { chromium } = require('playwright');
const path = require('path');

const INDEX_PATH = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// Cada teste roda dentro do contexto da página (tem acesso direto às globais
// do game.js: unidades, WEAPONS, SPELLS, funções de cast, etc.) e deve
// retornar { pass: boolean, details?: string }. `resetGame()` já é chamado
// antes de cada teste pelo runner, então cada teste começa do estado inicial.
const tests = [
  {
    name: 'Envenenamento (Xamã) acerta aliados e inimigos na mesma área',
    fn: async () => {
      xama.x = 5; xama.y = 5; xama.hp = xama.maxHp; xama.mp = xama.maxMp;
      orc.x = 5; orc.y = 4; orc.hp = orc.maxHp; // aliado, no cone (acima)
      guerreiro.x = 5; guerreiro.y = 3; guerreiro.hp = guerreiro.maxHp; // inimigo, mesmo cone
      for (const u of [goblin, fada, troll, arqueiro, mago, ladino, quimico]) { u.x = -1; u.y = -1; }

      const coneSpell = xama.spells.find((s) => s.kind === 'cone-poison');
      const coneTiles = pickBestConeDirection(xama, coneSpell);
      Math.random = () => 0.01; // garante o acerto em todo mundo
      castPoisonCone(xama, coneSpell, coneTiles);

      const orcPoisoned = orc.statusEffects.some((e) => e.type === 'poison');
      const guerreiroPoisoned = guerreiro.statusEffects.some((e) => e.type === 'poison');

      // Espera o feedback visual escalonado (setTimeout por distância) acabar
      // antes de terminar o teste — senão o timer sobrevive e polui o DOM que
      // o PRÓXIMO teste da suite vai inspecionar.
      await new Promise((r) => setTimeout(r, 250));

      const pass = orcPoisoned && guerreiroPoisoned;
      return {
        pass,
        details: `orc(aliado)=${orcPoisoned} guerreiro(inimigo)=${guerreiroPoisoned} (esperado: true,true)`,
      };
    },
  },
  {
    name: 'Ventania (Fada) acerta aliados e inimigos na mesma área',
    fn: async () => {
      fada.x = 5; fada.y = 5; fada.hp = fada.maxHp; fada.mp = fada.maxMp;
      orc.x = 5; orc.y = 4; orc.hp = orc.maxHp; // aliado, no cone
      guerreiro.x = 5; guerreiro.y = 3; guerreiro.hp = guerreiro.maxHp; // inimigo, mesmo cone
      for (const u of [goblin, xama, troll, arqueiro, mago, ladino, quimico]) { u.x = -1; u.y = -1; }

      const windSpell = fada.spells.find((s) => s.kind === 'windstorm');
      const coneTiles = pickBestConeDirection(fada, windSpell);
      Math.random = () => 0.01;
      castWindstorm(fada, windSpell, coneTiles);

      const orcHit = orc.hp < orc.maxHp;
      const guerreiroHit = guerreiro.hp < guerreiro.maxHp;

      await new Promise((r) => setTimeout(r, 250));

      const pass = orcHit && guerreiroHit;
      return {
        pass,
        details: `orc(aliado)=${orcHit} guerreiro(inimigo)=${guerreiroHit} (esperado: true,true)`,
      };
    },
  },
  {
    name: 'Cura (Xamã/Fada) é área em losango de 5 quadrados e cura qualquer time',
    fn: () => {
      xama.x = 5; xama.y = 5; xama.hp = xama.maxHp; xama.mp = xama.maxMp;
      orc.x = 5; orc.y = 4; orc.hp = 1; orc.maxHp = 45; // aliado ferido, dentro do losango
      guerreiro.x = 5; guerreiro.y = 6; guerreiro.hp = 1; guerreiro.maxHp = 35; // inimigo ferido, dentro do losango também
      mago.x = 5; mago.y = 2; mago.hp = 1; mago.maxHp = 20; // fora do losango (distância 3) — não deve ser afetado
      for (const u of [goblin, fada, troll, arqueiro, ladino, quimico]) { u.x = -1; u.y = -1; }

      const cureSpell = xama.spells.find((s) => s.kind === 'heal-aoe');
      const center = { x: xama.x, y: xama.y };
      const areaTiles = computeAoeAreaTiles(xama, cureSpell, center);
      const shapeOk = cureSpell.areaRadius === 1 && areaTiles.length === 5;
      const magoOutsideArea = !areaTiles.some((t) => t.x === mago.x && t.y === mago.y);

      castHealAoe(xama, cureSpell, center);

      const orcHealed = orc.hp > 1;
      const guerreiroHealed = guerreiro.hp > 1;
      const magoUnaffected = mago.hp === 1;
      return {
        pass: shapeOk && magoOutsideArea && orcHealed && guerreiroHealed && magoUnaffected,
        details: `areaRadius=${cureSpell.areaRadius} tiles=${areaTiles.length} orcHp=${orc.hp} guerreiroHp=${guerreiro.hp} magoHp=${mago.hp}`,
      };
    },
  },
  {
    name: 'Atropelar (Troll) não termina em cima de quem foi atropelado',
    fn: () => {
      troll.x = 0; troll.y = 5; troll.hp = troll.maxHp;
      goblin.x = 4; goblin.y = 5; goblin.hp = goblin.maxHp;
      for (const u of [orc, xama, fada]) { u.x = -1; u.y = -1; }
      for (const u of [guerreiro, arqueiro, mago, ladino, quimico]) { u.x = -2; u.y = -2; }

      const trampleSpell = troll.spells.find((s) => s.targetMode === 'trample');
      castTrample(troll, trampleSpell, { x: 4, y: 5 });

      const overlapping = troll.x === goblin.x && troll.y === goblin.y;
      return { pass: !overlapping, details: `troll=(${troll.x},${troll.y}) goblin=(${goblin.x},${goblin.y})` };
    },
  },
  {
    name: 'Contra-ataque do Orc dispara com o Machado',
    fn: async () => {
      // O contra-ataque é assíncrono (setTimeout de REACTION_ATTACK_DELAY =
      // 650ms, ver resolveSingleHit em game.js) — precisa esperar mais que
      // isso antes de checar o HP, senão o teste roda cedo demais e nunca
      // vê o revide (era a causa real da falha, não um bug do jogo).
      orc.x = 5; orc.y = 5; orc.hp = orc.maxHp;
      guerreiro.x = 5; guerreiro.y = 6; guerreiro.hp = guerreiro.maxHp;
      Math.random = () => 0.01; // garante acerto do atacante e a rolagem de 20% do contra-ataque
      resolveSingleHit(guerreiro, orc, WEAPONS.club);
      await new Promise((r) => setTimeout(r, 800));
      const pass = guerreiro.hp < guerreiro.maxHp;
      return { pass, details: `guerreiro hp após=${guerreiro.hp}/${guerreiro.maxHp} (esperado: < maxHp)` };
    },
  },
  {
    name: 'Ataque de Oportunidade do Ladino dispara ao passar adjacente',
    fn: async () => {
      // Mesmo motivo do teste do contra-ataque acima: applyOpportunityAttacks
      // dispara o golpe dentro de um setTimeout(REACTION_ATTACK_DELAY).
      ladino.x = 3; ladino.y = 3; ladino.hp = ladino.maxHp;
      orc.x = 0; orc.y = 3; orc.hp = orc.maxHp;
      Math.random = () => 0.01; // garante os 50% de acerto
      const before = orc.hp;
      applyOpportunityAttacks(orc, [{ x: 2, y: 3 }, { x: 2, y: 4 }]); // (2,4) é adjacente ao ladino em (3,3)
      await new Promise((r) => setTimeout(r, 800));
      const pass = orc.hp < before;
      return { pass, details: `orc hp antes=${before} depois=${orc.hp} (esperado: depois < antes)` };
    },
  },
  {
    name: 'Raio de Gelo é arma (sem MP), não magia',
    fn: () => {
      const pass =
        WEAPONS.iceRay !== undefined &&
        WEAPONS.iceRay.mpCost === undefined &&
        mago.weapons.includes(WEAPONS.iceRay) &&
        !mago.spells.includes(WEAPONS.iceRay);
      return { pass, details: `iceRay=${!!WEAPONS.iceRay} mpCost=${WEAPONS.iceRay && WEAPONS.iceRay.mpCost}` };
    },
  },
  {
    name: 'Químico pode usar poções nele mesmo',
    fn: () => {
      const healTiles = computeRangeTiles(quimico, SPELLS.healPotion);
      const manaTiles = computeRangeTiles(quimico, SPELLS.manaPotion);
      const pass =
        healTiles.some((t) => t.x === quimico.x && t.y === quimico.y) &&
        manaTiles.some((t) => t.x === quimico.x && t.y === quimico.y);
      return { pass, details: `self incluído em heal=${pass}` };
    },
  },
  {
    name: 'Bola de Fogo: explosão ultrapassa o alcance máximo a partir do clique',
    fn: async () => {
      mago.x = 0; mago.y = 6; mago.hp = mago.maxHp; mago.mp = mago.maxMp;
      const fireballSpell = mago.spells.find((s) => s.targetMode === 'point-aoe');
      const clickTile = { x: mago.x + fireballSpell.maxRange, y: mago.y };
      goblin.x = clickTile.x + fireballSpell.areaRadius;
      goblin.y = clickTile.y;
      goblin.hp = goblin.maxHp;
      for (const u of [orc, xama, fada, troll]) { u.x = -1; u.y = -1; }
      for (const u of [guerreiro, arqueiro, ladino, quimico]) { u.x = -2; u.y = -2; }

      Math.random = () => 0.01;
      const before = goblin.hp;
      castFireball(mago, fireballSpell, clickTile);
      // Espera o projétil "chegar" (ver spawnProjectile/travelMs em
      // castFireball) — senão o timer do flash de impacto sobrevive ao
      // teste e polui o DOM que o próximo teste da suite vai inspecionar.
      await new Promise((r) => setTimeout(r, 600));
      const pass = goblin.hp < before;
      return {
        pass,
        details: `distância goblin-mago=${manhattan(mago, goblin)} (maxRange=${fireballSpell.maxRange}) hp antes=${before} depois=${goblin.hp}`,
      };
    },
  },
  {
    name: 'Previsão da ordem de turnos retorna 10 entradas válidas',
    fn: () => {
      const preview = computeTurnOrderPreview(10);
      const allValid = preview.every((e) => e && typeof e.name === 'string' && e.team);
      const pass = preview.length === 10 && allValid;
      return { pass, details: `length=${preview.length}` };
    },
  },
  {
    name: 'Punhal do Ladino: crítico varia por ângulo (15%/20%/25%)',
    fn: () => {
      ladino.x = 5; ladino.y = 5;
      goblin.x = 5; goblin.y = 6;

      goblin.facing = { dx: 0, dy: -1 }; // de frente pro ladino
      const frontCrit = getCritChance(WEAPONS.dirk, getAttackAngle(ladino, goblin));

      goblin.facing = { dx: 1, dy: 0 }; // de lado
      const sideCrit = getCritChance(WEAPONS.dirk, getAttackAngle(ladino, goblin));

      goblin.facing = { dx: 0, dy: 1 }; // de costas
      const backCrit = getCritChance(WEAPONS.dirk, getAttackAngle(ladino, goblin));

      const pass = frontCrit === 0.15 && sideCrit === 0.2 && backCrit === 0.25;
      return { pass, details: `front=${frontCrit} side=${sideCrit} back=${backCrit}` };
    },
  },
  {
    name: 'Token de unidade fica exatamente sobre o tile correspondente (inclusive nos cantos)',
    fn: async () => {
      // Bug real desta sessão: .board tinha borda/padding próprios que
      // .unit-layer/.board-overlay não descontavam, então o personagem
      // aparecia "descolado" do próprio tile — pior nos cantos. Confere
      // com getBoundingClientRect (posição real na tela), não só o style.
      guerreiro.x = 0; guerreiro.y = 0;
      quimico.x = 12; quimico.y = 12;
      render();
      // O token já existia numa posição anterior, então mudar x/y aciona a
      // transição suave de CSS (ver .unit-token) — a duração escala com a
      // distância percorrida (até 0.6s, ver renderUnitTokens), então espera
      // bem mais que isso antes de medir, senão a leitura pega a posição
      // "voando" no meio do caminho e parece um erro que não existe de verdade.
      await new Promise((r) => setTimeout(r, 750));
      const tile00 = document.querySelector('[data-x="0"][data-y="0"]').getBoundingClientRect();
      const tile1212 = document.querySelector('[data-x="12"][data-y="12"]').getBoundingClientRect();
      const guerreiroRect = unitTokenEls.get(guerreiro).getBoundingClientRect();
      const quimicoRect = unitTokenEls.get(quimico).getBoundingClientRect();
      const center = (r) => ({ cx: r.x + r.width / 2, cy: r.y + r.height / 2 });
      const c1 = center(tile00);
      const c2 = center(guerreiroRect);
      const c3 = center(tile1212);
      const c4 = center(quimicoRect);
      const dist1 = Math.hypot(c1.cx - c2.cx, c1.cy - c2.cy);
      const dist2 = Math.hypot(c3.cx - c4.cx, c3.cy - c4.cy);
      const pass = dist1 < 2 && dist2 < 2; // tolerância de sub-pixel
      return { pass, details: `distância canto(0,0)=${dist1.toFixed(2)}px distância canto(12,12)=${dist2.toFixed(2)}px (esperado < 2px)` };
    },
  },
  {
    name: 'Token de unidade acompanha movimento com transição',
    fn: () => {
      guerreiro.x = 2; guerreiro.y = 5;
      render();
      guerreiro.x = 6; guerreiro.y = 5;
      render();
      const token = unitTokenEls.get(guerreiro);
      const pass =
        !!token &&
        token.style.left === `${((6.5) / BOARD_SIZE) * 100}%` &&
        parseFloat(token.style.transitionDuration) > 0;
      return { pass, details: `left=${token && token.style.left} transitionDuration=${token && token.style.transitionDuration}` };
    },
  },
  {
    name: 'Projétil (spawnProjectile) realmente viaja até o destino, não fica preso na origem',
    fn: () => {
      // Bug real encontrado nesta sessão: sem forçar reflow entre a posição
      // inicial e a final, a transição de CSS nunca disparava e o projétil
      // ficava parado em cima de quem lançou, mesmo o código "achando" que
      // ele tinha chegado ao alvo (ver spawnProjectile em game.js).
      spawnProjectile(2, 2, 0, 0, 'fireball');
      const expectedPct = ((0 + 0.5) / BOARD_SIZE) * 100;
      const projectile = document.querySelector('.projectile-fireball');
      const leftPct = projectile ? parseFloat(projectile.style.left) : NaN;
      const topPct = projectile ? parseFloat(projectile.style.top) : NaN;
      const pass =
        !!projectile &&
        Math.abs(leftPct - expectedPct) < 0.01 &&
        Math.abs(topPct - expectedPct) < 0.01 &&
        projectile.style.transitionDuration !== '';
      return {
        pass,
        details: `left=${leftPct}% (esperado ${expectedPct}%) transitionDuration="${projectile && projectile.style.transitionDuration}"`,
      };
    },
  },
  {
    name: 'Ataque à distância (Arco) dispara projétil e atrasa o feedback de impacto',
    fn: () => {
      return new Promise((resolve) => {
        arqueiro.x = 2; arqueiro.y = 2; arqueiro.hp = arqueiro.maxHp;
        goblin.x = 2; goblin.y = 6; goblin.hp = goblin.maxHp; // distância 4, dentro do alcance do Arco
        render();
        Math.random = () => 0.01;
        resolveSingleHit(arqueiro, goblin, WEAPONS.bow);
        const castImmediately = document.querySelectorAll('.cast-cue-release').length;
        const projectileImmediately = document.querySelectorAll('.projectile-arrow').length;
        const floatingImmediately = document.querySelectorAll('.floating-text').length;
        setTimeout(() => {
          const projectileAfterRelease = document.querySelectorAll('.projectile-arrow').length;
          // Segunda espera alargada: a flecha ficou 30% mais lenta, e depois
          // mais 50% em cima disso, ambos a pedido do usuário (ver
          // ABILITY_VFX_PROFILES.bow), então o feedback de impacto (castDelay
          // + travel + hitStop) leva mais tempo pra aparecer que antes.
          setTimeout(() => {
            const floatingAfter = document.querySelectorAll('.floating-text').length;
            const pass = castImmediately === 1 && projectileImmediately === 0 && projectileAfterRelease === 1 && floatingImmediately === 0 && floatingAfter === 1;
            resolve({
              pass,
              details: `cast=${castImmediately} projétil imediato=${projectileImmediately} após release=${projectileAfterRelease} texto imediato=${floatingImmediately} texto depois=${floatingAfter}`,
            });
          }, 950);
        }, 120);
      });
    },
  },
  {
    name: 'Bola de Fogo: projétil voa antes da explosão em área aparecer',
    fn: () => {
      return new Promise((resolve) => {
        mago.x = 0; mago.y = 6; mago.hp = mago.maxHp; mago.mp = mago.maxMp;
        const spell = mago.spells.find((s) => s.targetMode === 'point-aoe');
        for (const u of [goblin, orc, xama, fada, troll]) { u.x = -1; u.y = -1; }
        castFireball(mago, spell, { x: 4, y: 6 });
        const castImmediately = document.querySelectorAll('.cast-cue-channel').length;
        const projectileImmediately = document.querySelectorAll('.projectile-fireball').length;
        const burstImmediately = document.querySelectorAll('.area-burst-fire').length;
        setTimeout(() => {
          const burstAfter = document.querySelectorAll('.area-burst-fire').length;
          const pass = castImmediately === 1 && projectileImmediately === 0 && burstImmediately === 0 && burstAfter === 1;
          resolve({
            pass,
            details: `cast=${castImmediately} projétil imediato=${projectileImmediately} explosão imediata=${burstImmediately} explosão depois=${burstAfter}`,
          });
        }, 950);
      });
    },
  },
  {
    name: 'Relâmpago dispara feixe instantâneo',
    fn: () => {
      return new Promise((resolve) => {
        mago.x = 0; mago.y = 6; mago.hp = mago.maxHp; mago.mp = mago.maxMp;
        const spell = mago.spells.find((s) => s.targetMode === 'line-aoe');
        castLightning(mago, spell, { x: 4, y: 6 });
        const castCue = document.querySelectorAll('.lightning-cast').length;
        // O feixe (SVG procedural, ver spawnLightningBolt) nasce 90ms depois
        // do cast cue, não no mesmo frame — precisa esperar.
        setTimeout(() => {
          const bolts = document.querySelectorAll('.lightning-bolt').length;
          const branches = document.querySelectorAll('.lightning-branch').length;
          const pass = castCue === 1 && bolts === 1 && branches >= 1;
          resolve({ pass, details: `cast=${castCue} bolts=${bolts} branches=${branches}` });
        }, 150);
      });
    },
  },
  {
    name: 'Ataque corpo a corpo continua instantâneo (sem projétil)',
    fn: async () => {
      // O número de dano/texto flutuante só aparece depois do "hit-stop"
      // (setTimeout dentro de resolveSingleHit, até 190ms pro pior caso —
      // magia crítica) — precisa esperar antes de checar, senão o teste roda
      // antes do texto existir (era a causa real da falha original).
      // Contar .floating-text no DOM é frágil: um contra-ataque/oportunidade
      // disparado em teste ANTERIOR (ver REACTION_ATTACK_DELAY, até 650ms)
      // pode disparar seu próprio setTimeout DURANTE a janela de espera deste
      // teste (os objetos de unidade são os mesmos entre testes — só
      // resetGame() reatribui os campos, o timer antigo ainda referencia o
      // objeto certo) e criar um texto extra que não tem nada a ver com este
      // ataque. Por isso a verificação real é sobre ESTADO (HP do goblin
      // caiu, sem projétil no meio do caminho), não sobre contagem de nós VFX.
      document.querySelectorAll('.floating-text').forEach((el) => el.remove());
      guerreiro.x = 5; guerreiro.y = 5; guerreiro.hp = guerreiro.maxHp;
      goblin.x = 6; goblin.y = 5; goblin.hp = goblin.maxHp;
      Math.random = () => 0.01;
      resolveSingleHit(guerreiro, goblin, WEAPONS.sword);
      await new Promise((r) => setTimeout(r, 300));
      const pass = document.querySelectorAll('.projectile').length === 0 && goblin.hp < goblin.maxHp;
      return {
        pass,
        details: `projéteis=${document.querySelectorAll('.projectile').length} hp goblin=${goblin.hp}/${goblin.maxHp}`,
      };
    },
  },
  {
    name: 'Ataque corpo a corpo dispara swing no atacante e shake no defensor',
    fn: async () => {
      // hit-shake só é aplicado depois do hit-stop (setTimeout dentro de
      // resolveSingleHit) — precisa esperar. A classe do ATACANTE também não
      // é o "lunge" genérico aqui: Espada tem swing:"slash" (ver WEAPONS.sword
      // e MELEE_SWING_CLASSES em game.js), que usa a classe "swing-slash" —
      // "lunge" só é usado por armas corpo a corpo SEM swing marcado (era o
      // nome errado que a falha original checava).
      guerreiro.x = 5; guerreiro.y = 5; guerreiro.hp = guerreiro.maxHp;
      goblin.x = 6; goblin.y = 5; goblin.hp = goblin.maxHp;
      render();
      Math.random = () => 0.01; // garante o acerto (a suite restaura antes do próximo teste)
      resolveSingleHit(guerreiro, goblin, WEAPONS.sword);
      await new Promise((r) => setTimeout(r, 300));
      const attackerInner = unitTokenEls.get(guerreiro).querySelector('.unit-token-inner');
      const defenderInner = unitTokenEls.get(goblin).querySelector('.unit-token-inner');
      const pass = attackerInner.classList.contains('swing-slash') && defenderInner.classList.contains('hit-shake');
      return {
        pass,
        details: `swing-slash=${attackerInner.classList.contains('swing-slash')} shake=${defenderInner.classList.contains('hit-shake')}`,
      };
    },
  },
  {
    name: 'Classes de animação de ataque somem depois (idle volta a funcionar)',
    fn: () => {
      // Bug real corrigido nesta sessão: a classe nunca era removida, então
      // depois do primeiro golpe a unidade perdia a animação de "respiração"
      // (unit-idle) pro resto da partida, porque a classe de ação (mais
      // específica) continuava sobrescrevendo a regra base pra sempre.
      return new Promise((resolve) => {
        guerreiro.x = 5; guerreiro.y = 5; guerreiro.hp = guerreiro.maxHp;
        goblin.x = 6; goblin.y = 5; goblin.hp = goblin.maxHp;
        render();
        Math.random = () => 0.01;
        resolveSingleHit(guerreiro, goblin, WEAPONS.sword);
        const attackerInner = unitTokenEls.get(guerreiro).querySelector('.unit-token-inner');
        const defenderInner = unitTokenEls.get(goblin).querySelector('.unit-token-inner');
        setTimeout(() => {
          const pass = !attackerInner.classList.contains('lunge') && !defenderInner.classList.contains('hit-shake');
          resolve({
            pass,
            details: `lunge ainda presente=${attackerInner.classList.contains('lunge')} shake ainda presente=${defenderInner.classList.contains('hit-shake')}`,
          });
        }, 600);
      });
    },
  },
  {
    name: 'Token de unidade derrotada vira cadáver visível após a animação (não some — fica pra Ressurreição)',
    fn: () => {
      // A asserção original esperava o token sumir de vez depois de 700ms —
      // isso descrevia o comportamento ANTES da mecânica de Ressurreição
      // existir. Hoje (ver renderUnitTokens em game.js) o corpo vira
      // ".corpse" e continua no tabuleiro por 3 turnos (decayCorpses),
      // exatamente pra dar tempo de trazer a unidade de volta — só some de
      // vez depois disso, não 700ms depois de morrer.
      return new Promise((resolve) => {
        goblin.hp = goblin.maxHp;
        render();
        const hadTokenBefore = unitTokenEls.has(goblin);
        goblin.hp = 0;
        render();
        const dyingClassAdded = unitTokenEls.get(goblin).classList.contains('dying');
        setTimeout(() => {
          const el = unitTokenEls.get(goblin);
          const pass = hadTokenBefore && dyingClassAdded && !!el && el.classList.contains('corpse');
          resolve({
            pass,
            details: `before=${hadTokenBefore} dying=${dyingClassAdded} tokenStillThere=${!!el} isCorpse=${el && el.classList.contains('corpse')}`,
          });
        }, 700);
      });
    },
  },
  {
    name: 'Árvore bloqueia movimento por completo',
    fn: () => {
      // (0,6) é uma árvore isolada no layout (não colada em outra árvore),
      // então dá pra testar o bloqueio sem ambiguidade de qual vizinho
      // bloqueou o quê.
      guerreiro.x = 1; guerreiro.y = 6; guerreiro.moveRange = 5;
      for (const u of [arqueiro, mago, ladino, quimico, goblin, orc, xama, fada, troll]) { u.x = -1; u.y = -1; }
      const reachable = computeReachable(guerreiro);
      const treeReached = reachable.some((t) => t.x === 0 && t.y === 6);
      return { pass: !treeReached, details: `árvore em (0,6) alcançável=${treeReached} (esperado: false)` };
    },
  },
  {
    name: 'Casa é destino válido mas não deixa atravessar pro outro lado',
    fn: () => {
      // Casa em (9,1). Só existe caminho ortogonal reto de (8,1) até (10,1)
      // passando por cima da casa — se ela bloqueia expansão, (10,1) fica
      // inalcançável mesmo com moveRange sobrando.
      guerreiro.x = 8; guerreiro.y = 1; guerreiro.moveRange = 3;
      for (const u of [arqueiro, mago, ladino, quimico, goblin, orc, xama, fada, troll]) { u.x = -1; u.y = -1; }
      const reachable = computeReachable(guerreiro);
      const houseReached = reachable.some((t) => t.x === 9 && t.y === 1);
      const pastHouseReached = reachable.some((t) => t.x === 10 && t.y === 1);
      const pass = houseReached && !pastHouseReached;
      return {
        pass,
        details: `casa(9,1) alcançável=${houseReached} (esperado: true), depois-da-casa(10,1) alcançável=${pastHouseReached} (esperado: false)`,
      };
    },
  },
  {
    name: 'Nenhuma posição inicial fica sem movimento possível (sem softlock)',
    fn: () => {
      const stuck = [];
      for (const u of [...playerTeam, ...enemyTeam]) {
        const reachable = computeReachable(u);
        if (reachable.length === 0) stuck.push(`${u.name}(${u.x},${u.y})`);
      }
      return { pass: stuck.length === 0, details: stuck.length === 0 ? 'todas as unidades têm ao menos 1 tile alcançável' : `presas: ${stuck.join(', ')}` };
    },
  },
  {
    name: 'Água custa 2 de movimento por tile',
    fn: () => {
      // (7,3) é água; (6,3) é grama adjacente.
      guerreiro.x = 6; guerreiro.y = 3;
      for (const u of [arqueiro, mago, ladino, quimico, goblin, orc, xama, fada, troll]) { u.x = -1; u.y = -1; }

      guerreiro.moveRange = 1;
      const notEnoughRange = computeReachable(guerreiro);
      const unreachableAt1 = !notEnoughRange.some((t) => t.x === 7 && t.y === 3);

      guerreiro.moveRange = 2;
      const enoughRange = computeReachable(guerreiro);
      const reachableAt2 = enoughRange.some((t) => t.x === 7 && t.y === 3);
      const cost = lastReachableCosts.get(tileKey(7, 3));

      const pass = unreachableAt1 && reachableAt2 && cost === 2;
      return {
        pass,
        details: `alcançável com moveRange=1: ${!unreachableAt1} (esperado false), com moveRange=2: ${reachableAt2} (esperado true), custo=${cost} (esperado 2)`,
      };
    },
  },
  {
    name: 'Armadilha em cima de água soma os dois custos (3 no total)',
    fn: () => {
      guerreiro.x = 6; guerreiro.y = 3;
      for (const u of [arqueiro, mago, ladino, quimico]) { u.x = -1; u.y = -1; }
      for (const u of [goblin, orc, xama, fada, troll]) { u.x = -2; u.y = -2; }
      traps.push({ tiles: [{ x: 7, y: 3 }], ownerTeam: 'enemy', triggered: false, turnsLeft: null });

      guerreiro.moveRange = 2;
      const notEnoughRange = computeReachable(guerreiro);
      const unreachableAt2 = !notEnoughRange.some((t) => t.x === 7 && t.y === 3);

      guerreiro.moveRange = 3;
      const enoughRange = computeReachable(guerreiro);
      const reachableAt3 = enoughRange.some((t) => t.x === 7 && t.y === 3);
      const cost = lastReachableCosts.get(tileKey(7, 3));

      const pass = unreachableAt2 && reachableAt3 && cost === 3;
      return {
        pass,
        details: `alcançável com moveRange=2: ${!unreachableAt2} (esperado false), com moveRange=3: ${reachableAt3} (esperado true), custo=${cost} (esperado 3)`,
      };
    },
  },
  {
    name: 'Atacar de cima de uma casa dá +10% de chance de acerto',
    fn: () => {
      // Trava o bônus de ângulo (ver teste da água, mesmo motivo) — aqui os
      // dois cenários já usam a mesma geometria relativa (atacante ao norte
      // do defensor nos dois), mas travar deixa a intenção do teste
      // explícita e imune a mudar de layout no futuro.
      const origGetAttackAngle = getAttackAngle;
      getAttackAngle = () => 'front';
      try {
        guerreiro.x = 5; guerreiro.y = 5;
        goblin.x = 5; goblin.y = 6;
        const item = guerreiro.weapons[0];
        const distance = manhattan(guerreiro, goblin);
        const baseline = getEffectiveHitChance(guerreiro, goblin, item, distance);

        guerreiro.x = 9; guerreiro.y = 1; // em cima da casa
        goblin.x = 9; goblin.y = 2;
        const onHouse = getEffectiveHitChance(guerreiro, goblin, item, manhattan(guerreiro, goblin));

        const diff = Math.round((onHouse - baseline) * 100) / 100;
        return { pass: diff === 0.1, details: `base=${baseline} em-cima-da-casa=${onHouse} diferença=${diff} (esperado 0.1)` };
      } finally {
        getAttackAngle = origGetAttackAngle;
      }
    },
  },
  {
    name: 'Atacar um alvo na água dá +10% de chance de acerto, e empilha com o bônus de casa',
    fn: () => {
      // getAttackAngle (bônus de flanco/costas) depende da posição RELATIVA
      // entre atacante e defensor, o que mudaria sozinho entre os cenários
      // abaixo (terreno de água/casa fica em lugares diferentes do
      // tabuleiro) e contaminaria a comparação. Trava em "front" (bônus 0)
      // só durante este teste pra isolar exclusivamente o efeito do terreno.
      const origGetAttackAngle = getAttackAngle;
      getAttackAngle = () => 'front';
      try {
        const item = guerreiro.weapons[0];

        guerreiro.x = 5; guerreiro.y = 5;
        goblin.x = 5; goblin.y = 6;
        const baseline = getEffectiveHitChance(guerreiro, goblin, item, manhattan(guerreiro, goblin));

        // Só o defensor na água (7,3), atacante numa tile de grama adjacente.
        guerreiro.x = 6; guerreiro.y = 3;
        goblin.x = 7; goblin.y = 3;
        const targetInWater = getEffectiveHitChance(guerreiro, goblin, item, manhattan(guerreiro, goblin));
        const diffWater = Math.round((targetInWater - baseline) * 100) / 100;

        // Atacante em cima da casa (9,1) MIRANDO o mesmo alvo na água — os
        // dois bônus (casa do atacante + água do defensor) devem somar.
        guerreiro.x = 9; guerreiro.y = 1;
        const bothBonuses = getEffectiveHitChance(guerreiro, goblin, item, manhattan(guerreiro, goblin));
        const diffBoth = Math.round((bothBonuses - baseline) * 100) / 100;

        const pass = diffWater === 0.1 && diffBoth === 0.2;
        return {
          pass,
          details: `base=${baseline} só-água=${targetInWater} (dif ${diffWater}, esperado 0.1) casa+água=${bothBonuses} (dif ${diffBoth}, esperado 0.2)`,
        };
      } finally {
        getAttackAngle = origGetAttackAngle;
      }
    },
  },
  {
    name: 'Tenda bloqueia movimento igual árvore',
    fn: () => {
      // (4,6) é uma tenda no layout.
      guerreiro.x = 4; guerreiro.y = 5; guerreiro.moveRange = 5;
      for (const u of [arqueiro, mago, ladino, quimico, goblin, orc, xama, fada, troll]) { u.x = -1; u.y = -1; }
      const reachable = computeReachable(guerreiro);
      const tentReached = reachable.some((t) => t.x === 4 && t.y === 6);
      return { pass: !tentReached, details: `tenda em (4,6) alcançável=${tentReached} (esperado: false)` };
    },
  },
  {
    name: 'Atacar de cima de uma casa dá +10% de chance de acerto',
    fn: () => {
      const origGetAttackAngle = getAttackAngle;
      getAttackAngle = () => 'front';
      try {
        guerreiro.x = 5; guerreiro.y = 5;
        goblin.x = 5; goblin.y = 6;
        const item = guerreiro.weapons[0];
        const baseline = getEffectiveHitChance(guerreiro, goblin, item, manhattan(guerreiro, goblin));

        guerreiro.x = 9; guerreiro.y = 1; // casa
        goblin.x = 9; goblin.y = 2; // grama comum (não é água, senão somaria o bônus de água também)
        const onHouse = getEffectiveHitChance(guerreiro, goblin, item, manhattan(guerreiro, goblin));

        const diff = Math.round((onHouse - baseline) * 100) / 100;
        return { pass: diff === 0.1, details: `base=${baseline} em-cima-da-casa=${onHouse} diferença=${diff} (esperado 0.1)` };
      } finally {
        getAttackAngle = origGetAttackAngle;
      }
    },
  },
  {
    name: 'Atacar estando na água dá -10% de chance de acerto (pro próprio atacante)',
    fn: () => {
      const origGetAttackAngle = getAttackAngle;
      getAttackAngle = () => 'front';
      try {
        guerreiro.x = 5; guerreiro.y = 5;
        goblin.x = 5; goblin.y = 6;
        const item = guerreiro.weapons[0];
        const baseline = getEffectiveHitChance(guerreiro, goblin, item, manhattan(guerreiro, goblin));

        guerreiro.x = 7; guerreiro.y = 3; // água
        goblin.x = 8; goblin.y = 3;
        const attackerInWater = getEffectiveHitChance(guerreiro, goblin, item, manhattan(guerreiro, goblin));

        const diff = Math.round((attackerInWater - baseline) * 100) / 100;
        return { pass: diff === -0.1, details: `base=${baseline} atacante-na-água=${attackerInWater} diferença=${diff} (esperado -0.1)` };
      } finally {
        getAttackAngle = origGetAttackAngle;
      }
    },
  },
  {
    name: 'Árvore tem 10 HP, leva dano de ataque em área e é destruída ao zerar (vira galhos, libera o tile)',
    fn: () => {
      // (0,6) é uma árvore isolada no layout.
      const key = tileKey(0, 6);
      const before = terrainMap.get(key);
      const hadHp = before && before.type === 'tree' && before.hp === 10;

      // Dano parcial primeiro: confirma que reduz o HP sem destruir.
      damageTree(0, 6, 4, 4);
      const afterPartial = terrainMap.get(key);
      const partialOk = afterPartial.type === 'tree' && afterPartial.hp === 6;

      // Termina o serviço: mais 6 de dano zera o HP.
      damageTree(0, 6, 6, 6);
      const afterDead = terrainMap.get(key);
      const destroyedOk = afterDead.type === 'stump';

      // Com "stump" (não bloqueante), o tile precisa estar liberado agora.
      guerreiro.x = 1; guerreiro.y = 6; guerreiro.moveRange = 5;
      for (const u of [arqueiro, mago, ladino, quimico, goblin, orc, xama, fada, troll]) { u.x = -1; u.y = -1; }
      const reachable = computeReachable(guerreiro);
      const freedOk = reachable.some((t) => t.x === 0 && t.y === 6);

      const pass = hadHp && partialOk && destroyedOk && freedOk;
      return {
        pass,
        details: `hp inicial=${before && before.hp} (10), após -4=${afterPartial.hp} (6, tipo ${afterPartial.type}), após -6=${afterDead.type} (stump), tile liberado=${freedOk} (true)`,
      };
    },
  },
  {
    name: 'Bola de Fogo (área) danifica árvore dentro do raio da explosão',
    fn: () => {
      // Árvore isolada em (0,6); Mago perto o bastante pra pegar ela na
      // explosão (areaRadius da Bola de Fogo cobre a distância).
      mago.x = 2; mago.y = 6; mago.hp = mago.maxHp; mago.mp = mago.maxMp;
      for (const u of [guerreiro, arqueiro, ladino, quimico, goblin, orc, xama, fada, troll]) { u.x = -1; u.y = -1; }

      const fireball = mago.spells.find((s) => s.targetMode === 'point-aoe');
      const before = terrainMap.get(tileKey(0, 6)).hp;
      Math.random = () => 0.5; // dano no meio do intervalo, sem crítico
      castFireball(mago, fireball, { x: 1, y: 6 });
      const after = terrainMap.get(tileKey(0, 6));

      const pass = after.hp < before || after.type === 'stump';
      return { pass, details: `hp antes=${before}, depois=${after.hp !== undefined ? after.hp : after.type} (esperado < ${before} ou destruída)` };
    },
  },
  {
    name: 'Fada (flying) não paga custo extra nem sofre/dá bônus de água, mas sempre tem o bônus de elevação',
    fn: () => {
      const origGetAttackAngle = getAttackAngle;
      getAttackAngle = () => 'front';
      try {
        // Movimento: água normalmente custa 2, mas a Fada voa por cima.
        fada.x = 6; fada.y = 3; fada.moveRange = 1; // grama, adjacente à água em (7,3)
        for (const u of [guerreiro, arqueiro, mago, ladino, quimico, goblin, orc, xama, troll]) { u.x = -1; u.y = -1; }
        const reachable = computeReachable(fada);
        const waterReachedWith1Move = reachable.some((t) => t.x === 7 && t.y === 3);
        const waterCost = lastReachableCosts.get(tileKey(7, 3));

        // Chance de acerto: Fada atacando de dentro da água não sofre -10%.
        const item = fada.weapons[0];
        goblin.x = 8; goblin.y = 3; goblin.hp = goblin.maxHp;
        fada.x = 7; fada.y = 3; // água
        const fadaInWaterChance = getEffectiveHitChance(fada, goblin, item, manhattan(fada, goblin));
        fada.x = 5; fada.y = 3; // grama comum, mesma distância médio pra comparar só o efeito da água
        const fadaOnGrassChance = getEffectiveHitChance(fada, goblin, item, manhattan(fada, goblin));
        const noWaterPenalty = fadaInWaterChance === fadaOnGrassChance;

        // Chance de acerto: alvo na água não dá bônus quando o ALVO é a Fada.
        guerreiro.x = 6; guerreiro.y = 3;
        fada.x = 7; fada.y = 3; // água, agora como defensora
        fada.hp = fada.maxHp;
        const weaponVsFlyingInWater = getEffectiveHitChance(guerreiro, fada, guerreiro.weapons[0], manhattan(guerreiro, fada));
        fada.x = 8; fada.y = 3; // fora da água, mesma distância
        const weaponVsFlyingOnGrass = getEffectiveHitChance(guerreiro, fada, guerreiro.weapons[0], manhattan(guerreiro, fada));
        const noWaterBonusForAttacker = Math.round(weaponVsFlyingInWater * 100) === Math.round(weaponVsFlyingOnGrass * 100);

        // Bônus de elevação: Fada em terreno comum já tem +10% (igual em cima de casa).
        fada.x = 5; fada.y = 5;
        goblin.x = 5; goblin.y = 6;
        const fadaBaseline = getEffectiveHitChance(fada, goblin, item, manhattan(fada, goblin));
        const guerreiroBaseline = getEffectiveHitChance(guerreiro, goblin, guerreiro.weapons[0], manhattan(guerreiro, goblin));
        // Não dá pra comparar valores absolutos entre armas diferentes, então
        // confere a Fada num tile comum contra a MESMA Fada "hipoteticamente"
        // sem flying, usando o termo isolado: repete o cálculo com flying
        // desligado temporariamente pra achar a diferença exata.
        fada.flying = false;
        const fadaWithoutFlying = getEffectiveHitChance(fada, goblin, item, manhattan(fada, goblin));
        fada.flying = true;
        const elevationDiff = Math.round((fadaBaseline - fadaWithoutFlying) * 100) / 100;

        const pass = waterReachedWith1Move && waterCost === 1 && noWaterPenalty && noWaterBonusForAttacker && elevationDiff === 0.1;
        return {
          pass,
          details: `água c/ 1 moveRange=${waterReachedWith1Move} (esperado true), custo=${waterCost} (esperado 1), sem penalidade própria=${noWaterPenalty}, sem bônus pro atacante=${noWaterBonusForAttacker}, diferença de elevação=${elevationDiff} (esperado 0.1)`,
        };
      } finally {
        getAttackAngle = origGetAttackAngle;
      }
    },
  },
  {
    name: 'Castelo/Montanha: só 1 unidade por vez ocupa o bloco de 9 tiles',
    fn: () => {
      guerreiro.x = 3; guerreiro.y = 1; guerreiro.moveRange = 5;
      for (const u of [arqueiro, mago, ladino, quimico, goblin, orc, xama, fada, troll]) { u.x = -1; u.y = -1; }
      const reachableFree = computeReachable(guerreiro);
      const castleTiles = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }];
      const anyReachableFree = castleTiles.some((t) => reachableFree.some((r) => r.x === t.x && r.y === t.y));

      arqueiro.x = 1; arqueiro.y = 1; // ocupa o castelo
      const reachableBlocked = computeReachable(guerreiro);
      const anyReachableBlocked = castleTiles.some((t) => reachableBlocked.some((r) => r.x === t.x && r.y === t.y));

      const pass = anyReachableFree && !anyReachableBlocked;
      return {
        pass,
        details: `castelo alcançável vazio=${anyReachableFree} (esperado true), castelo alcançável ocupado por outra unidade=${anyReachableBlocked} (esperado false)`,
      };
    },
  },
  {
    name: 'Castelo/Montanha: +20% pra quem ataca de dentro (time certo), -10% pra quem defende dentro (time certo)',
    fn: () => {
      const item = guerreiro.weapons[0];

      guerreiro.x = 9; guerreiro.y = 1; // fixo, fora de qualquer estrutura
      orc.x = 11; orc.y = 1; orc.team = 'enemy'; // tile real da montanha, time real
      const withPenalty = getEffectiveHitChance(guerreiro, orc, item, manhattan(guerreiro, orc));
      orc.team = 'player'; // mesmo tile, time errado -> sem penalidade
      const withoutPenalty = getEffectiveHitChance(guerreiro, orc, item, manhattan(guerreiro, orc));
      orc.team = 'enemy';

      guerreiro.x = 1; guerreiro.y = 1; guerreiro.team = 'other'; // dentro do castelo, time errado -> sem bônus
      orc.x = 5; orc.y = 8; orc.team = 'enemy';
      const attackerNoBonus = getEffectiveHitChance(guerreiro, orc, item, manhattan(guerreiro, orc));
      guerreiro.team = 'player'; // mesmo tile, time certo -> bônus
      const attackerWithBonus = getEffectiveHitChance(guerreiro, orc, item, manhattan(guerreiro, orc));

      const diffPenalty = Math.round((withoutPenalty - withPenalty) * 100) / 100;
      const diffBonus = Math.round((attackerWithBonus - attackerNoBonus) * 100) / 100;
      const pass = diffPenalty === 0.1 && diffBonus === 0.2;
      return {
        pass,
        details: `penalidade defensor=${diffPenalty} (esperado 0.1), bônus atacante=${diffBonus} (esperado 0.2)`,
      };
    },
  },
  {
    name: 'Castelo/Montanha: regenera 1HP/1MP do ocupante em QUALQUER troca de turno global',
    fn: () => {
      const s = structures.find((s) => s.type === 'mountain');
      orc.x = 11; orc.y = 1; orc.hp = orc.maxHp - 5; orc.mp = Math.max((orc.maxMp || 5) - 5, 0);
      const hpBefore = orc.hp;
      const mpBefore = orc.mp;

      // Simula troca de turno de OUTRO personagem qualquer, não do orc.
      currentActor = guerreiro;
      tickStructureRegen();

      const pass = orc.hp === hpBefore + 1 && (orc.maxMp === undefined || orc.mp === mpBefore + 1);
      return {
        pass,
        details: `hp antes=${hpBefore} depois=${orc.hp} (esperado +1), mp antes=${mpBefore} depois=${orc.mp} (esperado +1 se tiver mp)`,
      };
    },
  },
  {
    name: 'Castelo/Montanha: ataque em área danifica a estrutura E a unidade dentro dela ao mesmo tempo',
    fn: () => {
      const s = structures.find((s) => s.type === 'mountain');
      const hpBefore = s.hp;
      orc.x = 11; orc.y = 1; orc.hp = orc.maxHp; orc.team = 'enemy';
      for (const u of [guerreiro, arqueiro, ladino, quimico, xama, fada, troll, goblin]) { u.x = -1; u.y = -1; }
      mago.x = 11; mago.y = 4; mago.hp = mago.maxHp; mago.mp = mago.maxMp;

      const fireball = mago.spells.find((s) => s.targetMode === 'point-aoe');
      Math.random = () => 0.5;
      castFireball(mago, fireball, { x: 11, y: 1 });

      const orcHit = orc.hp < orc.maxHp;
      const structureHit = s.hp < hpBefore;
      const pass = orcHit && structureHit;
      return {
        pass,
        details: `orc hp=${orc.hp}/${orc.maxHp} (esperado < max), montanha hp=${s.hp}/${hpBefore} (esperado < ${hpBefore})`,
      };
    },
  },
  {
    name: 'Castelo/Montanha: destruição zera bloqueio e libera os 9 tiles pra movimento',
    fn: () => {
      const s = structures.find((s) => s.type === 'castle');
      s.hp = 1;
      damageStructure(s, 5, 5);
      const destroyedOk = s.destroyed === true && s.hp === 0;

      guerreiro.x = 3; guerreiro.y = 1; guerreiro.moveRange = 5;
      for (const u of [arqueiro, mago, ladino, quimico, goblin, orc, xama, fada, troll]) { u.x = -1; u.y = -1; }
      const reachable = computeReachable(guerreiro);
      const centerReached = reachable.some((t) => t.x === 1 && t.y === 1);

      const pass = destroyedOk && centerReached;
      return {
        pass,
        details: `destroyed=${s.destroyed} hp=${s.hp} (esperado true/0), centro do castelo (1,1) alcançável=${centerReached} (esperado true, já que não bloqueia mais nada)`,
      };
    },
  },
  {
    name: 'Castelo/Montanha: resetGame() restaura 100/100 HP e desfaz a destruição',
    fn: () => {
      const s = structures.find((s) => s.type === 'castle');
      damageStructure(s, 200, 200);
      const wasDestroyed = s.destroyed === true;

      resetGame();
      const s2 = structures.find((s) => s.type === 'castle');
      const pass = wasDestroyed && s2.hp === 100 && s2.maxHp === 100 && s2.destroyed === false;
      return {
        pass,
        details: `antes do reset destroyed=${wasDestroyed} (esperado true), depois hp=${s2.hp}/${s2.maxHp} destroyed=${s2.destroyed} (esperado 100/100, false)`,
      };
    },
  },
  {
    name: 'Casa tem 30 HP, leva dano de qualquer ataque e é destruída ao zerar (vira escombros, libera o tile)',
    fn: () => {
      const key = tileKey(3, 1);
      const before = terrainMap.get(key);
      const hadHp = before && before.type === 'house' && before.hp === 30;

      damageTree(3, 1, 20, 20);
      const afterPartial = terrainMap.get(key);
      const partialOk = afterPartial.type === 'house' && afterPartial.hp === 10;

      damageTree(3, 1, 10, 10);
      const afterDead = terrainMap.get(key);
      const destroyedOk = afterDead.type === 'house-rubble';

      guerreiro.x = 4; guerreiro.y = 1; guerreiro.moveRange = 3;
      for (const u of [arqueiro, mago, ladino, quimico, goblin, orc, xama, fada, troll]) { u.x = -1; u.y = -1; }
      const reachable = computeReachable(guerreiro);
      const freedOk = reachable.some((t) => t.x === 3 && t.y === 1);

      const pass = hadHp && partialOk && destroyedOk && freedOk;
      return {
        pass,
        details: `hp inicial=${before && before.hp} (30), após -20=${afterPartial.hp} (10, tipo ${afterPartial.type}), após -10=${afterDead.type} (house-rubble), tile liberado=${freedOk} (true)`,
      };
    },
  },
  {
    name: 'Fim do rio (última linha do tabuleiro) mantém o mesmo custo de movimento e bônus/penalidade de acerto da água comum, sem alargar em lago',
    fn: () => {
      guerreiro.x = 7; guerreiro.y = 12; // grama a leste de (6,12) — era lago, agora liberado
      for (const u of [arqueiro, mago, ladino, quimico, goblin, orc, xama, fada, troll]) { u.x = -1; u.y = -1; }
      guerreiro.moveRange = 1;
      const unreachableAt1 = !computeReachable(guerreiro).some((t) => t.x === 6 && t.y === 12);
      guerreiro.moveRange = 2;
      const reachableAt2 = computeReachable(guerreiro).some((t) => t.x === 6 && t.y === 12);
      const cost = lastReachableCosts.get(tileKey(6, 12));

      const terrain = terrainAt(6, 12);
      const isWater = terrain && terrain.type === 'water';
      const noLakeWidening = !terrainAt(7, 12); // coluna 7 volta a ser grama, sem lago 2x2

      const pass = unreachableAt1 && reachableAt2 && cost === 2 && isWater && noLakeWidening;
      return {
        pass,
        details: `custo=${cost} (esperado 2), tipo=${terrain && terrain.type} (esperado water), (7,12)=${terrainAt(7, 12) && terrainAt(7, 12).type} (esperado undefined/grama)`,
      };
    },
  },
  {
    name: 'Popup de terreno chama todo o rio (incluindo o fim dele) de "Rio", e a cachoeira de "Cachoeira"',
    fn: () => {
      isHumanControlled = () => true;
      currentActor = guerreiro;
      reachableTiles = [];
      pendingWeapon = null;
      for (const u of [guerreiro, arqueiro, mago, ladino, quimico, goblin, orc, xama, fada, troll]) { u.x = -1; u.y = -1; }

      onTileClick(6, 12); // fim do rio
      const riverEndTitle = document.getElementById('unit-info-title').innerHTML;
      document.getElementById('unit-info-close-btn').click();

      onTileClick(6, 0); // cachoeira
      const waterfallTitle = document.getElementById('unit-info-title').innerHTML;
      document.getElementById('unit-info-close-btn').click();

      onTileClick(6, 1); // rio comum
      const riverTitle = document.getElementById('unit-info-title').innerHTML;
      document.getElementById('unit-info-close-btn').click();

      const pass = riverEndTitle.includes('Rio') && waterfallTitle.includes('Cachoeira') && riverTitle.includes('Rio');
      return {
        pass,
        details: `fim do rio="${riverEndTitle}" (esperado conter Rio), cachoeira="${waterfallTitle}" (esperado conter Cachoeira), rio="${riverTitle}" (esperado conter Rio)`,
      };
    },
  },
  {
    name: 'Água apaga queimadura ao atravessar, e impede aplicar queimadura em quem já está na água',
    fn: () => {
      guerreiro.x = 6; guerreiro.y = 3; guerreiro.moveRange = 2;
      for (const u of [arqueiro, mago, ladino, quimico, goblin, orc, xama, fada, troll]) { u.x = -1; u.y = -1; }
      addStatusEffect(guerreiro, { type: 'burned', damageMin: 1, damageMax: 1, turnsLeft: 3 });
      const hadBurnBefore = guerreiro.statusEffects.some((e) => e.type === 'burned');
      computeReachable(guerreiro);
      performMove(guerreiro, { x: 7, y: 3 }); // atravessa/termina no tile de água
      const burnGoneAfterCrossing = !guerreiro.statusEffects.some((e) => e.type === 'burned');

      orc.x = 7; orc.y = 6; orc.hp = orc.maxHp; // outro tile de água
      mago.x = 7; mago.y = 9; mago.hp = mago.maxHp; mago.mp = mago.maxMp;
      const fireball = mago.spells.find((s) => s.appliesBurn);
      Math.random = () => 0.01; // garante acerto
      resolveSingleHit(mago, orc, fireball);
      const orcNotBurned = !orc.statusEffects || !orc.statusEffects.some((e) => e.type === 'burned');

      const pass = hadBurnBefore && burnGoneAfterCrossing && orcNotBurned;
      return {
        pass,
        details: `tinha queimadura antes=${hadBurnBefore} (esperado true), sumiu ao atravessar a água=${burnGoneAfterCrossing} (esperado true), não pegou fogo estando na água=${orcNotBurned} (esperado true)`,
      };
    },
  },
  {
    name: 'Castelo bloqueia inimigo por completo (mesmo vazio); Montanha bloqueia herói por completo',
    fn: () => {
      orc.x = 3; orc.y = 1; orc.moveRange = 5;
      for (const u of [guerreiro, arqueiro, mago, ladino, quimico, goblin, xama, fada, troll]) { u.x = -1; u.y = -1; }
      const reachableEnemy = computeReachable(orc);
      const castleTiles = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }];
      const enemyCanReachCastle = castleTiles.some((t) => reachableEnemy.some((r) => r.x === t.x && r.y === t.y));

      guerreiro.x = 9; guerreiro.y = 1; guerreiro.moveRange = 5;
      for (const u of [arqueiro, mago, ladino, quimico, goblin, orc, xama, fada, troll]) { u.x = -1; u.y = -1; }
      const reachableHero = computeReachable(guerreiro);
      const mountainTiles = [{ x: 10, y: 0 }, { x: 11, y: 0 }, { x: 12, y: 0 }, { x: 10, y: 1 }, { x: 11, y: 1 }, { x: 12, y: 1 }, { x: 10, y: 2 }, { x: 11, y: 2 }, { x: 12, y: 2 }];
      const heroCanReachMountain = mountainTiles.some((t) => reachableHero.some((r) => r.x === t.x && r.y === t.y));

      const pass = !enemyCanReachCastle && !heroCanReachMountain;
      return {
        pass,
        details: `inimigo alcança castelo=${enemyCanReachCastle} (esperado false), herói alcança montanha=${heroCanReachMountain} (esperado false)`,
      };
    },
  },
  {
    name: 'Atropelar do Troll para antes do Castelo inimigo e acerta o defensor + a estrutura',
    fn: () => {
      troll.x = 5; troll.y = 1; troll.hp = troll.maxHp;
      guerreiro.x = 2; guerreiro.y = 1; guerreiro.hp = guerreiro.maxHp;
      for (const u of [arqueiro, mago, ladino, quimico, goblin, orc, xama, fada]) { u.x = -1; u.y = -1; }

      const trampleItem =
        (troll.weapons && troll.weapons.find((w) => w.targetMode === 'trample')) ||
        (troll.spells && troll.spells.find((s) => s.targetMode === 'trample'));
      const structure = structures.find((s) => s.type === 'castle');
      const hpBefore = structure.hp;
      Math.random = () => 0.01; // garante acerto no golpe contra o guerreiro
      castTrample(troll, trampleItem, { x: 0, y: 1 });

      const stoppedBeforeCastle = troll.x === 3 && troll.y === 1;
      const guerreiroHit = guerreiro.hp < guerreiro.maxHp;
      const castleHit = structure.hp < hpBefore;

      const pass = stoppedBeforeCastle && guerreiroHit && castleHit;
      return {
        pass,
        details: `troll parou em (${troll.x},${troll.y}) (esperado (3,1)), guerreiro hp=${guerreiro.hp}/${guerreiro.maxHp} (esperado < max), castelo hp=${structure.hp}/${hpBefore} (esperado < ${hpBefore})`,
      };
    },
  },
  {
    name: 'Tenda tem 20 HP, é destrutível e vira escombros liberando o tile',
    fn: () => {
      const key = tileKey(4, 6);
      const before = terrainMap.get(key);
      const hadHp = before && before.type === 'tent' && before.hp === 20;
      damageTree(4, 6, 20, 20);
      const after = terrainMap.get(key);
      const destroyedOk = after.type === 'tent-rubble';

      guerreiro.x = 3; guerreiro.y = 6; guerreiro.moveRange = 3;
      for (const u of [arqueiro, mago, ladino, quimico, goblin, orc, xama, fada, troll]) { u.x = -1; u.y = -1; }
      const reachable = computeReachable(guerreiro);
      const freedOk = reachable.some((t) => t.x === 4 && t.y === 6);

      const pass = hadHp && destroyedOk && freedOk;
      return {
        pass,
        details: `hp inicial=${before && before.hp} (esperado 20), tipo depois=${after.type} (esperado tent-rubble), tile liberado=${freedOk} (esperado true)`,
      };
    },
  },
  {
    name: 'Cadáver bloqueia só o destino final — passagem é livre e não custa movimento extra',
    fn: () => {
      guerreiro.x = 4; guerreiro.y = 5; guerreiro.hp = guerreiro.maxHp; guerreiro.moveRange = 4;
      goblin.x = 5; goblin.y = 5; goblin.hp = 0; goblin.turnsSinceDeath = 0;
      for (const u of [arqueiro, mago, ladino, quimico, orc, xama, fada, troll]) { u.x = -1; u.y = -1; }
      const reachable = computeReachable(guerreiro);
      const corpseTile = reachable.some((t) => t.x === 5 && t.y === 5);
      // (6,5) fica do outro lado do cadáver, a 2 tiles de distância em linha
      // reta — só é alcançável se a passagem por cima do cadáver for livre.
      const beyondCorpseTile = reachable.some((t) => t.x === 6 && t.y === 5);
      const pass = !corpseTile && occupantAt(5, 5) === goblin && beyondCorpseTile;
      return {
        pass,
        details: `tile cadáver alcançável=${corpseTile} occupant=${occupantAt(5, 5)?.name} tile além do cadáver alcançável=${beyondCorpseTile}`,
      };
    },
  },
  {
    name: 'Investida não atravessa cadáver nem termina sobre ele',
    fn: () => {
      orc.x = 1; orc.y = 5; orc.hp = orc.maxHp;
      goblin.x = 3; goblin.y = 5; goblin.hp = 0; goblin.turnsSinceDeath = 0;
      guerreiro.x = 5; guerreiro.y = 5; guerreiro.hp = guerreiro.maxHp;
      for (const u of [arqueiro, mago, ladino, quimico, xama, fada, troll]) { u.x = -1; u.y = -1; }
      const targets = computeChargeTargets(orc);
      const targetBehindCorpse = targets.some((t) => t.x === guerreiro.x && t.y === guerreiro.y);
      return { pass: !targetBehindCorpse && orc.x === 1 && orc.y === 5, details: `alvo atrás do cadáver=${targetBehindCorpse}` };
    },
  },
  {
    name: 'Atropelar para antes de cadáver ressuscitável',
    fn: () => {
      troll.x = 1; troll.y = 5; troll.hp = troll.maxHp;
      goblin.x = 4; goblin.y = 5; goblin.hp = 0; goblin.turnsSinceDeath = 0;
      for (const u of [orc, xama, fada, guerreiro, arqueiro, mago, ladino, quimico]) { u.x = -1; u.y = -1; }
      const trampleSpell = troll.spells.find((s) => s.targetMode === 'trample');
      castTrample(troll, trampleSpell, { x: 5, y: 5 });
      const pass = troll.x === 3 && troll.y === 5 && !(troll.x === goblin.x && troll.y === goblin.y);
      return { pass, details: `troll=(${troll.x},${troll.y}) cadáver=(${goblin.x},${goblin.y})` };
    },
  },
  {
    name: 'Contador de ressurreição do cadáver avança por rodada (todo mundo vivo jogou 1x), não pela agilidade de quem morreu',
    fn: () => {
      // Só guerreiro e ladino "vivos" (jogadores da rodada); fada (agilidade
      // 13, a mais rápida do elenco) e troll (agilidade 8, o mais lento) são
      // os dois cadáveres sob teste — devem decair no MESMO ritmo apesar da
      // diferença de agilidade.
      for (const u of [arqueiro, mago, quimico, goblin, orc, xama]) { u.hp = 0; }
      guerreiro.hp = guerreiro.maxHp;
      ladino.hp = ladino.maxHp;
      fada.hp = 0; fada.turnsSinceDeath = 0;
      troll.hp = 0; troll.turnsSinceDeath = 0;

      // 1 jogador vivo agiu, mas o outro ainda não — rodada incompleta,
      // nenhum cadáver deve avançar ainda.
      noteUnitActedThisRound(guerreiro);
      const unchangedAfterOnePlayer = fada.turnsSinceDeath === 0 && troll.turnsSinceDeath === 0;

      // Repetir o mesmo jogador de novo (ex: ação bônus) não deve contar
      // como uma segunda "vez jogada" — o Set deduplica.
      noteUnitActedThisRound(guerreiro);
      const stillUnchangedAfterRepeat = fada.turnsSinceDeath === 0 && troll.turnsSinceDeath === 0;

      // Agora o segundo (e último) jogador vivo age — rodada completa: os
      // dois cadáveres avançam juntos, independente de agilidade.
      noteUnitActedThisRound(ladino);
      const bothAdvancedTogether = fada.turnsSinceDeath === 1 && troll.turnsSinceDeath === 1;

      // Mais uma rodada completa (guerreiro + ladino de novo) confirma que
      // o ritmo continua o mesmo, 1 por rodada, pros dois.
      noteUnitActedThisRound(guerreiro);
      noteUnitActedThisRound(ladino);
      const secondRoundInLockstep = fada.turnsSinceDeath === 2 && troll.turnsSinceDeath === 2;

      const pass = unchangedAfterOnePlayer && stillUnchangedAfterRepeat && bothAdvancedTogether && secondRoundInLockstep;
      return {
        pass,
        details: `após 1 jogador=${unchangedAfterOnePlayer}, repetição não conta=${stillUnchangedAfterRepeat}, rodada completa avança juntos=${bothAdvancedTogether} (fada=${fada.turnsSinceDeath} troll=${troll.turnsSinceDeath}), 2ª rodada em lockstep=${secondRoundInLockstep}`,
      };
    },
  },
  {
    name: 'Castelo/Montanha ocupado: ataque acerta unidade e construção juntos, sem pedir escolha',
    fn: () => {
      orc.x = 10; orc.y = 1; orc.hp = orc.maxHp;
      guerreiro.x = 10; guerreiro.y = 0; guerreiro.hp = guerreiro.maxHp;
      currentActor = guerreiro;
      selectedUnit = guerreiro;
      pendingWeapon = WEAPONS.sword;
      attackableTiles = [{ x: 10, y: 1 }];
      const mountain = structures.find((s) => s.type === 'mountain' && !s.destroyed);
      const mtnHpBefore = mountain.hp;
      const orcHpBefore = orc.hp;
      Math.random = () => 0.01; // garante acerto
      onTileClick(10, 1);
      const modalOpened = !!pendingConfirmation;
      if (pendingConfirmation) pendingConfirmation.onConfirm();
      const pass = modalOpened && orc.hp < orcHpBefore && mountain.hp < mtnHpBefore;
      return {
        pass,
        details: `modal aberto=${modalOpened} orc hp ${orcHpBefore}->${orc.hp} montanha hp ${mtnHpBefore}->${mountain.hp}`,
      };
    },
  },
  {
    name: 'IA: Xamã/Fada vão pra montanha quando só resta 1 herói vivo',
    fn: () => {
      [arqueiro, mago, ladino, quimico].forEach((u) => { u.hp = 0; });
      guerreiro.hp = guerreiro.maxHp;
      guerreiro.x = 6; guerreiro.y = 6;
      xama.x = 9; xama.y = 3; xama.hp = xama.maxHp; xama.mp = 0; // sem MP: cai direto no fallback de movimento
      xama.hasMoved = false; xama.hasActed = false;
      enemyAct(xama);
      const mountain = structures.find((s) => s.type === 'mountain' && !s.destroyed);
      const inMountain = mountain.tiles.some((t) => t.x === xama.x && t.y === xama.y);
      return { pass: inMountain, details: `xama foi pra (${xama.x},${xama.y}), dentro da montanha=${inMountain}` };
    },
  },
  {
    name: 'Debilitado (Ladino) empilhado soma turnos e moveReduction, restaura tudo ao expirar',
    fn: () => {
      ladino.statusEffects = [];
      ladino.moveRange = 5;
      addStatusEffect(ladino, { type: 'weakened', turnsLeft: 3, moveReduction: 1 });
      ladino.moveRange -= 1;
      addStatusEffect(ladino, { type: 'weakened', turnsLeft: 2, moveReduction: 1 });
      ladino.moveRange -= 1;
      const merged = ladino.statusEffects.filter((e) => e.type === 'weakened');
      const mergedCorrectly = merged.length === 1 && merged[0].turnsLeft === 5 && merged[0].moveReduction === 2;
      for (let i = 0; i < 6 && ladino.statusEffects.some((e) => e.type === 'weakened'); i++) {
        applyStatusEffectsAtTurnStart(ladino);
      }
      const restoredFully = ladino.moveRange === 5 && !ladino.statusEffects.some((e) => e.type === 'weakened');
      return {
        pass: mergedCorrectly && restoredFully,
        details: `1 instância só=${merged.length === 1}, turnsLeft=${merged[0] && merged[0].turnsLeft} (esperado 5), moveReduction=${merged[0] && merged[0].moveReduction} (esperado 2); moveRange final=${ladino.moveRange} (esperado 5)`,
      };
    },
  },
  {
    name: 'Regeneração (buff do Troll) e Regeneração em Área dão +10 CT no fim do turno',
    fn: () => {
      // Troca advanceCTUntilReady por um no-op durante o teste — sem isso,
      // advanceToNextTurn chamaria ela em seguida e ticaria o CT de todo
      // mundo por speed, escondendo o efeito isolado do bônus de
      // Regeneração no valor final.
      const origAdvanceCT = advanceCTUntilReady;
      advanceCTUntilReady = () => aliveUnits()[0];
      try {
        troll.statusEffects = [{ type: 'regenBoost', turnsLeft: 2, bonus: 3 }];
        troll.ct = 50;
        troll.hasMoved = true; troll.hasActed = true; // pula os bônus de "descansou o turno" (não mexem em ct, mas mantém o cenário limpo)
        currentActor = troll;
        advanceToNextTurn();
        const trollGained = troll.ct === 60;

        xama.statusEffects = [{ type: 'regen', turnsLeft: 2, healMin: 2, healMax: 4 }];
        xama.ct = 30;
        xama.hasMoved = true; xama.hasActed = true;
        currentActor = xama;
        advanceToNextTurn();
        const xamaGained = xama.ct === 40;

        return {
          pass: trollGained && xamaGained,
          details: `troll ct=${troll.ct} (esperado 60), xama ct=${xama.ct} (esperado 40)`,
        };
      } finally {
        advanceCTUntilReady = origAdvanceCT;
      }
    },
  },
  {
    name: 'Arqueiro: Flecha de Fogo + Tiro Rápido queima nos 2 disparos do turno',
    fn: () => {
      // resetGame() reconstrói os stats base (ver createArqueiroState), mas
      // não apaga Sets adicionados dinamicamente por castSelfAbility — isso
      // só acontece de verdade em beginTurnFor, no início do turno da
      // própria unidade (não roda sozinho no reset). Limpa na mão aqui pra
      // não herdar "já usei X" de um teste anterior que chamou
      // castSelfAbility no arqueiro.
      arqueiro.abilityUsedThisTurn = false;
      if (arqueiro.selfAbilitiesUsedThisTurn) arqueiro.selfAbilitiesUsedThisTurn.clear();
      if (arqueiro.selfAbilityKindsUsedThisTurn) arqueiro.selfAbilityKindsUsedThisTurn.clear();
      arqueiro.x = 5; arqueiro.y = 5; arqueiro.mp = arqueiro.maxMp; arqueiro.hasActed = false;
      goblin.x = 5; goblin.y = 7; goblin.hp = goblin.maxHp; // alcance 2, dentro do Arco
      castSelfAbility(arqueiro, SPELLS.fireArrow);
      castSelfAbility(arqueiro, SPELLS.quickShot);
      const quickShotPopup = [...document.querySelectorAll('.floating-text')].some((el) => el.textContent === 'Tiro Rápido!');
      const comboAllowed = arqueiro.selfAbilityKindsUsedThisTurn.has('fire-arrow') && arqueiro.selfAbilityKindsUsedThisTurn.has('haste-attack');
      Math.random = () => 0.01; // garante acerto nos 2 disparos
      resolveSingleHit(arqueiro, goblin, WEAPONS.bow); // 1º disparo (bonusAttacksRemaining ainda não decrementou — resolveSingleHit é chamado direto, sem passar por finalizeAction)
      const firstShotBurned = goblin.statusEffects.some((e) => e.type === 'burned');
      const stillHasBonusForSecondShot = arqueiro.oneShotDamageBonusSource === 'Flecha de Fogo';
      arqueiro.bonusAttacksRemaining -= 1; // simula o que finalizeAction faria entre os 2 disparos
      goblin.statusEffects = []; // limpa pra distinguir claramente a queimadura do 2º disparo
      resolveSingleHit(arqueiro, goblin, WEAPONS.bow); // 2º disparo (o bônus, concedido pelo Tiro Rápido)
      const secondShotBurned = goblin.statusEffects.some((e) => e.type === 'burned');
      const bonusGoneAfterBothShots = arqueiro.oneShotDamageBonusSource === null; // sem 3º disparo pendente, reseta normal
      const pass = quickShotPopup && comboAllowed && firstShotBurned && stillHasBonusForSecondShot && secondShotBurned && bonusGoneAfterBothShots;
      return {
        pass,
        details: `popup Tiro Rápido=${quickShotPopup} combo permitido=${comboAllowed} 1º disparo queimou=${firstShotBurned} bônus sobrou pro 2º=${stillHasBonusForSecondShot} 2º disparo queimou=${secondShotBurned} bônus zerou depois dos 2=${bonusGoneAfterBothShots}`,
      };
    },
  },
  {
    name: 'Arqueiro: Flecha de Fogo + Tiro Longo queima E dobra o alcance no mesmo disparo',
    fn: () => {
      // Mesmo motivo do teste acima: limpa o rastreamento de habilidades já
      // usadas neste turno na mão (resetGame() não cobre isso).
      arqueiro.abilityUsedThisTurn = false;
      if (arqueiro.selfAbilitiesUsedThisTurn) arqueiro.selfAbilitiesUsedThisTurn.clear();
      if (arqueiro.selfAbilityKindsUsedThisTurn) arqueiro.selfAbilityKindsUsedThisTurn.clear();
      arqueiro.x = 1; arqueiro.y = 1; arqueiro.mp = arqueiro.maxMp; arqueiro.hasActed = false;
      castSelfAbility(arqueiro, SPELLS.fireArrow);
      castSelfAbility(arqueiro, SPELLS.longShot);
      const rangeTiles = computeRangeTiles(arqueiro, WEAPONS.bow);
      const doubledRangeReached = rangeTiles.some((t) => manhattan(arqueiro, t) === WEAPONS.bow.maxRange * 2);
      goblin.x = 1; goblin.y = 1 + WEAPONS.bow.maxRange * 2; goblin.hp = goblin.maxHp; // (1,11): distância 10, dentro do tabuleiro
      Math.random = () => 0.01;
      resolveSingleHit(arqueiro, goblin, WEAPONS.bow);
      const burned = goblin.statusEffects.some((e) => e.type === 'burned');
      const pass = doubledRangeReached && burned;
      return {
        pass,
        details: `alcance dobrado alcançável=${doubledRangeReached} (esperado ${WEAPONS.bow.maxRange * 2}) alvo distante queimou=${burned}`,
      };
    },
  },
  {
    name: 'Montanha destruída vence a batalha na hora, mesmo com heróis vivos',
    fn: () => {
      const mountain = structures.find((s) => s.type === 'mountain');
      mountain.hp = 0;
      mountain.destroyed = true;
      const pass = checkBattleOutcome() === true && battleEnded === true;
      return { pass, details: `checkBattleOutcome=${pass} battleEnded=${battleEnded}` };
    },
  },
  {
    name: 'Castelo destruído perde a batalha na hora, mesmo com inimigos vivos',
    fn: () => {
      const castle = structures.find((s) => s.type === 'castle');
      castle.hp = 0;
      castle.destroyed = true;
      const pass = checkBattleOutcome() === true && battleEnded === true;
      return { pass, details: `checkBattleOutcome=${pass} battleEnded=${battleEnded}` };
    },
  },
  {
    name: 'Limite de 100 turnos: quem tiver mais HP total (unidades + estrutura) vence',
    fn: () => {
      for (const u of enemyTeam) u.hp = 1;
      const castle = structures.find((s) => s.type === 'castle');
      const mountain = structures.find((s) => s.type === 'mountain');
      castle.hp = 100; castle.destroyed = false;
      mountain.hp = 1; mountain.destroyed = false;
      globalTurnCount = 100;
      const limitHit = checkGlobalTurnLimit();
      const playerWon = document.getElementById('battle-end-title').classList.contains('victory');
      const pass = limitHit === true && battleEnded === true && playerWon === true;
      return { pass, details: `limite atingido=${limitHit} battleEnded=${battleEnded} time do Guerreiro venceu=${playerWon} (tinha muito mais HP total)` };
    },
  },
  {
    name: 'Perfis 2D diferenciam timing de flecha, magia e frasco sem alterar atributos',
    fn: () => {
      const arrow = abilityVfxProfile(WEAPONS.bow);
      const magic = abilityVfxProfile(SPELLS.fireball);
      const flask = abilityVfxProfile(SPELLS.healPotion);
      // Flecha: 771ms (era 360ms; -30% de velocidade, depois mais -50% em
      // cima disso, ambos a pedido do usuário — ver ABILITY_VFX_PROFILES.bow).
      const pass = arrow.projectileDuration === 771 && magic.projectileDuration === 680 && flask.trajectory === 'arc'
        && WEAPONS.bow.damageMin === 6 && SPELLS.fireball.mpCost === 10;
      return { pass, details: `flecha=${arrow.projectileDuration}ms fogo=${magic.projectileDuration}ms frasco=${flask.trajectory}` };
    },
  },
  {
    name: 'Aura mantém um status continuamente e alterna dois/três por timestamp global',
    fn: () => {
      guerreiro.x = 1; guerreiro.y = 1; guerreiro.hp = guerreiro.maxHp;
      guerreiro.statusEffects = [{ type: 'poison', turnsLeft: 2 }];
      const oneA = activeStatusVfx(guerreiro, 0);
      const oneB = activeStatusVfx(guerreiro, 5000);
      guerreiro.statusEffects.push({ type: 'slowed', turnsLeft: 2 });
      const twoA = activeStatusVfx(guerreiro, 550);
      const twoB = activeStatusVfx(guerreiro, 1650);
      guerreiro.statusEffects.push({ type: 'guarding', turnsLeft: 2 });
      const three = [550, 1650, 2750].map((now) => activeStatusVfx(guerreiro, now).effect.type);
      const pass = oneA.effect.type === 'poison' && oneB.effect.type === 'poison' && oneA.opacity === 1
        && twoA.effect.type !== twoB.effect.type && new Set(three).size === 3;
      return { pass, details: `1=${oneA.effect.type}/${oneB.effect.type} 2=${twoA.effect.type},${twoB.effect.type} 3=${three.join(',')}` };
    },
  },
  {
    name: 'Aura remove status expirado e limpa imediatamente na morte',
    fn: () => {
      guerreiro.x = 1; guerreiro.y = 1; guerreiro.hp = guerreiro.maxHp;
      guerreiro.statusEffects = [{ type: 'poison', turnsLeft: 2 }, { type: 'slowed', turnsLeft: 2 }];
      const before = activeStatusVfx(guerreiro, 550);
      guerreiro.statusEffects = guerreiro.statusEffects.filter((e) => e.type !== before.effect.type);
      const afterRemoval = activeStatusVfx(guerreiro, 550);
      guerreiro.hp = 0;
      const afterDeath = activeStatusVfx(guerreiro, 550);
      const pass = before && afterRemoval && afterRemoval.effect.type !== before.effect.type && afterDeath === null;
      return { pass, details: `antes=${before?.effect.type} remoção=${afterRemoval?.effect.type} morte=${afterDeath}` };
    },
  },
  {
    name: 'Menu principal é vertical, uniforme e contém Encerrar turno no lugar do botão superior',
    fn: () => {
      currentActor = arqueiro;
      arqueiro.hasMoved = false;
      arqueiro.hasActed = false;
      openActionMenu(arqueiro);
      const menu = document.getElementById('context-menu');
      const labels = [...menu.querySelectorAll('.weapon-btn')].map((btn) => btn.textContent.trim());
      const heights = [...menu.querySelectorAll('.weapon-btn')].map((btn) => getComputedStyle(btn).height);
      const topHidden = document.getElementById('end-turn-btn').classList.contains('hidden');
      // Arqueiro não é conjurador (só Xamã/Fada/Maga usam "Magia" — ver
      // SPELLCASTER_SPRITE_KEYS), então o botão de spells dele é "Habilidade".
      const pass = labels.some((v) => v.includes('Mover')) && labels.some((v) => v.includes('Atacar'))
        && labels.some((v) => v.includes('Habilidade')) && labels.some((v) => v.includes('Encerrar turno'))
        && new Set(heights).size === 1 && getComputedStyle(menu).flexDirection === 'column' && topHidden;
      return { pass, details: `itens=${labels.join('|')} alturas=${[...new Set(heights)].join(',')} vertical=${getComputedStyle(menu).flexDirection} topo oculto=${topHidden}` };
    },
  },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (err) => console.log('PAGEERROR:', err.message));
  await page.goto(INDEX_PATH);
  await page.waitForSelector('#board');
  await page.evaluate(() => {
    window.__origRandom = Math.random;
    // Desliga os turnos autônomos da IA pra toda a suite: cada teste monta
    // seu próprio cenário e chama as funções de ataque/magia diretamente, e
    // um turno da IA disparando em segundo plano (via scheduled() a 500ms de
    // resetGame) poluiria testes que esperam um tempo (ex: VFX com atraso).
    isHumanControlled = () => true;
  });

  let passCount = 0;
  const failures = [];

  for (const test of tests) {
    // Restaura Math.random antes de cada teste — alguns testes o sobrescrevem
    // pra garantir acerto/rolagem determinística, e isso não pode vazar pro
    // próximo teste da lista.
    // Restaura Math.random, reinicia o estado do jogo E limpa qualquer
    // elemento visual (projétil/flash/texto flutuante) que ainda não tenha se
    // auto-removido do teste anterior — senão os testes de VFX contam lixo
    // de execuções passadas em vez do que o teste atual realmente criou.
    await page.evaluate(() => {
      Math.random = window.__origRandom;
      resetGame();
      document.getElementById('board-overlay').innerHTML = '';
    });
    let result;
    try {
      result = await page.evaluate(test.fn);
    } catch (err) {
      result = { pass: false, details: `Erro: ${err.message}` };
    }
    if (result.pass) {
      passCount += 1;
      console.log(`OK   ${test.name}`);
    } else {
      failures.push(test.name);
      console.log(`FAIL ${test.name}${result.details ? ' — ' + result.details : ''}`);
    }
  }

  console.log(`\n${passCount}/${tests.length} testes passaram.`);
  await browser.close();
  process.exit(failures.length > 0 ? 1 : 0);
})();
