# Doodle District

A first-person survival shooter drawn in blue ballpoint on lined notebook paper. Grapple across
rooftops and canyons, slice bullets back at the doodles that fired them, lob grenades, and see how
many waves you can survive. Play alone, survive with friends, or fight them.

Everything you see is generated in code with three.js. There are no models, textures or sound
files: the paper, the ink outlines, the hatching, the enemies and the music are all procedural, including the 8-bit themes, one per map (toggle them in settings or with M).

## Running it

### Opção 1: Executável Nativo Windows (.exe)
Dê um duplo clique em `DoodleShooter.exe` na pasta raiz.
- Abre o jogo diretamente em uma **janela nativa de desktop** (não abre o navegador).
- Inicia automaticamente o servidor de rede local seguro em segundo plano.
- Gera o arquivo `CONECTAR_LAN.txt` com o link direto para seus colegas entrarem na mesma rede Wi-Fi / cabo.

### Opção 2: Launcher Python & Servidor LAN
```bash
python launcher.py
```
ou no modo servidor dedicado sem janela:
```bash
python launcher.py --server-only
```

### Segurança na Rede Local (LAN / Wi-Fi compartilhado)
- **Janela de Jogo Nativa**: Roda com Edge Chromium / WebView2 isolado.
- **Proteção contra Path Traversal**: Impede estritamente navegação para fora da pasta do jogo (`..`).
- **Bloqueio de Arquivos Confidenciais**: Impede acesso a arquivos ocultos (`.git`, `.env`, `.claude`) e scripts do sistema (`.py`, `.exe`).
- **Listagem de Pastas Desativada**: Retorna 404/403 evitando varredura e enumeração de arquivos.
- **Cabeçalhos de Segurança (CSP Rigoroso)**: Permite apenas assets locais e WebRTC seguro via PeerJS/STUN.
- **Rate Limiting Anti-Scan / Anti-DDoS**: Limite por IP para barrar scripts e ferramentas de ataque na rede local.

## Modes

- **Solo**: survive the waves. Bosses every fifth wave, checkpoints unlock at wave 5, 10, 15...
- **Free for all**: up to ten players, first to 20 kills, with a ten minute cap shown on screen that starts once a second player is in. Anyone in the lobby can start. After the death cam a press of any button brings you back with a two second shield; two and a half minutes without input gets you kicked, with a one-click rejoin. Health
  regenerates after a few seconds out of combat (not while sprinting), so only ammo drops in.

Multiplayer is peer-to-peer over WebRTC (PeerJS), so it works from a static host with no game
server. Under PLAY ONLINE you can Quick Play (joins an open public lobby, or opens one for you),
create a public or private lobby, or join a friend's lobby with their five letter code. People can
join a match already in progress. The host's browser keeps score; each player runs their own body.

## Controles & Mecânicas

| Ação | Teclado + Mouse | Controle PS5 |
| --- | --- | --- |
| Mover / Olhar / Correr | WASD, mouse, Shift | Analógico L, Analógico R, L3 |
| Atirar / Cortar | LMB | R2 |
| Mirar / Bloquear (katana) | RMB | L2 |
| Pular, Pulo na Parede, Pulo Duplo | Espaço | ✕ |
| Deslizar no chão, Investida no ar | C / Ctrl (X, Alt) | ○ |
| Gancho (segure para puxar) | Q / E | L1 |
| Golpe rápido de Katana | F | R1 |
| Recarregar | R | □ |
| Granada (segure para arremessar longe) | G | R3 ou D-Pad Cima |
| Loja / Comprar Armas & Coletes | **B** | **D-Pad Baixo** |
| Corte Foco Katana (barra cheia) | Ambos os botões ou X | L2 + R2 |
| Selecionar Armas | 1-6 / Scroll | △, D-Pad |
| Placar (Online) | Tab | Create |
| Menu / Pausa | Esc | Options |

## Sistema de Economia & Roguelite ("Ao morrer perde tudo")
- **Início com Pistola**: Você inicia apenas com o Revólver (Slot 1) e a Katana (Slot 6).
- **Ganhando Dinheiro ($)**:
  - Abate comum: `+$75`
  - Tiro na Cabeça (Headshot): `+$150`
  - Abate na Katana / Parada Perfeita: `+$175`
  - Concluir Onda: `+$300` + bônus
  - Destruir Piñatas e Objetos: `+$25`
- **Loja do Caderno (Tecla B)**:
  - **Escopeta (Slot 2)**: $600
  - **Rifle de Assalto (Slot 3)**: $900
  - **Sniper (Slot 4)**: $1200
  - **Bazuca (Slot 5)**: $1800
  - **Colete Leve (+50 Armadura)**: $300 (absorve 70% do dano)
  - **Colete Reforçado (100 Armadura)**: $600
  - **Recarga Total de Munição**: $150
  - **+2 Granadas**: $200
- **Ao Morrer Perde Tudo**: Se você morrer, seu saldo de dinheiro zera, sua armadura é destruída e todas as armas compradas voltam a ficar bloqueadas.

## Mapas
- **Distrito Doodle**: Ruas, becos, escadas de incêndio e telhados.
- **Doodle México**: Praça ensolarada, fonte, mariachis, piñatas com tacos e cactos.
- **Mesa de Estudos**: Mesa de estudos escolar gigante com pilhas de livros formando torres, pontes de réguas, borrachas como trincheiras, apontadores e aviões de papel voando.

## Enemies

Grunts, rushers, bombers, snipers with dodgeable lasers, flyers, heavies and shield bearers. Bosses
rotate: The Doodler, The Eraser and The Inkblot, each with its own moves.

## How the look works

The scene renders to a buffer holding shade, an ink id and view-space normals plus a float depth.
A post pass draws outlines from an inverse-depth Laplacian, adds surface-following hatching, paper
grain, ruled lines and the red margin. Wobble is static so nothing flickers.
