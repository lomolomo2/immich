<script lang="ts">
  import QRCode from '$lib/components/shared-components/qrcode.svelte';
  import { copyToClipboard } from '$lib/utils';
  import { onMount } from 'svelte';

  type Props = {
    onClose: () => void;
  };

  type ConnectInfo = {
    url: string;
    candidateUrls?: string[];
  };

  // Lomorage mobile app store links.
  const APP_STORE_URL = 'https://apps.apple.com/us/app/lomomobile/id6771038226';
  const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.wtao.lomo';

  type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  type TauriGlobals = {
    __TAURI__?: { core?: { invoke?: TauriInvoke } };
    __TAURI_INTERNALS__?: { invoke?: TauriInvoke };
  };

  let { onClose }: Props = $props();

  let info = $state<ConnectInfo | null>(null);
  let qrUrl = $state('');
  let backendMode = $state<'local' | 'remote' | null>(null);
  let serverUrl = $state('');
  let loading = $state(true);
  let copied = $state(false);
  let showNextTime = $state(true);

  const connectUrl = $derived(info?.url ?? '');
  const qrValue = $derived(qrUrl || connectUrl);
  // Remote mode: photos live on a server the user signed into; the phone app backs up
  // directly to that lomod backend (serverUrl, :8000), distinct from the local :3001 proxy
  // that only serves the browser/view UI on this computer.
  const isRemote = $derived(backendMode === 'remote');
  const serverHostPort = $derived(serverUrl.replace(/^https?:\/\//, ''));

  const getTauriInvoke = (): TauriInvoke | null => {
    const globals = globalThis as TauriGlobals;
    return globals.__TAURI__?.core?.invoke ?? globals.__TAURI_INTERNALS__?.invoke ?? null;
  };

  const openStore = async (url: string) => {
    const invoke = getTauriInvoke();
    if (invoke) {
      try {
        await invoke('open_external_url', { url });
        return;
      } catch (error) {
        console.error('Failed to open external URL', error);
      }
    }
    window.open(url, '_blank', 'noopener');
  };

  const loadInfo = async () => {
    loading = true;
    try {
      // browser-access-link returns the photo-viewer web address (proxy port, e.g.
      // http://192.168.1.73:3001/) — the address a phone/browser opens to view photos.
      const response = await fetch('/api/lomo/browser-access-link');
      const data = (await response.json().catch(() => ({}))) as Partial<ConnectInfo>;
      if (response.ok && data.url) {
        info = data as ConnectInfo;
      }
    } catch {
      // Leave info null; the dialog still renders the guide without the address.
    } finally {
      loading = false;
    }
  };

  // The QR encodes the mobile-upload deep link (proxy port + ?server=…) so a phone scan
  // opens the upload page directly — distinct from the typed connect address shown above.
  const loadQrUrl = async () => {
    try {
      const response = await fetch('/api/lomo/mobile-upload-link');
      const data = (await response.json().catch(() => ({}))) as {
        url?: string;
        backendMode?: 'local' | 'remote';
        backendUrl?: string;
      };
      if (response.ok && data.url) {
        qrUrl = data.url;
      }
      // backendMode/backendUrl tell us whether this app is connected to a remote server and,
      // if so, which one — so the dialog can name the connected server instead of "this computer".
      if (data.backendMode) {
        backendMode = data.backendMode;
      }
      if (data.backendUrl) {
        serverUrl = data.backendUrl;
      }
    } catch {
      // Fall back to the connect URL for the QR if the mobile-upload link is unavailable.
    }
  };

  const copy = async () => {
    if (!connectUrl) {
      return;
    }
    await copyToClipboard(connectUrl);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  };

  const close = () => {
    try {
      localStorage.setItem('lomo_show_setup_guide', showNextTime ? '1' : '0');
    } catch {
      // Ignore storage failures; worst case the guide shows again next launch.
    }
    onClose();
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      close();
    }
  };

  onMount(() => {
    void loadInfo();
    void loadQrUrl();
  });
</script>

<svelte:window on:keydown={onKeydown} />

<div
  class="frs-backdrop"
  role="presentation"
  onclick={(event) => {
    if (event.target === event.currentTarget) {
      close();
    }
  }}
>
  <div class="frs-card" role="dialog" aria-modal="true" aria-label="You're all set">
    <div class="frs-check" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="white" stroke-width="3">
        <path d="M5 12.5l4.5 4.5L19 7.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </div>
    <h2 class="frs-title">You're all set!</h2>
    <p class="frs-subtitle">
      {#if isRemote}
        You're connected to a remote Lomorage server. Here's how to back up your photos to it.
      {:else}
        Lomorage is now running on this computer. Here's how to start backing up your photos.
      {/if}
    </p>
    {#if isRemote && serverHostPort}
      <div class="frs-server">
        <span aria-hidden="true">🖥️</span>
        Lomorage server: <code>{serverUrl}</code>
      </div>
    {/if}

    <div class="frs-divider"></div>

    <div class="frs-access">
      <div class="frs-access-label">
        <span class="frs-globe" aria-hidden="true">🌐</span>
        OPEN FROM YOUR PHONE OR ANY BROWSER
      </div>
      <div class="frs-access-row">
        <div class="frs-url-block">
          <div class="frs-url" class:placeholder={!connectUrl}>
            {connectUrl || (loading ? 'Finding this computer…' : 'Address unavailable')}
          </div>
          <button type="button" class="frs-copy" onclick={copy} disabled={!connectUrl}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <div class="frs-qr">
          {#if qrValue}
            <QRCode value={qrValue} width={88} alt="Scan to connect" />
          {:else}
            <div class="frs-qr-empty"></div>
          {/if}
          <span class="frs-qr-cap">Scan to connect</span>
        </div>
      </div>
      <div class="frs-wifi">
        <span aria-hidden="true">📶</span>
        Keep your phone on the <strong>same Wi-Fi</strong> as this computer, then type this address into the Lomorage app.
      </div>
      {#if !isRemote}
        <div class="frs-wifi frs-awake">
          <span aria-hidden="true">💤</span>
          Keep this computer <strong>awake</strong> (lid open) during your first backup — backups pause while it sleeps.
        </div>
      {/if}
    </div>

    <div class="frs-steps-label">3 STEPS TO YOUR FIRST BACKUP</div>
    <div class="frs-steps">
      <div class="frs-step">
        <div class="frs-step-num">1</div>
        <div class="frs-step-title">Get the app</div>
        <div class="frs-step-copy">Install Lomorage on your phone.</div>
      </div>
      <div class="frs-step">
        <div class="frs-step-num">2</div>
        <div class="frs-step-title">Connect &amp; back up</div>
        <div class="frs-step-copy">
          {#if isRemote && serverHostPort}
            Scan the code, or enter <code>{serverHostPort}</code> in the Lomorage app, then turn on
            <strong>Auto Backup</strong>.
          {:else}
            Scan the code{#if connectUrl}
              (or enter <code>{connectUrl.replace(/^https?:\/\//, '')}</code>){/if}, then turn on
            <strong>Auto Backup</strong>.
          {/if}
        </div>
      </div>
      <div class="frs-step">
        <div class="frs-step-num">3</div>
        <div class="frs-step-title">View them here</div>
        <div class="frs-step-copy">Photos appear in this window automatically, sorted by date.</div>
      </div>
    </div>

    <div class="frs-getapp">
      <span class="frs-getapp-label">Get the app for your phone</span>
      <div class="frs-badges">
        <button type="button" class="frs-badge" onclick={() => openStore(APP_STORE_URL)}>
          <span class="frs-badge-glyph"></span>
          <span class="frs-badge-text"><small>Download on the</small><strong>App Store</strong></span>
        </button>
        <button type="button" class="frs-badge" onclick={() => openStore(GOOGLE_PLAY_URL)}>
          <span class="frs-badge-glyph"></span>
          <span class="frs-badge-text"><small>Get it on</small><strong>Google Play</strong></span>
        </button>
      </div>
    </div>

    <div class="frs-footer">
      <label class="frs-checkbox">
        <input type="checkbox" bind:checked={showNextTime} />
        <span>Show this guide next time</span>
      </label>
      <button type="button" class="frs-cta" onclick={close}>Start exploring</button>
    </div>
  </div>
</div>

<style>
  .frs-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(20, 17, 45, 0.42);
    backdrop-filter: blur(2px);
  }
  .frs-card {
    --brand: #5146c7;
    --brand-ink: #4035b5;
    --brand-soft: #ebe7fb;
    --ink-900: #1e1a3a;
    --ink-700: #3a3565;
    --ink-500: #6b6590;
    --ink-400: #8d86ad;
    --border-soft: #e6e2f2;
    --success: #21a36a;
    width: min(640px, 100%);
    max-height: calc(100dvh - 48px);
    overflow-y: auto;
    box-sizing: border-box;
    background: #fff;
    border-radius: 18px;
    padding: 28px 32px 22px;
    text-align: center;
    box-shadow:
      0 1px 2px rgba(30, 26, 58, 0.05),
      0 24px 60px rgba(30, 26, 58, 0.22);
    font-family:
      'Space Grotesk', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    color: var(--ink-700);
  }
  .frs-check {
    width: 52px;
    height: 52px;
    margin: 0 auto 12px;
    border-radius: 50%;
    background: var(--success);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 6px 18px rgba(33, 163, 106, 0.32);
  }
  .frs-title {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
    color: var(--ink-900);
    letter-spacing: -0.01em;
  }
  .frs-subtitle {
    margin: 8px auto 0;
    max-width: 460px;
    font-size: 14px;
    color: var(--ink-500);
    line-height: 1.5;
  }
  .frs-server {
    margin: 12px auto 0;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 13px;
    color: var(--ink-700);
  }
  .frs-server code {
    font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace;
    font-size: 12.5px;
    background: var(--brand-soft);
    color: var(--brand-ink);
    padding: 2px 8px;
    border-radius: 6px;
  }
  .frs-divider {
    height: 1px;
    background: var(--border-soft);
    margin: 18px -32px;
  }
  .frs-access {
    text-align: left;
    background: linear-gradient(180deg, #f3f0fd 0%, #eeebfb 100%);
    border: 1px solid #e0dbf5;
    border-radius: 14px;
    padding: 16px;
  }
  .frs-access-label {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--brand-ink);
  }
  .frs-access-row {
    display: flex;
    gap: 14px;
    margin-top: 10px;
    align-items: stretch;
  }
  .frs-url-block {
    flex: 1;
    display: flex;
    gap: 8px;
    align-items: stretch;
    min-width: 0;
  }
  .frs-url {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    background: #fff;
    border: 1px solid var(--border-soft);
    border-radius: 10px;
    padding: 0 14px;
    font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace;
    font-size: 15px;
    color: var(--ink-900);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .frs-url.placeholder {
    color: var(--ink-400);
    font-style: italic;
  }
  .frs-copy {
    flex-shrink: 0;
    background: var(--brand);
    color: #fff;
    border: none;
    border-radius: 10px;
    padding: 0 18px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .frs-copy:hover:not(:disabled) {
    background: var(--brand-ink);
  }
  .frs-copy:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .frs-qr {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .frs-qr :global(img),
  .frs-qr-empty {
    width: 88px;
    height: 88px;
    background: #fff;
    border: 1px solid var(--border-soft);
    border-radius: 8px;
    padding: 2px;
    box-sizing: border-box;
  }
  .frs-qr-cap {
    font-size: 10px;
    color: var(--ink-400);
  }
  .frs-wifi {
    margin-top: 12px;
    display: flex;
    gap: 7px;
    font-size: 12.5px;
    color: var(--ink-500);
    line-height: 1.45;
  }
  .frs-wifi strong {
    color: var(--ink-700);
  }
  .frs-awake {
    margin-top: 6px;
  }
  .frs-steps-label {
    text-align: left;
    margin: 18px 0 10px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--ink-400);
  }
  .frs-steps {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  .frs-step {
    text-align: left;
    border: 1px solid var(--border-soft);
    border-radius: 12px;
    padding: 14px;
  }
  .frs-step-num {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--brand);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 10px;
  }
  .frs-step-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink-900);
    margin-bottom: 4px;
  }
  .frs-step-copy {
    font-size: 12.5px;
    color: var(--ink-500);
    line-height: 1.45;
  }
  .frs-step-copy code {
    font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace;
    font-size: 11px;
    background: var(--brand-soft);
    color: var(--brand-ink);
    padding: 1px 5px;
    border-radius: 4px;
  }
  .frs-getapp {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-top: 18px;
    padding-top: 16px;
    border-top: 1px solid var(--border-soft);
  }
  .frs-getapp-label {
    font-size: 13px;
    color: var(--ink-700);
    font-weight: 500;
  }
  .frs-badges {
    display: flex;
    gap: 10px;
  }
  .frs-badge {
    display: flex;
    align-items: center;
    gap: 9px;
    background: #1a1a1f;
    color: #fff;
    border: none;
    border-radius: 9px;
    padding: 8px 14px;
    font-family: inherit;
    text-decoration: none;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .frs-badge:hover {
    background: #000;
  }
  .frs-badge-glyph {
    width: 18px;
    height: 22px;
    border: 1.5px solid rgba(255, 255, 255, 0.7);
    border-radius: 4px;
    flex-shrink: 0;
  }
  .frs-badge-text {
    display: flex;
    flex-direction: column;
    line-height: 1.1;
    text-align: left;
  }
  .frs-badge-text small {
    font-size: 9px;
    opacity: 0.8;
  }
  .frs-badge-text strong {
    font-size: 14px;
    font-weight: 600;
  }
  .frs-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-top: 18px;
    padding-top: 16px;
    border-top: 1px solid var(--border-soft);
  }
  .frs-checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--ink-500);
    cursor: pointer;
  }
  .frs-checkbox input {
    width: 16px;
    height: 16px;
    accent-color: var(--brand);
    cursor: pointer;
  }
  .frs-cta {
    background: var(--brand);
    color: #fff;
    border: none;
    border-radius: 11px;
    padding: 12px 26px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .frs-cta:hover {
    background: var(--brand-ink);
  }
  @media (max-width: 560px) {
    .frs-steps {
      grid-template-columns: 1fr;
    }
    .frs-access-row {
      flex-direction: column;
    }
    .frs-getapp,
    .frs-footer {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
