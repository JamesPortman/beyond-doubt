import * as P from './protocol.js';

/** Thin typed wrapper. Note what it cannot do: submit a score, submit a time, or ask for
 *  a specific seed. Those are server concerns and there is no method for them. */
export class Api {
  token: string | null = null;
  user: P.PublicUser | null = null;

  constructor(public base: string) {
    try { this.token = globalThis.localStorage?.getItem('clues.token') ?? null; } catch { /* ignore */ }
  }

  get signedIn(): boolean { return !!this.token; }

  private async call<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
    const res = await fetch(this.base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    });
    const data = await res.json().catch(() => ({ error: 'bad-response' }));
    if (!res.ok) throw new ApiError((data as P.ApiErrorBody).error ?? 'error', res.status);
    return data as T;
  }

  requestCode(email: string) { return this.call<P.AuthRequestResult>('/api/auth/request', { email }); }

  async verify(email: string, code: string, displayName?: string): Promise<P.PublicUser> {
    const r = await this.call<P.AuthVerifyResult>('/api/auth/verify', { email, code, displayName });
    this.token = r.token;
    this.user = r.user;
    try { globalThis.localStorage?.setItem('clues.token', r.token); } catch { /* ignore */ }
    return r.user;
  }

  async me(): Promise<P.PublicUser | null> {
    if (!this.token) return null;
    try { this.user = await this.call<P.PublicUser>('/api/me'); return this.user; }
    catch { this.signOut(); return null; }
  }

  signOut(): void {
    this.token = null; this.user = null;
    try { globalThis.localStorage?.removeItem('clues.token'); } catch { /* ignore */ }
  }

  start(body: P.StartBody) { return this.call<P.StartResult>('/api/play/start', body); }
  move(body: P.MoveBody) { return this.call<P.MoveAck>('/api/play/move', body); }
  hint(playId: string) { return this.call<P.HintResult>('/api/play/hint', { playId }); }
  archive(body: P.ArchiveBody) { return this.call<P.ArchiveResult>('/api/archive', body); }
  roomJoin(body: P.RoomJoinBody) { return this.call<P.RoomJoinResult>('/api/room/join', body); }
  roomHeartbeat(roomId: string, focusCell: number | null) {
    return this.call<P.RoomHeartbeatResult>('/api/room/heartbeat', { roomId, focusCell });
  }
  today() { return this.call<P.TodayResult>('/api/today', undefined, 'GET'); }
  board(editionId: string) { return this.call<P.BoardResult>(`/api/board?editionId=${encodeURIComponent(editionId)}`, undefined, 'GET'); }
  week(weekId: string) { return this.call<P.WeekResult>(`/api/week?weekId=${encodeURIComponent(weekId)}`, undefined, 'GET'); }

  async reachable(): Promise<boolean> {
    try { await this.today(); return true; } catch { return false; }
  }
}

export class ApiError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}

export function defaultApiBase(): string {
  const loc = globalThis.location;
  if (loc && /^https?:$/.test(loc.protocol)) return loc.origin;
  return 'http://localhost:8787';
}
