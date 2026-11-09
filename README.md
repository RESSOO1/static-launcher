# Static Launcher

Electron + React + TypeScript ile yazılmış, çevrimdışı (crack'li) girişli Minecraft launcher'ı.

## Komutlar

```bash
npm install          # bağımlılıklar (ilk sefer)
npm run dev          # geliştirme modu (canlı yenileme)
npm run build        # derle
npm start            # derlenmiş hali çalıştır
npm test             # birim testleri
npm run typecheck    # TypeScript kontrolü
npm run dist         # Windows kurulum dosyası -> release/
```

## Sunucunu bağlamak: `resources/launcher.config.json`

Kod değiştirmeden launcher'ı kendi sunucuna göre ayarlarsın:

| Alan | Ne işe yarar |
|------|--------------|
| `name`, `tagline` | Launcher adı ve açılış ekranındaki slogan |
| `modes` | Ana sayfadaki sunucu modları. `mcVersion` (`"latest"` olabilir), `loader` (`vanilla`/`fabric`), `mods` (Modrinth slug listesi, açılışta otomatik kurulur), `server` (oyun açılınca bağlanılacak adres), `accent` (renk) |
| `servers` | Sunucular sayfasında "Resmi" olarak görünen sunucular (`id`, `name`, `address`, `featured`) |
| `news` | Haberler sayfası |
| `links.discord`, `links.website` | Alt bardaki butonlar (sadece `https://`) |
| `discordClientId` | Discord Rich Presence için Discord Developer Portal'daki uygulama ID'si |
| `remoteConfigUrl` | Bu dosyanın internetteki kopyası. Doluysa launcher her açılışta haberleri, modları ve sunucuları buradan çeker; launcher'ı yeniden dağıtmana gerek kalmaz |
| `updateUrl` | Otomatik güncelleme için `npm run dist` çıktısını (`latest.yml` + `.exe`) koyduğun https klasörü |

## Güncelleme yayınlama

**İçerik (haber, mod listesi, sunucular)** — yeni sürüm gerekmez: `remoteConfigUrl` adresindeki JSON'u değiştir, oyuncular launcher'ı bir sonraki açışlarında görür.

**Launcher'ın kendisi (kod/tasarım değişikliği):**

1. `package.json` içindeki `version` değerini artır (ör. `1.0.0` → `1.0.1`) ve `resources/release-notes.md` dosyasına bu sürümdeki yenilikleri yaz (oyunculara güncelleme penceresinde gösterilir).
2. `npm run dist` çalıştır.
3. `release/` içindeki şu 3 dosyayı `updateUrl` klasörüne yükle (eskilerin üzerine yaz):
   `latest.yml`, `StaticLauncher-Setup-1.0.1.exe`, `StaticLauncher-Setup-1.0.1.exe.blockmap`
4. Oyuncuların launcher'ı açılıştan ~5 sn sonra kontrol eder; sol alttaki kartta "Yeni sürüm → İndir → Yeniden başlat" çıkar.

> `updateUrl` boşken üretilen kurulumlar kendini güncelleyemez. Oyunculara dağıtmadan **önce** `updateUrl`'i doldurup `npm run dist` çalıştır.

## Veriler nerede?

`%APPDATA%\.staticlauncher` (Windows kullanıcı adında Türkçe karakter varsa `C:\StaticLauncher`).
Oyun dosyaları ortak (`game/`), her profilin dünyaları/modları ayrı (`instances/<profil>`), Java `runtime/` içinde, dünya yedekleri `backups/` içinde.

## Güvenlik notları

- Arayüz sandbox içinde çalışır; Node erişimi yok, sadece izin verilen IPC kanalları açık ve her girdi ana süreçte doğrulanır.
- Modrinth indirmeleri sadece `cdn.modrinth.com` adresinden yapılır ve SHA-512 ile doğrulanır; dosya adları yol kaçışlarına karşı temizlenir.
- Oyun, Java ve kütüphane dosyaları Mojang'ın verdiği SHA-1 değerleriyle doğrulanır.
- Uzak yapılandırma dosyasındaki her alan kontrol edilir; sadece `https` bağlantılar açılır.
