const WORKER_URL = 'https://ape-coach-invite.narbehousellc.workers.dev';

export interface CoachInvite {
  id: string;
  coachEmail: string;
  coachName: string;
  clientEmail: string;
  createdAt: string;
}

export async function sendCoachInvite(
  coachEmail: string,
  coachName: string,
  clientEmail: string,
  accessToken: string,
): Promise<void> {
  const res = await fetch(`${WORKER_URL}/coach-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ coachEmail, coachName, clientEmail }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to send invite' }));
    throw new Error(err.error || 'Failed to send invite');
  }
}

export async function getPendingInvites(clientEmail: string, accessToken: string): Promise<CoachInvite[]> {
  const res = await fetch(`${WORKER_URL}/coach-invite?email=${encodeURIComponent(clientEmail)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch invites');
  const data = await res.json();
  return data.invites || [];
}

export async function removeInvite(inviteId: string, clientEmail: string, accessToken: string): Promise<void> {
  await fetch(`${WORKER_URL}/coach-invite/${inviteId}?email=${encodeURIComponent(clientEmail)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
