import { useState, useCallback } from 'react';

export function useCommand() {
  const [history, setHistory] = useState<string[]>([]);

  const sendCommand = useCallback(async (cmd: string) => {
    try {
      await fetch('/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command: cmd })
      });
      setHistory(prev => {
        const newHist = [cmd, ...prev.filter(c => c !== cmd)].slice(0, 10);
        return newHist;
      });
    } catch (e) {
      console.error("Failed to send command", e);
    }
  }, []);

  return { sendCommand, history };
}