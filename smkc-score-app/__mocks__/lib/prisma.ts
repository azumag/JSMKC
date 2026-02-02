// Create a mock prisma instance
const mockPrisma = {
  auditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  player: {
    update: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  tournament: {
    update: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  bMMatch: {
    update: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  bMQualification: {
    update: jest.fn(),
    findMany: jest.fn(),
  },
  mRMatch: {
    update: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  mRQualification: {
    update: jest.fn(),
    findMany: jest.fn(),
  },
  gPMatch: {
    update: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  gPQualification: {
    update: jest.fn(),
    findMany: jest.fn(),
  },
  tTEntry: {
    update: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

export const prisma = mockPrisma;

export default prisma;
