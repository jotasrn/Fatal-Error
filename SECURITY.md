# Arquitetura de Segurança e Atualizações — Fatal Error

Este projeto adota o mesmo modelo de defesa em profundidade e distribuição automática do **Concord**.

## 1. Endurecimento do Executável (`@electron/fuses`)
No empacotamento (`electron/afterPack.cjs`), os fuses binários do Electron V1 são gravados diretamente no executável `Fatal Error.exe`:
- `RunAsNode: false` — impede abuso de `ELECTRON_RUN_AS_NODE=1`.
- `EnableNodeCliInspectArguments: false` e `EnableNodeOptionsEnvironmentVariable: false` — bloqueiam depuradores (`--inspect`) e injeção via `NODE_OPTIONS`.
- `OnlyLoadAppFromAsar: true` — impede carregamento de código solto fora do `app.asar`.
- `EnableEmbeddedAsarIntegrityValidation: true` — verifica o hash criptográfico do `app.asar` na inicialização.
- `EnableCookieEncryption: true` — criptografa dados de sessão via DPAPI do sistema operacional.

## 2. Isolamento de Processo e Content-Security-Policy (CSP)
- `BrowserWindow` roda com `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` e `webSecurity: true`.
- DevTools e atalhos de inspeção são desativados na build instalada de produção.
- Navegação externa, `<webview>` e popups internos são bloqueados; permissões de dispositivo são negadas por padrão (permitindo apenas `pointerLock` e `fullscreen` para a origem local do jogo).
- `index.html` aplica uma Content-Security-Policy estrita sem `unsafe-eval` e sem `unsafe-inline` em `script-src`, validando o `<script type="importmap">` por hash SHA-256 exato (`npm run check`).
- Flags opcionais em `<userData>/gpu-flags.txt` passam por lista branca estrita (`filterSafeGpuFlags`).

## 3. Segurança de Rede P2P e Protocolo Multiplayer
- **Transporte Hyperswarm + Noise**: chaves públicas Ed25519 autenticadas por handshake Noise, no máximo 1 socket ativo por chave pública, teto de `MAX_PEERS = 16`, framing limitado a `256 KB`, rejeição imediata de pacotes malformados, proteção contra *prototype pollution* e *rate-limiting* por peer (`PeerRateLimiter`).
- **Autoridade de Host e Anti-Spoofing**: o Host carimba `from` com a identidade autenticada do transporte e bloqueia qualquer tentativa de cliente emitir ou retransmitir eventos exclusivos do Host (`kick`, `end`, `score`, `ekillcredit`, `lobby`, `start`, `esnap`, etc.). Clientes rejeitam tentativa de sequestro de `hostId` após entrarem na sala.
- **Defesa contra XSS e Corrupção Numérica**: todos os textos remotos passam por sanitização e escape HTML (`escHtml`, `sanitizeName`), e coordenadas/danos/vetores passam por limites finitos (`clampNum`, `sanitizeVec3`, `sanitizeShots`).

## 4. Pipeline CI/CD e Atualização Automática
- **CI (`.github/workflows/ci.yml`)**: roda a cada push e PR executando `npm run check`, `npm test`, `npm audit --audit-level=high` e análise estática **GitHub CodeQL**.
- **Dependabot (`.github/dependabot.yml`)**: revisa semanalmente dependências `npm` e `github-actions`.
- **Release & Auto-Update (`.github/workflows/release.yml` + `electron/updater.cjs`)**:
  Para lançar uma nova versão para todos os jogadores:
  ```bash
  git tag v1.3.1
  git push origin v1.3.1
  ```
  O GitHub Actions compila o instalador NSIS, o `.zip` portátil, o `latest.yml` e o `SHA256SUMS.txt`. Quem já tem o jogo instalado recebe a atualização automaticamente em segundo plano, **sem nunca interromper uma partida em andamento**.

