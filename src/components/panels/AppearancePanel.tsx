import type { ManualOverrides, ReadingSettings, SettingKey } from '../../types';
import { LIMITS } from '../../utils/settings';
import { Badge, Segmented, Slider, Toggle } from '../ui';

interface Props {
  settings: ReadingSettings;
  manualOverrides: ManualOverrides;
  onChange: <K extends SettingKey>(key: K, value: ReadingSettings[K]) => void;
  onResetDefaults: () => void;
}

export function AppearancePanel({ settings, manualOverrides, onChange, onResetDefaults }: Props) {
  const manual = (key: SettingKey) => (manualOverrides[key] !== undefined ? <Badge>elle</Badge> : null);
  return (
    <div className="panel-body">
      <section className="group">
        <h3>Tema</h3>
        <Segmented
          label="Tema"
          value={settings.theme}
          onChange={(v) => onChange('theme', v)}
          options={[
            { value: 'dark', label: 'Koyu' },
            { value: 'light', label: 'Açık' },
            { value: 'warm', label: 'Sıcak' },
          ]}
        />
        <Segmented
          label="Yazı tipi"
          value={settings.fontFamily}
          onChange={(v) => onChange('fontFamily', v)}
          options={[
            { value: 'serif', label: 'Tırnaklı' },
            { value: 'sans', label: 'Tırnaksız' },
          ]}
        />
      </section>

      <section className="group">
        <h3>Tipografi</h3>
        <Slider
          label="Yazı boyutu"
          badge={manual('fontSize')}
          {...LIMITS.fontSize}
          value={settings.fontSize}
          format={(v) => `${v} px`}
          onChange={(v) => onChange('fontSize', v)}
        />
        <Slider
          label="Satır aralığı"
          badge={manual('lineHeight')}
          {...LIMITS.lineHeight}
          value={settings.lineHeight}
          format={(v) => v.toFixed(1)}
          onChange={(v) => onChange('lineHeight', Math.round(v * 10) / 10)}
        />
        <Slider
          label="Paragraf genişliği"
          badge={manual('paragraphWidth')}
          {...LIMITS.paragraphWidth}
          value={settings.paragraphWidth}
          format={(v) => `${v} karakter`}
          onChange={(v) => onChange('paragraphWidth', v)}
        />
      </section>

      <section className="group">
        <h3>Bionic Reading</h3>
        <Toggle
          label="Kelime başlarını kalın göster"
          hint="Görsel bir okuma yardımıdır; metnin kendisi değişmez. Etkisi kişiden kişiye farklıdır."
          checked={settings.bionic}
          onChange={(v) => onChange('bionic', v)}
        />
        <Slider
          label="Kalın kısım oranı"
          {...LIMITS.bionicRatio}
          value={settings.bionicRatio}
          disabled={!settings.bionic}
          format={(v) => `%${Math.round(v * 100)}`}
          onChange={(v) => onChange('bionicRatio', Math.round(v * 100) / 100)}
        />
      </section>

      <button type="button" className="btn btn-ghost btn-block" onClick={onResetDefaults}>
        Varsayılan görünüme dön
      </button>
    </div>
  );
}
