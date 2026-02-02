import { DownloadItem, BatchJob } from '@/types';

const HISTORY_KEY = 'download_history';
const BATCH_JOBS_KEY = 'batch_jobs';

export function getHistory(): DownloadItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function addToHistory(item: DownloadItem): void {
  if (typeof window === 'undefined') return;
  try {
    const history = getHistory();
    history.unshift(item);
    // 只保留最近100条
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
  } catch {
    console.error('Failed to save to history');
  }
}

export function removeFromHistory(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const history = getHistory();
    const filtered = history.filter(item => item.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
  } catch {
    console.error('Failed to remove from history');
  }
}

export function clearHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    console.error('Failed to clear history');
  }
}

export function getBatchJobs(): BatchJob[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(BATCH_JOBS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveBatchJob(job: BatchJob): void {
  if (typeof window === 'undefined') return;
  try {
    const jobs = getBatchJobs();
    jobs.unshift(job);
    localStorage.setItem(BATCH_JOBS_KEY, JSON.stringify(jobs.slice(0, 20)));
  } catch {
    console.error('Failed to save batch job');
  }
}
