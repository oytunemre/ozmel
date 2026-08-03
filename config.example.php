<?php
// QFW Program — veritabanı bağlantı ayarları ŞABLONU
//
// KURULUM: Bu dosyayı `config.php` adıyla kopyalayın ve kendi bilgilerinizi girin.
// `config.php` .gitignore ile hariç tutulmuştur; şifre içerdiği için depoya girmez.
//
// Plesk > Databases ekranında oluşturduğunuz veritabanının bilgilerini,
// orada gördüğünüz gibi birebir yazın.
//
// UYARI: Sunucuya yüklerken .htaccess dosyasını da birlikte yükleyin —
// config.php'nin dışarıdan okunmasını o engelliyor.

return [
    'db_host' => 'localhost',
    'db_name' => 'veritabani_adi',
    'db_user' => 'veritabani_kullanicisi',
    'db_pass' => 'BURAYA_VERITABANI_SIFRESINI_YAZIN',
];
