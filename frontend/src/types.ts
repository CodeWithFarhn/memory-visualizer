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

export const PROCESS_COLORS: Record<string, string> = {
  P1: 'var(--p1-color)',
  P2: 'var(--p2-color)',
  P3: 'var(--p3-color)',
  P4: 'var(--p4-color)',
  P5: 'var(--p5-color)'
}

export const PROCESS_BGS: Record<string, string> = {
  P1: 'var(--p1-bg)',
  P2: 'var(--p2-bg)',
  P3: 'var(--p3-bg)',
  P4: 'var(--p4-bg)',
  P5: 'var(--p5-bg)'
}
