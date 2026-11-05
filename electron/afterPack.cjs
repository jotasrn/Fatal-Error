'use strict';
/**
 * Grava os fuses de seguranca do Electron direto no binario empacotado (modelo Concord).
 *
 * Fuses sao interruptores gravados no proprio executavel: uma vez desligados no build,
 * nenhuma variavel de ambiente ou argumento de linha de comando consegue reativa-los.
 */
const { join } = require('node:path');

module.exports = async function afterPack(context) {
  const { FuseV1Options, FuseVersion, flipFuses } = require('@electron/fuses');

  const plataforma = context.electronPlatformName;
  const nome =
    plataforma === 'darwin'
      ? join(`${context.packager.appInfo.productFilename}.app`)
      : `${context.packager.appInfo.productFilename}${plataforma === 'win32' ? '.exe' : ''}`;
  const executavel = join(context.appOutDir, nome);

  await flipFuses(executavel, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: false,

    // Impede que ELECTRON_RUN_AS_NODE=1 transforme o jogo num interpretador Node irrestrito.
    [FuseV1Options.RunAsNode]: false,

    // Bloqueia argumentos --inspect e NODE_OPTIONS para evitar injecao/leitura de memoria.
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,

    // So carrega codigo de dentro do app.asar (impede sideload de arquivos soltos).
    [FuseV1Options.OnlyLoadAppFromAsar]: true,

    // Valida integridade criptografica (hash) do app.asar na inicializacao.
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,

    // Criptografa armazenamento de sessao/cookies via DPAPI do sistema operacional.
    [FuseV1Options.EnableCookieEncryption]: true,
  });

  console.log(`[security] Electron fuses aplicados em ${executavel}`);
};

