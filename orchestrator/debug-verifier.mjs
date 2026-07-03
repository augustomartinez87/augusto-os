import { execa } from 'execa'

const result = await execa('npm', ['run', 'test'], {
  cwd: 'C:/Users/Augusto/Downloads/Proyectos/augusto-os/orchestrator',
  reject: false,
  all: true,
  env: { ...process.env },
})

console.log('EXIT CODE:', result.exitCode)
console.log('--- OUTPUT LAST 30 LINES ---')
const lines = (result.all ?? '').split('\n')
lines.slice(-30).forEach(l => console.log(l))
