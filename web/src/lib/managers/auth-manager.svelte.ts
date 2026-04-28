import { page } from '$app/state';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { Route } from '$lib/route';
import { clearClientSession } from '$lib/utils/auth';
import { isSharedLinkRoute } from '$lib/utils/navigation';
import { getAboutInfo, type UserAdminResponseDto } from '@immich/sdk';

class AuthManager {
  isPurchased = $state(false);
  isSharedLink = $derived(isSharedLinkRoute(page.route?.id));
  params = $derived(this.isSharedLink ? { key: page.params.key, slug: page.params.slug } : {});

  constructor() {
    eventManager.on({
      AuthUserLoaded: (user) => this.onAuthUserLoaded(user),
    });
  }

  private async onAuthUserLoaded(user: UserAdminResponseDto) {
    if (user.license?.activatedAt) {
      authManager.isPurchased = true;
      return;
    }

    const serverInfo = await getAboutInfo().catch(() => undefined);
    if (serverInfo?.licensed) {
      authManager.isPurchased = true;
    }
  }

  async logout() {
    await clearClientSession();
    this.isPurchased = false;
    globalThis.location.replace(Route.login({ showChooser: 1 }));
  }
}

export const authManager = new AuthManager();
