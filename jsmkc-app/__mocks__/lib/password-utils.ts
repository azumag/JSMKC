// Create mock functions for password-utils module
// Mock functions to prevent real bcrypt operations during testing
export const generateSecurePassword = jest.fn();

export const hashPassword = jest.fn();

export const verifyPassword = jest.fn();
