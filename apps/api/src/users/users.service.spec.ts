import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should return safe user profile when user exists', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-uuid-1',
      email: 'ada@devpulse.dev',
      name: 'Ada Lovelace',
      hashedPassword: 'super_secret_hash_value',
      createdAt: new Date('2026-01-01T12:00:00.000Z'),
    });

    const profile = await service.findById('user-uuid-1');

    expect(profile).toEqual({
      id: 'user-uuid-1',
      email: 'ada@devpulse.dev',
      name: 'Ada Lovelace',
      createdAt: '2026-01-01T12:00:00.000Z',
    });
    // Ensure password hash is completely excluded from safe profile
    expect((profile as unknown as Record<string, unknown>).hashedPassword).toBeUndefined();
  });

  it('should throw NotFoundException when user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.findById('non-existent-id')).rejects.toThrow(
      NotFoundException,
    );
  });
});
