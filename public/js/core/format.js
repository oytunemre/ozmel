// Ortak biçimlendirme yardımcıları — tr-TR sayı, süre (sa/dk), tarih (GG.AA.YYYY).
// Miktar/süre alanları mono + sağa hizalı gösterilir (CSS tarafında).

// Binlik ayırıcı nokta, ondalık virgül. Boş/geçersiz → '—'.
export function fmtTr(n, dash = '—') {
  if (n == null || n === '' || !isFinite(Number(n))) return dash;
  return Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 3 });
}

// Süre: <60 dk → "45 dk", üstü → "2 sa 15 dk", 0/boş → '—'.
export function fmtDuration(min, dash = '—') {
  const m = Math.round(Number(min) || 0);
  if (m <= 0) return dash;
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} sa ${r} dk` : `${h} sa`;
}

// "YYYY-MM-DD" → "GG.AA.YYYY". Geçersiz → olduğu gibi.
export function fmtDateTR(iso) {
  if (!iso || typeof iso !== 'string' || iso.length < 10) return iso || '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

// Yüzde: sayı → "%42". null → '—'.
export function fmtPct(n, dash = '—') {
  if (n == null || !isFinite(Number(n))) return dash;
  return `%${Math.round(Number(n))}`;
}
