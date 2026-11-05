# Baixar e Instalar o Fatal Error

<p align="center">
  <a href="https://github.com/jotasrn/Fatal-Error/releases/latest/download/Fatal-Error-Setup.exe">
    <img alt="Baixar Instalador Windows (.exe)" src="https://img.shields.io/badge/%E2%AC%87%20BAIXAR%20INSTALADOR%20WINDOWS-Fatal--Error--Setup.exe-16a34a?style=for-the-badge&logo=windows&logoColor=white">
  </a>
  &nbsp;
  <a href="https://github.com/jotasrn/Fatal-Error/releases/latest/download/Fatal-Error-Portable.zip">
    <img alt="Baixar Versão Portátil (.zip)" src="https://img.shields.io/badge/%E2%AC%87%20BAIXAR%20PORT%C3%81TIL%20(.ZIP)-Sem%20Instala%C3%A7%C3%A3o-2563eb?style=for-the-badge&logo=files&logoColor=white">
  </a>
</p>

<p align="center">
  <a href="https://github.com/jotasrn/Fatal-Error/releases/latest">
    <img alt="Versão mais recente" src="https://img.shields.io/github/v/release/jotasrn/Fatal-Error?label=vers%C3%A3o%20atual&color=f97316&style=flat-square">
  </a>
  <img alt="Windows 10/11 64 bits" src="https://img.shields.io/badge/Windows-10%20%2F%2011%20(64%20bits)-0f172a?style=flat-square&logo=windows">
</p>

Os dois botões acima apontam sempre para a **versão mais recente publicada**: o link nunca muda de uma atualização para outra. Você pode copiar e mandar este endereço direto para seus amigos ou colegas de equipe:

- **Link direto do Instalador**: `https://github.com/jotasrn/Fatal-Error/releases/latest/download/Fatal-Error-Setup.exe`
- **Link direto do Portátil (`.zip`)**: `https://github.com/jotasrn/Fatal-Error/releases/latest/download/Fatal-Error-Portable.zip`

> **Por que o `.exe` não fica solto na raiz do repositório Git?**
> O GitHub bloqueia binários grandes no histórico do Git e manter um `.exe` antigo versionado faria as pessoas baixarem versões desatualizadas sem auto-update. Todas as builds oficiais ficam publicadas em **[GitHub Releases](https://github.com/jotasrn/Fatal-Error/releases/latest)**, compiladas automaticamente pela pipeline verificada do GitHub Actions.

---

## Qual versão escolher?

| Característica | Instalador (`Fatal-Error-Setup.exe`) | Portátil (`Fatal-Error-Portable.zip`) |
| --- | --- | --- |
| **Instalação** | Assistente rápido; cria atalho na Área de Trabalho e no Menu Iniciar | Basta extrair o `.zip` em qualquer pasta e abrir `Fatal Error.exe` |
| **Atualização Automática** | **Sim** (baixa novas versões sozinho em segundo plano) | **Não** (para atualizar, baixe o `.zip` novo manualmente) |
| **Exige Administrador?** | Não (instala no perfil do próprio usuário) | Não |
| **Recomendação** | **Melhor opção para todos os jogadores** | Útil para pendrive ou máquinas com bloqueio de instaladores |

---

## Passo a Passo de Instalação

1. Baixe o **[`Fatal-Error-Setup.exe`](https://github.com/jotasrn/Fatal-Error/releases/latest/download/Fatal-Error-Setup.exe)** clicando no botão verde no topo desta página.
2. Dê um duplo clique no arquivo baixado.
3. **Aviso do Windows SmartScreen**: na primeira instalação, o Windows pode exibir a tela azul *"O Windows protegeu o computador"*. Isso é normal em projetos independentes sem certificado comercial EV pago:
   - Clique em **Mais informações**;
   - Em seguida, clique no botão **Executar assim mesmo**.
4. Escolha a pasta de instalação (ou mantenha a padrão) e conclua o assistente.
5. **Permissão do Firewall do Windows**: ao entrar no modo Online pela primeira vez, caso o Windows pergunte se o `Fatal Error` pode se comunicar em redes privadas/públicas, marque **Permitir acesso** — o jogo usa conexão P2P direta entre os jogadores, sem servidor central.

---

## Como Jogar Online com os Colegas

No menu principal do jogo, clique em **JOGAR ONLINE**:

1. **Escolha o Modo de Rede**:
   - **Global (P2P Hyperswarm)**: recomendado para jogar de casa, fibra ou 4G com amigos em qualquer lugar, sem configurar roteador.
   - **Rede Interna / Corporativa (`GDFNet`)**: recomendado quando todos estão em uma rede corporativa/empresarial cujo firewall bloqueia tráfego UDP/DHT externo.
2. **Entrar ou Criar Sala**:
   - **Partida Rápida**: entra automaticamente em uma sala pública aberta (ou cria uma se não houver nenhuma).
   - **Criar Sala**: escolha o mapa (ex.: *Brasília · Eixo Monumental*) e defina se a sala será pública ou privada. Um **código de 5 letras** aparecerá na tela.
   - **Entrar com Código**: digite o código de 5 letras enviado pelo seu colega para cair direto na mesma sala.

---

## Como Funciona a Atualização Automática

Quem instalou pelo **`Fatal-Error-Setup.exe` não precisa baixar mais nada manualmente**:

- O jogo procura versões novas **15 segundos após abrir** e depois a cada **4 horas**.
- Quando encontra uma atualização no GitHub Releases, faz o download silenciosamente em segundo plano.
- **Partidas nunca são interrompidas**: se você estiver no meio de uma partida Solo ou Online, o jogo aguarda até você voltar ao menu ou fechar o aplicativo para aplicar a nova versão.
- Mais detalhes técnicos em [`docs/ATUALIZACAO.md`](../docs/ATUALIZACAO.md).

---

## Conferir a Integridade do Download (Opcional)

Toda versão publica um arquivo [`SHA256SUMS.txt`](https://github.com/jotasrn/Fatal-Error/releases/latest/download/SHA256SUMS.txt) gerado durante o build oficial no GitHub Actions. Para conferir no PowerShell:

```powershell
Get-FileHash .\Fatal-Error-Setup.exe -Algorithm SHA256
```

Compare o valor `Hash` exibido com a linha correspondente em [`SHA256SUMS.txt`](https://github.com/jotasrn/Fatal-Error/releases/latest/download/SHA256SUMS.txt).

---

## Onde Ficam Seus Dados e Logs

Cole `%APPDATA%\fatal-error` na barra de endereços do Explorador de Arquivos (`Win + R` → `%APPDATA%\fatal-error`) para acessar:

| Caminho | Finalidade |
| --- | --- |
| `%APPDATA%\fatal-error\` | Configurações locais e cache de atualização do aplicativo |
| `%APPDATA%\fatal-error\fatal-error.log` | Log de diagnóstico de inicialização, rede P2P e auto-updater |
| `%APPDATA%\fatal-error\gpu-flags.txt` | *(Opcional)* Arquivo avançado para flags gráficas permitidas pela whitelist de segurança |

---

## Desinstalar

Abra **Configurações do Windows → Aplicativos → Aplicativos instalados → Fatal Error → Desinstalar**.
Para remover também logs e configurações locais, apague a pasta `%APPDATA%\fatal-error` após desinstalar.

---

## Problemas Comuns e Soluções

| Sintoma | Como resolver |
| --- | --- |
| **"O Windows protegeu o computador" (SmartScreen)** | Clique em **Mais informações** → **Executar assim mesmo**. |
| **Antivírus colocou o instalador em quarentena** | Falso-positivo comum em executáveis sem assinatura EV paga. Confira o hash no `SHA256SUMS.txt` e permita o arquivo, ou baixe o `Fatal-Error-Portable.zip`. |
| **Não encontra a sala do colega no modo Global** | Verifique se ambos permitiram o `Fatal Error` no Firewall do Windows e estão na mesma versão. Se estiverem em rede empresarial restrita, mudem para o modo **Rede Interna / Corporativa (`GDFNet`)**. |
| **Queda de FPS em notebooks com vídeo integrado** | O jogo já possui ajuste automático de resolução; feche abas pesadas do navegador em segundo plano para liberar memória de vídeo (VRAM). |
| **O jogo não abre ou apresenta erro inesperado** | Anexe o arquivo `%APPDATA%\fatal-error\fatal-error.log` ao abrir uma [Issue no GitHub](https://github.com/jotasrn/Fatal-Error/issues). |
