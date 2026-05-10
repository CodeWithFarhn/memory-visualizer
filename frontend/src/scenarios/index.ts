export type Annotation = {
  trigger: 'fault' | 'hit' | 'frame_update' | 'process_update'
  text: string
}

export type ScenarioCommand = {
  cmd: string
  delay: number
}

export type Scenario = {
  id: number
  name: string
  description: string
  commands: ScenarioCommand[]
  annotations: Annotation[]
}

export const scenarios: Scenario[] = [
  {
    id: 1,
    name: 'Empty Memory',
    description: 'Baseline — observe how frames start unallocated',
    commands: [
      { cmd: 'reset', delay: 0 },
      { cmd: 'frames 8', delay: 500 },
      { cmd: 'algo fifo', delay: 800 }
    ],
    annotations: [
      {
        trigger: 'frame_update',
        text: 'All frames are FREE. No pages are loaded. This is the initial state before any process requests memory.'
      }
    ]
  },
  {
    id: 2,
    name: 'Enough Free Memory',
    description: 'Demand paging — pages load on first access without eviction',
    commands: [
      { cmd: 'reset', delay: 0 },
      { cmd: 'frames 8', delay: 500 },
      { cmd: 'algo fifo', delay: 800 },
      { cmd: 'add P1 3', delay: 1200 }
    ],
    annotations: [
      {
        trigger: 'fault',
        text: 'A page fault occurs when the requested page is not in memory. Since there are free frames available, the OS simply loads the page — no eviction needed.'
      },
      {
        trigger: 'hit',
        text: 'A page hit! The requested page is already in a frame. No disk I/O required — this is fast.'
      }
    ]
  },
  {
    id: 3,
    name: 'Memory Becomes Full',
    description: 'Capacity limits — watch frames fill up one by one',
    commands: [
      { cmd: 'reset', delay: 0 },
      { cmd: 'frames 4', delay: 500 },
      { cmd: 'algo fifo', delay: 800 },
      { cmd: 'add P1 3', delay: 1200 },
      { cmd: 'add P2 2', delay: 2000 }
    ],
    annotations: [
      {
        trigger: 'fault',
        text: 'Each new page access causes a fault and occupies a free frame. Watch as frames fill up.'
      },
      {
        trigger: 'frame_update',
        text: 'Memory is now full. The next fault will require evicting an existing page — the replacement algorithm decides which one.'
      }
    ]
  },
  {
    id: 4,
    name: 'Page Fault and Replacement',
    description: 'See eviction in action when memory is full',
    commands: [
      { cmd: 'reset', delay: 0 },
      { cmd: 'frames 4', delay: 500 },
      { cmd: 'algo fifo', delay: 800 },
      { cmd: 'add P1 6', delay: 1000 }
    ],
    annotations: [
      {
        trigger: 'fault',
        text: 'A page fault occurs when the requested page is not loaded in any frame. The OS must now choose a victim frame to evict.'
      },
      {
        trigger: 'hit',
        text: 'Page hit — the page is already resident in memory. No eviction or disk I/O needed.'
      }
    ]
  },
  {
    id: 5,
    name: 'FIFO vs LRU Comparison',
    description: 'Compare replacement algorithms on the same reference string',
    commands: [
      { cmd: 'reset', delay: 0 },
      { cmd: 'frames 3', delay: 500 },
      { cmd: 'algo fifo', delay: 800 },
      { cmd: 'add P1 5', delay: 1200 }
    ],
    annotations: [
      {
        trigger: 'fault',
        text: 'FIFO evicts the page that has been in memory the longest — regardless of how recently it was used. This can lead to Belady\'s Anomaly.'
      }
    ]
  },
  {
    id: 6,
    name: 'Thrashing',
    description: 'Too many processes, too few frames — watch the system thrash',
    commands: [
      { cmd: 'reset', delay: 0 },
      { cmd: 'frames 4', delay: 500 },
      { cmd: 'algo lru', delay: 800 },
      { cmd: 'add P1 4', delay: 1200 },
      { cmd: 'add P2 4', delay: 1800 },
      { cmd: 'add P3 4', delay: 2400 }
    ],
    annotations: [
      {
        trigger: 'fault',
        text: 'Thrashing occurs when the OS spends more time paging than executing processes. Each process constantly evicts pages that another process needs.'
      },
      {
        trigger: 'hit',
        text: 'Rare hits occur, but faults dominate. The CPU is mostly idle, waiting for pages to be loaded from disk.'
      }
    ]
  }
]
