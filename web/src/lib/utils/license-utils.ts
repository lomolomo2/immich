import type { ImmichProduct } from '$lib/constants';
import { setServerLicense, setUserLicense, type LicenseResponseDto } from '@immich/sdk';
import { loadUser } from './auth';

export const activateProduct = async (licenseKey: string, activationKey: string): Promise<LicenseResponseDto> => {
  // Send server key to user activation if user is not admin
  const user = await loadUser();
  const isServerActivation = user?.isAdmin && licenseKey.search('IMSV') !== -1;
  const licenseKeyDto = { licenseKey, activationKey };
  return isServerActivation ? setServerLicense({ licenseKeyDto }) : setUserLicense({ licenseKeyDto });
};

export const getActivationKey = async (licenseKey: string): Promise<string> => {
  throw new Error(`License activation is not configured for this build (${licenseKey}).`);
};

export const getLicenseLink = (license: ImmichProduct) => {
  return `#${license}`;
};
