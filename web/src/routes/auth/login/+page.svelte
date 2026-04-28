<script lang="ts">
  import { goto } from '$app/navigation';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import { serverConfigManager } from '$lib/managers/server-config-manager.svelte';
  import { Route } from '$lib/route';
  import { clearClientSession } from '$lib/utils/auth';
  import { oauth } from '$lib/utils';
  import { getServerErrorMessage, handleError } from '$lib/utils/handle-error';
  import { defaults, login, type LoginResponseDto } from '@immich/sdk';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  type TauriGlobals = {
    __TAURI__?: {
      core?: {
        invoke?: TauriInvoke;
      };
    };
    __TAURI_INTERNALS__?: {
      invoke?: TauriInvoke;
    };
  };
  type BackendMode = 'local' | 'remote';
  type InitialSetupState = {
    active_backend_mode?: BackendMode;
    needs_local_setup?: boolean;
    photos_dir?: string;
    setup_required?: boolean;
    backend_mode?: BackendMode;
    remote_lomod_url?: string;
    local?: {
      photos_dir?: string;
      setup_completed?: boolean;
    };
    remote?: {
      default_url?: string;
    };
  };
  type LocalLibraryInspection = {
    photos_dir?: string;
    has_existing_user_db?: boolean;
    existing_assets_db_paths?: string[];
  };

  const REMOTE_SERVER_ADDRESS_STORAGE_KEY = 'lomo_remote_server_address';
  const REMOTE_SERVER_PORT_STORAGE_KEY = 'lomo_remote_server_port';
  const SHOW_CHOOSER_QUERY_PARAM = 'showChooser';

  let { data }: Props = $props();

  let errorMessage: string = $state('');
  let email = $state('');
  let password = $state('');
  let serverAddress = $state(globalThis.localStorage?.getItem(REMOTE_SERVER_ADDRESS_STORAGE_KEY) || 'localhost');
  let serverPort = $state(globalThis.localStorage?.getItem(REMOTE_SERVER_PORT_STORAGE_KEY) || '8000');
  let backendMode = $state<BackendMode>('local');
  let oauthError = $state('');
  let loading = $state(false);
  let oauthLoading = $state(true);
  let isDesktop = $state(false);
  let initialSetupLoading = $state(true);
  let needsLocalSetup = $state(false);
  let initialBackendChoiceMade = $state(true);
  let setupPhotosDir = $state('');
  let setupPassword = $state('');
  let setupPasswordConfirm = $state('');
  let setupSaving = $state(false);
  let setupErrorMessage = $state('');
  let setupStateWarning = $state('');
  let setupFolderInspection = $state<LocalLibraryInspection | null>(null);
  let setupFolderInspectionLoading = $state(false);
  let useExistingLibraryLoading = $state(false);
  let changingLocalFolder = $state(false);
  let localFolderChangeSaving = $state(false);
  let localFolderChangeErrorMessage = $state('');
  let localFolderChangeSuccessMessage = $state('');
  let configuredRemoteLomodUrl = $state('');
  let chooserWasRequested = $state(false);

  const buildServerUrl = (address: string, port: string) => `http://${address.trim()}:${port.trim() || '8000'}`;
  const DESKTOP_SETUP_STATE_TIMEOUT_MS = 2500;
  const fallbackFeatureFlags = { passwordLogin: true, oauth: false, oauthAutoLaunch: false };

  const serverConfig = $derived(serverConfigManager.value);
  const flags = $derived.by(() => {
    try {
      return featureFlagsManager.value ?? fallbackFeatureFlags;
    } catch {
      return fallbackFeatureFlags;
    }
  });
  const showLocalSetupForm = $derived(
    isDesktop && backendMode === 'local' && needsLocalSetup && initialBackendChoiceMade,
  );
  const showLocalFolderChangeForm = $derived(
    isDesktop && backendMode === 'local' && !needsLocalSetup && initialBackendChoiceMade && changingLocalFolder,
  );
  const setupPasswordMismatch = $derived(
    setupPasswordConfirm.length > 0 && setupPassword !== setupPasswordConfirm ? 'Passwords do not match.' : '',
  );
  const canCompleteSetup = $derived(
    Boolean(setupPhotosDir.trim()) &&
      setupPassword.length > 0 &&
      setupPassword === setupPasswordConfirm &&
      !setupSaving &&
      !localFolderChangeSaving &&
      !setupFolderInspectionLoading &&
      !useExistingLibraryLoading &&
      !(setupFolderInspection?.has_existing_user_db ?? false),
  );
  const canChangeLocalFolder = $derived(
    Boolean(setupPhotosDir.trim()) &&
      setupPassword.length > 0 &&
      setupPassword === setupPasswordConfirm &&
      !setupFolderInspectionLoading &&
      !setupSaving &&
      !localFolderChangeSaving &&
      !useExistingLibraryLoading &&
      !(setupFolderInspection?.has_existing_user_db ?? false),
  );

  const LOADING_STAGES = ['Starting lomod…', 'Initializing local library', 'Checking setup status', 'Ready'];
  let loadingProgress = $state(4);
  let loadingStageIdx = $state(0);

  const passwordStrength = $derived.by(() => {
    const pw = setupPassword;
    if (!pw) return 0;
    let s = 0;
    if (pw.length >= 8) s++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
    if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
    return s;
  });
  const strengthLabel = $derived(['Too short', 'Weak', 'Good', 'Strong'][passwordStrength]);
  const setupAdminPath = $derived(setupPhotosDir.trim() ? `${setupPhotosDir.trim()}/admin` : '<selected-folder>/admin');
  const existingLibraryDbPaths = $derived(setupFolderInspection?.existing_assets_db_paths ?? []);
  const hasExistingLibraryInSelectedFolder = $derived(setupFolderInspection?.has_existing_user_db ?? false);

  const getStoredRemoteServerUrl = (): string | undefined => {
    const address = globalThis.localStorage?.getItem(REMOTE_SERVER_ADDRESS_STORAGE_KEY)?.trim();
    if (!address) {
      return undefined;
    }

    const port = globalThis.localStorage?.getItem(REMOTE_SERVER_PORT_STORAGE_KEY)?.trim() || '8000';
    return buildServerUrl(address, port);
  };

  const saveRemoteServerToStorage = (address: string, port: string) => {
    globalThis.localStorage?.setItem(REMOTE_SERVER_ADDRESS_STORAGE_KEY, address.trim());
    globalThis.localStorage?.setItem(REMOTE_SERVER_PORT_STORAGE_KEY, port.trim() || '8000');
  };

  const hasSessionCookies = (): boolean => {
    if (typeof document === 'undefined') {
      return false;
    }

    return document.cookie.split('; ').some((cookie) => {
      return cookie.startsWith('immich_is_authenticated=') || cookie.startsWith('lomo_session=');
    });
  };

  const applyServerUrl = (value?: string) => {
    if (!value) {
      return;
    }

    try {
      const normalized = value.includes('://') ? value : `http://${value}`;
      const parsed = new URL(normalized);
      serverAddress = parsed.hostname;
      serverPort = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
    } catch {
      // Keep the current manual input if the stored URL is malformed.
    }
  };

  const prepareRemoteLoginFields = () => {
    const storedRemoteUrl = getStoredRemoteServerUrl();
    if (storedRemoteUrl) {
      applyServerUrl(storedRemoteUrl);
      return;
    }

    serverAddress = '';
    serverPort = '8000';
  };

  const normalizeFolderPath = (value: string) => value.trim().replace(/[\\/]+$/, '');

  const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  };

  const loadInitialSetupStateFromProxy = async (): Promise<InitialSetupState> => {
    const response = await fetch('/api/lomo/settings', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to load proxy settings (${response.status})`);
    }

    return (await response.json()) as InitialSetupState;
  };

  const applyInitialSetupState = (setupState?: InitialSetupState) => {
    backendMode = setupState?.active_backend_mode ?? setupState?.backend_mode ?? 'local';
    needsLocalSetup = !!(setupState?.needs_local_setup ?? setupState?.setup_required);
    initialBackendChoiceMade = backendMode === 'remote' || !needsLocalSetup;
    setupPhotosDir = setupState?.local?.photos_dir ?? setupState?.photos_dir ?? '';
    configuredRemoteLomodUrl = setupState?.remote?.default_url ?? setupState?.remote_lomod_url ?? '';
    if (backendMode === 'local') {
      serverAddress = 'localhost';
      serverPort = '8000';
    } else {
      applyServerUrl(setupState?.remote?.default_url ?? setupState?.remote_lomod_url ?? getStoredRemoteServerUrl());
    }
  };

  const getTauriInvoke = (): TauriInvoke | null => {
    const globals = globalThis as TauriGlobals;
    const globalInvoke = globals.__TAURI__?.core?.invoke;
    if (typeof globalInvoke === 'function') {
      return globalInvoke;
    }

    const internalInvoke = globals.__TAURI_INTERNALS__?.invoke;
    if (typeof internalInvoke === 'function') {
      return internalInvoke;
    }

    return null;
  };

  const refreshSetupFolderInspection = async (photosDir = setupPhotosDir): Promise<LocalLibraryInspection | null> => {
    const invoke = getTauriInvoke();
    const nextDir = normalizeFolderPath(photosDir);
    if (!invoke || !nextDir) {
      setupFolderInspection = null;
      setupFolderInspectionLoading = false;
      return null;
    }

    setupFolderInspectionLoading = true;
    try {
      const inspection = (await invoke('inspect_local_library_folder', {
        photosDir: nextDir,
      })) as LocalLibraryInspection;
      if (normalizeFolderPath(setupPhotosDir) === nextDir) {
        setupFolderInspection = inspection;
      }
      return inspection;
    } finally {
      setupFolderInspectionLoading = false;
    }
  };

  const summarizeDetectedLibraryPath = (value: string) => {
    const normalizedPath = value.replace(/\//g, '\\');
    const normalizedBase = normalizeFolderPath(setupPhotosDir).replace(/\//g, '\\');
    const basePrefix = normalizedBase ? `${normalizedBase}\\` : '';
    if (basePrefix && normalizedPath.toLowerCase().startsWith(basePrefix.toLowerCase())) {
      return normalizedPath.slice(basePrefix.length);
    }

    const segments = normalizedPath.split('\\').filter(Boolean);
    return segments.slice(-2).join('\\') || normalizedPath;
  };

  const onSuccess = async (user: LoginResponseDto) => {
    await goto(data.continueUrl, { invalidateAll: true });
    eventManager.emit('AuthLogin', user);
  };

  const onFirstLogin = () => goto(Route.changePassword());
  const onOnboarding = () => goto(Route.onboarding());

  const loadInitialSetupState = async () => {
    const invoke = getTauriInvoke();
    isDesktop = !!invoke;
    setupStateWarning = '';

    if (!invoke) {
      backendMode = 'remote';
      chooserWasRequested = true;
      initialBackendChoiceMade = false;
      initialSetupLoading = false;
      return;
    }

    let setupState: InitialSetupState;
    try {
      setupState = await withTimeout(
        invoke('get_initial_setup_state') as Promise<InitialSetupState>,
        DESKTOP_SETUP_STATE_TIMEOUT_MS,
        'Desktop setup state',
      );
    } catch (error) {
      setupState = await loadInitialSetupStateFromProxy();
      setupStateWarning = `Desktop setup state did not respond; showing saved local proxy settings. ${
        error instanceof Error ? error.message : String(error)
      }`;
    }

    applyInitialSetupState(setupState);
    if (backendMode === 'local' && needsLocalSetup && setupPhotosDir.trim()) {
      await refreshSetupFolderInspection(setupPhotosDir);
    }

    initialSetupLoading = false;
  };

  const chooseBackend = (nextMode: BackendMode) => {
    errorMessage = '';
    setupErrorMessage = '';
    localFolderChangeErrorMessage = '';
    localFolderChangeSuccessMessage = '';
    changingLocalFolder = false;
    backendMode = nextMode;
  };

  const continueFromChooser = () => {
    errorMessage = '';
    setupErrorMessage = '';
    if (!isDesktop && backendMode === 'local') {
      backendMode = 'remote';
    }
    initialBackendChoiceMade = true;
    if (backendMode === 'remote') {
      prepareRemoteLoginFields();
      if (hasSessionCookies()) {
        void clearClientSession();
      }
    }
  };

  const applyShowChooserRequest = () => {
    const url = new URL(globalThis.location.href);
    if (url.searchParams.get(SHOW_CHOOSER_QUERY_PARAM) !== '1') {
      return;
    }

    chooserWasRequested = true;
    initialBackendChoiceMade = false;
    url.searchParams.delete(SHOW_CHOOSER_QUERY_PARAM);
    globalThis.history.replaceState(globalThis.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  };

  onMount(async () => {
    const progressTimer = setInterval(() => {
      if (!oauthLoading && !initialSetupLoading) {
        clearInterval(progressTimer);
        return;
      }
      loadingProgress = Math.min(95, loadingProgress + 2 + Math.random() * 3);
      if (loadingProgress >= 25) loadingStageIdx = Math.max(loadingStageIdx, 1);
      if (loadingProgress >= 55) loadingStageIdx = Math.max(loadingStageIdx, 2);
      if (loadingProgress >= 85) loadingStageIdx = Math.max(loadingStageIdx, 3);
    }, 90);

    try {
      await loadInitialSetupState();
      applyShowChooserRequest();
      if (isDesktop && backendMode === 'local' && needsLocalSetup) {
        oauthLoading = false;
        return;
      }
    } catch (error) {
      setupErrorMessage = `Failed to load setup state: ${error instanceof Error ? error.message : String(error)}`;
      needsLocalSetup = false;
      oauthLoading = false;
      initialSetupLoading = false;
      return;
    }

    let oauthEnabled = false;
    let oauthAutoLaunch = false;
    try {
      oauthEnabled = flags.oauth;
      oauthAutoLaunch = flags.oauthAutoLaunch;
    } catch {
      // featureFlagsManager not yet initialized (proxy slow to start) — treat oauth as disabled
    }

    if (!oauthEnabled) {
      oauthLoading = false;
      return;
    }

    if (oauth.isCallback(globalThis.location)) {
      try {
        const user = await oauth.login(globalThis.location);

        if (!user.isOnboarded) {
          await onOnboarding();
          return;
        }

        await onSuccess(user);
        return;
      } catch (error) {
        console.error('Error [login-form] [oauth.callback]', error);
        oauthError = getServerErrorMessage(error) || $t('errors.unable_to_complete_oauth_login');
        oauthLoading = false;
        return;
      }
    }

    try {
      if (
        (oauthAutoLaunch && !oauth.isAutoLaunchDisabled(globalThis.location)) ||
        oauth.isAutoLaunchEnabled(globalThis.location)
      ) {
        await goto(Route.login({ autoLaunch: 0 }), { replaceState: true });
        await oauth.authorize(globalThis.location);
        return;
      }
    } catch (error) {
      handleError(error, $t('errors.unable_to_connect'));
    }

    oauthLoading = false;
  });

  const handleLogin = async (credentials?: { email?: string; password?: string }) => {
    try {
      errorMessage = '';
      loading = true;
      const loginEmail = credentials?.email ?? email;
      const loginPassword = credentials?.password ?? password;

      // Set custom header so proxy knows which lomo-backend to use
      const lomoServerUrl =
        backendMode === 'remote' || !isDesktop ? buildServerUrl(serverAddress, serverPort) : 'http://localhost:8000';
      defaults.headers = { ...defaults.headers, 'X-Lomo-Server': lomoServerUrl };

      const user = await login({ loginCredentialDto: { email: loginEmail, password: loginPassword } });

      if (backendMode === 'remote' || !isDesktop) {
        saveRemoteServerToStorage(serverAddress, serverPort);
      }

      if (user.isAdmin && !serverConfig.isOnboarded) {
        await onOnboarding();
        return;
      }

      // change the user password before we onboard them
      if (!user.isAdmin && user.shouldChangePassword) {
        await onFirstLogin();
        return;
      }

      // We want to onboard after the first login since their password will change
      // and handleLogin will be called again (relogin). We then do onboarding on that next call.
      if (!user.isOnboarded) {
        await onOnboarding();
        return;
      }

      await onSuccess(user);
      return true;
    } catch (error) {
      errorMessage = getServerErrorMessage(error) || $t('errors.incorrect_email_or_password');
      loading = false;
      return false;
    }
  };

  const browseForSetupFolder = async () => {
    const invoke = getTauriInvoke();
    if (!invoke) {
      return;
    }

    setupErrorMessage = '';
    const selected = (await invoke('pick_folder')) as string | null;
    if (selected) {
      setupPhotosDir = selected;
      setupFolderInspection = null;
      await refreshSetupFolderInspection(selected);
    }
  };

  const startLocalFolderChange = async () => {
    errorMessage = '';
    setupErrorMessage = '';
    localFolderChangeErrorMessage = '';
    localFolderChangeSuccessMessage = '';
    changingLocalFolder = true;
    setupPhotosDir = localLibraryPreview;
    setupPassword = '';
    setupPasswordConfirm = '';
    setupFolderInspection = null;
    await refreshSetupFolderInspection(setupPhotosDir);
  };

  const cancelLocalFolderChange = () => {
    changingLocalFolder = false;
    localFolderChangeErrorMessage = '';
    setupFolderInspection = null;
    setupPhotosDir = localLibraryPreview;
    setupPassword = '';
    setupPasswordConfirm = '';
  };

  const handleLocalFolderChange = async () => {
    const nextDir = normalizeFolderPath(setupPhotosDir);
    if (!nextDir || localFolderChangeSaving || setupFolderInspectionLoading || useExistingLibraryLoading) {
      return;
    }

    const invoke = getTauriInvoke();
    if (!invoke) {
      localFolderChangeErrorMessage = 'Changing the local folder is only available in the desktop app.';
      return;
    }

    localFolderChangeSaving = true;
    localFolderChangeErrorMessage = '';
    localFolderChangeSuccessMessage = '';
    errorMessage = '';

    try {
      const inspection = await refreshSetupFolderInspection(nextDir);
      if (inspection?.has_existing_user_db) {
        localFolderChangeErrorMessage =
          'This folder contains an existing local library. Use Open existing library to continue with its accounts, or choose an empty folder.';
        return;
      }

      if (!setupPassword || setupPassword !== setupPasswordConfirm) {
        localFolderChangeErrorMessage = 'Create and confirm the new admin password for this local folder.';
        return;
      }

      const adminPassword = setupPassword;
      const setupState = (await invoke('create_new_local_library', {
        photosDir: nextDir,
        password: adminPassword,
      })) as InitialSetupState;
      await clearClientSession();
      applyInitialSetupState(setupState);
      changingLocalFolder = false;
      setupFolderInspection = null;
      setupPassword = '';
      setupPasswordConfirm = '';
      email = 'admin';
      password = adminPassword;
      localFolderChangeSuccessMessage =
        'New local library created. Sign in with admin and the password you just created.';
      await handleLogin({ email: 'admin', password: adminPassword });
    } catch (error) {
      localFolderChangeErrorMessage = `Failed to change local folder: ${
        error instanceof Error ? error.message : String(error)
      }`;
    } finally {
      localFolderChangeSaving = false;
    }
  };

  const handleInitialSetup = async () => {
    const nextDir = normalizeFolderPath(setupPhotosDir);
    if (!nextDir || !setupPassword || setupPassword !== setupPasswordConfirm || setupSaving) {
      return;
    }

    const invoke = getTauriInvoke();
    if (!invoke) {
      setupErrorMessage = 'Initial setup is only available in the desktop app.';
      return;
    }

    setupSaving = true;
    setupErrorMessage = '';
    errorMessage = '';

    const nextPassword = setupPassword;

    try {
      const inspection = await refreshSetupFolderInspection(nextDir);
      if (inspection?.has_existing_user_db) {
        setupErrorMessage =
          'This folder already contains local library data. Choose another folder or continue to sign in with the existing library.';
        return;
      }

      await invoke('complete_initial_setup', { photosDir: nextDir, password: nextPassword });
      email = 'admin';
      password = nextPassword;
      needsLocalSetup = false;
      const signedIn = await handleLogin({ email: 'admin', password: nextPassword });
      if (!signedIn) {
        errorMessage = errorMessage || 'Setup completed. Sign in with the admin password you just created.';
      }
    } catch (error) {
      setupErrorMessage = `Failed to complete setup: ${error instanceof Error ? error.message : String(error)}`;
      needsLocalSetup = true;
    } finally {
      setupSaving = false;
    }
  };

  const useExistingSelectedLibrary = async () => {
    const nextDir = normalizeFolderPath(setupPhotosDir);
    if (!nextDir || useExistingLibraryLoading) {
      return;
    }

    const invoke = getTauriInvoke();
    if (!invoke) {
      const message = 'Existing local libraries can only be opened in the desktop app.';
      if (changingLocalFolder) {
        localFolderChangeErrorMessage = message;
      } else {
        setupErrorMessage = message;
      }
      return;
    }

    setupErrorMessage = '';
    errorMessage = '';

    const inspection = await refreshSetupFolderInspection(nextDir);
    if (!inspection?.has_existing_user_db) {
      const message = 'No existing local library data was found in the selected folder.';
      if (changingLocalFolder) {
        localFolderChangeErrorMessage = message;
      } else {
        setupErrorMessage = message;
      }
      return;
    }

    useExistingLibraryLoading = true;
    try {
      const setupState = (await invoke('use_existing_local_library', {
        photosDir: nextDir,
      })) as InitialSetupState;
      setupFolderInspection = null;
      setupPassword = '';
      setupPasswordConfirm = '';
      applyInitialSetupState(setupState);
      changingLocalFolder = false;
      localFolderChangeSuccessMessage = 'Existing local library opened. Sign in with an account from that library.';
      await clearClientSession();
      if (needsLocalSetup) {
        setupErrorMessage =
          'Existing library data was found, but lomod did not expose any local users from this folder.';
      }
    } catch (error) {
      const message = `Failed to open existing library: ${error instanceof Error ? error.message : String(error)}`;
      if (changingLocalFolder) {
        localFolderChangeErrorMessage = message;
      } else {
        setupErrorMessage = message;
      }
    } finally {
      useExistingLibraryLoading = false;
    }
  };

  const handleOAuthLogin = async () => {
    oauthLoading = true;
    oauthError = '';
    const success = await oauth.authorize(globalThis.location);
    if (!success) {
      oauthLoading = false;
      oauthError = $t('errors.unable_to_login_with_oauth');
    }
  };

  const onsubmit = async (event: Event) => {
    event.preventDefault();
    await handleLogin();
  };

  const goBackToChooser = () => {
    initialBackendChoiceMade = false;
    changingLocalFolder = false;
    errorMessage = '';
    setupErrorMessage = '';
    localFolderChangeErrorMessage = '';
    localFolderChangeSuccessMessage = '';
    setupFolderInspection = null;
  };

  let showSetupPassword = $state(false);
  let showLoginPassword = $state(false);

  const showChooser = $derived(!initialBackendChoiceMade);
  const showServerTargetFields = $derived(!isDesktop || backendMode === 'remote');
  const canSubmitLogin = $derived(
    Boolean(email.trim()) &&
      Boolean(password) &&
      (!showServerTargetFields || Boolean(serverAddress.trim())) &&
      !loading,
  );
  const remoteTargetPreview = $derived.by(() => `http://${serverAddress.trim() || '—'}:${serverPort.trim() || '—'}`);
  const localLibraryPreview = $derived(
    setupPhotosDir.trim() || 'C:\\Users\\<user>\\AppData\\Roaming\\com.lomoware.photoviewer\\photos',
  );
</script>

<svelte:head>
  <title>{data.meta.title}</title>
</svelte:head>

<div class="onb-page">
  <div class="stage">
    <div class="stage-inner">
      {#if oauthLoading || initialSetupLoading}
        <div class="loader-wrap fade-in" role="status" aria-live="polite">
          <div class="brand brand--stacked">
            <div class="loader-logo"></div>
            <div class="loader-brand-block">
              <div class="loader-brand">Lomorage</div>
              <div class="loader-tag">PHOTO VIEWER</div>
            </div>
          </div>
          <div class="spinner" aria-hidden="true"></div>
          <div class="loader-status">{LOADING_STAGES[loadingStageIdx]}</div>
          <div class="loader-progress">
            <div class="loader-progress-fill" style="width: {loadingProgress}%"></div>
          </div>
        </div>
      {:else if !flags.passwordLogin && !flags.oauth}
        <section class="card fade-in">
          <div class="brand">
            <div class="brand-logo"></div>
            <div class="brand-text">
              <div class="brand-name">Lomorage</div>
              <div class="brand-tag">PHOTO VIEWER</div>
            </div>
          </div>
          <h1 class="card-title">Sign in unavailable</h1>
          <div class="alert alert--warning">{$t('login_has_been_disabled')}</div>
        </section>
      {:else if flags.passwordLogin && showChooser}
        <section class="card fade-in">
          <div class="brand">
            <div class="brand-logo"></div>
            <div class="brand-text">
              <div class="brand-name">Lomorage</div>
              <div class="brand-tag">PHOTO VIEWER</div>
            </div>
          </div>
          <h1 class="card-title">Welcome</h1>
          <div class="steps" aria-hidden="true">
            <div class="step-dot active"></div>
            <div class="step-dot"></div>
            <div class="step-dot"></div>
          </div>

          {#if serverConfig.loginPageMessage}
            <div class="alert alert--info">
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              {@html serverConfig.loginPageMessage}
            </div>
          {/if}
          {#if errorMessage}
            <div class="alert alert--danger">{errorMessage}</div>
          {/if}
          {#if setupErrorMessage}
            <div class="alert alert--danger">{setupErrorMessage}</div>
          {/if}
          {#if setupStateWarning}
            <div class="alert alert--warning">{setupStateWarning}</div>
          {/if}

          <div class="panel">
            <div class="panel-title">Where should your photos live?</div>
            <div class="panel-copy">
              Choose how this app stores and serves your library. You can change this later from Settings.
            </div>
          </div>

          <div class="choice-grid">
              <button
                type="button"
                class={`choice ${backendMode === 'local' ? 'active' : ''}`}
                onclick={() => chooseBackend('local')}
                disabled={!isDesktop || initialSetupLoading || loading || setupSaving}
              >
              <div class="choice-head">
                <div class="choice-title">This machine</div>
                <div class="choice-check" aria-hidden="true"></div>
              </div>
              <div class="choice-desc">
                {isDesktop
                  ? 'Store photos on your own computer. Uses the packaged lomod on localhost:8000.'
                  : 'Available in the desktop app only. Browser windows can connect to an existing server.'}
              </div>
            </button>

            <button
              type="button"
              class={`choice ${backendMode === 'remote' ? 'active' : ''}`}
              onclick={() => chooseBackend('remote')}
              disabled={initialSetupLoading || loading || setupSaving}
            >
              <div class="choice-head">
                <div class="choice-title">Remote server</div>
                <div class="choice-check" aria-hidden="true"></div>
              </div>
              <div class="choice-desc">Sign in to an existing Lomo backend on your network or in the cloud.</div>
            </button>
          </div>

          <div class="guidance">
            <div class="guidance-icon">i</div>
            <div>
              {#if isDesktop}
                Pick <strong>This machine</strong> to set up a fresh local library, or
                <strong>Remote server</strong> to connect to one you already run.
              {:else}
                Browser mode can only connect to an existing Lomo server. Use the desktop app for local library setup.
              {/if}
            </div>
          </div>

          <button
            type="button"
            class="btn"
            onclick={continueFromChooser}
            disabled={initialSetupLoading || loading || setupSaving}
          >
            Continue
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M4 2 L10 7 L4 12"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              ></path>
            </svg>
          </button>
        </section>
      {:else if flags.passwordLogin && showLocalSetupForm}
        <section class="card fade-in">
          <div class="brand">
            <div class="brand-logo"></div>
            <div class="brand-text">
              <div class="brand-name">Lomorage</div>
              <div class="brand-tag">PHOTO VIEWER</div>
            </div>
          </div>
          <h1 class="card-title">Create your library</h1>
          <div class="steps" aria-hidden="true">
            <div class="step-dot done"></div>
            <div class="step-dot active"></div>
            <div class="step-dot"></div>
          </div>

          {#if serverConfig.loginPageMessage}
            <div class="alert alert--info">
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              {@html serverConfig.loginPageMessage}
            </div>
          {/if}
          {#if setupStateWarning}
            <div class="alert alert--warning">{setupStateWarning}</div>
          {/if}

          <div class="panel">
            <div class="panel-title">Current Backend</div>
            <div class="panel-grid">
              <div class="panel-row">
                <div class="panel-label">Mode</div>
                <div class="panel-value">This machine</div>
              </div>
              <div class="panel-row">
                <div class="panel-label">Sign-in target</div>
                <div class="panel-value mono">http://localhost:8000</div>
              </div>
              <div class="panel-row full">
                <div class="panel-label">Local library root</div>
                <div class="panel-value mono">{localLibraryPreview}</div>
              </div>
            </div>
            <p class="panel-note">
              {#if hasExistingLibraryInSelectedFolder}
                Existing user library data was detected in this folder. Continue to sign in instead of creating a new
                admin account.
              {:else}
                Your admin account will be created inside the selected library folder.
              {/if}
            </p>
          </div>

          <form
            class="fields"
            onsubmit={(event) => {
              event.preventDefault();
              handleInitialSetup();
            }}
          >
            <label class="field">
              <span>Photos folder</span>
              <div class="field-input-row">
                <input
                  class="field-input"
                  type="text"
                  bind:value={setupPhotosDir}
                  placeholder="Select a folder for photo storage"
                  disabled={setupSaving || useExistingLibraryLoading}
                  oninput={() => {
                    setupFolderInspection = null;
                  }}
                  onblur={() => void refreshSetupFolderInspection()}
                />
                <button
                  type="button"
                  class="field-input-action"
                  onclick={browseForSetupFolder}
                  disabled={!isDesktop || setupSaving || useExistingLibraryLoading}
                >
                  Browse
                </button>
              </div>
              <div class="field-hint">Admin home: <code>{setupAdminPath}</code></div>
            </label>

            {#if hasExistingLibraryInSelectedFolder}
              <div class="existing-library-warning">
                <div class="existing-library-title">Existing local library data found</div>
                <div class="existing-library-copy">
                  This folder already contains <code>assets.db</code>. Lomod keeps its active database in AppData, but
                  it will read the existing user database from this library folder and continue with those accounts.
                </div>
                <div class="existing-library-paths">
                  {#each existingLibraryDbPaths as dbPath (dbPath)}
                    <div class="existing-library-path">
                      <code>{summarizeDetectedLibraryPath(dbPath)}</code>
                    </div>
                  {/each}
                </div>
                <div class="btn-row">
                  <button
                    type="button"
                    class="btn secondary"
                    onclick={browseForSetupFolder}
                    disabled={!isDesktop || setupSaving || useExistingLibraryLoading}
                  >
                    Choose another folder
                  </button>
                  <button
                    type="button"
                    class="btn"
                    onclick={useExistingSelectedLibrary}
                    disabled={setupFolderInspectionLoading || setupSaving || useExistingLibraryLoading}
                  >
                    {useExistingLibraryLoading ? 'Opening library…' : 'Continue to sign in'}
                  </button>
                </div>
              </div>
            {:else}
              <label class="field">
                <span>Create a password</span>
                <div class="field-input-row">
                  <input
                    class="field-input field-input--with-toggle"
                    type={showSetupPassword ? 'text' : 'password'}
                    bind:value={setupPassword}
                    autocomplete="new-password"
                    disabled={setupSaving}
                    maxlength={64}
                    placeholder="At least 8 characters"
                  />
                  <button
                    type="button"
                    class="field-input-toggle"
                    onclick={() => (showSetupPassword = !showSetupPassword)}
                    aria-label={showSetupPassword ? 'Hide password' : 'Show password'}
                  >
                    {showSetupPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div class="strength" aria-hidden="true">
                  {#each [0, 1, 2] as i (i)}
                    <div class={`strength-bar ${i < passwordStrength ? `on-${passwordStrength}` : ''}`}></div>
                  {/each}
                </div>
                <div class="strength-label">
                  <span>{setupPassword ? strengthLabel : 'Use 8+ characters, mix of letters and numbers.'}</span>
                  <span>{setupPassword.length}/64</span>
                </div>
              </label>

              <label class="field">
                <span>Confirm password</span>
                <input
                  class="field-input"
                  type="password"
                  bind:value={setupPasswordConfirm}
                  autocomplete="new-password"
                  disabled={setupSaving}
                  placeholder="Re-enter password"
                />
                {#if setupPasswordConfirm}
                  {#if setupPasswordMismatch}
                    <div class="field-hint error">{setupPasswordMismatch}</div>
                  {:else}
                    <div class="field-hint success">Passwords match</div>
                  {/if}
                {/if}
              </label>
            {/if}

            {#if setupErrorMessage}
              <div class="alert alert--danger">{setupErrorMessage}</div>
            {/if}
            {#if !isDesktop}
              <div class="alert alert--info">Running without Tauri. Folder browsing is unavailable in this window.</div>
            {/if}

            {#if hasExistingLibraryInSelectedFolder}
              <div class="btn-row btn-row--single">
                <button
                  type="button"
                  class="btn secondary"
                  onclick={goBackToChooser}
                  disabled={setupSaving || useExistingLibraryLoading}
                >
                  Back
                </button>
              </div>
            {:else}
              <div class="btn-row">
                <button
                  type="button"
                  class="btn secondary"
                  onclick={goBackToChooser}
                  disabled={setupSaving || useExistingLibraryLoading}
                >
                  Back
                </button>
                <button
                  type="submit"
                  class="btn"
                  disabled={!canCompleteSetup || initialSetupLoading || useExistingLibraryLoading}
                >
                  {setupSaving ? 'Creating…' : 'Create library'}
                </button>
              </div>
            {/if}
          </form>
        </section>
      {:else if flags.passwordLogin && showLocalFolderChangeForm}
        <section class="card fade-in">
          <div class="brand">
            <div class="brand-logo"></div>
            <div class="brand-text">
              <div class="brand-name">Lomorage</div>
              <div class="brand-tag">PHOTO VIEWER</div>
            </div>
          </div>
          <h1 class="card-title">Change local folder</h1>
          <div class="steps" aria-hidden="true">
            <div class="step-dot done"></div>
            <div class="step-dot active"></div>
            <div class="step-dot"></div>
          </div>

          {#if localFolderChangeErrorMessage}
            <div class="alert alert--danger">{localFolderChangeErrorMessage}</div>
          {/if}
          {#if setupStateWarning}
            <div class="alert alert--warning">{setupStateWarning}</div>
          {/if}

          <div class="panel">
            <div class="panel-title">Local Backend</div>
            <div class="panel-grid">
              <div class="panel-row">
                <div class="panel-label">Mode</div>
                <div class="panel-value">This machine</div>
              </div>
              <div class="panel-row">
                <div class="panel-label">Sign-in target</div>
                <div class="panel-value mono">http://localhost:8000</div>
              </div>
              <div class="panel-row full">
                <div class="panel-label">Current local folder</div>
                <div class="panel-value mono">{localLibraryPreview}</div>
              </div>
            </div>
            <p class="panel-note">
              Choose an empty folder to create a new local library with a new admin password. If the folder already has
              local library data, open it with that library's existing account instead.
            </p>
          </div>

          <form
            class="fields"
            onsubmit={(event) => {
              event.preventDefault();
              handleLocalFolderChange();
            }}
          >
            <label class="field">
              <span>Photos folder</span>
              <div class="field-input-row">
                <input
                  class="field-input"
                  type="text"
                  bind:value={setupPhotosDir}
                  placeholder="Select the local folder for this computer"
                  disabled={localFolderChangeSaving || useExistingLibraryLoading}
                  oninput={() => {
                    setupFolderInspection = null;
                    localFolderChangeErrorMessage = '';
                  }}
                  onblur={() => void refreshSetupFolderInspection()}
                />
                <button
                  type="button"
                  class="field-input-action"
                  onclick={browseForSetupFolder}
                  disabled={!isDesktop || localFolderChangeSaving || useExistingLibraryLoading}
                >
                  Browse
                </button>
              </div>
              <div class="field-hint">
                Empty folder: create a new admin password. Existing library: sign in with that library's accounts.
              </div>
            </label>

            {#if hasExistingLibraryInSelectedFolder}
              <div class="existing-library-warning">
                <div class="existing-library-title">Existing local library data found</div>
                <div class="existing-library-copy">
                  This folder contains <code>assets.db</code>. Open it only if you want the bundled
                  <code>lomod</code> to use that local library and its existing accounts.
                </div>
                <div class="existing-library-paths">
                  {#each existingLibraryDbPaths as dbPath (dbPath)}
                    <div class="existing-library-path">
                      <code>{summarizeDetectedLibraryPath(dbPath)}</code>
                    </div>
                  {/each}
                </div>
                <div class="btn-row">
                  <button
                    type="button"
                    class="btn secondary"
                    onclick={browseForSetupFolder}
                    disabled={!isDesktop || localFolderChangeSaving || useExistingLibraryLoading}
                  >
                    Choose another folder
                  </button>
                  <button
                    type="button"
                    class="btn"
                    onclick={useExistingSelectedLibrary}
                    disabled={setupFolderInspectionLoading || localFolderChangeSaving || useExistingLibraryLoading}
                  >
                    {useExistingLibraryLoading ? 'Opening library…' : 'Open existing library'}
                  </button>
                </div>
              </div>
            {:else}
              <label class="field">
                <span>Create a new admin password</span>
                <div class="field-input-row">
                  <input
                    class="field-input field-input--with-toggle"
                    type={showSetupPassword ? 'text' : 'password'}
                    bind:value={setupPassword}
                    autocomplete="new-password"
                    disabled={localFolderChangeSaving}
                    maxlength={64}
                    placeholder="At least 8 characters"
                  />
                  <button
                    type="button"
                    class="field-input-toggle"
                    onclick={() => (showSetupPassword = !showSetupPassword)}
                    aria-label={showSetupPassword ? 'Hide password' : 'Show password'}
                  >
                    {showSetupPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div class="strength" aria-hidden="true">
                  {#each [0, 1, 2] as i (i)}
                    <div class={`strength-bar ${i < passwordStrength ? `on-${passwordStrength}` : ''}`}></div>
                  {/each}
                </div>
                <div class="strength-label">
                  <span>{setupPassword ? strengthLabel : 'Use 8+ characters, mix of letters and numbers.'}</span>
                  <span>{setupPassword.length}/64</span>
                </div>
              </label>

              <label class="field">
                <span>Confirm new admin password</span>
                <input
                  class="field-input"
                  type="password"
                  bind:value={setupPasswordConfirm}
                  autocomplete="new-password"
                  disabled={localFolderChangeSaving}
                  placeholder="Re-enter password"
                />
                {#if setupPasswordConfirm}
                  {#if setupPasswordMismatch}
                    <div class="field-hint error">{setupPasswordMismatch}</div>
                  {:else}
                    <div class="field-hint success">Passwords match</div>
                  {/if}
                {/if}
              </label>
            {/if}

            <div class="btn-row">
              <button
                type="button"
                class="btn secondary"
                onclick={cancelLocalFolderChange}
                disabled={localFolderChangeSaving || useExistingLibraryLoading}
              >
                Back
              </button>
              {#if !hasExistingLibraryInSelectedFolder}
                <button type="submit" class="btn" disabled={!canChangeLocalFolder}>
                  {localFolderChangeSaving ? 'Creating…' : 'Create new library'}
                </button>
              {/if}
            </div>
          </form>
        </section>
      {:else}
        <section class={`card fade-in ${showServerTargetFields ? 'card-wide' : ''}`}>
          <div class="brand">
            <div class="brand-logo"></div>
            <div class="brand-text">
              <div class="brand-name">Lomorage</div>
              <div class="brand-tag">PHOTO VIEWER</div>
            </div>
          </div>
          <h1 class="card-title">
            {flags.passwordLogin ? (showServerTargetFields ? 'Connect to a Lomo server' : 'Sign in') : 'Continue'}
          </h1>
          {#if flags.passwordLogin}
            <div class="steps" aria-hidden="true">
              <div class="step-dot done"></div>
              <div class="step-dot active"></div>
              <div class="step-dot"></div>
            </div>
          {/if}

          {#if serverConfig.loginPageMessage}
            <div class="alert alert--info">
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              {@html serverConfig.loginPageMessage}
            </div>
          {/if}
          {#if errorMessage}
            <div class="alert alert--danger">{errorMessage}</div>
          {/if}
          {#if setupStateWarning}
            <div class="alert alert--warning">{setupStateWarning}</div>
          {/if}
          {#if localFolderChangeSuccessMessage}
            <div class="alert alert--success">{localFolderChangeSuccessMessage}</div>
          {/if}

          {#if flags.passwordLogin}
            <div class="panel">
              <div class="panel-title">Current Backend</div>
              <div class="panel-grid">
                <div class="panel-row">
                  <div class="panel-label">Mode</div>
                  <div class="panel-value">{showServerTargetFields ? 'Remote server' : 'This machine'}</div>
                </div>
                <div class="panel-row">
                  <div class="panel-label">Sign-in target</div>
                  <div class="panel-value mono">
                    {showServerTargetFields ? remoteTargetPreview : 'http://localhost:8000'}
                  </div>
                </div>
                {#if !showServerTargetFields}
                  <div class="panel-row full">
                    <div class="panel-label">Local library root</div>
                    <div class="panel-value mono">{localLibraryPreview}</div>
                  </div>
                {/if}
              </div>
              {#if showServerTargetFields}
                <p class="panel-note">
                  The remote address is remembered separately from your local desktop storage settings.
                </p>
              {:else}
                <p class="panel-note">
                  Need another local folder? Use the folder change option below. It restarts the bundled
                  <code>lomod</code> and then asks you to sign in again.
                </p>
              {/if}
            </div>

            <form {onsubmit} class="fields">
              {#if showServerTargetFields}
                <div class="field-row">
                  <label class="field">
                    <span>Server address</span>
                    <input
                      class="field-input"
                      id="serverAddress"
                      name="serverAddress"
                      type="text"
                      placeholder="192.168.1.73 or lomo.example.com"
                      bind:value={serverAddress}
                    />
                  </label>
                  <label class="field">
                    <span>Port</span>
                    <input
                      class="field-input"
                      id="serverPort"
                      name="serverPort"
                      type="text"
                      placeholder="8000"
                      bind:value={serverPort}
                    />
                  </label>
                </div>
              {/if}

              <label class="field">
                <span>{$t('username')}</span>
                <input
                  class="field-input"
                  id="email"
                  name="email"
                  type="text"
                  autocomplete="username"
                  bind:value={email}
                  placeholder="admin"
                />
              </label>

              <label class="field">
                <span>{$t('password')}</span>
                <div class="field-input-row">
                  <input
                    class="field-input field-input--with-toggle"
                    id="password"
                    name="password"
                    type={showLoginPassword ? 'text' : 'password'}
                    autocomplete="current-password"
                    bind:value={password}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    class="field-input-toggle"
                    onclick={() => (showLoginPassword = !showLoginPassword)}
                    aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                  >
                    {showLoginPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>

              <div class="btn-row">
                {#if isDesktop || chooserWasRequested}
                  <button type="button" class="btn secondary" onclick={goBackToChooser} disabled={loading}>
                    Back
                  </button>
                {/if}
                <button type="submit" class="btn" disabled={!canSubmitLogin}>
                  {loading ? 'Signing in…' : $t('to_login')}
                </button>
              </div>
            </form>

            {#if isDesktop && !showServerTargetFields}
              <div class="local-folder-action">
                <div>
                  <div class="local-folder-action-title">Need to use another folder?</div>
                  <div class="local-folder-action-copy">
                    Change the folder used by this computer's local <code>lomod</code>.
                  </div>
                </div>
                <button type="button" class="btn secondary compact" onclick={startLocalFolderChange} disabled={loading}>
                  Use a different local folder
                </button>
              </div>
            {/if}
          {/if}

          {#if flags.oauth}
            {#if flags.passwordLogin}
              <div class="divider"><span>{$t('or')}</span></div>
            {/if}
            {#if oauthError}
              <div class="alert alert--danger">{oauthError}</div>
            {/if}
            <button
              type="button"
              class="btn secondary full"
              onclick={handleOAuthLogin}
              disabled={loading || oauthLoading}
            >
              {serverConfig.oauthButtonText}
            </button>
          {/if}
        </section>
      {/if}
    </div>
  </div>
</div>

<style>
  :global(html),
  :global(body) {
    background: #d7d4e6;
  }
  :global(.dark) :global(html),
  :global(.dark) :global(body) {
    background: #1a1628;
  }

  .onb-page {
    --bg-page: #f4f2f7;
    --bg-card: #ffffff;
    --bg-panel: #eeebfb;
    --border-soft: #e6e2f2;
    --border-strong: #d6cff0;
    --ink-900: #1e1a3a;
    --ink-700: #3a3565;
    --ink-500: #6b6590;
    --ink-400: #8d86ad;
    --ink-300: #b4afcb;
    --brand: #5146c7;
    --brand-ink: #4035b5;
    --brand-soft: #ebe7fb;
    --brand-tint: #f3f0fd;
    --success: #21a36a;
    --danger: #d14a4a;
    --warning: #b37420;
    --shadow-card: 0 1px 2px rgba(30, 26, 58, 0.04), 0 20px 48px rgba(30, 26, 58, 0.1);
    --radius-card: 14px;
    --radius-sm: 8px;
    --radius-md: 10px;
    --radius-pill: 999px;
    min-height: 100vh;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background:
      radial-gradient(ellipse at 20% 10%, rgba(81, 70, 199, 0.14), transparent 50%),
      radial-gradient(ellipse at 90% 90%, rgba(81, 70, 199, 0.1), transparent 40%), #d7d4e6;
    font-family:
      'Roboto',
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      system-ui,
      sans-serif;
    color: var(--ink-900);
    -webkit-font-smoothing: antialiased;
  }
  :global(.dark) .onb-page {
    --bg-card: #231d38;
    --bg-panel: rgba(81, 70, 199, 0.14);
    --border-soft: rgba(255, 255, 255, 0.08);
    --border-strong: rgba(81, 70, 199, 0.45);
    --ink-900: #f2efff;
    --ink-700: #ece9ff;
    --ink-500: #b4afcb;
    --ink-400: rgba(255, 255, 255, 0.55);
    --ink-300: rgba(255, 255, 255, 0.35);
    --brand-soft: rgba(81, 70, 199, 0.22);
    --brand-tint: rgba(81, 70, 199, 0.1);
    background:
      radial-gradient(ellipse at 20% 10%, rgba(81, 70, 199, 0.32), transparent 50%),
      radial-gradient(ellipse at 90% 90%, rgba(81, 70, 199, 0.24), transparent 40%), #1a1628;
  }

  .stage {
    width: min(1100px, 100%);
    min-height: min(720px, calc(100vh - 48px));
    display: flex;
    align-items: flex-start;
    justify-content: center;
    position: relative;
    padding: 32px 24px;
    overflow: auto;
    background:
      radial-gradient(ellipse at 20% 10%, rgba(81, 70, 199, 0.09), transparent 50%),
      radial-gradient(ellipse at 90% 90%, rgba(81, 70, 199, 0.07), transparent 40%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.32) 0%, rgba(255, 255, 255, 0.16) 100%);
    border-radius: 28px;
    box-shadow: 0 28px 72px rgba(30, 26, 58, 0.12);
  }
  :global(.dark) .stage {
    background:
      radial-gradient(ellipse at 20% 10%, rgba(81, 70, 199, 0.2), transparent 50%),
      radial-gradient(ellipse at 90% 90%, rgba(81, 70, 199, 0.16), transparent 40%),
      linear-gradient(180deg, rgba(35, 29, 56, 0.78) 0%, rgba(31, 26, 49, 0.92) 100%);
    box-shadow: 0 28px 72px rgba(0, 0, 0, 0.32);
  }
  .stage-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100%;
    width: 100%;
    gap: 16px;
  }

  .card {
    width: 460px;
    max-width: 100%;
    background: var(--bg-card);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    padding: 22px 28px 24px;
    position: relative;
    flex-shrink: 0;
  }
  .card-wide {
    width: 560px;
  }
  :global(.dark) .card {
    box-shadow:
      0 20px 45px rgba(0, 0, 0, 0.35),
      0 0 0 1px rgba(255, 255, 255, 0.04);
  }

  .brand {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-bottom: 4px;
  }
  .brand--stacked {
    flex-direction: column;
    gap: 14px;
  }
  .brand-logo {
    width: 30px;
    height: 30px;
    border-radius: 30%;
    background: url('/lomorage-icon.png') center / contain no-repeat;
    flex-shrink: 0;
  }
  .brand-logo::after {
    content: none;
  }
  .brand-text {
    text-align: left;
    line-height: 1;
  }
  .brand-name {
    font-size: 22px;
    font-weight: 700;
    color: var(--brand);
    letter-spacing: -0.01em;
  }
  .brand-tag {
    font-size: 9px;
    letter-spacing: 0.22em;
    color: var(--brand);
    opacity: 0.75;
    margin-top: 3px;
    font-weight: 500;
  }

  .card-title {
    font-size: 26px;
    font-weight: 700;
    color: var(--brand);
    text-align: center;
    margin: 4px 0 14px;
    letter-spacing: -0.01em;
  }

  .steps {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin: 0 0 14px;
  }
  .step-dot {
    height: 4px;
    width: 22px;
    border-radius: 2px;
    background: var(--border-strong);
    transition: all 0.3s ease;
  }
  .step-dot.active {
    background: var(--brand);
    width: 32px;
  }
  .step-dot.done {
    background: var(--brand);
    opacity: 0.5;
  }

  .panel {
    background: var(--bg-panel);
    border-radius: var(--radius-md);
    padding: 12px 14px;
    margin-bottom: 14px;
    border: 1px solid transparent;
  }
  .panel-title {
    font-size: 12px;
    color: var(--brand);
    font-weight: 600;
    margin-bottom: 10px;
  }
  .panel-copy {
    font-size: 12.5px;
    color: var(--ink-500);
    line-height: 1.55;
  }
  .panel-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 16px;
  }
  .panel-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .panel-row.full {
    grid-column: 1 / -1;
  }
  .panel-label {
    font-size: 11px;
    color: var(--ink-500);
  }
  .panel-value {
    font-size: 12.5px;
    color: var(--brand);
    font-weight: 500;
    word-break: break-all;
  }
  .panel-value.mono {
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11.5px;
  }
  .panel-note {
    font-size: 11.5px;
    color: var(--ink-500);
    line-height: 1.5;
    margin: 10px 0 0;
    padding-top: 10px;
    border-top: 1px solid rgba(81, 70, 199, 0.12);
  }

  .choice-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 16px;
  }
  @media (max-width: 520px) {
    .choice-grid {
      grid-template-columns: 1fr;
    }
  }
  .choice {
    background: #fff;
    border: 1.5px solid var(--border-soft);
    border-radius: var(--radius-md);
    padding: 12px 14px;
    cursor: pointer;
    transition: all 0.18s ease;
    text-align: left;
    font-family: inherit;
    color: inherit;
    position: relative;
  }
  :global(.dark) .choice {
    background: rgba(255, 255, 255, 0.02);
  }
  .choice:hover:not(:disabled) {
    border-color: var(--border-strong);
    background: var(--brand-tint);
  }
  .choice:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .choice.active {
    border-color: var(--brand);
    background: var(--brand-soft);
    box-shadow: 0 0 0 3px rgba(81, 70, 199, 0.1);
  }
  .choice-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  .choice-title {
    font-size: 13.5px;
    color: var(--brand);
    font-weight: 600;
  }
  .choice-check {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1.5px solid var(--border-strong);
    display: grid;
    place-items: center;
  }
  .choice.active .choice-check {
    background: var(--brand);
    border-color: var(--brand);
  }
  .choice.active .choice-check::after {
    content: '';
    width: 5px;
    height: 8px;
    border: solid #fff;
    border-width: 0 1.5px 1.5px 0;
    transform: rotate(45deg) translate(-0.5px, -0.5px);
  }
  .choice-desc {
    font-size: 11.5px;
    color: var(--ink-500);
    line-height: 1.45;
  }
  .choice-desc code,
  .field-hint code,
  .panel-note code,
  .alert code {
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 10.5px;
    background: rgba(81, 70, 199, 0.1);
    color: var(--brand);
    padding: 1px 5px;
    border-radius: 3px;
  }

  .guidance {
    background: var(--brand-tint);
    border-radius: var(--radius-md);
    padding: 14px 16px;
    display: flex;
    gap: 12px;
    align-items: flex-start;
    font-size: 12.5px;
    color: var(--ink-700);
    line-height: 1.55;
    margin-bottom: 18px;
  }
  .guidance-icon {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1.5px solid var(--brand);
    color: var(--brand);
    display: grid;
    place-items: center;
    flex-shrink: 0;
    margin-top: 1px;
    font-size: 11px;
    font-weight: 700;
    font-style: italic;
    font-family: Georgia, serif;
  }
  .guidance strong {
    color: var(--ink-900);
    font-weight: 600;
  }

  .existing-library-warning {
    background: rgba(224, 155, 58, 0.08);
    border: 1px solid rgba(224, 155, 58, 0.24);
    border-radius: var(--radius-md);
    padding: 14px 16px;
    display: grid;
    gap: 10px;
  }
  .existing-library-title {
    font-size: 13px;
    color: var(--warning);
    font-weight: 700;
  }
  .existing-library-copy {
    font-size: 12.5px;
    color: var(--ink-700);
    line-height: 1.55;
  }
  .existing-library-paths {
    display: grid;
    gap: 6px;
  }
  .existing-library-path {
    font-size: 11.5px;
    color: var(--ink-700);
  }

  .fields {
    display: grid;
    gap: 12px;
    margin-bottom: 14px;
  }
  .field-row {
    display: grid;
    grid-template-columns: 1fr 120px;
    gap: 10px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field span {
    display: block;
    font-size: 12px;
    color: var(--ink-700);
    font-weight: 500;
  }
  .field-input-row {
    position: relative;
    display: flex;
    align-items: stretch;
    gap: 10px;
  }
  .field-input {
    width: 100%;
    height: 38px;
    padding: 0 12px;
    border: 1.5px solid var(--border-soft);
    border-radius: var(--radius-sm);
    background: #fff;
    font-family: inherit;
    font-size: 13px;
    color: var(--ink-900);
    outline: none;
    transition: all 0.15s ease;
  }
  :global(.dark) .field-input {
    background: rgba(255, 255, 255, 0.04);
    color: var(--ink-900);
  }
  .field-input::placeholder {
    color: var(--ink-300);
  }
  .field-input:focus {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(81, 70, 199, 0.12);
  }
  .field-input:disabled,
  .field-input-action:disabled,
  .field-input-toggle:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .field-input--with-toggle {
    padding-right: 60px;
  }
  .field-input-action {
    height: 38px;
    padding: 0 14px;
    border-radius: var(--radius-sm);
    border: 1.5px solid var(--border-soft);
    background: #fff;
    color: var(--brand);
    font-family: inherit;
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }
  :global(.dark) .field-input-action {
    background: rgba(255, 255, 255, 0.04);
  }
  .field-input-action:hover:not(:disabled) {
    border-color: var(--brand);
    background: var(--brand-tint);
  }
  .field-input-toggle {
    position: absolute;
    right: 8px;
    top: 8px;
    height: 22px;
    background: transparent;
    border: none;
    font-size: 11px;
    color: var(--ink-500);
    cursor: pointer;
    padding: 0 6px;
    font-family: inherit;
  }
  .field-input-toggle:hover:not(:disabled) {
    color: var(--brand);
  }
  .field-hint {
    font-size: 11.5px;
    color: var(--ink-500);
    line-height: 1.4;
  }
  .field-hint.error {
    color: var(--danger);
  }
  .field-hint.success {
    color: var(--success);
  }

  .strength {
    display: flex;
    gap: 4px;
    margin-top: 8px;
  }
  .strength-bar {
    flex: 1;
    height: 3px;
    border-radius: 2px;
    background: var(--border-soft);
    transition: all 0.2s;
  }
  .strength-bar.on-1 {
    background: #e09b3a;
  }
  .strength-bar.on-2 {
    background: #c7a832;
  }
  .strength-bar.on-3 {
    background: var(--success);
  }
  .strength-label {
    font-size: 11px;
    color: var(--ink-500);
    margin-top: 6px;
    display: flex;
    justify-content: space-between;
  }

  .btn {
    width: 100%;
    height: 44px;
    border: none;
    border-radius: var(--radius-pill);
    background: var(--brand);
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .btn:hover:not(:disabled) {
    background: var(--brand-ink);
  }
  .btn:active:not(:disabled) {
    transform: translateY(1px);
  }
  .btn:disabled {
    background: #b4afcb;
    cursor: not-allowed;
  }
  .btn.secondary {
    background: transparent;
    color: var(--brand);
    border: 1.5px solid var(--border-strong);
  }
  .btn.secondary:hover:not(:disabled) {
    background: var(--brand-tint);
  }
  .btn.full {
    width: 100%;
  }
  .btn.compact {
    width: auto;
    min-width: 210px;
    padding: 0 18px;
    white-space: nowrap;
  }
  .btn-row {
    display: flex;
    gap: 10px;
    margin-top: 2px;
  }
  .btn-row--single {
    justify-content: flex-start;
  }
  .btn-row .btn.secondary {
    flex: 0 0 auto;
    width: 120px;
  }

  .alert {
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    font-size: 12.5px;
    line-height: 1.5;
    margin-bottom: 14px;
  }
  .alert--info {
    background: var(--brand-tint);
    color: var(--brand-ink);
    border: 1px solid var(--brand-soft);
  }
  .alert--danger {
    background: rgba(209, 74, 74, 0.08);
    color: var(--danger);
    border: 1px solid rgba(209, 74, 74, 0.25);
  }
  .alert--warning {
    background: rgba(224, 155, 58, 0.1);
    color: var(--warning);
    border: 1px solid rgba(224, 155, 58, 0.3);
  }
  .alert--success {
    background: rgba(33, 163, 106, 0.1);
    color: var(--success);
    border: 1px solid rgba(33, 163, 106, 0.28);
  }
  .alert :global(p:first-child) {
    margin-top: 0;
  }
  .alert :global(p:last-child) {
    margin-bottom: 0;
  }

  .divider {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 6px 0 14px;
  }
  .divider::before {
    content: '';
    position: absolute;
    inset: 50% 0 auto 0;
    height: 1px;
    background: var(--border-soft);
  }
  .divider span {
    position: relative;
    padding: 0 12px;
    background: var(--bg-card);
    color: var(--ink-400);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .local-folder-action {
    margin-top: 14px;
    padding: 12px 14px;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    background: rgba(81, 70, 199, 0.04);
  }
  .local-folder-action-title {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--ink-900);
    margin-bottom: 3px;
  }
  .local-folder-action-copy {
    font-size: 11.5px;
    color: var(--ink-500);
    line-height: 1.45;
  }
  .local-folder-action-copy code {
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 10.5px;
    background: rgba(81, 70, 199, 0.1);
    color: var(--brand);
    padding: 1px 5px;
    border-radius: 3px;
  }

  .loader-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
  }
  .loader-logo {
    width: 64px;
    height: 64px;
    border-radius: 30%;
    background: url('/lomorage-icon.png') center / contain no-repeat;
  }
  .loader-logo::after {
    content: none;
  }
  .loader-brand-block {
    text-align: center;
  }
  .loader-brand {
    font-size: 32px;
    font-weight: 700;
    color: var(--brand);
    letter-spacing: -0.01em;
    line-height: 1;
  }
  .loader-tag {
    font-size: 11px;
    letter-spacing: 0.26em;
    color: var(--brand);
    opacity: 0.7;
    margin-top: 6px;
    text-align: center;
    font-weight: 500;
  }
  .spinner {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2.5px solid var(--brand-soft);
    border-top-color: var(--brand);
    animation: spin 0.9s linear infinite;
  }
  .loader-status {
    font-size: 13px;
    color: var(--ink-500);
    min-height: 18px;
    font-variant-numeric: tabular-nums;
  }
  .loader-progress {
    width: 240px;
    height: 3px;
    background: var(--border-soft);
    border-radius: 2px;
    overflow: hidden;
  }
  .loader-progress-fill {
    height: 100%;
    background: var(--brand);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .fade-in {
    animation: fadeIn 0.35s ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 720px) {
    .onb-page {
      padding: 12px;
    }

    .stage {
      min-height: calc(100vh - 24px);
      padding: 18px 16px;
      border-radius: 22px;
    }

    .card {
      padding: 20px 18px;
    }

    .field-row,
    .btn-row {
      grid-template-columns: 1fr;
      display: grid;
    }

    .btn-row .btn.secondary {
      width: 100%;
    }

    .local-folder-action {
      align-items: stretch;
      display: grid;
    }

    .btn.compact {
      width: 100%;
      min-width: 0;
      white-space: normal;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .fade-in,
    .spinner {
      animation-duration: 0s !important;
    }
  }
</style>
