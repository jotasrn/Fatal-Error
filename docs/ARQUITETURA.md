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
│  • Camada de protocolo de partida (src/net.js): Host, Cliente e GDFNet  │
└─────────────────────────────────────────────────────────────────────────┘
```

O processo *Renderer* **não possui acesso a `require`, `fs` nem sockets brutos**. Toda comunicação externa passa exclusivamente pela ponte `electron/preload.cjs` com validação em `electron/security.cjs`.

---

## 2. Topologia Híbrida de Rede Multiplayer

Para garantir conectividade tanto na internet aberta quanto dentro de redes corporativas restritas, `src/net.js` abstrai dois transportes sob a mesma interface de mensagens de jogo:

| Modo | Transporte | Como descobre e conecta |
| --- | --- | --- |
| **Global P2P** | `Hyperswarm` (via IPC `electron/main.cjs`) | Deriva um tópico criptográfico SHA-256 de 32 bytes a partir do código da sala (ou lobby público), anuncia na DHT Kademlia distribuída e negocia conexão direta cifrada com **Noise Protocol + UDP Hole-Punching**. |
| **Rede Interna / Corporativa (`GDFNet`)** | `PeerJS` / `WebRTC DataChannel` (`vendor/peerjs/`) | Sinalização compatível com ambientes onde portas UDP da DHT são bloqueadas pelo firewall corporativo, mantendo canais de dados `SCTP/DTLS` de baixa latência. |

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
| `electron/main.cjs` | Inicialização do Electron, criação da `BrowserWindow` isolada, gerenciamento do nó P2P Hyperswarm, logs em `%APPDATA%` e integração IPC. |
| `electron/preload.cjs` | Ponte `contextBridge` mínima que expõe `window.fatalNet` e `window.fatalUpdater` ao renderer sem vazar APIs do Node. |
| `electron/security.cjs` | Validadores de URL local, lista branca de flags de GPU, parser JSON seguro contra *prototype pollution*, *rate-limiter* por peer e validadores de IPC. |
| `electron/updater.cjs` | Orquestrador do `electron-updater`: checagem periódica no GitHub Releases, download silencioso e bloqueio de reinício durante partidas (`emPartida`). |
| `electron/afterPack.cjs` | Hook do `electron-builder` que grava os `@electron/fuses` de segurança no executável `Fatal Error.exe`. |

### `src/` — Núcleo do Jogo (Renderer)
| Arquivo | Responsabilidade |
| --- | --- |
| `src/main.js` | Orquestrador principal: menus, seleção de mapas/rede, loop de simulação, câmera de morte, placar multiplayer, governador de FPS e banner de update. |
| `src/render.js` | Motor gráfico Three.js, materiais de tinta esferográfica e shader pós-processado de folha de caderno. |
| `src/physics.js` | Colisores AABB/cilíndricos do mundo, rampas, plataformas móveis, degraus e raycasting de tiros. |
| `src/nav.js` | Grade de navegação espacial (`NavGrid`) para movimentação, desvio de obstáculos e flanqueamento dos bots. |
| `src/input.js` | Entrada unificada de Teclado + Mouse (Pointer Lock 360°) e Controle (DualSense/Xbox com vibração *dual-rumble*). |
| `src/audio.js` | Sintetizador procedural Web Audio API: efeitos sonoros de tiro/impacto/katana e trilhas musicais 8-bit exclusivas por mapa. |
| `src/hud.js` | Interface DOM estilo *Cartoon Arcade*: vida, blindagem, dinheiro, ondas, mira telescópica, medidor de Foco, *killfeed* e Loja (`[B]`). |
| `src/minimap.js` | Minimapa tático em tempo real exibindo geometria próxima, aliados, inimigos e eventos. |
| `src/effects.js` | Partículas de tinta, faíscas de deflexão, explosões, trilhas de projéteis e *screen shake*. |
| `src/net.js` | Protocolo multiplayer: salas públicas/privadas, modo Global (Hyperswarm) e Corporativo (`GDFNet`), autoridade de Host e migração automática. |
| `src/players.js` | Avatares 3D, interpolação de movimento, animações e barras de identificação dos jogadores remotos. |
| `src/security.js` | Sanitização no cliente/Host: escape HTML (`escHtml`), limites numéricos (`clampNum`), validação de vetores/tiros e listas de permissão de pacotes. |
| `src/util.js` | Funções matemáticas utilitárias, PRNG determinístico e molas físicas amortecidas (`Spring`) para recuo de câmera. |

### `src/levels/` — Construtor e Mapas Procedurais
| Arquivo | Responsabilidade |
| --- | --- |
| `src/levels/builder.js` | DSL geométrica procedural para erguer prédios, escadas, rampas, arcos, cúpulas, árvores e pontos de cobertura/spawn. |
| `src/levels/index.js` | Registro oficial dos 6 mapas e despacho de construção (`buildLevel`). |
| `src/levels/brasilia.js` | Mega-mapa **Brasília · Eixo Monumental (~770 m)**: Mané Garrincha, Torre de TV escalável, Ulysses, Pátio Brasil, Conjunto Nacional, Rodoviária, Catedral, Esplanada, Congresso e Três Poderes. |
| `src/levels/district.js` | Mapa urbano **Distrito Central** com prédios, becos e telhados. |
| `src/levels/mexico.js` | Mapa **Pueblo México** com praça central, arcos, fonte e piñatas destrutíveis. |
| `src/levels/desk.js` | Mapa **Mesa de Estudos** em escala gigante com livros, réguas e material escolar. |
| `src/levels/clocktower.js` | Mapa vertical **Torre do Relógio** com pátio gótico e campanário. |
| `src/levels/peak.js` | Mapa aéreo **Pico** com torres em níveis e passarelas suspensas. |

### `src/player/` & `src/weapons/` — Jogador e Arsenal
| Arquivo | Responsabilidade |
| --- | --- |
| `src/player/player.js` | Corpo em 1ª pessoa: corrida, *slide*, *wall-jump*, pulo duplo, *mantle*, *air dash*, vida/blindagem, deflexão e troca entre os 8 slots. |
| `src/player/shop.js` | Mixin da Loja (`[B]`): carteira de dinheiro, compra de armas (`$600`–`$1800`), coletes e munições. |
| `src/player/grapple.js` | Mecânica física do Gancho (`Q`/`E`) com fôlego, pêndulo e impulso de saída. |
| `src/player/grenades.js` | Carga de arremesso, arco preditivo, quique físico e explosão em área das granadas (`G`). |
| `src/player/rockets.js` | Simulação dos foguetes da Bazuca, dano explosivo radial e impulso de *Rocket Jump*. |
| `src/weapons/*.js` | Modelos 3D em 1ª pessoa, animações procedurais e lógica de disparo de `revolver`, `shotgun`, `smg`, `rifle`, `sniper`, `laser`, `bazooka` e `katana`. |

### `src/enemies/` & `src/game/` — Inteligência Artificial e Regras
| Arquivo | Responsabilidade |
| --- | --- |
| `src/enemies/types.js` | Tabela completa de atributos dos 22 tipos de bots (incluindo PMDF/GSI/BOPE, Manifestantes e Civis) e dos 3 Chefes. |
| `src/enemies/manager.js` | Spawns, máquina de estados de IA, lógica de neutralidade policial vs manifestantes, combate entre facções e sincronização de rede. |
| `src/enemies/batch.js` | Renderizador instanciado (`BotBatcher`) de alta performance para todos os bots humanoides. |
| `src/enemies/models.js` | Construção procedural das malhas de chefes, criaturas voadoras, aranhas, lobos e acessórios. |
| `src/enemies/projectiles.js` | Pool de projéteis inimigos com colisão, deflexão por Katana e trilhas visuais. |
| `src/game/survival.js` | Diretor de ondas Solo, progressão de dificuldade, chefes a cada 5 ondas, *pickups* de munição/armas caídas e spawns de facções em Brasília. |

### `scripts/`, `tests/` e `.github/` — Qualidade e CI/CD
| Arquivo | Responsabilidade |
| --- | --- |
| `scripts/check.mjs` | Validação de sintaxe (`node --check`) em todos os módulos e conferência do hash SHA-256 da CSP do `index.html`. |
| `tests/security.test.mjs` | Testes automatizados (`node:test`) cobrindo segurança Electron, P2P, rate-limit, XSS e autoridade de Host. |
| `.github/workflows/ci.yml` | Pipeline de Integração Contínua + `npm audit` + análise estática **GitHub CodeQL**. |
| `.github/workflows/release.yml` | Pipeline de empacotamento Windows, aplicação de Electron Fuses, geração de `SHA256SUMS.txt` e publicação automática no GitHub Releases. |

