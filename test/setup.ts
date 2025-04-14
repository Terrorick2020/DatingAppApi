import { MockStorageService } from './mock/storage.service.mock'

beforeEach(() => {
	jest.clearAllMocks()
	MockStorageService.uploadPhoto.mockResolvedValue('mock-photo-key.jpg')
	MockStorageService.getPresignedUrl.mockResolvedValue(
		'https://storage.mock/mock-photo-key.jpg'
	)
})
