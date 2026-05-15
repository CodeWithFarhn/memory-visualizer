export type FrameState = {
  id: number
  process: string | null
  page: number | null
  status: 'free' | 'occupied' | 'fault' | 'hit'
}

export type ProcessState = {
  name: string
  pid: number
  pages_requested: number
  frames_held: number
  rss?: string
}

export type LogEntry = {
  module: string
  message: string
  timestamp: string
}

export type ReferenceEntry = {
  page: number
  process: string
  type: 'fault' | 'hit' | 'pending'
}

export type Stats = {
  total: number
  hits: number
  faults: number
  algorithm: string
}

export type MemInfo = {
  total: string
  used: string
  free: string
}

export type AppState = {
  frames: FrameState[]
  processes: ProcessState[]
  logs: LogEntry[]
  references: ReferenceEntry[]
  currentRefIndex: number
  stats: Stats
  meminfo: MemInfo
  connectionStatus: 'connected' | 'disconnected'
}

// Scenario step highlight targets
export type ScenarioHighlight = {
  highlight_frame?: number[]
  highlight_ref_index?: number[]
  highlight_stat?: string
  highlight_log?: boolean
}

// Single narrated step in a scenario
export type ScenarioStep = {
  narration_heading: string
  narration_body: string
  commands: { cmd: string; delay: number }[]
  wait_for_event: string | null
  highlight: ScenarioHighlight
}

// Full scenario definition
export type Scenario = {
  id: number
  name: string
  description: string
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced'
  estimated_time: string
  concept_tag: string
  steps: ScenarioStep[]
}

export const PROCESS_COLORS: Record<string, string> = {
  P1: '#2563EB',
  P2: '#D97706',
  P3: '#059669',
  P4: '#E11D48',
  P5: '#7C3AED'
}

export const PROCESS_BGS: Record<string, string> = {
  P1: 'rgba(37,99,235,0.1)',
  P2: 'rgba(217,119,6,0.1)',
  P3: 'rgba(5,150,105,0.1)',
  P4: 'rgba(225,29,72,0.1)',
  P5: 'rgba(124,58,237,0.1)'
}
