# Sprites dos personagens

Esta pasta é lida automaticamente pelo jogo (`game.js`, ver `SPRITE_MANIFEST`
e `detectSprites()`). Assim que os arquivos de um personagem aparecerem aqui
com os nomes certos, o jogo troca sozinho o "bonequinho" de CSS pelo sprite de
verdade — não precisa mexer em nenhum código.

## Estrutura de pastas

```
assets/
  heroes/
    guerreiro/
    arqueiro/
    mago/
    ladino/
    quimico/
  enemies/
    goblin/
    orc/
    xama/
    fada/
    troll/
```

## Nome dos arquivos (dentro da pasta de cada personagem)

Padrão: `{prefixo}_{acao}_{direcao}_{frame}.png` — `{prefixo}` é o nome da
pasta (ex: `guerreiro`, `xama`).

| Ação | Direções | Frames | Exemplo |
|---|---|---|---|
| `idle` (parado) | `down` | 1 em diante (detecta quantos existirem) | `guerreiro_idle_down_1.png` |
| `walk` (andar) | `down`, `up`, `left`, `right` | 4 cada (padrão FFT) | `guerreiro_walk_down_1.png` ... `_4.png` |
| `attack` (atacar) | `down` (ou sem direção, veja abaixo) | 4 a 8 | `guerreiro_attack_down_1.png` |
| `hit` (levar dano) | `down` (ou sem direção) | 1 em diante | `guerreiro_hit_down_1.png` |
| `death` (morrer) | `down` (ou sem direção) | 1 em diante | `guerreiro_death_down_1.png` |

Pra `attack`/`hit`/`death`, se não fizer sentido ter 4 direções, também
funciona sem o segmento de direção: `guerreiro_attack_1.png`,
`guerreiro_attack_2.png` etc. — o jogo tenta os dois formatos.

O jogo detecta sozinho quantos frames existem de cada ação (tenta `_1`, `_2`,
`_3`... até não achar mais nenhum), então não precisa ser sempre o mesmo
número pra todo mundo.

## Portrait

Um arquivo único por personagem, direto na pasta dele, 128x128px:

```
guerreiro_portrait.png
```

Usado nos cartões do roster e no popup de informação da unidade.

## Tamanho/formato

- Sprites: PNG com fundo transparente, 48x64px (base — pode ser maior, só
  mantenha a proporção).
- Portraits: PNG, 128x128px.

## Enquanto os arquivos não existem

O jogo continua mostrando o "bonequinho" atual (emoji + corpo colorido em
CSS) normalmente — nada quebra. Assim que os arquivos de UM personagem
aparecerem (mesmo que só o `idle`), aquele personagem específico passa a
usar o sprite; os outros continuam no CSS até terem os deles também.
