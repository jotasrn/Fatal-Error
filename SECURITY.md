# Política e Arquitetura de Segurança — Fatal Error

<p>
  <a href="https://github.com/jotasrn/Fatal-Error/actions/workflows/ci.yml">
    <img alt="CI & CodeQL" src="https://github.com/jotasrn/Fatal-Error/actions/workflows/ci.yml/badge.svg">
  </a>
  <a href="https://github.com/jotasrn/Fatal-Error/releases/latest">
    <img alt="Última Release Verificada" src="https://img.shields.io/github/v/release/jotasrn/Fatal-Error?label=release&color=10b981">
  </a>
</p>

**Fatal Error** adota o mesmo modelo de **defesa em profundidade** e distribuição verificada do projeto **Concord**: como o multiplayer opera em rede P2P sem servidor central, nenhuma entrada vinda da rede ou da interface gráfica é tratada como confiável por padrão.

---

## Sumário

1. [Modelo de Ameaça](#1-modelo-de-ameaça)
2. [Endurecimento Binário do Executável (`@electron/fuses`)](#2-endurecimento-binário-do-executável-electronfuses)
3. [Isolamento de Processos, Sandbox, IPC e CSP](#3-isolamento-de-processos-sandbox-ipc-e-csp)
4. [Segurança de Transporte P2P (`Hyperswarm` + `Noise`)](#4-segurança-de-transporte-p2p-hyperswarm--noise)
5. [Autoridade de Host, Anti-Spoofing e Anti-XSS](#5-autoridade-de-host-anti-spoofing-e-anti-xss)
6. [Servidor LAN Python Opcional (`launcher.py`)](#6-servidor-lan-python-opcional-launcherpy)
7. [Pipeline DevSecOps, Auditoria Contínua e Testes](#7-pipeline-devsecops-auditoria-contínua-e-testes)
8. [Limitações Conhecidas e Reporte de Vulnerabilidades](#8-limitações-conhecidas-e-reporte-de-vulnerabilidades)

---

## 1. Modelo de Ameaça

Em um jogo P2P distribuído:
- **Qualquer peer remoto pode estar rodando código modificado** tentando forjar identidade (`from`), enviar pacotes gigantes para travar memória, inundar sockets (*flood*), injetar HTML/JS em nomes de jogadores ou emitir comandos administrativos falsos (`kick`, `score`, `end`).
- **A camada de renderização (`BrowserWindow`) processa estados vindos de terceiros**: portanto, mesmo no improvável cenário de um bug na UI, o processo *Renderer* **jamais** pode ter acesso direto ao Node.js, ao sistema de arquivos ou ao shell do sistema operacional.
- **O binário instalado na máquina do usuário** não deve permitir vetores clássicos de sequestro local (*Living-off-the-Land* com `ELECTRON_RUN_AS_NODE`, `--inspect` ou adulteração silenciosa do pacote `app.asar`).

---

## 2. Endurecimento Binário do Executável (`@electron/fuses`)

Durante o empacotamento (`electron/afterPack.cjs`), os **Electron Fuses V1** são gravados diretamente no binário `Fatal Error.exe` antes da geração do instalador e do `.zip`:

| Fuse (`FuseV1Options`) | Valor | Proteção Garantida |
| --- | :---: | --- |
| `RunAsNode` | `false` | Impede que malwares locais abusem de `ELECTRON_RUN_AS_NODE=1` usando o binário do jogo como interpretador Node. |
| `EnableCookieEncryption` | `true` | Criptografa dados de armazenamento de sessão em disco via chaves do sistema operacional (DPAPI no Windows). |
| `EnableNodeOptionsEnvironmentVariable` | `false` | Bloqueia injeção de código via variável de ambiente `NODE_OPTIONS` (ex.: `--require`). |
| `EnableNodeCliInspectArguments` | `false` | Desativa portas de depuração remota (`--inspect`, `--inspect-brk`) no executável final. |
| `OnlyLoadAppFromAsar` | `true` | Impede que arquivos soltos em `resources/app/` substituam o código oficial empacotado. |
| `EnableEmbeddedAsarIntegrityValidation` | `true` | Valida o hash criptográfico embutido do `app.asar` na inicialização; qualquer adulteração aborta a abertura. |

---

## 3. Isolamento de Processos, Sandbox, IPC e CSP

Implementado em `electron/main.cjs`, `electron/preload.cjs`, `electron/security.cjs` e `index.html`:

- **Renderer Isolado**: `BrowserWindow` opera obrigatoriamente com:
  - `sandbox: true`
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `webSecurity: true`
  - `allowRunningInsecureContent: false`
- **Bloqueio de DevTools em Produção**: atalhos de inspeção (`Ctrl+Shift+I`, `F12`) são ignorados quando `app.isPackaged === true`, e o evento `devtools-opened` fecha imediatamente o inspetor.
- **Contenção de Navegação e Permissões**:
  - `will-navigate`, `will-attach-webview` e `setWindowOpenHandler` bloqueiam qualquer redirecionamento para URLs externas ou abertura de popups (`isAllowedAppUrl`).
  - `setPermissionRequestHandler` e `setPermissionCheckHandler` operam em modo *default-deny*, autorizando exclusivamente `pointerLock` e `fullscreen` quando solicitados pelo `index.html` local.
- **Content-Security-Policy (CSP) com Hash Criptográfico**:
  - `index.html` define CSP estrita (`default-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, sem `unsafe-eval` e sem `unsafe-inline` em `script-src`).
  - O único bloco inline (`<script type="importmap">`) é autorizado exclusivamente por seu **hash SHA-256 exato**, verificado automaticamente pelo comando `npm run check` em todo commit.
- **Ponte IPC Mínima e Validada (`electron/preload.cjs`)**:
  - Expõe somente primitivas estritamente tipadas (`window.fatalNet` e `window.fatalUpdater`), validando formato de tópicos hexadecimais (`isValidTopicHex`), identificadores de peers (`isValidPeerId`) e *bounds* de tamanho antes de cruzar para o processo principal.
- **Whitelist de Flags de GPU (`filterSafeGpuFlags`)**:
  - Caso exista um arquivo `<userData>/gpu-flags.txt`, apenas flags gráficas constantes numa lista branca explícita são aceitas (bloqueando `--no-sandbox`, `--disable-web-security`, `--remote-debugging-port`, etc.).

---

## 4. Segurança de Transporte P2P (`Hyperswarm` + `Noise`)

Implementado no processo principal (`electron/main.cjs`) e em `electron/security.cjs`:

- **Criptografia Ponta a Ponta Autenticada**: todas as conexões globais usam **Hyperswarm** sobre o **Noise Protocol Framework** com chaves públicas **Ed25519**, garantindo sigilo e autenticidade de transporte antes de qualquer byte do jogo trafegar.
- **Deduplicação por Chave Pública e Teto de Conexões**:
  - Apenas **1 socket ativo por chave pública remota** é admitido.
  - Limite rígido de **`MAX_PEERS = 16`** conexões simultâneas por instância, protegendo memória e descritores de rede.
- **Enquadramento Seguro (`MAX_FRAME_BYTES = 256 KB`)**:
  - Buffers que ultrapassem `256 KB` sem delimitador válido causam desconexão imediata do peer infrator.
  - Todo JSON recebido passa por `safeJsonParse`, que remove chaves perigosas (`__proto__`, `constructor`, `prototype`) contra ataques de *Prototype Pollution*.
- **Rate-Limiting por Peer (`PeerRateLimiter`)**:
  - Algoritmo *token-bucket* individual por peer desconecta automaticamente conexões que disparem rajadas abusivas de pacotes acima da taxa máxima de simulação do jogo.

---

## 5. Autoridade de Host, Anti-Spoofing e Anti-XSS

Implementado em `src/net.js`, `src/security.js` e `src/main.js`:

- **Identidade Carimbada pelo Transporte**: o Host ignora campos `from` forjados pelo remetente e sobrescreve a origem com o identificador autenticado da sessão P2P/WebRTC.
- **Separação Estrita de Mensagens (`HOST_ONLY_KINDS` vs `CLIENT_ALLOWED_KINDS`)**:
  - Clientes comuns **jamais** podem emitir ou pedir retransmissão de eventos exclusivos do Host (`lobby`, `start`, `end`, `kick`, `score`, `esnap`, `edead`, `ekillcredit`, ` boss`, etc.).
  - Clientes validam que pacotes de autoridade venham exclusivamente do `hostId` legítimo da sala e bloqueiam tentativas de sequestro de `hostId` durante a partida.
- **Sanitização contra XSS e Corrupção de Física**:
  - Todos os apelidos, códigos de sala e mensagens de *killfeed*/placar passam por `sanitizeName` e `escHtml` antes de tocar o DOM.
  - Vetores de posição, velocidade, direções de tiro e valores numéricos passam por `clampNum`, `sanitizeVec3` e `sanitizeShots`, impedindo que `NaN`, `Infinity` ou coordenadas absurdas corrompam a simulação dos demais jogadores.

---

## 6. Servidor LAN Python Opcional (`launcher.py`)

Para cenários de desenvolvimento ou execução via navegador local (`python serve.py` / `python launcher.py`):
- Proteção contra **Path Traversal** (`..` e caminhos fora do diretório raiz são rejeitados com `403`).
- **Lista Branca de Extensões** (`.html`, `.css`, `.js`, `.woff2`, etc.) e bloqueio total de arquivos ocultos (`.git`, `.env`) ou scripts/binários (`.py`, `.exe`, `.cjs`).
- **Listagem de Diretórios Desativada**, cabeçalhos HTTP de segurança (**CSP**, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`) e *rate-limiting* por endereço IP.

---

## 7. Pipeline DevSecOps, Auditoria Contínua e Testes

| Camada Automatizada | Arquivo | O que verifica |
| --- | --- | --- |
| **Verificação Estática & CSP** | `scripts/check.mjs` | Sintaxe de todo o código JS/CJS e correspondência exata do hash SHA-256 do `importmap` na CSP de `index.html`. |
| **Testes de Segurança** | `tests/security.test.mjs` | Bloqueio de `Prototype Pollution`, *rate-limiting*, whitelist de flags GPU, validação de origens `file://`, anti-XSS, clamping numérico e privilégios Host/Cliente. |
| **Integração Contínua + CodeQL** | `.github/workflows/ci.yml` | Executa `npm run check`, `npm test`, `npm audit --audit-level=high` (bloqueante) e análise semântica **GitHub CodeQL (`javascript-typescript`)** em todo push/PR. |
| **Atualização de Dependências** | `.github/dependabot.yml` | Monitora semanalmente vulnerabilidades e atualizações em pacotes `npm` e `github-actions`. |
| **Release Reprodutível + SHA-256** | `.github/workflows/release.yml` | Compila em runner limpo da nuvem, aplica Electron Fuses e publica `SHA256SUMS.txt` junto aos instaladores. |

---

## 8. Limitações Conhecidas e Reporte de Vulnerabilidades

### Limitações Conhecidas
- **Sem Certificado Pago de Code Signing (EV)**: o Windows SmartScreen exibe aviso padrão na primeira execução do instalador; a integridade do binário pode ser conferida pelo arquivo `SHA256SUMS.txt` oficial da Release.
- **Visibilidade de IP entre Peers**: por ser uma arquitetura P2P direta (sem servidor proxy central), os participantes da mesma sala estabelecem conexão direta entre si para atingir latência mínima.
- **Autoridade no Host da Sala**: o criador atual da sala processa o placar e os bots; embora clientes não possam forjar eventos administrativos, um Host mal-intencionado controla as regras da própria sala que hospedou (basta sair e criar outra sala).

### Como Reportar uma Vulnerabilidade
Caso encontre qualquer falha de segurança (escape de sandbox, bypass de autoridade P2P, injeção no DOM ou dependência vulnerável):
1. **Não publique exploits funcionais em issues públicas** antes da correção.
2. Utilize a aba **[Security → Report a vulnerability](https://github.com/jotasrn/Fatal-Error/security/advisories/new)** do GitHub (Private Vulnerability Reporting) informando passos de reprodução, impacto e versão testada.
