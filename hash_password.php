<?php
/**
 * QFW Program — kullanıcı oluşturma yardımcı aracı.
 *
 * KULLANIM: Bu dosyayı tarayıcıda açın, kullanıcı adı + görünen ad + şifre + rol girin,
 * "SQL Oluştur" deyin. Çıkan SQL kodunu kopyalayıp phpMyAdmin > SQL sekmesine yapıştırıp
 * çalıştırın. Böylece şifreniz hiçbir yerde düz metin olarak saklanmaz.
 *
 * ÖNEMLİ (GÜVENLİK): Tüm kullanıcılarınızı oluşturduktan sonra bu dosyayı sunucudan SİLİN.
 * Herkese açık kalırsa, kimliği doğrulanmamış biri şifre hash'i üretebilir (tek başına
 * zararlı değildir çünkü veritabanına yazma yetkisi yoktur, ama yine de silinmesi önerilir).
 */

$sql = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = trim($_POST['username'] ?? '');
    $displayName = trim($_POST['display_name'] ?? '');
    $password = (string)($_POST['password'] ?? '');
    $role = ($_POST['role'] ?? 'viewer') === 'editor' ? 'editor' : 'viewer';

    if ($username !== '' && $displayName !== '' && $password !== '') {
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $usernameEsc = addslashes($username);
        $displayNameEsc = addslashes($displayName);
        $sql = "INSERT INTO users (username, password_hash, display_name, role) VALUES\n"
             . "  ('{$usernameEsc}', '{$hash}', '{$displayNameEsc}', '{$role}');";
    }
}
?>
<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<title>QFW — Kullanıcı Oluşturma Aracı</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;color:#12233F;}
  h1{font-size:20px;}
  label{display:block;margin:14px 0 4px;font-size:13px;font-weight:600;}
  input,select{width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;font-size:14px;box-sizing:border-box;}
  button{margin-top:18px;padding:10px 18px;background:#1D6F8C;color:#fff;border:none;border-radius:4px;font-size:14px;cursor:pointer;}
  textarea{width:100%;margin-top:10px;padding:10px;font-family:monospace;font-size:13px;border-radius:4px;border:1px solid #ccc;box-sizing:border-box;}
  .warn{background:#F6ECD9;border:1px solid #C98A2C;padding:10px 14px;border-radius:4px;font-size:13px;margin-top:24px;}
</style>
</head>
<body>
  <h1>QFW Program — Kullanıcı Oluşturma Aracı</h1>
  <p style="font-size:13px;color:#555;">Bilgileri girin, çıkan SQL'i kopyalayıp phpMyAdmin &gt; SQL sekmesinde çalıştırın.</p>
  <form method="post">
    <label>Kullanıcı Adı (giriş için)</label>
    <input name="username" required placeholder="orn. ahmet">
    <label>Görünen Ad</label>
    <input name="display_name" required placeholder="orn. Ahmet Yılmaz">
    <label>Şifre</label>
    <input type="password" name="password" required>
    <label>Rol</label>
    <select name="role">
      <option value="editor">editor (görüntüler + değişiklik yapar)</option>
      <option value="viewer">viewer (sadece görüntüler)</option>
    </select>
    <button type="submit">SQL Oluştur</button>
  </form>

  <?php if ($sql): ?>
    <label>Bu SQL'i kopyalayıp phpMyAdmin &gt; SQL sekmesine yapıştırın:</label>
    <textarea rows="4" readonly onclick="this.select()"><?php echo htmlspecialchars($sql); ?></textarea>
  <?php endif; ?>

  <div class="warn">⚠ Tüm kullanıcılarınızı oluşturduktan sonra bu dosyayı (hash_password.php) sunucudan silmeniz önerilir.</div>
</body>
</html>
