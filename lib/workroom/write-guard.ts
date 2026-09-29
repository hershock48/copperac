import 'server-only';
import { NextResponse } from 'next/server';
import { connectionVar } from './store';

/** Local demos may use memory. Production must never report a volatile save. */
export function unavailableWrite() {
  if (process.env.NODE_ENV === 'production' && !connectionVar()) {
    return NextResponse.json({ error: 'Saving is unavailable until persistent storage is connected. Your changes have not been saved.' }, { status: 503 });
  }
  return null;
}
