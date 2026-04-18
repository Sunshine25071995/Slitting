import { JobCard, SlittingEntry } from "../types";

export type SyncType = 'JOB_SUMMARY' | 'PRODUCTION_ENTRY';

export async function syncToGoogleSheets(data: Partial<JobCard> | Partial<SlittingEntry>, type: SyncType) {
  try {
    const response = await fetch('/api/sync-to-sheets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data, type }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to sync to Google Sheets');
    }

    return await response.json();
  } catch (error) {
    console.error('Sync error:', error);
    throw error;
  }
}
