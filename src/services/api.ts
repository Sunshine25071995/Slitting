import { JobCard, SlittingEntry } from "../types";

export type SyncType = 'JOB_SUMMARY' | 'PRODUCTION_ENTRY' | 'PRODUCTION_BATCH';

export async function syncToGoogleSheets(data: any, type: SyncType) {
  try {
    const response = await fetch('/api/sync-to-sheets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data, type }),
    });

    const contentType = response.headers.get('content-type');
    let errorMessage = '';
    
    if (!response.ok) {
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json();
        errorMessage = errorData.error || `Sync failed with status: ${response.status}`;
      } else {
        const text = await response.text();
        errorMessage = `Server Error: ${response.status}. The server returned an unexpected response format. This often happens if the backend is starting up or has crashed.`;
        console.error('Non-JSON error response:', text);
      }
      throw new Error(errorMessage);
    }

    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    
    return { success: true };
  } catch (error) {
    console.error('Sync error:', error);
    throw error;
  }
}
