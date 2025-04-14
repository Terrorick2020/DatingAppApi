export const MockStorageService = {
	uploadPhoto: jest.fn().mockResolvedValue('mock-photo-key.jpg'),
	getPresignedUrl: jest.fn().mockResolvedValue('https://storage.mock/mock-photo-key.jpg'),
  };
  