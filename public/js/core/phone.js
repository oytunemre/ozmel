// phone.js — Türkiye telefon biçimlendirme yardımcıları (ortak).
//
// Depolama (DB):  TR numaraları YALNIZ RAKAM, 90 ülke kodu önekli -> "905326164015".
//                 Açık yurt dışı (+ ile, ülke kodu 90 değil) -> "+<rakamlar>"
//                 (zorla +90 EKLENMEZ; ayrımı korumak için baştaki + tutulur).
// Görüntü:        "+90 532 616 40 15" (90 + 3-3-2-2). Yurt dışı -> "+<rakamlar>".
//
// Biçim yalnızca SUNUM katmanında yaşar: forma girerken formatPhone, kaydederken
// normalizePhone. Tablo hücrelerinde de formatPhone kullanılır.

// Açık yurt dışı mı: + ile başlıyor ve ülke kodu 90 değil.
function isForeign(raw, digits) {
  return raw.startsWith('+') && !digits.startsWith('90');
}

/** Saklanan değeri (rakam ya da +rakam) okunur biçime çevirir. */
export function formatPhone(value) {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (isForeign(raw, digits)) return '+' + digits;
  // TR: 90 ülke kodunu ayıkla, yerel (en çok 10) haneyi 3-3-2-2 grupla.
  const local = (digits.startsWith('90') ? digits.slice(2) : digits).slice(0, 10);
  if (!local) return '+90';
  const g = [local.slice(0, 3), local.slice(3, 6), local.slice(6, 8), local.slice(8, 10)].filter(Boolean);
  return '+90 ' + g.join(' ');
}

/** DB'ye yazılacak değer. TR -> "90" + 10 hane; yurt dışı -> "+" + rakamlar. */
export function normalizePhone(value) {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (isForeign(raw, digits)) return '+' + digits;
  const local = (digits.startsWith('90') ? digits.slice(2) : digits).slice(0, 10);
  return local ? '90' + local : '';
}

/**
 * Bir input'a CANLI biçimlendirme bağlar: kullanıcı sadece rakam yazar, +90 ve
 * boşluklar otomatik gelir. İmleç, sağındaki rakam sayısı korunacak şekilde
 * yeniden konumlanır (baştaki +90 eki imleci kaçırmasın diye sondan sayılır).
 */
export function attachPhoneFormat(input) {
  const handler = () => {
    const before = input.value;
    const sel = input.selectionStart ?? before.length;
    const trailing = before.slice(sel).replace(/\D/g, '').length;   // imlecin sağındaki rakamlar
    const formatted = formatPhone(before);
    if (formatted === before) return;
    input.value = formatted;
    let seen = 0, pos = formatted.length;
    for (let i = formatted.length; i >= 0; i--) {
      if (seen === trailing) { pos = i; break; }
      if (i > 0 && /\d/.test(formatted[i - 1])) seen++;
      pos = Math.max(0, i - 1);
    }
    input.setSelectionRange(pos, pos);
  };
  input.addEventListener('input', handler);
  return handler;
}
