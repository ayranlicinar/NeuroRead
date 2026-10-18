// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../src/App';
import { AiOutput } from '../src/components/AiOutput';
import { BionicText } from '../src/components/BionicText';
import { parseAiOutput } from '../src/utils/aiFormat';
import { SAMPLE_TEXT } from '../src/services/sampleText';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('safe AI output rendering', () => {
  afterEach(cleanup);

  it('renders HTML and script tags from the model as inert text', () => {
    const malicious = '<img src=x onerror="alert(1)"><script>alert(2)</script>\n- **kalın** <b>madde</b>';
    const { container } = render(<AiOutput content={malicious} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('li b')).toBeNull();
    expect(container.textContent).toContain('<script>alert(2)</script>');
    expect(container.querySelector('li strong')?.textContent).toBe('kalın');
  });

  it('parses headings, lists and paragraphs', () => {
    const blocks = parseAiOutput('# Başlık\n\nBir paragraf\ndevamı\n\n- a\n- b\n1. c\n2) d');
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'p', 'ul', 'ol']);
  });
});

describe('BionicText component', () => {
  afterEach(cleanup);

  it('shows identical text content with or without bionic mode', () => {
    const text = 'Işığın “öğrenci” için önemi, değil mi?\nEvet.';
    const plain = render(<BionicText text={text} enabled={false} ratio={0.4} />);
    expect(plain.container.textContent).toBe(text);
    cleanup();
    const bionic = render(<BionicText text={text} enabled ratio={0.4} />);
    expect(bionic.container.textContent).toBe(text);
    expect(bionic.container.querySelectorAll('b').length).toBeGreaterThan(3);
  });

  it('does not interpret markup in the reading text', () => {
    const { container } = render(<BionicText text={'<script>alert(1)</script>'} enabled ratio={0.4} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toBe('<script>alert(1)</script>');
  });
});

describe('App without camera or API key', () => {
  let getUserMedia: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/health') return new Response(JSON.stringify({ ok: true, aiConfigured: false }), { status: 200 });
      return new Response('{}', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('never requests the camera on page load', async () => {
    await act(async () => {
      render(<App />);
    });
    expect(getUserMedia).not.toHaveBeenCalled();
    // Only the health check is made on load — no AI request with text.
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/api/health']);
  });

  it('loads the sample, renders the reading view and supports bionic + session controls', async () => {
    await act(async () => {
      render(<App />);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Örnek Türkçe metni yükle' }));
    const article = document.querySelector('article.reading-surface')!;
    expect(article).not.toBeNull();
    expect(article.textContent).toContain('Ekranda Uzun Metin Okumak');
    expect(screen.getByText(/kelime/).textContent).toMatch(/kelime/);

    // Bionic toggle changes presentation but not the text.
    const before = article.textContent;
    fireEvent.click(screen.getByRole('switch', { name: /Kelime başlarını kalın göster/ }));
    expect(article.querySelectorAll('b').length).toBeGreaterThan(10);
    expect(article.textContent).toBe(before);

    fireEvent.click(screen.getByRole('button', { name: 'Başlat' }));
    expect(screen.getByText('Okuma sürüyor')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Duraklat' }));
    expect(screen.getByText('Duraklatıldı')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sıfırla' }));
    expect(screen.getByText('Oturum başlamadı')).toBeTruthy();

    // Original text remains intact in the editor.
    fireEvent.click(screen.getByRole('tab', { name: 'Metin' }));
    expect((screen.getByLabelText('Okunacak metin') as HTMLTextAreaElement).value).toBe(SAMPLE_TEXT);
  });

  it('shows the Turkish setup message when the API key is missing', async () => {
    await act(async () => {
      render(<App />);
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Asistan' }));
    const panel = document.getElementById('panel-assistant')!;
    expect(within(panel).getByText('Yapay zekâ yapılandırılmamış')).toBeTruthy();
  });

  it('demo mode is labelled as simulated and does not start the camera', async () => {
    await act(async () => {
      render(<App />);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Örnek Türkçe metni yükle' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Kamera' }));
    fireEvent.click(screen.getByRole('radio', { name: /Örnek öneri/ }));
    expect(screen.getByText(/DEMO · Örnek öneri \(simüle\)/)).toBeTruthy();
    expect(screen.queryByText('Kamera açık')).toBeNull();
    expect(screen.queryByText('GERÇEK ÖLÇÜM')).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();
    // The simulated recommendation is shown and marked as simulated.
    const banner = document.querySelector('.banner .suggestion')!;
    expect(banner.className).toContain('is-simulated');
    expect(banner.textContent).toMatch(/SİMÜLE/);
  });
});
