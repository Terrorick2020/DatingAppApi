export class StorageServiceMock {
	uploadPhoto = jest.fn(file => {
		return Promise.resolve('photo-key-123')
	})

	saveTempPhoto = jest.fn((key, telegramId) => {
		return Promise.resolve({ message: 'Фото временно сохранено' })
	})
}
