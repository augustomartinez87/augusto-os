const path = require("node:path");
const { pathToFileURL } = require("node:url");

const tsxDist = path.join(__dirname, "node_modules", "tsx", "dist");
const tsxPreflight = path.join(tsxDist, "preflight.cjs");
const tsxLoader = pathToFileURL(path.join(tsxDist, "loader.mjs")).href;

module.exports = {
  apps: [
    {
      name: "orch-sync",
      // Corre el mismo entry point que node_modules/.bin/tsx.cmd usa internamente
      // (--require preflight.cjs --import loader.mjs), pero invocado DIRECTO por pm2
      // en vez de a través de tsx/dist/cli.mjs. cli.mjs hace su propio re-exec a un
      // proceso node hijo vía child_process.spawn SIN windowsHide, lo que abre una
      // consola visible que pm2 no puede controlar (windowsHide solo aplica al
      // proceso que pm2 spawnea directamente). Invocando node con estos flags acá,
      // pm2 spawnea el worker real sin wrapper de por medio.
      script: "src/sync.ts",
      interpreter: "node",
      interpreter_args: [
        "--require", tsxPreflight,
        "--import", tsxLoader,
        "--env-file=.env",
      ],
      cwd: __dirname,
      windowsHide: true,
    },
  ],
};
