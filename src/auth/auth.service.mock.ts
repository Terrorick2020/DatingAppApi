export class AuthServiceMock {
	check = jest.fn(({ id }) =>
		Promise.resolve({ data: id === 'non_existing' ? 'None' : 'Pro' })
	)

	register = jest.fn(() =>
		Promise.resolve({ message: 'Пользователь создан и фото привязаны' })
	)

	uploadPhoto = jest.fn(dto =>
		Promise.resolve({
			message: 'Фото временно сохранено',
			photo: {
				id: '1',
				key: dto.key,
				telegramId: dto.telegramId,
			},
		})
	)
}
