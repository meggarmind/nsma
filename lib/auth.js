import { getSettings } from './storage.js';

/**
 * Verify registration token from Authorization header
 * @throws {Error} If token is invalid or missing
 */
export async function verifyRegistrationToken(request) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer') {
    throw new Error('Invalid authentication scheme. Use Bearer token.');
  }

  if (!token) {
    throw new Error('Missing authentication token');
  }

  const settings = await getSettings();

  if (!settings.registrationToken) {
    throw new Error('Registration token not configured in NSMA settings');
  }

  if (token !== settings.registrationToken) {
    throw new Error('Invalid registration token');
  }

  return true;
}
