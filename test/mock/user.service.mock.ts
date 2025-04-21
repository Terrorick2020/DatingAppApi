import { Status } from '@prisma/client'
import {
	successResponse,
	errorResponse,
} from '../../src/common/helpers/api.response.helper'

export class UserServiceMock {
	findByTelegramId = jest.fn(telegramId => {
		if (!telegramId) return Promise.resolve({ data: null })

		return Promise.resolve({
			data: {
				id: 1,
				telegramId,
				name: 'Mock User',
				status: Status.Pro,
			},
		})
	})

	checkTgID = jest.fn((id: string) => {
		if (id === 'non_existing') return Promise.resolve('None')
		return Promise.resolve('Pro')
	})

	savePhotos = jest.fn((userId, keys) => {
		if (userId && keys.length > 0) {
			return Promise.resolve({ message: 'Фотографии сохранены' })
		}
		return Promise.resolve({ message: 'Ошибка' })
	})

	getPublicProfile = jest.fn(userId => {
		if (userId === '1') {
			return successResponse(
				{
					id: 1,
					name: 'John Doe',
					town: 'Some City',
					age: 30,
					sex: 'Male',
					photos: ['photo-url-1', 'photo-url-2'],
				},
				'Публичный профиль получен'
			)
		} else {
			return errorResponse('Пользователь не найден')
		}
	})
}
