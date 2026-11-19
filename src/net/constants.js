export const LOCAL = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|.*\.local)$/.test(location.hostname);
export const PREFIX = LOCAL ? 'fatalerrordev-' : 'fatalerror-';
export const LEGACY_PREFIX = 'doodledistrict-';
export const PUBLIC_SLOTS = 12;
export const GDF_PUBLIC_SLOTS = 8;
export const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const makeCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

export const WAN_PEER_OPTS = {
  debug: 0,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ],
  },
};

export const LAN_PEER_OPTS = {
  debug: 0,
  config: { iceServers: [] },
};

export const JOIN_TIMEOUT = 12000;
export const QUICK_TIMEOUT = 8000;
export const SIGNAL_TIMEOUT = 9000;

export function isLikelyLanCode(raw) {
  if (typeof raw !== 'string') return false;
  const s = raw.trim().toUpperCase();
  if (!s) return false;
  if (/^(GDF|LAN)-?[A-Z0-9]+$/.test(s)) return true;
  if (/^G[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}(-\d+)?$/.test(s)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d{2,5})?$/.test(s)) return true;
  return false;
}

export function peerAvailable() {
  return typeof window !== 'undefined' && typeof window.Peer === 'function';
}
export const idFromError = (err) => {
  const m = /peer\s+(\S+)/.exec(String(err && err.message || ''));
  return m ? m[1] : null;
};
