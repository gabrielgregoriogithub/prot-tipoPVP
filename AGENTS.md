# AGENTS.md — RPG PVP Tático

## Visão geral

Este repositório contém um protótipo de RPG tático por turnos para navegador. É uma aplicação estática: não há backend, processo de build nem gerenciador de pacotes na raiz.

O estado da partida e as regras estão hoje concentrados em `game.js`. O jogo oferece duas apresentações do mesmo estado: o tabuleiro DOM/CSS 2D e uma visualização isométrica 3D opcional/padrão baseada em Three.js.

## Tecnologia

- HTML5 para estrutura da interface (`index.html`).
- CSS puro para layout, interface, tokens e efeitos (`style.css`).
- JavaScript puro para regras, UI, IA e renderização 2D (`game.js`).
- Three.js 0.160.0 carregado por CDN para a cena 3D (`scene3d.js`).
- Python, somente como servidor HTTP local no script `iniciar.bat`.
- Node.js + Playwright, somente para os testes em `tests/`.

Não introduza frameworks, bundlers ou dependências novas sem uma necessidade explícita e aprovação do usuário.

## Executar localmente

No Windows, a forma recomendada é executar:

```bat
iniciar.bat
```

O script sobe `python -m http.server 8731` na raiz e abre:

```text
http://localhost:8731/index.html
```

Pré-requisito: Python disponível no `PATH`.

Evite validar a cena 3D abrindo `index.html` diretamente como `file://`: módulos ES e o import CDN do Three.js podem ser bloqueados por CORS. O modo 2D pode continuar funcional nessa situação.

## Estrutura de pastas

```text
/
├── index.html       # Casca da interface, HUD, modais, camadas do tabuleiro e scripts
├── style.css        # Estilos, layout e animações CSS
├── game.js          # Motor atual: dados, regras, estado, UI, IA, áudio e renderização 2D
├── scene3d.js       # Renderização/interação Three.js ligada ao estado de game.js
├── iniciar.bat      # Servidor HTTP local e abertura do navegador
├── assets/
│   ├── heroes/      # Sprites e portraits dos personagens do jogador
│   ├── enemies/     # Sprites e portraits dos inimigos
│   ├── tiles/       # Terreno, estruturas, blocos de elevação e decoração
│   ├── scenery/     # Fundos da cena de batalha
│   ├── reference/   # Referências visuais; não usadas necessariamente em runtime
│   └── README.md    # Convenção de nomes e carregamento de sprites
└── tests/
    ├── package.json # Dependência e comando do Playwright
    └── run_tests.js # Testes de regras e fluxos no navegador
```

## Arquitetura e regras de alteração

- Preserve `game.js` como a fonte de verdade do estado da partida. Posições, HP, CT, MP, efeitos, estruturas e terrenos devem vir dele.
- `scene3d.js` é uma camada de apresentação. Não replique regras de combate, alcance, pathfinding ou seleção nela; encaminhe cliques para `onTileClick()` e leia os dados já calculados pelo motor.
- O tabuleiro é uma grade fixa de `BOARD_SIZE` (atualmente 13×13). Use coordenadas `{ x, y }` e `tileKey(x, y)` para dados indexados por tile.
- Use `terrainAt()`, `structureAt()`, `elevationAt()` e `unitAt()` em vez de duplicar consultas ao mapa.
- Para movimento, mantenha `computeReachable()` como autoridade do caminho/custo. Ele usa Dijkstra porque água e armadilhas têm custo diferente.
- Para dano direto, centralize regras em `resolveSingleHit()`. Para pagar custos e encerrar ações, use `finalizeAction()` exatamente uma vez por ação.
- Se uma mudança alterar o estado de terreno ou estrutura durante a partida, confirme que as visões 2D e 3D continuam sincronizadas.
- Não altere o carregamento de `game.js` antes de `scene3d.js` sem revisar o acoplamento existente: a cena 3D depende de símbolos e estado já inicializados pelo jogo.
- Prefira alterações pequenas e coesas. Antes de uma refatoração grande do monólito, proponha o plano e mantenha compatibilidade de comportamento.

## Convenções de código

- Mantenha JavaScript compatível com navegador moderno, sem etapa de compilação.
- Use `const` por padrão; use `let` apenas para estado que realmente muda. Não use `var`.
- Escreva nomes em inglês para identificadores e textos/comentários de jogo em português, seguindo o padrão existente.
- Para itens e poderes, use objetos declarativos nos catálogos `WEAPONS` e `SPELLS`; não espalhe números de dano, CT, MP ou alcance pelos handlers.
- Preserve os nomes e formatos de campos usados nas unidades (`team`, `x`, `y`, `hp`, `maxHp`, `moveRange`, `speed`, `ct`, `mp`, `statusEffects`, `facing`, `spriteKey`, `weapons`, `spells`).
- Sempre limpe ou redefina estado temporário de UI quando criar um novo modo de seleção: alvos alcançáveis, previews de área, confirmação pendente e telegraph.
- Não use `innerHTML` com texto externo/não confiável. O código atual o usa para UI interna; novos conteúdos dinâmicos devem preferir `textContent` ou valores controlados pelo jogo.
- Preserve UTF-8 nos arquivos. Não converta acentos, emojis ou assets para outra codificação.

## Como testar

1. Rode o jogo pelo servidor local e faça uma verificação manual da alteração.
2. Teste os dois controles: humano e IA, quando a mudança afetar turno, seleção ou combate.
3. Quando relevante, teste tanto a visão 2D quanto a 3D, incluindo rotação e clique em tiles.
4. Rode os testes automatizados a partir da raiz:

```powershell
npm test --prefix tests
```

Em PowerShell com a execução de `npm.ps1` bloqueada, use:

```powershell
npm.cmd test --prefix tests
```

Os testes usam Playwright e precisam conseguir iniciar o Chromium instalado. Se o ambiente impedir o navegador de abrir, registre a limitação; não trate isso automaticamente como falha da lógica do jogo.

## Regras para evitar regressões

- Não mude valores existentes de armas, magias, personagens ou mapa sem o pedido explícito incluir balanceamento.
- Não quebre o fallback de token CSS quando um sprite PNG estiver ausente.
- Não assuma quantidade fixa de frames: o carregamento descobre sequências de `_1`, `_2` etc.
- Não permita que uma ação seja finalizada duas vezes; isso consome CT/MP indevidamente e pode avançar turnos.
- Respeite `turnToken` e os callbacks agendados para evitar que animações antigas alterem uma nova partida após `resetGame()`.
- Verifique efeitos de status no início do turno, morte, ressurreição, cadáveres, armadilhas, voo, invisibilidade e contra-ataques quando tocar em combate ou movimento.
- Preserve as regras de elevação, linha de visão, bloqueio e destruição de terreno. Elas se cruzam em diversas habilidades.
- Após mexer em `resetGame()`, confirme que terreno, estruturas, unidades, menus, modais, animações e HUD voltam a um estado limpo.

## Adicionar um personagem

1. Crie uma função `create<NovoPersonagem>State()` em `game.js`, seguindo o formato das fábricas existentes.
2. Defina equipe, posição inicial, atributos, `spriteKey`, armas, magias e passivas declarativas.
3. Instancie a unidade e inclua-a em `playerTeam` ou `enemyTeam`; `units` deve continuar contendo ambos os times.
4. Crie a pasta correspondente em `assets/heroes/<chave>/` ou `assets/enemies/<chave>/`.
5. Adicione ao `SPRITE_MANIFEST` a chave e a pasta corretas.
6. Inclua ao menos `<chave>_idle_down_1.png` e `<chave>_portrait.png`; sem eles, o fallback CSS será usado.
7. Confirme posições iniciais válidas, equilíbrio de turnos/CT, roster, sprites 2D, billboards 3D, IA e reset.

## Adicionar uma habilidade

1. Declare a habilidade em `WEAPONS` ou `SPELLS`; use `mpCost` para distinguir magia de arma, conforme a lógica atual.
2. Reutilize um `targetMode` e um resolvedor existente quando a mecânica já for compatível (`enemy`, `point-aoe`, `line-aoe`, cones e similares).
3. Só crie um novo resolvedor `cast...` se a regra não couber nos fluxos existentes.
4. Valide alcance, linha de visão, alvo, gasto de CT/MP e preview antes de aplicar dano/efeitos.
5. Para dano por alvo, use `resolveSingleHit()`; para concluir a ação, use `finalizeAction()` uma única vez.
6. Adicione suporte à IA apenas se a habilidade for disponibilizada a uma unidade controlada pela IA.
7. Atualize ou acrescente cenários em `tests/run_tests.js` para a nova regra e seus casos de borda.

## Trabalhar com assets

- Siga rigorosamente `assets/README.md`.
- Pastas de personagens usam a mesma chave do `spriteKey`.
- Nome de frame: `<chave>_<acao>_<direcao>_<numero>.png`; `attack`, `hit` e `death` também aceitam o formato sem direção já suportado pelo carregador.
- Ações suportadas: `idle`, `walk`, `attack`, `hit` e `death`.
- Portraits seguem `<chave>_portrait.png`.
- Preserve PNG com transparência. O guia recomenda sprites base 48×64 e portraits 128×128.
- Para novos tiles e cenários, use caminhos relativos em `assets/` e confira o resultado no 2D e no 3D.
- Não renomeie nem mova assets existentes sem atualizar todos os caminhos consumidores.

## Comandos importantes

```powershell
# Iniciar o jogo (Windows)
.\iniciar.bat

# Alternativa manual: iniciar um servidor HTTP na raiz
python -m http.server 8731

# Executar testes
npm test --prefix tests

# Alternativa para PowerShell com política de scripts restrita
npm.cmd test --prefix tests

# Ver arquivos modificados
git status --short
```

## Arquivos de maior impacto

- `game.js`: regras e estado; alterações aqui exigem maior cautela.
- `scene3d.js`: apresentação 3D; mantenha-o alinhado ao motor 2D.
- `style.css`: aparência e animações; não altere classes usadas por `game.js` sem revisar seus seletores.
- `index.html`: elementos cujo `id` é consumido pelos scripts.
- `tests/run_tests.js`: rede de segurança para comportamento de combate e turno.
