<script lang="ts">
  import { page } from '$app/stores';
  import ChangePinCodeSettings from '$lib/components/user-settings-page/PinCodeSettings.svelte';
  import DownloadSettings from '$lib/components/user-settings-page/download-settings.svelte';
  import MobileUploadSettings from '$lib/components/user-settings-page/mobile-upload-settings.svelte';
  import { OpenQueryParam, QueryParameter } from '$lib/constants';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import { user } from '$lib/stores/user.store';
  import { oauth } from '$lib/utils';
  import {
    mdiAccountOutline,
    mdiCellphoneArrowDownVariant,
    mdiCogOutline,
    mdiDownload,
    mdiFormTextboxPassword,
    mdiLockSmart,
    mdiTwoFactorAuthentication,
  } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import SettingAccordionState from '../shared-components/settings/setting-accordion-state.svelte';
  import SettingAccordion from '../shared-components/settings/setting-accordion.svelte';
  import AppSettings from './app-settings.svelte';
  import ChangePasswordSettings from './change-password-settings.svelte';
  import OAuthSettings from './oauth-settings.svelte';
  import UserProfileSettings from './user-profile-settings.svelte';

  let oauthOpen =
    oauth.isCallback(globalThis.location) ||
    $page.url.searchParams.get(QueryParameter.OPEN_SETTING) === OpenQueryParam.OAUTH;
</script>

<SettingAccordionState queryParam={QueryParameter.IS_OPEN}>
  <SettingAccordion
    icon={mdiCogOutline}
    key="app-settings"
    title={$t('app_settings')}
    subtitle={$t('manage_the_app_settings')}
  >
    <AppSettings />
  </SettingAccordion>

  <SettingAccordion icon={mdiAccountOutline} key="account" title={$t('account')} subtitle={$t('manage_your_account')}>
    <UserProfileSettings />
  </SettingAccordion>

  <SettingAccordion
    icon={mdiCellphoneArrowDownVariant}
    key="mobile-upload"
    title="Mobile Upload"
    subtitle="Scan a QR code to upload photos from your phone"
  >
    <MobileUploadSettings />
  </SettingAccordion>

  <SettingAccordion
    icon={mdiDownload}
    key="download-settings"
    title={$t('download_settings')}
    subtitle={$t('download_settings_description')}
  >
    <DownloadSettings />
  </SettingAccordion>

  {#if featureFlagsManager.value.oauth}
    <SettingAccordion
      icon={mdiTwoFactorAuthentication}
      key={OpenQueryParam.OAUTH}
      title={$t('oauth')}
      subtitle={$t('manage_your_oauth_connection')}
      isOpen={oauthOpen || undefined}
    >
      <OAuthSettings user={$user} />
    </SettingAccordion>
  {/if}

  <SettingAccordion
    icon={mdiFormTextboxPassword}
    key="password"
    title={$t('password')}
    subtitle={$t('change_your_password')}
  >
    <ChangePasswordSettings />
  </SettingAccordion>

  <SettingAccordion
    icon={mdiLockSmart}
    key="user-pin-code-settings"
    title={$t('user_pin_code_settings')}
    subtitle={$t('user_pin_code_settings_description')}
    autoScrollTo={true}
  >
    <ChangePinCodeSettings />
  </SettingAccordion>
</SettingAccordionState>
