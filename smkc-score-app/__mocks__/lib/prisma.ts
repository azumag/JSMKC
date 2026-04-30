// Create a mock prisma instance
const mockPrisma = {
  auditLog: {
    create: jest.fn(),
    createMany: jest.fn(),
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
    deleteMany: jest.fn(),
  },
  bMMatch: {
    update: jest.fn(),
    updateMany: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  bMQualification: {
    update: jest.fn(),
    updateMany: jest.fn(),
    findMany: jest.fn(),
  },
  mRMatch: {
    update: jest.fn(),
    updateMany: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  mRQualification: {
    update: jest.fn(),
    updateMany: jest.fn(),
    findMany: jest.fn(),
  },
  gPMatch: {
    update: jest.fn(),
    updateMany: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  gPQualification: {
    update: jest.fn(),
    updateMany: jest.fn(),
    findMany: jest.fn(),
  },
  tTEntry: {
    update: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  tTPhaseRound: {
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  tTPhaseSuddenDeathRound: {
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
  },
  tournamentPlayerScore: {
    upsert: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
  $executeRaw: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

export const prisma = mockPrisma;

export default prisma;
