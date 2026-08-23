const LONG_DATE = { day: 'numeric', month: 'long', year: 'numeric' };
const TIME = { hour: 'numeric', minute: '2-digit' };

export function formatDate(value, options = LONG_DATE) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-IN', options);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.toLocaleDateString('en-IN', LONG_DATE)}, ${date.toLocaleTimeString('en-IN', TIME)}`;
}

export function isUpcoming(value) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() >= Date.now();
}

export function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter((part) => /^[A-Za-z]/.test(part))
    .slice(-2)
    .map((part) => part[0].toUpperCase())
    .join('') || '·';
}
