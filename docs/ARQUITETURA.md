# Arquitetura Técnica — Fatal Error

Este documento descreve como os processos, a renderização procedural de caderno, o motor de alto desempenho e a rede híbrida P2P do **Fatal Error** funcionam internamente, além de listar o papel de cada arquivo do repositório.

---

## 1. Visão Geral dos Processos (Electron)

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Processo PRINCIPAL — Electron (Node.js CJS)                             │
│ electron/main.cjs · electron/security.cjs · electron/updater.cjs        │
│                                                                         │
│  • Gerencia janela nativa, tela cheia, energia e logs em %APPDATA%      │
│  • Opera o nó Hyperswarm (DHT + Noise Ed25519 + UDP Hole-Punching)      │
│  • Executa o electron-updater em segundo plano (respeitando emPartida)  │
│  • Aplica contenção de URLs, permissões e whitelist de flags de GPU     │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ IPC estritamente validado (contextBridge)
                                    │ electron/preload.cjs (window.fatalNet / fatalUpdater)
┌───────────────────────────────────┴─────────────────────────────────────┐
│ Processo RENDERER — Chromium (sandbox: true, sem Node.js)               │
│ index.html · style.css · src/main.js                                    │
│                                                                         │
│  • Motor 3D Three.js (WebGL2) + Pós-processamento de folha de caderno   │
│  • Física de personagem, armas, IA de bots, BotBatcher e áudio 8-bit    │
│  • Camada de protocolo de partida (src/net.js): Host, Cliente           │
└─────────────────────────────────────────────────────────────────────────┘
```

O processo *Renderer* **não possui acesso a `require`, `fs` nem sockets brutos**. Toda comunicação externa passa exclusivamente pela ponte `electron/preload.cjs` com validação em `electron/security.cjs`.

---

## 2. Topologia Híbrida de Rede Multiplayer

Para garantir conectividade tanto na internet aberta quanto dentro de redes corporativas restritas, `src/net.js` abstrai dois transportes sob a mesma interface de mensagens de jogo:

| Modo | Transporte | Como descobre e conecta |
| --- | --- | --- |
| **Global P2P** | `Hyperswarm` (via IPC `electron/main.cjs`) | Deriva um tópico criptográfico SHA-256 de 32 bytes a partir do código da sala (ou lobby público), anuncia na DHT Kademlia distribuída e negocia conexão direta cifrada com **Noise Protocol + UDP Hole-Punching**. |
| **Rede Interna / Corporativa** | Híbrido `LanNet` (`electron/lan.cjs` TCP/UDP) + `PeerNet` (`WebRTC` IP local sem mDNS/TURN) | Prioriza conexão TCP direta (`41230–41237`) na rede `10.x.x.x`/`192.168.x.x` via código de 8 letras (`Gxxxxxxx`) ou descoberta UDP (`41229`), com fallback imediato para WebRTC ICE direto por IP local caso o Firewall de Domínio bloqueie TCP de entrada. |

### Modelo Host-Autoritativo com Migração Automática
- **Sincronização de Jogadores**: cada jogador simula o próprio movimento localmente a `60+ Hz` (zero *input lag*) e envia snapshots compactos de posição/rotação/arma; os demais interpolam suavemente em `src/players.js`.
- **Sincronização de Bots e Placar**: o Host executa a IA dos bots, valida abates/pontuações e transmite snapshots compactos (`esnap`) para todos os clientes.
- **Migração de Host**: se a conexão do Host cair, os clientes elegem deterministicamente o próximo peer ativo da sala, que assume o controle da partida sem encerrar a sessão.

---

## 3. Pipeline Gráfica Procedural ("Caderno Esferográfico")

Não há nenhum arquivo `.gltf`, `.obj` ou `.png` de textura no jogo. Todo o visual é construído matematicamente em `src/render.js`:

1. **Geometria Procedural**: prédios, monumentos de Brasília, armas e inimigos são compostos por primitivas mescladas (`BufferGeometryUtils`) com atributo de cor/tinta por vértice (`INK.BLUE`, `INK.BLACK`, `INK.RED`, `INK.GREEN`, `INK.ORANGE`, `INK.PINK`).
2. **Passe de Buffer Geométrico**: renderiza sombreamento difuso estilizado, identificador da cor da caneta, normais no espaço da câmera e profundidade linear em ponto flutuante.
3. **Passe Final de Pós-Processamento (`ShaderMaterial`)**:
   - **Contornos de Tinta**: filtro Laplaciano sobre o inverso da profundidade + descontinuidade de normais desenha traços firmes de caneta ao redor de silhuetas e quinas.
   - **Hachuras (*Cross-Hatching*)**: linhas diagonais orientadas pela superfície escurecem áreas de sombra como rabiscos reais de caneta.
   - **Folha Pautada**: aplica pauta horizontal azul, margem vertical vermelha e granulação sutil de papel estática no espaço do mundo/tela (sem *flicker*).

---

## 4. Engenharia de Desempenho (60+ FPS em Mapas Grandes)

Para suportar o mapa expandido de **Brasília (~770 m)** com dezenas de bots, projéteis e facções simultâneas sem quedas de FPS nem travamentos após vários minutos de partida:

- **`BotBatcher` (`src/enemies/batch.js`)**: em vez de centenas de `THREE.Mesh` individuais por partes do corpo dos inimigos, empacota cabeças, troncos, membros, chapéus e armas em malhas instanciadas (`THREE.InstancedMesh`), reduzindo centenas de chamadas de desenho para **~3 draw calls** por quadro.
- **LOD de IA e Animação (`src/enemies/manager.js`)**: inimigos distantes ou fora do cone de visão atualizam poses e buscas de caminho em frequência reduzida.
- **Grade Espacial `NavGrid` (`src/nav.js`) & Física Leve (`src/physics.js`)**: consultas espaciais rápidas e vetores pré-alocados fora do loop de quadro (`_v`, `_v2`, `_v3`), evitando pausas de *Garbage Collection* (GC).
- **Governador Adaptativo de Resolução (`src/main.js`)**: monitora o *frame time* médio e ajusta suavemente o `pixelRatio` do renderizador se a GPU ficar sobrecarregada.
- **Mouse Raw 360° Contínuo (`src/input.js`)**: usa `Pointer Lock` padrão filtrando saltos sintéticos de recentralização do cursor do Windows/RDP sem nunca limitar a rotação horizontal (`yaw` livre infinito em 360°).

---

## 5. Mapa Completo de Arquivos do Repositório

### `electron/` — Aplicativo Desktop Nativo
| Arquivo | Responsabilidade |
| --- | --- |
| `electron/main.cjs` | Inicialização do Electron, criação da `BrowserWindow` isolada, gerenciamento do nó P2P Hyperswarm/LAN, logs em `%APPDATA%` e integração IPC. |
| `electron/lan.cjs` | Transporte nativo para redes corporativas: servidor/cliente TCP de baixa latência (`41230–41237`), descoberta UDP na sub-rede (`41229`) e proteção anti-SSRF. |
| `electron/preload.cjs` | Ponte `contextBridge` mínima que expõe `window.fatalNet` e `window.fatalUpdater` ao renderer sem vazar APIs do Node. |
| `electron/security.cjs` | Validadores de URL local, lista branca de flags de GPU, parser JSON seguro contra *prototype pollution*, *rate-limiter* por peer e validadores de IPC. |
| `electron/updater.cjs` | Orquestrador do `electron-updater`: checagem periódica no GitHub Releases, download silencioso e bloqueio de reinício durante partidas (`emPartida`). |
| `electron/afterPack.cjs` | Hook do `electron-builder` que grava os `@electron/fuses` de segurança no executável `Fatal Error.exe`. |

### `src/` — Núcleo Modular do Jogo (Renderer)
| Módulo / Arquivo | Responsabilidade |
| --- | --- |
| `src/main.js` | Bootstrap do jogo: inicialização dos sistemas centrais, registro dos mapas e conexão entre módulos. |
| `src/core/render.js` e `postFrag.glsl.js` | Motor gráfico Three.js cel-shaded, G-buffer, contornos de tinta, oclusão de contato, ciclo dia/noite, clima/chuva e resolução dinâmica. |
| `src/core/physics.js` e `src/wasm/core.js` | Colisores AABB/cilíndricos do mundo (`FlatBoxStore`), rampas, terreno contínuo e raycasting de tiros. |
| `src/core/nav.js` | Grade de navegação espacial (`NavGrid`) para movimentação, desvio de obstáculos e flanqueamento dos bots. |
| `src/core/input.js` | Entrada unificada de Teclado + Mouse (Pointer Lock 360°) e Controle (DualSense/Xbox com vibração *dual-rumble*). |
| `src/core/audio.js` | Sintetizador procedural Web Audio API com limite de polifonia, espacialização 3D, volumes separados (Geral/SFX/Música) e trilha 8-bit. |
| `src/core/effects.js` | Pools instanciados de partículas de tinta, decalques, faíscas de deflexão, explosões e *screen shake*. |
| `src/core/security.js` e `util.js` | Sanitização (`escHtml`), limites numéricos (`clampNum`), validação de pacotes e molas físicas (`Spring`). |
| `src/net/` (`net.js`, `lobby.js`, `peerNet.js`, `bridgeNet.js`, `hybridNet.js`) | Protocolo multiplayer híbrido (Global P2P Hyperswarm, LAN TCP/UDP e WebRTC), autoridade de Host e migração automática. |
| `src/ui/` (`hud.js`, `minimap.js`, `screens.js`, `settingsScreen.js`) | HUD tática, minimapa em tempo real, Mapa Tático `[M]` com cache estático, telas de menu/lobby e configurações. |

### `src/levels/` — Construtor, Tráfego e Mapas Procedurais
| Arquivo | Responsabilidade |
| --- | --- |
| `src/levels/builder.js` | DSL geométrica procedural com mesclagem por blocos e *LOD* por distância (`nearTiles` e `lodTiles`). |
| `src/levels/index.js` | Registro oficial dos mapas e despacho de construção (`buildLevel`). |
| `src/levels/brasilia*.js` e `data/` | Mega-mapa **Brasília · Eixo Monumental (~770 m)** com vias, monumentos, elevações e props urbanos. |
| `src/levels/traffic.js` e `trafficModels.js` | Sistema de tráfego em grafo com `InstancedMesh`, semáforos, paradas de ônibus e desobstrução automática. |
| `src/levels/desk.js`, `clocktower.js`, `peak.js` | Mapas **Mesa de Estudos**, **Torre do Relógio** e **Pico**. |

### `src/player/` & `src/weapons/` — Jogador e Arsenal
| Arquivo | Responsabilidade |
| --- | --- |
| `src/player/player.js` e `remotePlayer.js` | Corpo em 1ª pessoa (*slide*, *wall-jump*, pulo duplo, *mantle*, *air dash*) e avatares/interpolação de jogadores remotos. |
| `src/player/shop.js` | Mixin da Loja (`[B]`): carteira de dinheiro, compra de armas, coletes e munições. |
| `src/player/grapple.js`, `grenades.js`, `rockets.js` | Mecânica física do Gancho (`Q`/`E`), granadas (`G`) e foguetes/Rocket Jump da Bazuca. |
| `src/weapons/*.js` | Modelos 3D em 1ª pessoa, animações procedurais e disparo das 12 armas (`revolver`, `pistol9mm`, `punisher`, `deagle`, `requiem`, `shotgun`, `smg`, `rifle`, `sniper`, `laser`, `bazooka` e `katana`). |

### `src/enemies/`, `src/game/` e `src-tauri/` — IA, Regras e Runtime Nativo
| Arquivo | Responsabilidade |
| --- | --- |
| `src/enemies/types.js`, `manager.js` e `ai/*.js` | Tabela de atributos e máquinas de estado de IA (tática, chefes, veículos, civis/facções de Brasília). |
| `src/enemies/batch.js` e `models/*.js` | Renderizador instanciado (`BotBatcher`) com sombras de contato em *draw call* única e malhas procedurais. |
| `src/enemies/projectiles.js`, `combat.js`, `anim.js`, `netSync.js` | Projéteis, combate, animações e sincronização de snapshots de bots na rede. |
| `src/game/` (`loop.js`, `survival.js`, `environment.js`, `missions.js`, `brasilia*.js`, `pvpCombat.js`) | Loop principal, diretor de ondas, ciclo dia/noite/clima, missões, tráfego/eventos de Brasília e combate PvP. |
| `src-tauri/` e `rust-core/` | Shell alternativo Tauri 2.0 (LAN TCP/UDP compatível com portas `41230–41237` do Electron) e núcleo espacial WASM em Rust. |

### `scripts/`, `tests/` e `.github/` — Qualidade e CI/CD
| Arquivo | Responsabilidade |
| --- | --- |
| `scripts/check.mjs` | Validação de sintaxe (`node --check`) em todos os módulos e conferência do hash SHA-256 da CSP do `index.html`. |
| `tests/security.test.mjs` | Testes automatizados (`node:test`) cobrindo segurança Electron, P2P, rate-limit, XSS e autoridade de Host. |
| `.github/workflows/ci.yml` | Pipeline de Integração Contínua + `npm audit` + análise estática **GitHub CodeQL**. |
| `.github/workflows/release.yml` | Pipeline de empacotamento Windows, aplicação de Electron Fuses, geração de `SHA256SUMS.txt` e publicação automática no GitHub Releases. |

