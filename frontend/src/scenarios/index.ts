import { Scenario, ScenarioStep } from '../types';

// Kept for backwards compatibility with useSSE.ts
export type Annotation = {
  trigger: 'fault' | 'hit' | 'frame_update' | 'process_update'
  text: string
}

export type { Scenario, ScenarioStep };

export const scenarios: Scenario[] = [
  {
    id: 1,
    name: 'Empty Memory',
    description: 'Baseline — observe how frames start unallocated before any process runs',
    difficulty: 'Beginner',
    estimated_time: '~1 minute',
    concept_tag: 'Basics',
    steps: [
      {
        narration_heading: 'Physical memory at rest',
        narration_body: 'This is physical memory — 8 empty frames, each one a slot where a page can live. Think of frames as numbered parking spaces. Right now we have {{frames.free}} empty spaces.',
        commands: [
          { cmd: 'reset', delay: 0 },
          { cmd: 'frames 8', delay: 300 },
          { cmd: 'algo fifo', delay: 600 }
        ],
        wait_for_event: null,
        highlight: {}
      },
      {
        narration_heading: 'A process arrives',
        narration_body: 'P1 has arrived and needs 3 pages. Watch each page claim a frame — pages 0, 1, and 2 each get their own slot. Since there is plenty of space, every access loads without any eviction.',
        commands: [
          { cmd: 'add P1 3', delay: 0 }
        ],
        wait_for_event: 'spawn',
        highlight: { highlight_frame: [0, 1, 2] }
      },
      {
        narration_heading: 'Pages resident in memory',
        narration_body: "P1's pages are now resident in memory. Any access to these pages will be a fast hit. Notice the green dots on the reference string: every access was satisfied immediately, giving us {{stats.hits}} hits and a {{stats.hit_ratio}} hit ratio so far!",
        commands: [],
        wait_for_event: 'frame_update',
        highlight: { highlight_stat: 'hit_ratio' }
      }
    ]
  },
  {
    id: 2,
    name: 'Demand Paging',
    description: 'Pages load only when first accessed — no preloading',
    difficulty: 'Beginner',
    estimated_time: '~2 minutes',
    concept_tag: 'Demand Paging',
    steps: [
      {
        narration_heading: 'What is demand paging?',
        narration_body: 'Demand paging means pages are only loaded when actually accessed — not all at once when the process starts. This conserves memory for processes that never use all their pages.',
        commands: [
          { cmd: 'reset', delay: 0 },
          { cmd: 'frames 8', delay: 300 },
          { cmd: 'algo fifo', delay: 600 }
        ],
        wait_for_event: null,
        highlight: {}
      },
      {
        narration_heading: 'Two processes, plenty of room',
        narration_body: 'Two processes are running. Both fit comfortably in the available frames. Watch the grid fill gradually — each page loads only when the process first touches it.',
        commands: [
          { cmd: 'add P1 3', delay: 0 },
          { cmd: 'add P2 2', delay: 800 }
        ],
        wait_for_event: 'spawn',
        highlight: {}
      },
      {
        narration_heading: 'All hits — efficient operation',
        narration_body: 'All accesses are hits — green dots across the board. When there is enough memory, the system runs efficiently. The hit ratio should be at or near 100%.',
        commands: [],
        wait_for_event: 'frame_update',
        highlight: { highlight_stat: 'hit_ratio' }
      }
    ]
  },
  {
    id: 3,
    name: 'Memory Becomes Full',
    description: 'Observe capacity limits as frames fill to maximum',
    difficulty: 'Intermediate',
    estimated_time: '~2 minutes',
    concept_tag: 'Capacity',
    steps: [
      {
        narration_heading: 'A small frame pool',
        narration_body: "We are starting with a small frame pool — only 4 slots. This is intentionally tight to show what happens when memory runs out.",
        commands: [
          { cmd: 'reset', delay: 0 },
          { cmd: 'frames 4', delay: 300 },
          { cmd: 'algo fifo', delay: 600 }
        ],
        wait_for_event: null,
        highlight: {}
      },
      {
        narration_heading: 'Frames filling up',
        narration_body: 'Processes are being added. Watch the frame grid fill up — each new page access claims one of the limited slots. The green dots show clean initial loads.',
        commands: [
          { cmd: 'add P1 3', delay: 0 },
          { cmd: 'add P2 2', delay: 1000 }
        ],
        wait_for_event: 'spawn',
        highlight: {}
      },
      {
        narration_heading: 'Memory at capacity',
        narration_body: 'All frames are now occupied. The next page access cannot find a free slot. The system is at capacity — something must give.',
        commands: [],
        wait_for_event: 'frame_update',
        highlight: { highlight_frame: [0, 1, 2, 3] }
      },
      {
        narration_heading: 'Faults begin',
        narration_body: 'When capacity is reached, every new page access becomes a fault. The system must now make difficult choices about what stays in memory and what gets evicted. Watch the fault count climb.',
        commands: [
          { cmd: 'add P1 5', delay: 0 }
        ],
        wait_for_event: 'fault',
        highlight: { highlight_stat: 'fault_count' }
      }
    ]
  },
  {
    id: 4,
    name: 'Page Fault and Replacement',
    description: 'See eviction in action when memory is full and a new page is needed',
    difficulty: 'Intermediate',
    estimated_time: '~3 minutes',
    concept_tag: 'Page Fault',
    steps: [
      {
        narration_heading: 'Setting the scene',
        narration_body: 'We have 4 physical frames and a process that needs 6 pages. All frame slots are empty right now — shown as grey cards in the grid. Watch what happens as P1 starts accessing pages.',
        commands: [
          { cmd: 'reset', delay: 0 },
          { cmd: 'frames 4', delay: 300 },
          { cmd: 'algo fifo', delay: 600 },
          { cmd: 'add P1 6', delay: 1000 }
        ],
        wait_for_event: 'spawn',
        highlight: {}
      },
      {
        narration_heading: 'Memory filling up',
        narration_body: 'P1 is accessing pages one by one. Each new page gets loaded into an empty frame — no problem yet. Notice the frame cards turning blue as each page claims a slot.',
        commands: [],
        wait_for_event: 'frame_update',
        highlight: { highlight_ref_index: [0, 1, 2, 3] }
      },
      {
        narration_heading: 'All frames are full',
        narration_body: 'All 4 frames are now occupied. P1 needs to access another page, but there is no empty slot left. This triggers a page fault — shown as a red dot on the reference string. The system must now evict an existing page to make room.',
        commands: [],
        wait_for_event: 'fault',
        highlight: { highlight_stat: 'fault_count' }
      },
      {
        narration_heading: 'The replacement decision',
        narration_body: 'Using FIFO, the system chose the frame loaded first as the victim — it was loaded first, so it leaves first. Watch it flash and clear, then the new page slides in. This eviction is the cost of a page fault.',
        commands: [],
        wait_for_event: 'frame_update',
        highlight: { highlight_frame: [0] }
      },
      {
        narration_heading: 'Understanding the cost',
        narration_body: 'Every red dot in the reference string is a fault — a slow, expensive operation. Every green dot is a hit — fast, the page was already loaded. Your hit ratio below shows how efficiently memory is being used. A high fault rate means the process needs more frames than it has.',
        commands: [],
        wait_for_event: null,
        highlight: { highlight_stat: 'hit_ratio' }
      }
    ]
  },
  {
    id: 5,
    name: 'FIFO vs LRU',
    description: 'Run the same reference string with two algorithms — see the difference',
    difficulty: 'Advanced',
    estimated_time: '~4 minutes',
    concept_tag: 'LRU',
    steps: [
      {
        narration_heading: 'Two algorithms, same data',
        narration_body: 'We will run the same reference string twice — first with FIFO, then with LRU. Watch how the fault count differs. Both see identical page requests; only the replacement logic changes.',
        commands: [
          { cmd: 'reset', delay: 0 },
          { cmd: 'frames 3', delay: 300 },
          { cmd: 'algo fifo', delay: 600 },
          { cmd: 'add P1 5', delay: 1000 }
        ],
        wait_for_event: 'spawn',
        highlight: {}
      },
      {
        narration_heading: 'FIFO in action',
        narration_body: 'FIFO evicts whichever page has been in memory the longest — regardless of whether it is still being used. Sometimes this evicts a page that will be needed again very soon, causing an immediate re-fault.',
        commands: [],
        wait_for_event: 'fault',
        highlight: { highlight_stat: 'fault_count' }
      },
      {
        narration_heading: 'Switching to LRU',
        narration_body: 'Now we reset and run the same workload with LRU. LRU evicts the page that has not been accessed for the longest time. It uses recent history as a predictor of future use.',
        commands: [
          { cmd: 'reset', delay: 0 },
          { cmd: 'frames 3', delay: 300 },
          { cmd: 'algo lru', delay: 600 },
          { cmd: 'add P1 5', delay: 1000 }
        ],
        wait_for_event: 'fault',
        highlight: {}
      },
      {
        narration_heading: 'Compare the results',
        narration_body: 'Compare the fault counts between runs. LRU usually wins — but not always. The best algorithm depends on the access pattern. For sequential scans, FIFO can actually perform better.',
        commands: [],
        wait_for_event: null,
        highlight: { highlight_stat: 'hit_ratio' }
      }
    ]
  },
  {
    id: 6,
    name: 'Thrashing',
    description: 'Too many processes, too few frames — watch the system thrash',
    difficulty: 'Advanced',
    estimated_time: '~3 minutes',
    concept_tag: 'Thrashing',
    steps: [
      {
        narration_heading: 'Setting up to thrash',
        narration_body: 'Thrashing occurs when a process needs far more pages than the available frames can hold. We will create exactly this condition — 3 processes each needing 4 pages, but only 4 frames total.',
        commands: [
          { cmd: 'reset', delay: 0 },
          { cmd: 'frames 4', delay: 300 },
          { cmd: 'algo lru', delay: 600 }
        ],
        wait_for_event: null,
        highlight: {}
      },
      {
        narration_heading: 'The system begins to struggle',
        narration_body: 'Watch the frame grid — pages are being evicted almost immediately after loading. The replacement thread is running constantly. Each process keeps evicting the other processes\' pages.',
        commands: [
          { cmd: 'add P1 4', delay: 0 },
          { cmd: 'add P2 4', delay: 800 },
          { cmd: 'add P3 4', delay: 1600 }
        ],
        wait_for_event: 'fault',
        highlight: { highlight_frame: [0, 1, 2, 3] }
      },
      {
        narration_heading: 'Fault count climbing',
        narration_body: 'Look at the fault count climbing rapidly. The hit ratio is collapsing. The process spends more time waiting for page loads than actually executing.',
        commands: [],
        wait_for_event: 'fault',
        highlight: { highlight_stat: 'fault_count' }
      },
      {
        narration_heading: 'Thrashing is unavoidable here',
        narration_body: 'This is thrashing. Real operating systems detect this condition and either suspend the process or allocate it more frames. With a fixed frame pool of 4 and 12 pages needed across 3 processes, there is no escape. The only fix is more memory or fewer processes.',
        commands: [],
        wait_for_event: null,
        highlight: { highlight_stat: 'hit_ratio', highlight_log: true }
      }
    ]
  }
];
