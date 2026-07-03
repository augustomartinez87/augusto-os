import { execa } from 'execa'

// Run npm test as a subprocess and log NODE_OPTIONS + result
const env = { ...process.env }
console.log('NODE_OPTIONS in parent:', env.NODE_OPTIONS)

const result = await execa('node', ['-e', 'console.log("NODE_OPTIONS in child:", process.env.NODE_OPTIONS)'], {
  reject: false,
  all: true,
  env,
})
console.log(result.all)

const testResult = await execa('npm', ['run', 'test'], {
  cwd: 'C:/Users/Augusto/Downloads/Proyectos/augusto-os/orchestrator',
  reject: false,
  all: true,
  env,
})
console.log('TEST EXIT CODE:', testResult.exitCode)
const lines = (testResult.all ?? '').split('\n')
lines.slice(-5).forEach(l => console.log(l))
