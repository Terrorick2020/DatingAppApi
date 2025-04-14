import { Status } from '@prisma/client'

export class PrismaServiceMock {
	user = {
		findUnique: jest.fn(({ where }) => {
			if (!where || !where.telegramId) return null

			return {
				id: 1,
				telegramId: where.telegramId,
				name: 'Test User',
				status: Status.Pro,
			}
		}),
		create: jest.fn(({ data }) => ({
			...data,
			id: 2,
		})),
	}

	photo = {
		createMany: jest.fn(({ data }) => {
			return { count: data.length }
		}),
		updateMany: jest.fn(({ where }) => {
			if (where.telegramId) {
				return { count: 1 }
			}
			return { count: 0 }
		}),
	}

	// $transaction = jest.fn(async operations => {
	// 	return Promise.all(operations.map(fn => fn()))
	// })
}
