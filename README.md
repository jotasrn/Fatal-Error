# Fatal Error

<p align="center">
  <b>Arena Shooter 3D em Primeira Pessoa desenhado a caneta esferográfica sobre folha de caderno — 100% procedural, com Multiplayer P2P sem servidor e Atualização Automática.</b>
</p>

<p align="center">
  <a href="https://github.com/jotasrn/Fatal-Error/releases/latest/download/Fatal-Error-Setup.exe">
    <img alt="Baixar Instalador Windows (.exe)" src="https://img.shields.io/badge/%E2%AC%87%20BAIXAR%20JOGO%20(WINDOWS%2064--BIT)-Instalador%20.exe%20(Auto--Update)-16a34a?style=for-the-badge&logo=windows&logoColor=white">
  </a>
  &nbsp;
  <a href="https://github.com/jotasrn/Fatal-Error/releases/latest/download/Fatal-Error-Portable.zip">
    <img alt="Baixar Versão Portátil (.zip)" src="https://img.shields.io/badge/%E2%AC%87%20BAIXAR%20PORT%C3%81TIL-Sem%20Instala%C3%A7%C3%A3o%20(.zip)-2563eb?style=for-the-badge&logo=files&logoColor=white">
  </a>
</p>

<p align="center">
  <a href="https://github.com/jotasrn/Fatal-Error/releases/latest">
    <img alt="Versão mais recente" src="https://img.shields.io/github/v/release/jotasrn/Fatal-Error?label=vers%C3%A3o&color=f97316&style=flat-square">
  </a>
  <a href="https://github.com/jotasrn/Fatal-Error/actions/workflows/ci.yml">
    <img alt="CI & CodeQL" src="https://github.com/jotasrn/Fatal-Error/actions/workflows/ci.yml/badge.svg">
  </a>
  <a href="https://github.com/jotasrn/Fatal-Error/actions/workflows/release.yml">
    <img alt="Pipeline de Release" src="https://github.com/jotasrn/Fatal-Error/actions/workflows/release.yml/badge.svg">
  </a>
  <img alt="Plataforma Windows 10/11 x64" src="https://img.shields.io/badge/Windows-10%20%2F%2011%20(64%20bits)-0f172a?style=flat-square&logo=windows">
  <a href="SECURITY.md">
    <img alt="Segurança Electron Fuses + Noise P2P" src="https://img.shields.io/badge/Seguran%C3%A7a-Fuses%20%2B%20CSP%20%2B%20Noise%20P2P-10b981?style=flat-square">
  </a>
</p>

---

## Baixar e Jogar em 1 Minuto

| Opção | Link Direto Permanente | Quando usar |
| --- | --- | --- |
| **Instalador Windows (Recomendado)** | **[`Fatal-Error-Setup.exe`](https://github.com/jotasrn/Fatal-Error/releases/latest/download/Fatal-Error-Setup.exe)** | Cria atalho na Área de Trabalho e **atualiza o jogo sozinho** sempre que sair versão nova |
| **Versão Portátil (`.zip`)** | **[`Fatal-Error-Portable.zip`](https://github.com/jotasrn/Fatal-Error/releases/latest/download/Fatal-Error-Portable.zip)** | Basta extrair a pasta e abrir `Fatal Error.exe` (ideal para pendrive ou PC restrito) |
| **Hashes de Integridade** | **[`SHA256SUMS.txt`](https://github.com/jotasrn/Fatal-Error/releases/latest/download/SHA256SUMS.txt)** | Conferência criptográfica SHA-256 dos arquivos baixados |

1. Clique no botão verde **[BAIXAR JOGO — Instalador `.exe`](https://github.com/jotasrn/Fatal-Error/releases/latest/download/Fatal-Error-Setup.exe)** acima (o endereço é fixo e baixa sempre a versão mais nova).
2. Na primeira execução, caso o Windows SmartScreen exiba *"O Windows protegeu o computador"* (por não haver certificado pago EV), clique em **Mais informações** → **Executar assim mesmo**.
3. Se o Firewall do Windows perguntar sobre acesso à rede, clique em **Permitir** para habilitar a conexão direta P2P com outros jogadores.
4. **Pronto!** Depois de instalado, o jogo verifica, baixa e aplica novas versões automaticamente em segundo plano — **nunca interrompendo uma partida em andamento**.

> Passo a passo detalhado de instalação, diferenças entre Instalador e Portátil, verificação de `SHA256` e solução de dúvidas: consulte **[`download/README.md`](download/README.md)**.

---

## Sumário

- [Sobre o Jogo](#sobre-o-jogo)
- [Modos de Jogo (Solo & Multiplayer Online)](#modos-de-jogo)
- [Mapas Oficiais e Expansão Brasília (770 m)](#mapas-oficiais)
- [Arsenal, Slots e Economia da Loja (`[B]`)](#arsenal-slots-e-economia-da-loja)
- [Controles Completos (Teclado/Mouse e Controle)](#controles-completos)
- [Elenco de Inimigos, Facções e Chefes](#elenco-de-inimigos-facções-e-chefes)
- [Arquitetura, Desempenho e Segurança](#arquitetura-desempenho-e-segurança)
- [Rodar e Compilar em Desenvolvimento](#rodar-e-compilar-em-desenvolvimento)
- [Documentação Completa do Projeto](#documentação-completa-do-projeto)

---

## Sobre o Jogo

**Fatal Error** é um *arena shooter* frenético em primeira pessoa onde todo o universo visual e sonoro é **gerado 100% via código** (Three.js + WebGL2 + Web Audio API), sem arquivos externos de modelos 3D, texturas ou MP3:

- **Estética de Caderno Procedural**: o motor renderiza iluminação, IDs de tinta (azul, preta, vermelha, verde, laranja e rosa), normais e profundidade em ponto flutuante, aplicando contorno Laplaciano, hachuras que acompanham a curvatura das superfícies, pauta azul, margem vermelha e granulação de papel sem cintilação.
- **Movimentação Avançada**: corrida, deslize (*slide*), pulo duplo, corrida/pulo na parede (*wall-jump*), escalada automática de bordas (*mantle*), investida aérea (*air dash*), **Gancho de Escalada (`Q`/`E`)** e *Rocket Jump* de Bazuca.
- **Combate de Katana & Deflexão**: bloqueie rajadas pela frente no tempo exato (*Aparada Perfeita*) para devolver as balas na cara de quem atirou e carregue a barra de **Foco** para fatiar múltiplos alvos em investida relâmpago.
- **Trilha Sonora 8-Bit Procedural**: cada mapa possui um tema musical próprio sintetizado em tempo real (alterne com a tecla `M`).

---

## Modos de Jogo

### 1. Solo — Sobrevivência em Ondas (Roguelite)
- Enfrente ondas progressivas de inimigos cada vez mais numerosos, rápidos e agressivos.
- **Chefes a cada 5 ondas** (*O Desenhista*, *A Borracha* e *A Mancha de Tinta*), cada um com ataques e padrões próprios.
- **Morte = Reinício Real**: no modo Solo não há checkpoint travado; morreu, a partida recomeça do zero na **Onda 1** com Pistola, Katana e `$300`.

### 2. Multiplayer Online — Mata-Mata Livre + Bots (Até 10 Jogadores)
- Partidas intensas com **cronômetro de 10 minutos**, misturando jogadores reais e hordas de bots sincronizados pelo Host em tempo real.
- **Sem Servidor Central**: o jogo opera com arquitetura dupla de rede para funcionar em qualquer lugar:
  - **Modo Global P2P (`Hyperswarm` + `Noise`)**: conecta jogadores em qualquer internet residencial, fibra ou 4G via DHT distribuída + *UDP hole-punching* nativo, sem precisar abrir portas no roteador. Crie salas públicas, use **Partida Rápida** ou compartilhe um **código privado de 5 letras**.
  - **Modo Rede Interna / Corporativa ( WebRTC)**: projetado para ambientes corporativos/governamentais onde portas UDP externas ou DHT são bloqueadas pelo firewall, permitindo jogar normalmente entre colegas na rede.
- **Recursos de Partida**:
  - Entrada livre em partidas já em andamento (*late-join*).
  - **Migração Automática de Host**: se o criador da sala cair ou sair, outro jogador assume a autoridade da partida sem derrubar a sala.
  - Renascimento rápido com **2 segundos de escudo** após a câmera de abate e *drop* no chão das armas compradas por quem morreu.

---

## Mapas Oficiais

| Mapa | Chave | Descrição e Destaques |
| --- | --- | --- |
| **Distrito Central** | `district` | Quarteirões urbanos, becos estreitos, escadas de incêndio e telhados interligados para gancho e *wall-jump*. |
| **Brasília · Eixo Monumental** | `brasilia` | **Mega-mapa de ~770 m de extensão** fiel ao eixo urbano real de Brasília, com monumentos escaláveis e eventos dinâmicos de rua (detalhes abaixo). |
| **Pueblo México** | `mexico` | Praça ensolarada com fonte central, arcos coloniais, cactos, mariachis e piñatas recheadas de recompensas. |
| **Mesa de Estudos** | `desk` | Arena em escala miniatura sobre uma mesa escolar gigante: torres de livros, pontes de réguas, trincheiras de borracha, apontadores e aviões de papel. |
| **Torre do Relógio** | `clocktower` | Pátio gótico vertical dominado por campanário central com sino, galerias elevadas e linhas longas para Sniper. |
| **Pico** | `peak` | Complexo vertical de prédios em múltiplos níveis, passarelas suspensas e combate aéreo sobre abismos. |

### Destaque Especial: Brasília · Eixo Monumental (~770 metros)
O mapa de Brasília recria de ponta a ponta os principais cartões-postais do Plano Piloto em escala jogável:
- **Eixo Oeste → Centro**: **Estádio Mané Garrincha**, **Ginásio Nilson Nelson**, **Palácio do Buriti** e **Centro de Convenções Ulysses Guimarães**.
- **Torre de TV & Setores Centrais**: **Feirinha da Torre**, **Fonte Luminosa**, **Mirante escalável da Torre de TV**, **Pátio Brasil Shopping**, **Brasília Shopping**, **Conjunto Nacional** e os blocos dos **Setores Hoteleiros, Comerciais e Bancários (Sul e Norte)**.
- **Rodoviária & Esplanada**: **Rodoviária do Plano Piloto** em dois níveis (plataforma superior e passagem subterrânea), **Teatro Nacional**, **Museu Nacional**, **Catedral Metropolitana**, **Esplanada dos Ministérios**, **Congresso Nacional** (cúpulas, gêmeas e rampa) e **Praça dos Três Poderes** (Planalto, STF, Panteão e Mastro da Bandeira).
- **Mecânica Viva de Facções**:
  - **Manifestantes** e forças policiais (**PMDF**, **GSI** e **Tropa de Choque / BOPE**) entram em confronto dinâmico ao longo da Esplanada e da Torre de TV.
  - **Neutralidade Inteligente**: os policiais contêm os manifestantes e **não atacam você de graça** — eles só revidam contra quem atirar na polícia ou agredir os manifestantes perto deles.
  - **Civis, Políticos e Feirantes**: circulam pelas calçadas e feirinha; atingi-los aplica penalidade de pontuação.

---

## Arsenal, Slots e Economia da Loja

Você inicia com o **Revólver (Slot 1)**, a **Katana (Slot 8)**, **3 Granadas** e **`$300`** no bolso. Pressione **`B`** (ou **D-Pad Baixo** no controle) a qualquer momento para abrir a **Loja de Armas**:

### Armas e Slots (`1` a `8`)

| Tecla / Slot | Arma | Custo na Loja | Características |
| :---: | --- | :---: | --- |
| **`1`** | **Revólver** | *Inicial* | Preciso, dano confiável por disparo e saque rápido. |
| **`2`** | **Escopeta** | **`$600`** | Dispara 10 balins de chumbo; devastadora em corredores e curta distância. |
| **`3`** | **Submetralhadora (SMG)** | **`$750`** | Cadência altíssima (18 tiros/s), carregador de 45 balas e ótima mobilidade. |
| **`4`** | **Rifle de Assalto** | **`$900`** | Automático equilibrado (35 balas), versátil a média e longa distância. |
| **`5`** | **Sniper** | **`$1200`** | Mira telescópica de longo alcance e dano massivo de eliminação. |
| **`6`** | **Fuzil de Plasma Laser** | **`$1500`** | Feixe energético contínuo de 50 células com precisão cirúrgica. |
| **`7`** | **Bazuca** | **`$1800`** | Foguetes explosivos em área com empurrão físico e suporte a *Rocket Jump*. |
| **`8`** / **`F`** | **Katana** | *Inicial* | Corte corpo a corpo, bloqueio/deflexão de tiros (`RMB`) e **Corte Foco** (`LMB+RMB` ou `X`). |

### Blindagem, Suprimentos e Recompensas

| Item / Evento | Valor | Efeito |
| --- | :---: | --- |
| **Colete Leve (+50)** | `$300` | Adiciona 50 pontos de blindagem (absorve **70%** do dano recebido). |
| **Colete Pesado (100)** | `$600` | Preenche a blindagem máxima (100 pontos). |
| **Munição Completa** | `$150` | Reabastece 100% da reserva de todas as armas compradas + 1 granada. |
| **+2 Granadas** | `$200` | Adiciona 2 granadas de fragmentação (máximo de 5 na mochila). |
| **Recompensas de Combate** | `+$25` a `+$300+` | Abates comuns, bônus de *Headshot*, abates/deflexões de Katana, objetos/piñatas e conclusão de onda. |
| **Queda de Armas ao Morrer** | *Drop no chão* | Ao morrer, suas armas compradas caem no cenário para qualquer jogador coletar, e seu inventário reseta para o kit inicial (`$300`). |

---

## Controles Completos

| Ação | Teclado + Mouse | Controle (PS5 DualSense / Xbox) |
| --- | --- | --- |
| **Mover / Correr** | `WASD` (ou Setas) + `Shift` | Analógico Esquerdo + `L3` |
| **Olhar (360° livre)** | Mouse | Analógico Direito |
| **Atirar / Cortar** | Botão Esquerdo (`LMB`) | `R2` / `RT` |
| **Mirar (ADS) / Bloquear (Katana)** | Botão Direito (`RMB`) | `L2` / `LT` |
| **Pular / Pulo Duplo / Wall-Jump** | `Espaço` | `✕` / `A` |
| **Agachar / Deslizar (*Slide*)** | `C` ou `Ctrl` | `○` / `B` |
| **Investida no Ar (*Air Dash*)** | `X`, `Alt` (ou `C`/`Ctrl` no ar) | `○` / `B` (no ar) |
| **Gancho (*Grapple*)** | `Q`, `E` ou Botão Meio/Lateral do Mouse | `L1` / `LB` |
| **Golpe Rápido de Katana** | `F`, `V` ou Mouse 5 | `R1` / `RB` |
| **Corte Foco da Katana (barra cheia)** | `LMB + RMB` | `L2 + R2` |
| **Recarregar Arma** | `R` | `□` / `X` |
| **Arremessar Granada (segure p/ longe)** | `G` | `R3` ou `D-Pad Cima` |
| **Abrir Loja de Armas e Coletes** | **`B`** | **`D-Pad Baixo`** |
| **Trocar Arma Direta / Rolagem** | Teclas **`1` a `8`** ou `Scroll` | `△` / `Y` ou `D-Pad Esq./Dir.` |
| **Ligar / Desligar Música 8-Bit** | `M` | Pelo menu de pausa |
| **Placar da Partida (Online)** | `Tab` | `Create` / `View` |
| **Pausar / Menu** | `Esc` ou `P` | `Options` / `Menu` |

---

## Elenco de Inimigos, Facções e Chefes

| Categoria | Unidades | Comportamento |
| --- | --- | --- |
| **Infantaria & Táticos** | *Soldado*, *Comando Tático*, *Escudeiro*, *Bruto* | Rajadas de rifle e SMG, avanço com escudo balístico frontal e escopetas pesadas. |
| **Especialistas Pesados** | *Soldado de Plasma*, *Artilheiro de Bazuca*, *Atirador*, *Caçador de Precisão* | Feixes de energia, foguetes de longo alcance e mira laser esquivável de alta letalidade. |
| **Assalto Rápido & Criaturas** | *Corredor*, *Lobo de Tinta*, *Aranha Tecelã*, *Morcego Voraz*, *Vespa de Papel*, *Bomba de Tinta* | Investidas corpo a corpo velozes, ataques aéreos rasantes e kamikazes explosivos. |
| **Facções de Brasília** | *Manifestante*, *Líder Manifestante*, *Polícia Militar (PMDF)*, *Agente Tático (GSI)*, *Tropa de Choque (BOPE)*, *Cidadão*, *Político*, *Feirante* | Confronto urbano sistêmico entre manifestantes e forças de segurança + pedestres civis neutros. |
| **Chefes de Onda** | **O Desenhista**, **A Borracha**, **A Mancha de Tinta** | Chefes colossais a cada 5 ondas no modo Solo, com barra de vida dedicada e ataques especiais. |

---

## Arquitetura, Desempenho e Segurança

```text
electron/          Processo principal Electron (Node CJS), IPC seguro, Fuses, Auto-Updater e Hyperswarm P2P
src/               Motor 3D (Three.js ESM), física, áudio 8-bit procedural, HUD, minimapa e rede híbrida
  ├── enemies/     IA, tipos de bots, projéteis e BotBatcher (InstancedMesh de alto FPS)
  ├── game/        Loop de ondas Solo, drops, modificadores e regras de partida
  ├── levels/      Construtor geométrico + 6 mapas procedurais (incluindo Brasília 770 m)
  ├── player/      Física em 1ª pessoa, loja, gancho, granadas e foguetes
  └── weapons/     Modelos 3D procedurais em 1ª pessoa das 8 armas + Katana
scripts/           Verificador estático de sintaxe + integridade SHA-256 da Content-Security-Policy
tests/             Suíte automatizada de testes de segurança, protocolo P2P, rate-limit e fuses
download/          Guia passo a passo de download, instalação e solução de problemas para jogadores
docs/              Documentação técnica detalhada de Arquitetura e Atualização Automática
```

- **Alto Desempenho (`60+ FPS` estáveis mesmo em mapas gigantes)**:
  - **`BotBatcher` (`InstancedMesh`)**: agrupa dezenas de bots articulados em apenas ~3 *draw calls* WebGL, com *frustum culling* e *LOD* de animação por distância.
  - **`NavGrid` Espacial & Zero-GC**: navegação e colisões sem alocações por quadro, eliminando engasgos de *Garbage Collector* em partidas longas.
  - **Qualidade Gráfica Adaptativa**: ajuste dinâmico suave de resolução caso o hardware sofra quedas de quadros, preservando nitidez de contornos.
- **Segurança em Profundidade (Padrão Concord)**:
  - Executável selado com **`@electron/fuses`** (`RunAsNode: false`, validação criptográfica de integridade do `app.asar`, cookies cifrados via DPAPI, inspeção CLI bloqueada).
  - Janela com `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, DevTools desativado em produção e **CSP rigorosa** validada por hash SHA-256 no CI.
  - Transporte P2P cifrado por **Noise Protocol + Ed25519**, *rate-limiter* por peer, teto de *payload*, autoridade estrita de Host contra *spoofing* e sanitização total contra XSS/NaN.
  - Pipeline automatizada com **GitHub Actions CI**, **`npm audit`** bloqueante, **GitHub CodeQL** e **Dependabot**.

---

## Rodar e Compilar em Desenvolvimento

Pré-requisito: **Node.js 22+**.

```bash
# 1. Instalar dependências
npm install

# 2. Abrir o jogo em modo desenvolvimento (Electron)
npm start
```

### Scripts Disponíveis

| Comando | Descrição |
| --- | --- |
| `npm start` | Abre o jogo localmente no Electron |
| `npm run check` | Verifica sintaxe de todos os módulos (`.js`/`.cjs`) e confere o hash SHA-256 da CSP em `index.html` |
| `npm test` | Executa a suíte automatizada de testes de segurança, IPC, P2P e autoridade de Host |
| `npm run dist` | Empacota localmente o instalador `Fatal-Error-Setup-<versão>.exe` e `Fatal-Error-Portable-<versão>.zip` em `dist/` (com Electron Fuses aplicados) |
| `python serve.py` | *(Opcional)* Inicia servidor HTTP/LAN local seguro na porta `8910` para testes rápidos em navegador |

---

## Documentação Completa do Projeto

| Documento | Público-Alvo | Conteúdo |
| --- | --- | --- |
| **[`download/README.md`](download/README.md)** | Jogadores | Links diretos de download, Instalador vs Portátil, aviso do SmartScreen, verificação SHA-256, pasta de dados e solução de problemas |
| **[`SECURITY.md`](SECURITY.md)** | Segurança / Auditoria | Modelo de ameaça P2P, tabela de Electron Fuses, Sandbox/CSP, protocolo Hyperswarm/Noise, anti-cheat de Host e DevSecOps |
| **[`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)** | Desenvolvedores | Diagrama de processos Electron, topologia híbrida P2P, pipeline gráfica de caderno, `BotBatcher` e mapa arquivo por arquivo |
| **[`docs/ATUALIZACAO.md`](docs/ATUALIZACAO.md)** | Mantenedores | Funcionamento interno do `electron-updater`, proteção de partida ativa e passo a passo para publicar novas versões via `git tag` |
