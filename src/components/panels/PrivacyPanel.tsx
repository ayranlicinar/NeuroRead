import { Toggle } from '../ui';

interface Props {
  rememberPrefs: boolean;
  onRememberPrefs: (v: boolean) => void;
}

export function PrivacyPanel({ rememberPrefs, onRememberPrefs }: Props) {
  return (
    <div className="panel-body">
      <section className="group">
        <h3>Ayarlar</h3>
        <Toggle
          label="Görünüm tercihlerimi bu cihazda hatırla"
          hint="Yalnızca yazı boyutu, satır aralığı, genişlik, tema ve Bionic ayarları tarayıcınızın yerel depolamasına yazılır. Kapatınca silinir."
          checked={rememberPrefs}
          onChange={onRememberPrefs}
        />
      </section>

      <section className="group prose">
        <h3>Verileriniz nasıl işlenir?</h3>
        <h4>Okuma metni</h4>
        <p>
          Metniniz tarayıcınızın belleğinde tutulur ve kaydedilmez. Yalnızca siz yapay zekâ panelinde “Gönder”e bastığınızda, seçtiğiniz metin NeuroRead
          sunucusu üzerinden Kedy NOVAQ hizmetine iletilir. Sunucu metni kaydetmez ve günlüklere yazmaz; yalnızca işlem türü, karakter sayısı ve süre gibi
          teknik bilgiler loglanır. Kedy’nin veriyi nasıl işlediği Kedy’nin kendi koşullarına tabidir.
        </p>
        <h4>Kamera</h4>
        <p>
          Kamera yalnızca “Kamerayı etkinleştir” düğmesine bastığınızda açılır. Görüntü tarayıcınızda işlenir; kareler, yüz görüntüleri, yüz noktaları ve
          ham biyometrik veriler hiçbir yere gönderilmez, kaydedilmez ve yapay zekâ isteklerine eklenmez. Bellekte yalnızca son 60 saniyelik özet sayılar
          (ör. göz kırpma sayısı) tutulur. Kamera kapatıldığında, sayfa kapandığında veya bir hata oluştuğunda tüm kamera izleri durdurulur.
        </p>
        <p>
          Analiz modeli dosyaları uygulamanın kendi sunucusundan yüklenir. Yerel model dosyası yoksa, model Google’ın genel MediaPipe deposundan indirilir
          (bu yalnızca bir dosya indirmesidir; görüntü gönderilmez).
        </p>
        <h4>Analitik ve izleme</h4>
        <p>Uygulamada analitik, reklam veya izleme betiği yoktur. Hesap veya giriş gerekmez.</p>
        <h4>Yasal not</h4>
        <p>
          Yerel işleme gizliliği güçlendirir, ancak tek başına KVKK veya GDPR uyumluluğunu kanıtlamaz. Bu uygulamayı başkalarına sunacaksanız aydınlatma
          metni, açık rıza ve veri işleme sözleşmeleri gibi yükümlülükleri ayrıca değerlendirmeniz gerekir.
        </p>
      </section>
    </div>
  );
}
