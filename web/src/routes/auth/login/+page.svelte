<script lang="ts">
  import { goto } from '$app/navigation';
  import AuthPageLayout from '$lib/components/layouts/AuthPageLayout.svelte';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import { serverConfigManager } from '$lib/managers/server-config-manager.svelte';
  import { Route } from '$lib/route';
  import { oauth } from '$lib/utils';
  import { getServerErrorMessage, handleError } from '$lib/utils/handle-error';
  import { defaults, login, type LoginResponseDto } from '@immich/sdk';
  import { Alert, Button, Field, Input, PasswordInput, Stack } from '@immich/ui';
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
  type InitialSetupState = {
    photos_dir?: string;
    setup_required?: boolean;
  };

  let { data }: Props = $props();

  let errorMessage: string = $state('');
  let email = $state('');
  let password = $state('');
  let serverAddress = $state(globalThis.localStorage?.getItem('lomo_server_address') || 'localhost');
  let serverPort = $state(globalThis.localStorage?.getItem('lomo_server_port') || '8000');
  let oauthError = $state('');
  let loading = $state(false);
  let oauthLoading = $state(true);
  let isDesktop = $state(false);
  let initialSetupLoading = $state(true);
  let showInitialSetup = $state(false);
  let setupPhotosDir = $state('');
  let setupPassword = $state('');
  let setupPasswordConfirm = $state('');
  let setupSaving = $state(false);
  let setupErrorMessage = $state('');

  const serverConfig = $derived(serverConfigManager.value);
  const setupPasswordMismatch = $derived(
    setupPasswordConfirm.length > 0 && setupPassword !== setupPasswordConfirm ? 'Passwords do not match.' : '',
  );
  const canCompleteSetup = $derived(
    Boolean(setupPhotosDir.trim()) &&
      setupPassword.length > 0 &&
      setupPassword === setupPasswordConfirm &&
      !setupSaving,
  );
  const setupAdminPath = $derived(
    setupPhotosDir.trim() ? `${setupPhotosDir.trim()}/admin` : '<selected-folder>/admin',
  );

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

  const onSuccess = async (user: LoginResponseDto) => {
    await goto(data.continueUrl, { invalidateAll: true });
    eventManager.emit('AuthLogin', user);
  };

  const onFirstLogin = () => goto(Route.changePassword());
  const onOnboarding = () => goto(Route.onboarding());

  const loadInitialSetupState = async () => {
    const invoke = getTauriInvoke();
    isDesktop = !!invoke;

    if (!invoke) {
      initialSetupLoading = false;
      return;
    }

    const setupState = (await invoke('get_initial_setup_state')) as InitialSetupState;
    showInitialSetup = !!setupState?.setup_required;
    setupPhotosDir = setupState?.photos_dir ?? '';
    initialSetupLoading = false;
  };

  onMount(async () => {
    try {
      await loadInitialSetupState();
      if (showInitialSetup) {
        oauthLoading = false;
        return;
      }
    } catch (error) {
      setupErrorMessage = `Failed to load setup state: ${error instanceof Error ? error.message : String(error)}`;
      showInitialSetup = true;
      oauthLoading = false;
      initialSetupLoading = false;
      return;
    }

    if (!featureFlagsManager.value.oauth) {
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
        (featureFlagsManager.value.oauthAutoLaunch && !oauth.isAutoLaunchDisabled(globalThis.location)) ||
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
      const lomoServerUrl = `http://${serverAddress}:${serverPort}`;
      defaults.headers = { ...defaults.headers, 'X-Lomo-Server': lomoServerUrl };

      const user = await login({ loginCredentialDto: { email: loginEmail, password: loginPassword } });

      // Save server address on successful login
      globalThis.localStorage?.setItem('lomo_server_address', serverAddress);
      globalThis.localStorage?.setItem('lomo_server_port', serverPort);

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
    }
  };

  const handleInitialSetup = async () => {
    if (!canCompleteSetup) {
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

    const nextDir = setupPhotosDir.trim();
    const nextPassword = setupPassword;

    try {
      await invoke('complete_initial_setup', { photosDir: nextDir, password: nextPassword });
      email = 'admin';
      password = nextPassword;
      showInitialSetup = false;
      const signedIn = await handleLogin({ email: 'admin', password: nextPassword });
      if (!signedIn) {
        errorMessage = errorMessage || 'Setup completed. Sign in with the admin password you just created.';
      }
    } catch (error) {
      setupErrorMessage = `Failed to complete setup: ${error instanceof Error ? error.message : String(error)}`;
      showInitialSetup = true;
    } finally {
      setupSaving = false;
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
</script>

<AuthPageLayout title={data.meta.title}>
  <div class="relative">
    <div class:opacity-40={showInitialSetup} class:pointer-events-none={showInitialSetup}>
      <Stack gap={4}>
        {#if serverConfig.loginPageMessage}
          <Alert color="primary" class="mb-6">
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html serverConfig.loginPageMessage}
          </Alert>
        {/if}

        {#if !oauthLoading && featureFlagsManager.value.passwordLogin}
          <form {onsubmit} class="flex flex-col gap-4">
            {#if errorMessage}
              <Alert color="danger" title={errorMessage} closable />
            {/if}

            <div class="flex gap-2">
              <div class="flex-1">
                <Field label="Server Address">
                  <Input id="serverAddress" name="serverAddress" type="text" placeholder="192.168.1.73" bind:value={serverAddress} />
                </Field>
              </div>
              <div class="w-28">
                <Field label="Port">
                  <Input id="serverPort" name="serverPort" type="text" placeholder="8000" bind:value={serverPort} />
                </Field>
              </div>
            </div>

            <Field label={$t('username')}>
              <Input id="email" name="email" type="text" autocomplete="username" bind:value={email} />
            </Field>

            <Field label={$t('password')}>
              <PasswordInput id="password" bind:value={password} autocomplete="current-password" />
            </Field>

            <Button type="submit" size="large" shape="round" fullWidth {loading} class="mt-6">{$t('to_login')}</Button>
          </form>
        {/if}

        {#if featureFlagsManager.value.oauth}
          {#if featureFlagsManager.value.passwordLogin}
            <div class="inline-flex w-full items-center justify-center my-4">
              <hr class="my-4 h-px w-3/4 border-0 bg-gray-200 dark:bg-gray-600" />
              <span
                class="absolute start-1/2 -translate-x-1/2 bg-gray-50 px-3 font-medium text-gray-900 dark:bg-neutral-900 dark:text-white uppercase"
              >
                {$t('or')}
              </span>
            </div>
          {/if}
          {#if oauthError}
            <Alert color="danger" title={oauthError} closable />
          {/if}
          <Button
            shape="round"
            loading={loading || oauthLoading}
            disabled={loading || oauthLoading || showInitialSetup}
            size="large"
            fullWidth
            color={featureFlagsManager.value.passwordLogin ? 'secondary' : 'primary'}
            onclick={handleOAuthLogin}
          >
            {serverConfig.oauthButtonText}
          </Button>
        {/if}

        {#if !featureFlagsManager.value.passwordLogin && !featureFlagsManager.value.oauth}
          <Alert color="warning" title={$t('login_has_been_disabled')} />
        {/if}
      </Stack>
    </div>

    {#if showInitialSetup}
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6">
        <section class="w-full max-w-2xl rounded-3xl bg-gray-50 p-6 text-primary shadow-2xl dark:bg-neutral-900">
          <Stack gap={4}>
            <div class="flex flex-col gap-1">
              <h2 class="text-2xl font-semibold">First-Time Setup</h2>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Set where new photos are stored and choose the admin password for this app.
              </p>
            </div>

            <Field label="Admin Username">
              <Input value="admin" disabled />
            </Field>

            <div class="flex flex-col gap-2">
              <Field label="Photos Storage Folder">
                <div class="flex gap-2 max-sm:flex-col">
                  <Input
                    id="setupPhotosDir"
                    name="setupPhotosDir"
                    type="text"
                    bind:value={setupPhotosDir}
                    placeholder="Select a folder for photo storage"
                    disabled={setupSaving}
                  />
                  <Button
                    type="button"
                    onclick={browseForSetupFolder}
                    disabled={!isDesktop || setupSaving}
                    color="secondary"
                    variant="ghost"
                  >
                    Browse
                  </Button>
                </div>
              </Field>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Photos will be stored under <code class="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">{setupAdminPath}</code>.
              </p>
            </div>

            <Field label="Admin Password">
              <PasswordInput bind:value={setupPassword} autocomplete="new-password" disabled={setupSaving} />
            </Field>

            <Field label="Confirm Password">
              <PasswordInput bind:value={setupPasswordConfirm} autocomplete="new-password" disabled={setupSaving} />
            </Field>

            <Alert color="warning" class="text-dark">
              You can change the folder later, but existing photos are not moved automatically.
            </Alert>

            {#if !isDesktop}
              <Alert color="info" class="text-dark">
                Running without Tauri. Folder browsing is unavailable in this window.
              </Alert>
            {/if}

            {#if setupPasswordMismatch}
              <Alert color="danger" title={setupPasswordMismatch} />
            {/if}

            {#if setupErrorMessage}
              <Alert color="danger" title={setupErrorMessage} />
            {/if}

            <div class="flex justify-end">
              <Button
                type="button"
                onclick={handleInitialSetup}
                disabled={!canCompleteSetup || initialSetupLoading}
                loading={setupSaving}
              >
                Create Setup & Continue
              </Button>
            </div>
          </Stack>
        </section>
      </div>
    {/if}
  </div>
</AuthPageLayout>
