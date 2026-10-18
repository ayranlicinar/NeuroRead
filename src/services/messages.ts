import type { AiAction, CameraErrorCode, DemoScenario } from '../types';

export const CAMERA_ERRORS: Record<CameraErrorCode, { title: string; help: string }> = {
  UNSUPPORTED: {
    title: 'Tarayıcı kamera analizini desteklemiyor',
    help: 'Güncel bir Chrome, Edge veya Firefox sürümü kullanın. Bu arada açıkça etiketlenmiş demo modunu deneyebilirsiniz.',
  },
  INSECURE_CONTEXT: {
    title: 'Güvenli bağlantı gerekli',
    help: 'Tarayıcılar kameraya yalnızca https:// veya http://localhost adreslerinde izin verir. Uygulamayı localhost üzerinden açın.',
  },
  PERMISSION_DENIED: {
    title: 'Kamera izni verilmedi',
    help: 'Adres çubuğundaki kamera simgesinden izni etkinleştirip tekrar deneyin. Windows’ta Ayarlar › Gizlilik ve güvenlik › Kamera bölümünde masaüstü uygulamalarının erişimini de kontrol edin.',
  },
  NO_CAMERA: {
    title: 'Kamera bulunamadı',
    help: 'Bir web kamerasının bağlı ve etkin olduğundan emin olun. Kamera olmadan demo modunu kullanabilirsiniz.',
  },
  CAMERA_IN_USE: {
    title: 'Kamera başka bir uygulama tarafından kullanılıyor',
    help: 'Teams, Zoom veya Kamera uygulaması gibi programları kapatıp tekrar deneyin.',
  },
  MODEL_LOAD_FAILED: {
    title: 'Yüz analizi modeli yüklenemedi',
    help: 'Model dosyaları eksik olabilir. Terminalde “npm run prepare:mediapipe” komutunu çalıştırın ve sayfayı yenileyin. Kamera açılmadı.',
  },
  STREAM_ENDED: {
    title: 'Kamera bağlantısı kesildi',
    help: 'Kamera çıkarılmış ya da izin geri alınmış olabilir. Analiz durduruldu.',
  },
  UNKNOWN: {
    title: 'Kamera analizi başlatılamadı',
    help: 'Beklenmeyen bir hata oluştu. Okuma alanı etkilenmez; demo modunu kullanabilirsiniz.',
  },
};

export const AI_ACTIONS: Record<AiAction, { label: string; description: string }> = {
  summarize: { label: 'Özetle', description: 'Metnin kısa ve sadık bir özeti' },
  simplify: { label: 'Sadeleştir', description: 'Zor bölümleri daha anlaşılır bir dille yeniden yazar' },
  'key-ideas': { label: 'Ana fikirler', description: 'Temel fikirler ve önemli terimler' },
  'study-notes': { label: 'Çalışma notları', description: 'Notlar ve anlama soruları' },
  ask: { label: 'Soru sor', description: 'Metinle ilgili sorunuzu yanıtlar' },
};

export const DEMO_SCENARIOS: Record<DemoScenario, { label: string; description: string }> = {
  normal: { label: 'Normal okuma', description: 'Düzenli kaydırma, olağan göz göstergeleri. Öneri beklenmez.' },
  'reduced-scroll': {
    label: 'Azalmış kaydırma',
    description: '4 dakikadır kaydırma yapılmamış gibi davranır. Özet önerisi tetiklenebilir.',
  },
  'long-session': {
    label: 'Uzun oturum',
    description: 'Oturuma 45 dakika eklenmiş gibi davranır. Tema ve mola önerileri tetiklenebilir.',
  },
  'example-recommendation': {
    label: 'Örnek öneri',
    description: 'Yükseltilmiş simüle göz kapanma oranı. Satır aralığı önerisi tetiklenir.',
  },
};
