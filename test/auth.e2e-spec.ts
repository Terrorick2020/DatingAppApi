import * as request from 'supertest'
import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { AppModule } from '../src/app/app.module'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../src/storage/storage.service'
import * as fs from 'fs'

describe('AuthController (e2e)', () => {
	let app: INestApplication
	let prisma: PrismaService
	let telegramId: string

	const mockStorage = {
		uploadPhoto: jest.fn().mockResolvedValue({
			key: 'test/photo-key.jpg',
		}),
		getPresignedUrl: jest
			.fn()
			.mockResolvedValue(
				'https://mock-bucket.presigned.url/test/photo-key.jpg'
			),
	}

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(StorageService)
			.useValue(mockStorage)
			.compile()

		app = moduleFixture.createNestApplication()
		await app.init()

		prisma = app.get(PrismaService)
	})

	beforeEach(async () => {
		telegramId = (
			10n ** 10n +
			BigInt(Math.floor(Math.random() * 1_000_000_000))
		).toString()
		await prisma.photo.deleteMany()
		await prisma.user.deleteMany()
		mockStorage.uploadPhoto.mockClear()
		mockStorage.getPresignedUrl.mockClear()
	})

	it('/auth (POST) check', async () => {
		const res = await request(app.getHttpServer())
			.post('/auth')
			.send({ id: telegramId })
			.expect(200)

		console.log('Check response:', res.body)

		expect(res.body).toHaveProperty('success', true)
		expect(res.body).toHaveProperty('message')
		expect([
			'Пользователь не зарегистрирован',
			'Пользователь найден',
		]).toContain(res.body.message)
	})

	it('/auth/upload-photo (POST)', async () => {
		const filePath = './test/test-photo.jpg'
		if (!fs.existsSync(filePath)) throw new Error('Фото для теста не найдено')

		const res = await request(app.getHttpServer())
			.post('/auth/upload-photo')
			.attach('photo', filePath)
			.field('telegramId', telegramId)
			.expect(201)

		console.log('Upload photo response:', res.body)

		expect(mockStorage.uploadPhoto).toHaveBeenCalled()
		expect(res.body).toHaveProperty('success', true)
		expect(res.body).toHaveProperty('message', 'Фото временно сохранено')
		expect(res.body.data).toHaveProperty('key')
	})

	it('/auth/register (POST)', async () => {
		const filePath = './test/test-photo.jpg'
		if (!fs.existsSync(filePath)) throw new Error('Фото для теста не найдено')

		await request(app.getHttpServer())
			.post('/auth/upload-photo')
			.attach('photo', filePath)
			.field('telegramId', telegramId)
			.expect(201)

		const createUserDto = {
			telegramId,
			lang: 'ru',
			name: 'Test User',
			town: 'Moscow',
			sex: 'Male',
			age: 30,
			bio: 'Just a test user',
			geo: true,
			isVerify: false,
			findRequest: 'Love',
			role: 'User',
			status: 'Noob',
		}

		const res = await request(app.getHttpServer())
			.post('/auth/register')
			.send(createUserDto)
			.expect(201)

		console.log('Register response:', res.body)

		expect(res.body).toHaveProperty('success', true)
		expect(res.body).toHaveProperty(
			'message',
			'Пользователь создан и фото привязаны'
		)
		expect(res.body.data).toMatchObject({
			telegramId: BigInt(createUserDto.telegramId).toString(),
			name: createUserDto.name,
		})
		expect(res.body.data).toHaveProperty('id')
	})

	afterAll(async () => {
		await app.close()
	})
})
