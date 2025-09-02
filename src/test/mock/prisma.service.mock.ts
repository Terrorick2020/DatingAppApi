import { Prisma } from '@prisma/client'

export function createPrismaClientMock<T>(
	data: T
): Prisma.Prisma__UserClient<T> {
	return {
		then: <TResult1 = T, TResult2 = never>(
			onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
			onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
		): Promise<TResult1 | TResult2> =>
			Promise.resolve(data).then(onfulfilled, onrejected),

		catch: <TResult = never>(
			onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
		): Promise<T | TResult> => Promise.resolve(data).catch(onrejected),

		finally: (onfinally?: (() => void) | null): Promise<T> =>
			Promise.resolve(data).finally(onfinally),

		[Symbol.toStringTag]: 'PrismaClientPromise',
	} as unknown as Prisma.Prisma__UserClient<T>
}

export const PrismaServiceMock = {
	user: {
		findUnique: jest.fn(({ where }) => {
			if (where?.telegramId === 'telegram_test_id') {
				return createPrismaClientMock({
					id: 1,
					telegramId: 'telegram_test_id',
					name: 'Test User',
					town: 'Test Town',
					age: 30,
					sex: 'Male' as const,
					lang: 'ru',
					bio: '',
					enableGeo: true,
					isVerify: true,
					role: 'User' as const,
					status: 'Pro' as const,
					createdAt: new Date(),
					updatedAt: new Date(),
					interestId: 1,
					invitedById: null,
					latitude: null,
					longitude: null,
					photos: [],
					interest: null,
					receivedComplaints: [],
					sentComplaints: [],
					likesFrom: [],
					likesTo: [],
				})
			}

			if (where?.referralCode === 'ABC123') {
				return createPrismaClientMock({
					id: 2,
					telegramId: 'inviter_tg_id',
				} as any)
			}

			return createPrismaClientMock(null)
		}),

		create: jest.fn(({ data }) =>
			createPrismaClientMock({ id: 1, ...data } as any)
		),
	},

	photo: {
		create: jest.fn(({ data }) =>
			createPrismaClientMock({
				id: Math.floor(Math.random() * 1000),
				...data,
			})
		),

		findMany: jest.fn(({ where }) => {
			if (where.id.in.includes(999)) {
				return Promise.resolve([{ id: 1 }] as any) // simulate missing
			}

			return Promise.resolve(
				(where.id.in as number[]).map(id => ({
					id,
					key: `photo-key-${id}`,
				}))
			)
		}),

		updateMany: jest.fn(() => Promise.resolve({ count: 2 })),
	},

	like: {
		createMany: jest.fn(() => Promise.resolve({ count: 0 })),
	},

	interest: {
		findUnique: jest.fn(() => createPrismaClientMock({ id: 1 })),
	},

	coordinate: {
		create: jest.fn(() => createPrismaClientMock({})),
	},
}
