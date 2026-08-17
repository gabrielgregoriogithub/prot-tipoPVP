# Auditoria de Performance — RPG PVP (versão 2D)

## 1. Problema observado

Relato de pequenas travadas/stutters durante o jogo. Escopo: exclusivamente a versão 2D (DOM/CSS), sem tocar em `godot_poc/`. Sem alterar gameplay, dano, IA, cooldowns, ticks ou quantidade de personagens.

## 2. Baseline

**Limitação de metodologia (importante, relatada com honestidade em vez de inventar números):** a única forma de automação disponível neste ambiente é o Chromium **headless** via Playwright. Medi `requestAnimationFrame` num loop de 3s em três cenários (idle, muitos status, combate intenso com VFX pesados simultâneos) e os números vieram claramente inválidos — até o cenário **idle**, com o mapa parado e nada acontecendo, registrou ~30 frames em 3000ms (≈10 fps). Isso não é o jogo: é o Chromium headless jogando `requestAnimationFrame` num throttle artificial porque não há compositor de tela real por trás (comportamento documentado do Chromium headless, não específico deste projeto). Reportar esses números como "frame time do jogo" seria inventar dado, então descartei essa abordagem em vez de usá-la.

Como baseline real e honesto, usei duas coisas que **não dependem de rAF/headless**:

- **Leitura de código** dos mecanismos que a auditoria pediu para investigar (VFX/status, projéteis, timers, buscas recorrentes, alocações por frame) — determinística, independe do ambiente de teste.
- **Contagem real de nós DOM** simultâneos no pior caso de VFX (medida por `querySelectorAll('*').length`, que é uma leitura de DOM real, não uma medida de tempo sujeita a throttle).

Baseline medido (Destruição Rastejante, faixa de 10 tiles até a borda, o maior "sweep" do jogo): **pico de 62 elementos simultâneos** em `#board-overlay` (cracks + debris + poeira + eruptions, todos com `setTimeout` de limpeza de 380–560ms).

**Recomendação para uma medição de frame time autoritativa:** abrir o jogo numa janela real do Chrome e usar o painel Performance do DevTools durante os cenários "muitos status" e "combate intenso" descritos acima — isso captura frame time real (incluindo spikes de GC, layout, paint) de um jeito que este ambiente não consegue reproduzir de forma automatizada e confiável.

## 3. Gargalos encontrados (por leitura de código)

1. **Busca linear repetida sem cache** — `abilityCatalogKey(item)` percorria `Object.entries(WEAPONS)` e `Object.entries(SPELLS)` (duas alocações de array + varredura O(n)) **toda vez** que `abilityVfxProfile(item)` era chamada — ou seja, em todo ataque/lançamento de magia, mesmo repetindo a mesma arma/magia várias vezes na mesma batalha. `WEAPONS`/`SPELLS` são objetos estáticos e `item` é sempre a mesma referência de objeto singleton, então o resultado nunca muda — busca clássica "recorrente desnecessária" (item explicitamente citado na auditoria pedida).
2. **VFX ocultos durante a rotação de 2+ status**: verificado que a arquitetura já é correta — cada camada de status (`.poison-layer`, `.burn-layer` etc.) tem um `display:none` padrão que só é sobrescrito quando a classe do status correspondente está ativa no elemento único e reutilizado `.status-vfx` por unidade. Quando a rotação troca de status, a classe muda e a camada anterior some via `display:none` — **animações CSS não rodam em elementos `display:none`**, então não há trabalho invisível acontecendo. Não encontrei regressão aqui; era o risco mais explicitamente citado na auditoria pedida e está OK.
3. **Timer único global, não por unidade**: `setInterval` de 80ms que atualiza o VFX de status de todas as unidades já está centralizado (comentário no próprio código confirma: "não há timer por unidade") — não há N timers concorrentes.
4. **Uso de `filter: blur()` em VFX de área/linha** (poeira do Destruição Rastejante, nuvem do Envenenamento): até ~30 elementos simultâneos com blur podem aparecer num cast de linha longa. `blur()` é mais caro que transform/opacity puro para o compositor. Não encontrei evidência de que isso é a causa dos stutters relatados (são vida curta, 520–560ms, e só aparecem durante o cast) — listado como acompanhamento, não como problema confirmado (ver seção 7; a auditoria pedida explicitamente proíbe reduzir efeitos sem evidência).

## 4. Causa

O gargalo #1 (busca linear sem cache) é uma causa **confirmada e determinística**: todo ataque/magia do jogo paga o custo de duas varreduras lineares + duas alocações de array desnecessárias, sempre repetindo o mesmo resultado para o mesmo item. Os itens #2 e #3 são **não-problemas** (arquitetura já correta, verificado por leitura de código). O item #4 é uma **observação sem causa confirmada** — requer profiling real (DevTools) para validar antes de qualquer mudança.

## 5. Alterações realizadas

- **`abilityCatalogKey` agora usa cache por referência (`Map`)**: primeira chamada para um item faz a busca linear normalmente e guarda o resultado; todas as chamadas seguintes para o mesmo objeto (mesma arma/magia) são O(1). Testado: 3000 chamadas repetidas para 3 itens distintos resultam em cache de tamanho 3 (sem crescimento indevido, sem repetir a busca). Zero mudança de comportamento — `abilityVfxProfile` continua devolvendo exatamente o mesmo perfil de sempre, só mais rápido a partir da segunda chamada.
- Nenhuma outra mudança de código foi feita nesta auditoria — não removi partículas, não reduzi blur, não alterei contagens de emitters, exatamente como pedido ("não reduza cegamente... preserve a qualidade visual").

## 6. Métricas depois

- `abilityCatalogKeyCache.size === 3` após 3000 chamadas para 3 itens distintos (antes: 3000 buscas lineares completas; depois: 3 buscas + 2997 lookups O(1) de `Map`).
- Suíte de regressão: 64/64 testes automatizados continuam passando após a mudança — nenhum comportamento de combate, dano, alcance ou timing visual foi alterado.
- Pico de 62 elementos simultâneos no maior "sweep" do jogo permanece o mesmo (nenhuma mudança visual foi feita) — registrado aqui como baseline de referência para uma auditoria futura comparar.

## 7. Melhorias futuras

1. **Medir frame time de verdade**: repetir os cenários "muitos status" e "combate intenso" (scripts usados nesta auditoria ficam disponíveis para reaproveitar a configuração de cena) numa janela real do Chrome com o painel Performance do DevTools aberto, gravando durante ~5s de cada cenário. Isso vai mostrar se os spikes relatados vêm de layout thrashing, GC, paint de blur, ou de outra fonte que este ambiente headless não consegue expor.
2. **Se o profiling real confirmar `blur()` como custo relevante**: considerar reduzir o raio do blur (não removê-lo) ou usar `will-change: filter` nos elementos de poeira/fumaça pra dar uma dica ao compositor, mantendo a identidade visual.
3. **Cap opcional de elementos simultâneos** em sweeps muito longos (ex: Destruição Rastejante numa faixa maior que ~8 tiles) — hoje cada tile do caminho gera seus próprios elementos; um teto (ex: nunca mais que ~20 puffs de poeira/fumaça vivos ao mesmo tempo, reciclando os mais antigos) reduziria o pico sem cortar a leitura visual do efeito, já que a maioria dos tiles do meio do caminho não muda a percepção geral do "rastejar".
4. **Revisitar após qualquer novo VFX**: como boa parte do redesign visual desta sessão é recente, vale repetir esta auditoria (com profiling real) depois que o restante do backlog de redesign 2D estiver completo, para ter uma visão consolidada de todos os efeitos novos juntos.
