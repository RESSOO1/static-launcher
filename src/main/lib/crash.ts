// Turns the tail of a game log into a Turkish explanation the player can act on.
export interface CrashHint {
  title: string
  hint: string
}

const RULES: Array<{ test: RegExp; title: string; hint: string }> = [
  {
    test: /java\.lang\.OutOfMemoryError|Could not reserve enough space for object heap|There is insufficient memory/i,
    title: 'Bellek yetersiz',
    hint: 'Oyuna ayrılan RAM yetmedi ya da bilgisayarda boş bellek yok. Ayarlar > Bellek bölümünden RAM miktarını değiştir ve diğer programları kapat.'
  },
  {
    test: /UnsupportedClassVersionError|has been compiled by a more recent version of the Java Runtime/i,
    title: 'Java sürümü uyumsuz',
    hint: 'Bu sürüm daha yeni bir Java istiyor. Ayarlar > Java bölümünde "Otomatik" seçili olsun; launcher doğru Java’yı kendisi indirir.'
  },
  {
    test: /Incompatible mods? found|Mod resolution failed|requires .* which is missing|depends on .* but/i,
    title: 'Mod uyumsuzluğu',
    hint: 'Bir mod başka bir modu istiyor ya da bu sürümle uyumlu değil. Modlar sayfasından en son eklediğin modu kapatıp tekrar dene.'
  },
  {
    test: /Mixin apply failed|MixinApplyError|InvalidMixinException/i,
    title: 'Mod çakışması',
    hint: 'İki mod aynı yeri değiştirmeye çalışıyor. Son eklediğin modları tek tek kapatarak sorunlu olanı bul.'
  },
  {
    test: /Pixel format not accelerated|GLFW error 65542|WGL: The driver does not appear to support OpenGL|No OpenGL context/i,
    title: 'Ekran kartı sürücüsü sorunu',
    hint: 'Ekran kartı sürücün OpenGL desteklemiyor ya da eski. Ekran kartı üreticisinin sitesinden sürücüyü güncelle.'
  },
  {
    test: /EXCEPTION_ACCESS_VIOLATION|A fatal error has been detected by the Java Runtime/i,
    title: 'Java çöktü',
    hint: 'Genellikle ekran kartı sürücüsü ya da bozuk bir mod sebep olur. Sürücüleri güncelle, sorun sürerse modları kapatıp dene.'
  },
  {
    test: /Failed to (?:load|find) native|UnsatisfiedLinkError|no lwjgl in java\.library\.path/i,
    title: 'Oyun dosyaları eksik',
    hint: 'Bazı oyun dosyaları bozuk ya da eksik. Profil ayarlarından "Dosyaları onar" seçeneğini kullan.'
  },
  {
    test: /ZipException|invalid (?:LOC|CEN) header|zip END header not found/i,
    title: 'Bozuk dosya',
    hint: 'İndirilen bir dosya bozuk. Profil ayarlarından "Dosyaları onar" seçeneğini kullan; bozuk bir mod varsa onu sil.'
  }
]

export function analyzeCrash(logTail: string[], exitCode: number | null): CrashHint {
  const text = logTail.join('\n')
  for (const r of RULES) if (r.test.test(text)) return { title: r.title, hint: r.hint }
  return {
    title: 'Oyun beklenmedik şekilde kapandı',
    hint: `Çıkış kodu: ${exitCode ?? 'bilinmiyor'}. Konsol sekmesinde son satırlara bakabilir ya da logu kopyalayıp destek isteyebilirsin.`
  }
}
