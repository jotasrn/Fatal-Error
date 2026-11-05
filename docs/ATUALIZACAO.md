# Atualização Automática e Publicação de Releases — Fatal Error

Este guia explica como novas versões do **Fatal Error** chegam automaticamente a todos os jogadores instalados (seguindo o mesmo padrão do **Concord**) e como publicar uma atualização nova pelo GitHub.

---

## 1. O que Acontece na Máquina do Jogador

Todo o ciclo de atualização é gerenciado por [`electron/updater.cjs`](../electron/updater.cjs) em conjunto com o `electron-updater`:

1. **Verificação Automática**: **15 segundos** após abrir o jogo (e depois a cada **4 horas**), o aplicativo consulta silenciosamente os Releases do repositório oficial [`jotasrn/Fatal-Error`](https://github.com/jotasrn/Fatal-Error/releases).
2. **Download Diferencial em Segundo Plano**: se existir uma versão maior que a instalada (comparada por *SemVer*), o jogo baixa apenas os blocos necessários (`.blockmap` + `Fatal-Error-Setup-<versão>.exe`) sem travar a rede nem o FPS.
3. **Proteção Absoluta de Partida em Andamento (`emPartida`)**:
   - Enquanto o jogador estiver dentro de uma partida Solo ou Multiplayer Online, **nenhum reinício automático ou acidental é permitido**.
   - Se o download terminar no meio do combate, a atualização fica aguardando silenciosamente (`waitingForMatch: true`).
4. **Aplicação sem Atrito**:
   - Ao voltar ao menu principal, uma faixa discreta avisa que a nova versão está pronta e permite reiniciar com **1 clique**; **ou**
   - Se o jogador apenas fechar o jogo normalmente ao terminar de jogar, `autoInstallOnAppQuit = true` aplica a atualização sozinho no encerramento.

---

## 2. Como Publicar uma Versão Nova (Passo a Passo para Mantenedores)

Não é necessário configurar nenhuma chave secreta manual: o workflow [`.github/workflows/release.yml`](../.github/workflows/release.yml) utiliza o próprio `GITHUB_TOKEN` nativo do GitHub Actions.

### Pré-requisitos
- O repositório `jotasrn/Fatal-Error` deve permanecer **público** no GitHub (para que os clientes baixem `latest.yml` e os instaladores direto do GitHub Releases sem precisar de token embutido).
- A nova versão deve ser **maior** que a anterior segundo SemVer (ex.: `1.3.0` → `1.3.1` ou `1.4.0`).

### Comandos para Lançar

1. Atualize o campo `"version"` em [`package.json`](../package.json) (opcional, pois a pipeline também sincroniza automaticamente com o nome da tag, mas mantém o repositório alinhado):
   ```bash
   npm version 1.3.1 --no-git-tag-version
   ```
2. Valide localmente que a sintaxe, o hash da CSP e os testes de segurança estão 100% verdes:
   ```bash
   npm run check
   npm test
   ```
3. Faça o commit, crie a tag `v*` e envie para o GitHub:
   ```bash
   git add -A
   git commit -m "chore: release v1.3.1"
   git tag v1.3.1
   git push origin main --tags
   ```

Assim que a tag `v1.3.1` chega ao GitHub, a action **`release`** executa automaticamente:
1. `npm ci` em ambiente Windows limpo (`windows-latest`);
2. `npm run check`, `npm test` e `npm audit --audit-level=high`;
3. Empacotamento `nsis` + `zip` com gravação dos **Electron Fuses** (`electron/afterPack.cjs`);
4. Criação da cópia de URL fixa (`Fatal-Error-Setup.exe` e `Fatal-Error-Portable.zip`), cálculo do `SHA256SUMS.txt` e publicação das notas automáticas no GitHub Releases.

Em poucos minutos a nova versão já está no ar e todas as instalações existentes começam a recebê-la automaticamente!

---

## 3. Arquivos Gerados em Cada Release

| Arquivo Publicado | Finalidade |
| --- | --- |
| **`Fatal-Error-Setup.exe`** | Instalador com **nome fixo** — garante que o botão de download do `README.md` nunca quebre nem mude de link. |
| **`Fatal-Error-Portable.zip`** | Versão portátil com **nome fixo** — descompactar e jogar sem instalar. |
| `Fatal-Error-Setup-<versão>.exe` | Instalador versionado referenciado internamente pelo manifesto `latest.yml` do auto-updater. |
| `Fatal-Error-Setup-<versão>.exe.blockmap` | Mapa de blocos para download diferencial rápido nas atualizações automáticas. |
| `Fatal-Error-Portable-<versão>.zip` | Pacote portátil identificado com o número exato da versão. |
| **`latest.yml`** | Manifesto lido pelo `electron-updater` contendo versão, tamanho e hash SHA-512 oficial do instalador. |
| **`SHA256SUMS.txt`** | Lista de hashes SHA-256 de todos os binários para auditoria e verificação manual. |

### URLs Fixas Permanentes
Estes links apontam sempre para o último release estável publicado:

```text
https://github.com/jotasrn/Fatal-Error/releases/latest/download/Fatal-Error-Setup.exe
https://github.com/jotasrn/Fatal-Error/releases/latest/download/Fatal-Error-Portable.zip
https://github.com/jotasrn/Fatal-Error/releases/latest/download/SHA256SUMS.txt
```

---

## 4. Gerar Build de Teste (Sem Publicar para os Jogadores)

- **Na sua máquina local**:
  ```bash
  npm run dist
  ```
  Gera `dist/Fatal-Error-Setup-<versão>.exe` e `dist/Fatal-Error-Portable-<versão>.zip` com os mesmos Electron Fuses de produção, sem enviar nada para o GitHub.

- **Na nuvem (GitHub Actions)**:
  Na aba **Actions → release → Run workflow**, dispare manualmente na branch `main`. Como não há tag `v*`, o workflow compila, testa e disponibiliza o pacote como artefato de download do Actions, **sem criar Release pública** e sem disparar auto-update nos jogadores.
