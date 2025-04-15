import { Status } from '@prisma/client'

export class PrismaServiceMock {
	user = {
		findUnique: jest.fn(({ where }) => {
			if (!where || !where.telegramId || where.telegramId === 'non_existing')
				return null

			return {
				id: 1,
				telegramId: where.telegramId,
				name: 'Test User',
				status: Status.Pro,
			}
		}),
		create: jest.fn(({ data }) => {
			if (data.telegramId === 'non_existing') {
				throw new Error('Ошибка: пользователь не может быть создан')
			}
			return {
				...data,
				id: 2,
			}
		}),
	}

	photo = {
		create: jest.fn(({ data }) => ({
			id: 1,
			...data,
		})),
		createMany: jest.fn(({ data }) => {
			return { count: data.length }
		}),
		updateMany: jest.fn(({ where }) => {
			if (where.telegramId) {
				return Promise.resolve({ count: 1 })
			}
			return Promise.resolve({ count: 0 })
		}),
	}

	$transaction = jest.fn(async cb => {
		return cb({
			user: this.user,
			photo: this.photo,
		})
	})
}
