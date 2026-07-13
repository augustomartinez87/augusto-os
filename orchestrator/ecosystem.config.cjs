const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "orch-sync",
      // Fix 2026-07-09 (Cowork): el approach anterior (replicar a mano los flags
      // --require preflight.cjs / --import loader.mjs que tsx usa internamente,
      // para que pm2 spawneara node DIRECTO sin pasar por cli.mjs) dejó de
      // funcionar de forma SILENCIOSA bajo Node 24.13.0 — pm2 mostraba el proceso
      // "online" y con memoria estable, pero nunca ejecutaba una sola línea de
      // sync.ts (cero logs, ni siquiera el de arranque). No se pudo diagnosticar
      // la causa exacta sin acceso a la máquina; confirmado por descarte: `pm2 kill`
      // (reinicio total del daemon, para descartar PATH/env viejo del daemon) no
      // lo arregló, pero `npm run sync` corrido directo (que sí pasa por cli.mjs)
      // anduvo perfecto al toque.
      //
      // Este approach apunta pm2 directo a tsx/dist/cli.mjs (lo mismo que hace
      // `npm run sync` por debajo). Trade-off conocido (ver nota vieja abajo):
      // cli.mjs re-spawnea un proceso node hijo que NO hereda windowsHide, así
      // que puede abrirse una consola visible para ese hijo. Se prioriza que
      // ANDE sobre que sea invisible — si el flicker de consola molesta, retomar
      // el approach de flags a mano pero investigando en la máquina real por qué
      // rompió con Node 24 (probablemente cli.mjs eligió otro flag/orden vs. lo
      // hardcodeado acá — ver tsx/dist/cli.mjs, función que arma
      // ["--require", "preflight.cjs", ...(interactive ? ["--require","patch-repl.cjs"] : []),
      // supportsImport ? "--import" : "--loader", "loader.mjs", ...args]).
      script: path.join(__dirname, "node_modules", "tsx", "dist", "cli.mjs"),
      interpreter: "node",
      args: ["--env-file=.env", "src/sync.ts"],
      cwd: __dirname,
      windowsHide: true,
    },
  ],
};
