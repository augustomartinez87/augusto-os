export interface ScoutTask {
  objetivo: string
  repoRoot: string
  focus: 'mapa' | 'detective' | 'riesgos'
}

export interface EvidenceItem {
  path: string
  simbolo: string
  lineas: string
  explicacion: string
  confianza: number
}

export interface ScoutReport {
  objetivo: string
  archivos: string[]
  patrones: string[]
  dependencias: string[]
  riesgos: string[]
  evidencia: EvidenceItem[]
  resumen: string
}

export interface ScoutProvider {
  name: string
  investigate(task: ScoutTask): Promise<ScoutReport>
}
