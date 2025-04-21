export class AuthServiceMock {
	check = jest.fn(({ telegramId }) =>
		Promise.resolve({
			data: telegramId === 'non_existing' ? 'None' : 'Pro',
			message:
				telegramId === 'non_existing'
					? 'Пользователь не зарегистрирован'
					: 'Пользователь найден',
		})
	)

	uploadPhoto = jest.fn(dto =>
		Promise.resolve({
			message: 'Фото временно сохранено',
			data: { photoId: 1 },
		})
	)
	
	register = jest.fn(() =>
		Promise.resolve({
			message: 'Пользователь создан и фото привязаны',
		})
	)
}
