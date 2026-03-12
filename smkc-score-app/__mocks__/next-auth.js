// Manual mock for next-auth module

// Provider mock functions - return a provider object with the options
const mockCredentials = jest.fn((options) => ({
  id: 'player-credentials',
  name: 'Player Login',
  type: 'credentials',
  credentials: {},
  authorize: options?.authorize,
  ...options,
}));

const mockDiscord = jest.fn((options) => ({
  id: 'discord',
  name: 'Discord',
  type: 'oauth',
  ...options,
}));

const mockGitHub = jest.fn((options) => ({
  id: 'github',
  name: 'GitHub',
  type: 'oauth',
  ...options,
}));

const mockGoogle = jest.fn((options) => ({
  id: 'google',
  name: 'Google',
  type: 'oauth',
  authorization: { params: {} },
  ...options,
}));

// Mock NextAuth function
const mockNextAuth = jest.fn((config) => {
  // Create provider instances from the config
  const providers = [];
  if (config.providers) {
    config.providers.forEach((providerConfig) => {
      if (typeof providerConfig === 'function') {
        // It's a provider factory function - execute it
        const provider = providerConfig({});
        providers.push(provider);
      } else if (providerConfig && typeof providerConfig === 'object') {
        // It's already a provider object
        providers.push(providerConfig);
      }
    });
  }

  const result = {
    handlers: {
      GET: jest.fn(),
      POST: jest.fn(),
    },
    signIn: jest.fn(),
    signOut: jest.fn(),
    auth: jest.fn(),
    providers: providers,
    session: config?.session || { strategy: 'jwt' },
    callbacks: config?.callbacks || {},
    pages: config?.pages || { signIn: '/auth/signin', error: '/auth/error' },
  };

  // Store the result so we can return it
  mockNextAuth._mockResult = result;
  return result;
});

// Export the mock
module.exports = mockNextAuth;
module.exports.default = mockNextAuth;
module.exports.Credentials = mockCredentials;
module.exports.Discord = mockDiscord;
module.exports.GitHub = mockGitHub;
module.exports.Google = mockGoogle;
