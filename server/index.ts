import { createApp } from './app';
import { getKedyApiKey, getPort, loadEnvFile } from './config';

loadEnvFile();

const port = getPort();
const host = process.env.HOST || '127.0.0.1';
const app = createApp({ getApiKey: () => getKedyApiKey() });

app.listen(port, host, () => {
  console.info(`[server] NeuroRead API http://${host}:${port} adresinde çalışıyor.`);
  console.info(
    getKedyApiKey()
      ? '[server] KEDY_API_KEY yapılandırılmış.'
      : '[server] KEDY_API_KEY bulunamadı — yapay zekâ özellikleri devre dışı, okuma özellikleri çalışır.',
  );
});
